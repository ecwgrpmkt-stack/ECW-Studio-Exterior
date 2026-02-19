// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "ECW-Studio";
const MODEL_FOLDER = "models";

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

async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    if(loader) loader.classList.add('active');

    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${MODEL_FOLDER}`);
        if (!response.ok) throw new Error("GitHub API Error (Rate Limit likely).");
        
        const files = await response.json();
        
        // Loosened filter to catch missing .glb extensions just in case
        const modelFiles = files.filter(f => 
            (f.name.toLowerCase().endsWith('.glb') || f.name.toLowerCase().includes('tone')) 
            && !f.name.startsWith('disabled_')
        );

        if (modelFiles.length === 0) throw new Error("No 3D models found.");

        let tempModels = modelFiles.map(glb => {
            const baseName = glb.name.replace('.glb', '');
            const pngName = `${baseName}.png`;
            const posterFile = files.find(f => f.name === pngName);
            
            let niceName = baseName.replace(/_/g, ' ').replace(/-/g, ' ');
            niceName = niceName.replace(/\b\w/g, l => l.toUpperCase());

            return {
                src: glb.download_url,
                poster: posterFile ? posterFile.download_url : 'https://placehold.co/400x300/222/FFF.png?text=No+Preview',
                name: niceName,
                year: (niceName.match(/\d{4}/) || ["Model"])[0] 
            };
        });

        // -----------------------------------------------------
        // SMART CATEGORIZATION: Build strictly 3 items max
        // -----------------------------------------------------
        let singleModel = tempModels.find(m => /(single|one)/i.test(m.name));
        let twoModel = tempModels.find(m => /(two|dual)/i.test(m.name));
        let otherModel = tempModels.find(m => !/(single|one|two|dual)/i.test(m.name));

        models = []; // Reset and rigidly map
        if (singleModel) { singleModel.variant = "Single Tone"; models.push(singleModel); }
        if (twoModel) { twoModel.variant = "Two Tone"; models.push(twoModel); }
        if (otherModel) { otherModel.variant = "Other"; models.push(otherModel); }

        if (models.length === 0) {
            // Failsafe if regex misses everything
            tempModels[0].variant = "Model 1";
            models.push(tempModels[0]);
        }

        startApp();

    } catch (error) {
        console.warn("API Failed, using Hardcoded Fallback...", error);
        document.getElementById('infoName').innerText = "API LIMIT REACHED";
        
        // Updated fallback to match current repo contents
        models = [{
            src: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/Toyota%20H300%20Single%20Tone.glb",
            poster: "https://placehold.co/400x300/222/FFF.png?text=No+Preview",
            name: "Toyota H300 Single Tone",
            year: "Model",
            variant: "Single Tone"
        }];
        startApp();
    } finally {
        if(loader) setTimeout(() => loader.classList.remove('active'), 300);
    }
}

function startApp() {
    currentIndex = 0; // Always start at index 0 of the mapped array
    buildVariantButtons();
    loadModelData(currentIndex);
    setupEvents();
    startTimers(); 
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

// --- TRANSITIONS & CACHE ---
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
    
    document.getElementById('infoName').innerText = data.name;
    document.getElementById('infoYear').innerText = data.year;

    if(viewer) {
        viewer.poster = data.poster; 
        viewer.alt = `3D Model of ${data.name}`;

        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }

        try {
            const cache = await caches.open('ecw-3d-models-v1');
            const cachedResponse = await cache.match(data.src);

            if (cachedResponse) {
                const blob = await cachedResponse.blob();
                currentBlobUrl = URL.createObjectURL(blob);
                viewer.src = currentBlobUrl;
            } else {
                viewer.src = data.src;
                fetch(data.src, { mode: 'cors' })
                    .then(res => { if(res.ok) cache.put(data.src, res.clone()); })
                    .catch(e => console.warn("Cache save ignored"));
            }
        } catch (e) {
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

        caches.open('ecw-3d-models-v1').then(cache => {
            cache.match(nextModel.src).then(cachedResponse => {
                if (!cachedResponse) {
                    fetch(nextModel.src, { mode: 'cors', priority: 'low' })
                        .then(res => { if(res.ok) cache.put(nextModel.src, res.clone()); })
                        .catch(() => {});
                }
            });
        }).catch(() => {});
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
                    catch(e) { console.error("ColorEngine Error:", e); }
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
