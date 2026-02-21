// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "ECW-Studio";
const BRANCH = "main";

let models = []; 
let currentIndex = 0;
const viewer = document.querySelector("#viewer3d");

// DECOUPLED TIMERS
let globalIdleTimer = null;       // Controls the Hand Icon
let cameraIdleTimer = null;       // Controls the 3D Auto-Rotation
let slideTimer = null;            // Controls the 60s auto-slide
let colorEngineTimer = null;   

const IDLE_DELAY = 3000;       
const SLIDE_DELAY = 60000;     
let savedOrbit = null; 

async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    if(loader) loader.classList.add('active');

    try {
        const treeUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${BRANCH}?recursive=1`;
        const response = await fetch(treeUrl);
        
        if (!response.ok) throw new Error("GitHub API Rate Limit Hit.");
        
        const data = await response.json();
        const modelFiles = data.tree.filter(item => item.path.startsWith('models/') && item.type === 'blob');

        const getModelFromFolder = (folderName, variantName) => {
            const folderPrefix = `models/${folderName}/`;
            
            const modelItem = modelFiles.find(f => {
                if (!f.path.startsWith(folderPrefix)) return false;
                const fileName = f.path.split('/').pop();
                return fileName.toLowerCase().endsWith('.glb') || !fileName.includes('.');
            });
            
            if (!modelItem) return null; 

            const posterItem = modelFiles.find(f => f.path.startsWith(folderPrefix) && f.path.endsWith('.png'));

            return {
                src: `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${encodeURI(modelItem.path)}`,
                poster: posterItem ? `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${encodeURI(posterItem.path)}` : 'https://placehold.co/400x300/222/FFF.png?text=No+Preview',
                variant: variantName
            };
        };

        models = [];
        const singleData = getModelFromFolder('Single Tone', 'SINGLE TONE');
        const twoData = getModelFromFolder('Two Tone', 'TWO TONE');
        const otherData = getModelFromFolder('Other', 'OTHER');

        if (singleData) models.push(singleData);
        if (twoData) models.push(twoData);
        if (otherData) models.push(otherData); 

        if (models.length === 0) throw new Error("No valid 3D files found in folders.");

        startApp();

    } catch (error) {
        console.warn("API Failed or Empty. Using strict hardcoded fallbacks...", error);
        
        models = [
            {
                src: `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/models/Single%20Tone/Toyota%20H300%20Single%20Tone.glb`,
                poster: "https://placehold.co/400x300/222/FFF.png?text=No+Preview",
                variant: "SINGLE TONE"
            },
            {
                src: `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/models/Two%20Tone/Toyota%20H300%20Two%20Tone`,
                poster: "https://placehold.co/400x300/222/FFF.png?text=No+Preview",
                variant: "TWO TONE"
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
    
    // Kick off the global timers immediately
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
        currentIndex = index;
        loadModelData(currentIndex);

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
            loader.classList.remove('active');
            resetGlobalTimers(); 
        }, 250); 

    }, 250); 
}

function loadModelData(index) {
    if (!models[index]) return;
    const data = models[index];

    if(viewer) {
        viewer.poster = data.poster; 

        let finalSrc = data.src;
        if (!finalSrc.toLowerCase().includes('.glb') && !finalSrc.toLowerCase().includes('.gltf')) {
            finalSrc += '#.glb';
        }

        viewer.src = finalSrc;
        
        if (savedOrbit) {
            viewer.cameraOrbit = `${savedOrbit.theta}rad ${savedOrbit.phi}rad auto`;
        } else {
            viewer.cameraOrbit = "auto auto auto";
        }
        viewer.autoRotate = true; 
    }
    updateVariantButtons();
}

// -----------------------------------------------------
// DECOUPLED UX EVENT ARCHITECTURE
// -----------------------------------------------------
function setupEvents() {
    document.getElementById("fsBtn").onclick = () => {
        const app = document.getElementById("app");
        !document.fullscreenElement ? app.requestFullscreen() : document.exitFullscreen();
    };

    // 1. GLOBAL INTERACTION: Hides Hand Icon, resets slide timer. Does NOT affect 3D rotation.
    // Replaced 'pointermove' with 'mousemove/touchstart' to prevent hyper-sensitive jitter bugs.
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(evt => {
        window.addEventListener(evt, resetGlobalTimers);
    });

    if(viewer) {
        // 2. 3D SPECIFIC INTERACTION: Stops car rotation. Resumes after 3s of letting go.
        viewer.addEventListener('camera-change', (e) => {
            if (e.detail.source === 'user-interaction') {
                // Stop spinning
                viewer.autoRotate = false;
                
                // Also instantly hide the hand icon when dragging the car
                const indicator = document.getElementById('idleIndicator');
                if (indicator) indicator.classList.remove('visible');

                // 3D Resume Timer (3 seconds after they stop dragging)
                clearTimeout(cameraIdleTimer);
                cameraIdleTimer = setTimeout(() => {
                    viewer.autoRotate = true;
                    // Gently correct the vertical pitch so the car looks good again
                    const currentOrbit = viewer.getCameraOrbit();
                    viewer.cameraOrbit = `${currentOrbit.theta}rad 75deg auto`;
                }, IDLE_DELAY);
            }
        });

        // 3. COLOR ENGINE DELAY
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

// Triggers whenever the mouse moves ANYWHERE on the screen (UI, buttons, background)
function resetGlobalTimers() {
    const indicator = document.getElementById('idleIndicator');
    
    // Instantly hide the hand icon
    if(indicator && indicator.classList.contains('visible')) {
        indicator.classList.remove('visible');
    }
    
    // UI Timer: Bring the hand icon back ONLY if absolutely no mouse movement happens for 3 seconds
    clearTimeout(globalIdleTimer);
    globalIdleTimer = setTimeout(() => {
        if(indicator) {
            indicator.classList.add('visible');
        }
    }, IDLE_DELAY);

    // Slide Timer: Don't advance to the next car if they are busy tweaking colors
    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => {
        if(models.length > 1) {
            transitionToModel((currentIndex + 1) % models.length);
        }
    }, SLIDE_DELAY);
}

initShowroom();
