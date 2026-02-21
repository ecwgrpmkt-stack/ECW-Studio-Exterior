// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "ECW-Studio";

let models = []; 
let currentIndex = 0;
const viewer = document.querySelector("#viewer3d");

// TIMERS & STATE
let idleTimer = null;
let slideTimer = null; 
const IDLE_DELAY = 3000;       
const SLIDE_DELAY = 60000;     
let colorEngineTimer = null;   
let savedOrbit = null; 
let currentBlobUrl = null; 

async function fetchFolderData(folderName, variantName) {
    try {
        // Fetch files from the specific subfolder
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/models/${encodeURIComponent(folderName)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) return null; // Folder doesn't exist
            throw new Error(`GitHub API Error: ${response.status}`);
        }
        
        const files = await response.json();
        
        // Find the first GLB in this folder
        const glbFile = files.find(f => f.name.toLowerCase().endsWith('.glb') || f.name.toLowerCase().includes('tone'));
        if (!glbFile) return null;

        // Try to find a matching poster in the same folder
        const baseName = glbFile.name.replace('.glb', '');
        const pngName = `${baseName}.png`;
        const posterFile = files.find(f => f.name === pngName);

        return {
            src: glbFile.download_url,
            poster: posterFile ? posterFile.download_url : 'https://placehold.co/400x300/222/FFF.png?text=No+Preview',
            variant: variantName
        };

    } catch (error) {
        console.warn(`Could not fetch folder ${folderName}:`, error);
        return null; // Return null gracefully so the app doesn't crash
    }
}

async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    if(loader) loader.classList.add('active');

    try {
        // Fetch the three folders concurrently for maximum speed
        const [singleData, twoData, otherData] = await Promise.all([
            fetchFolderData('Single Tone', 'Single Tone'),
            fetchFolderData('Two Tone', 'Two Tone'),
            fetchFolderData('Other', 'Other')
        ]);

        models = [];
        
        // Push to array only if the folder existed and had a model
        if (singleData) models.push(singleData);
        if (twoData) models.push(twoData);
        if (otherData) models.push(otherData);

        if (models.length === 0) throw new Error("No 3D models found in any folders.");

        startApp();

    } catch (error) {
        console.warn("API Failed. Using Hardcoded Fallbacks...", error);
        
        // Fallback testing data just in case API limits hit
        models = [
            {
                src: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/Single%20Tone/Toyota_H300.glb",
                poster: "https://placehold.co/400x300/222/FFF.png?text=No+Preview",
                variant: "Single Tone"
            },
            {
                src: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/Two%20Tone/Toyota_H300_Two.glb",
                poster: "https://placehold.co/400x300/222/FFF.png?text=No+Preview",
                variant: "Two Tone"
            }
        ];
        startApp();
    } finally {
        if(loader) setTimeout(() => loader.classList.remove('active'), 300);
    }
}

function startApp() {
    currentIndex = 0; 
    buildVariantButtons();
    loadModelData(currentIndex);
    setupEvents();
    startTimers(); 
}

function buildVariantButtons() {
    const panel = document.getElementById("variantPanel");
    if(!panel) return;
    panel.innerHTML = "";
    
    // Only creates buttons for models that successfully loaded from folders
    models.forEach((m, index) => {
        const btn = document.createElement("button");
        btn.className = "tone-btn";
        btn.innerText = m.variant;
        btn.dataset.index = index;
        btn.onclick = () => transitionToModel(index);
        panel.appendChild(btn);
    });
}

function updateVariantButtons() {
    document.querySelectorAll(".tone-btn").forEach(btn => {
        if(parseInt(btn.dataset.index) === currentIndex) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// --- TRANSITIONS & ADVANCED FETCHING ---
function transitionToModel(index) {
    if (index === currentIndex) return;

    const fadeOverlay = document.getElementById('fadeOverlay');
    const loader = document.getElementById('ecwLoader');
    
    if (typeof ColorEngine !== 'undefined') ColorEngine.reset();

    if (viewer) {
        const orbit = viewer.getCameraOrbit();
        savedOrbit = { theta: orbit.theta, phi: orbit.phi };
    }

    fadeOverlay.classList.add('active');
    loader.classList.add('active'); 

    setTimeout(() => {
        try {
            currentIndex = index;
            loadModelData(currentIndex);
        } catch(e) { console.error(e); }

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
            loader.classList.remove('active');
            resetTimers(); 
            preloadNextModel(); 
        }, 200); 

    }, 200); 
}

async function loadModelData(index) {
    if (!models[index]) return;
    const data = models[index];

    if(viewer) {
        viewer.poster = data.poster; 

        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }

        try {
            let finalBlob = null;

            if ('caches' in window) {
                const cache = await caches.open('ecw-3d-models-v1');
                const cachedResponse = await cache.match(data.src);

                if (cachedResponse) {
                    finalBlob = await cachedResponse.blob();
                } else {
                    const res = await fetch(data.src, { mode: 'cors' });
                    if (res.ok) {
                        finalBlob = await res.blob();
                        finalBlob = new Blob([finalBlob], { type: 'model/gltf-binary' });
                        cache.put(data.src, new Response(finalBlob));
                    }
                }
            } else {
                const res = await fetch(data.src, { mode: 'cors' });
                if (res.ok) finalBlob = await res.blob();
            }

            if (finalBlob) {
                const glbBlob = new Blob([finalBlob], { type: 'model/gltf-binary' });
                currentBlobUrl = URL.createObjectURL(glbBlob);
                viewer.src = currentBlobUrl;
            } else {
                viewer.src = data.src;
            }

        } catch (e) {
            console.warn("Blob fetch failed, falling back to basic URL", e);
            viewer.src = data.src;
        }
        
        if (savedOrbit) {
            viewer.cameraOrbit = `${savedOrbit.theta}rad ${savedOrbit.phi}rad auto`;
        } else {
            viewer.cameraOrbit = "auto auto auto";
        }
        viewer.autoRotate = true; 
    }
    updateVariantButtons();
}

function preloadNextModel() {
    if (models.length > 1) {
        let nextIndex = (currentIndex + 1) % models.length;
        const nextModel = models[nextIndex];

        const img = new Image();
        img.src = nextModel.poster;

        if ('caches' in window) {
            caches.open('ecw-3d-models-v1').then(cache => {
                cache.match(nextModel.src).then(cachedResponse => {
                    if (!cachedResponse) {
                        fetch(nextModel.src, { mode: 'cors', priority: 'low' })
                            .then(res => res.blob())
                            .then(blob => {
                                const glbBlob = new Blob([blob], { type: 'model/gltf-binary' });
                                cache.put(nextModel.src, new Response(glbBlob));
                            })
                            .catch(() => {});
                    }
                });
            }).catch(() => {});
        }
    }
}

// --- IDLE & EVENTS ---
function setupEvents() {
    document.getElementById("fsBtn").onclick = () => {
        const app = document.getElementById("app");
        !document.fullscreenElement ? app.requestFullscreen() : document.exitFullscreen();
    };

    if(viewer) {
        viewer.addEventListener('camera-change', (e) => {
            if (e.detail.source === 'user-interaction') {
                viewer.autoRotate = false;
                document.getElementById('idleIndicator').classList.remove('visible');
                resetTimers(); 
            }
        });

        viewer.addEventListener('load', () => {
            if (typeof ColorEngine !== 'undefined') {
                clearTimeout(colorEngineTimer);
                colorEngineTimer = setTimeout(() => {
                    try { ColorEngine.analyze(viewer); } 
                    catch(e) { console.error("ColorEngine Crash Prevented:", e); }
                }, 400); 
            }
        });
    }
}

function startTimers() {
    idleTimer = setTimeout(() => {
        if(viewer) {
            viewer.autoRotate = true;
            const currentOrbit = viewer.getCameraOrbit();
            viewer.cameraOrbit = `${currentOrbit.theta}rad 75deg auto`;
        }
        document.getElementById('idleIndicator').classList.add('visible');
    }, IDLE_DELAY);

    slideTimer = setTimeout(() => {
        if(models.length > 1) {
            transitionToModel((currentIndex + 1) % models.length);
        }
    }, SLIDE_DELAY);
}

function resetTimers() {
    clearTimeout(idleTimer);
    clearTimeout(slideTimer);
    startTimers();
}

initShowroom();
