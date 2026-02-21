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

// Safely fetches a specific folder. Returns null if folder doesn't exist or is empty.
async function fetchFolderData(folderName, variantName) {
    try {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/models/${encodeURIComponent(folderName)}`;
        const response = await fetch(url);
        
        if (!response.ok) return null; 
        
        const files = await response.json();
        
        // Find the first valid 3D file in this folder
        const glbFile = files.find(f => 
            f.name.toLowerCase().endsWith('.glb') || 
            f.name.toLowerCase().includes('tone') || 
            f.name.toLowerCase().includes('toyota')
        );
        
        if (!glbFile) return null;

        const baseName = glbFile.name.replace('.glb', '');
        const posterFile = files.find(f => f.name === `${baseName}.png`);

        return {
            src: glbFile.download_url,
            poster: posterFile ? posterFile.download_url : 'https://placehold.co/400x300/222/FFF.png?text=No+Preview',
            variant: variantName
        };
    } catch (error) {
        return null; // Graceful fail
    }
}

async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    if(loader) loader.classList.add('active');

    try {
        // Promise.allSettled ensures that if one folder fails, the others still load
        const results = await Promise.allSettled([
            fetchFolderData('Single Tone', 'Single Tone'),
            fetchFolderData('Two Tone', 'Two Tone'),
            fetchFolderData('Other', 'Other')
        ]);

        models = [];
        
        // Safely extract successful results (ignoring nulls/empty folders)
        if (results[0].status === 'fulfilled' && results[0].value) models.push(results[0].value);
        if (results[1].status === 'fulfilled' && results[1].value) models.push(results[1].value);
        if (results[2].status === 'fulfilled' && results[2].value) models.push(results[2].value);

        if (models.length === 0) throw new Error("No 3D models found in folders. Attempting Fallback.");

        startApp();

    } catch (error) {
        console.warn("API Failed or Folders Empty. Using Bulletproof Fallbacks...", error);
        
        // Failsafe guarantees the UI will ALWAYS render buttons, even if API blocks you
        models = [
            {
                src: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/Toyota%20H300%20Single%20Tone.glb",
                poster: "https://placehold.co/400x300/222/FFF.png?text=No+Preview",
                variant: "Single Tone"
            },
            {
                src: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/Toyota%20H300%20Two%20Tone",
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
    resetGlobalTimers(); 
}

function buildVariantButtons() {
    const panel = document.getElementById("variantPanel");
    if(!panel) return;
    panel.innerHTML = "";
    
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

// --- TRANSITIONS & FETCHING ---
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
            resetGlobalTimers(); 
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
            
            // Safe Cache Loading
            if ('caches' in window && window.location.protocol !== 'file:') {
                const cache = await caches.open('ecw-3d-models-v1');
                const cachedResponse = await cache.match(data.src);

                if (cachedResponse) {
                    finalBlob = await cachedResponse.blob();
                } else {
                    const res = await fetch(data.src, { mode: 'cors' });
                    if (res.ok) {
                        finalBlob = await res.blob();
                        finalBlob = new Blob([finalBlob], { type: 'model/gltf-binary' }); // Force MIME TYPE
                        cache.put(data.src, new Response(finalBlob));
                    }
                }
            } else {
                // Fallback for strict environments without caches
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

        if ('caches' in window && window.location.protocol !== 'file:') {
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

// --- GLOBAL UX & EVENT LOGIC ---
function setupEvents() {
    document.getElementById("fsBtn").onclick = () => {
        const app = document.getElementById("app");
        !document.fullscreenElement ? app.requestFullscreen() : document.exitFullscreen();
    };

    // UI interactions instantly hide the idle indicator
    ['pointermove', 'pointerdown', 'keydown'].forEach(evt => {
        window.addEventListener(evt, resetGlobalTimers);
    });

    if(viewer) {
        viewer.addEventListener('camera-change', (e) => {
            if (e.detail.source === 'user-interaction') {
                viewer.autoRotate = false;
                
                const indicator = document.getElementById('idleIndicator');
                if (indicator) indicator.classList.remove('visible');

                clearTimeout(cameraIdleTimer);
                cameraIdleTimer = setTimeout(() => {
                    viewer.autoRotate = true;
                    const currentOrbit = viewer.getCameraOrbit();
                    viewer.cameraOrbit = `${currentOrbit.theta}rad 75deg auto`;
                }, IDLE_DELAY);
            }
        });

        viewer.addEventListener('load', () => {
            if (typeof ColorEngine !== 'undefined') {
                clearTimeout(colorEngineTimer);
                colorEngineTimer = setTimeout(() => {
                    try { ColorEngine.analyze(viewer); } catch(e) {}
                }, 400); 
            }
        });
    }
}

function resetGlobalTimers() {
    const indicator = document.getElementById('idleIndicator');
    
    if(indicator && indicator.classList.contains('visible')) {
        indicator.classList.remove('visible');
    }
    
    clearTimeout(globalInteractionTimer);
    globalInteractionTimer = setTimeout(() => {
        if(viewer && viewer.autoRotate && indicator) {
            indicator.classList.add('visible');
        }
    }, IDLE_DELAY);

    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => {
        if(models.length > 1) {
            transitionToModel((currentIndex + 1) % models.length);
        }
    }, SLIDE_DELAY);
}

initShowroom();
