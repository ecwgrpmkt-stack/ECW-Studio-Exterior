// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "ECW-Studio";
const MODEL_FOLDER = "models";

let models = []; 
let currentIndex = 0;
const viewer = document.querySelector("#viewer3d");

// TIMERS
let idleTimer = null;
let slideTimer = null; 
const IDLE_DELAY = 3000;       
const SLIDE_DELAY = 60000;     
let colorEngineTimer = null;   

let savedOrbit = null; 

async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    if(loader) loader.classList.add('active');

    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${MODEL_FOLDER}`);
        if (!response.ok) throw new Error("GitHub API Error.");
        
        const files = await response.json();
        const glbFiles = files.filter(f => f.name.toLowerCase().endsWith('.glb') && !f.name.startsWith('disabled_'));

        if (glbFiles.length === 0) throw new Error("No 3D models found.");

        models = glbFiles.map(glb => {
            const baseName = glb.name.substring(0, glb.name.lastIndexOf('.'));
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

        startApp();

    } catch (error) {
        console.warn("API Failed, using Hardcoded Fallback Models so the app keeps working...", error);
        document.getElementById('infoName').innerText = "API LIMIT REACHED";
        
        models = [{
            src: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/ford_mustang_1965.glb",
            poster: "https://raw.githubusercontent.com/ecwgrpmkt-stack/ECW-Studio/main/models/ford_mustang_1965.png",
            name: "Ford Mustang 1965",
            year: "1965"
        }];
        startApp();
    } finally {
        if(loader) setTimeout(() => loader.classList.remove('active'), 300);
    }
}

function startApp() {
    buildThumbnails();
    loadModelData(0);
    setupEvents();
    startTimers(); 
}

// SPEED OPTIMIZATION: Reduced Transition Delays
function transitionToModel(index) {
    const fadeOverlay = document.getElementById('fadeOverlay');
    const loader = document.getElementById('ecwLoader');
    
    if (typeof ColorEngine !== 'undefined') ColorEngine.reset();

    if (viewer) {
        const orbit = viewer.getCameraOrbit();
        savedOrbit = { theta: orbit.theta, phi: orbit.phi };
    }

    fadeOverlay.classList.add('active');
    loader.classList.add('active'); 

    // Reduced wait from 500ms to 200ms
    setTimeout(() => {
        try {
            currentIndex = index;
            loadModelData(currentIndex);
        } catch(e) { console.error(e); }

        // Reduced buffer from 800ms to 200ms
        setTimeout(() => {
            fadeOverlay.classList.remove('active');
            loader.classList.remove('active');
            updateThumbs();
            resetTimers(); 
            preloadNextPoster(); // Aggressive caching
        }, 200); 

    }, 200); 
}

function preloadNextPoster() {
    if (models.length > 1) {
        const nextIndex = (currentIndex + 1) % models.length;
        const img = new Image();
        img.src = models[nextIndex].poster;
    }
}

function loadModelData(index) {
    if (!models[index]) return;
    const data = models[index];
    
    document.getElementById('infoName').innerText = data.name;
    document.getElementById('infoYear').innerText = data.year;

    if(viewer) {
        viewer.poster = data.poster; 
        viewer.src = data.src;
        viewer.alt = `3D Model of ${data.name}`;
        
        if (savedOrbit) {
            viewer.cameraOrbit = `${savedOrbit.theta}rad ${savedOrbit.phi}rad auto`;
        } else {
            viewer.cameraOrbit = "auto auto auto";
        }
        viewer.autoRotate = true; 
    }
    updateThumbs();
}

function buildThumbnails() {
    const panel = document.getElementById("thumbPanel");
    if(!panel) return;
    panel.innerHTML = "";
    
    models.forEach((item, i) => {
        const thumb = document.createElement("img");
        thumb.src = item.poster; 
        thumb.className = "thumb";
        thumb.onclick = () => transitionToModel(i);
        panel.appendChild(thumb);
    });
}

function updateThumbs() {
    const thumbs = document.querySelectorAll(".thumb");
    thumbs.forEach((t, i) => {
        t.classList.toggle("active", i === currentIndex);
        if(i === currentIndex) {
            t.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
    });
}

function setupEvents() {
    document.getElementById("prevBtn").onclick = () => transitionToModel((currentIndex - 1 + models.length) % models.length);
    document.getElementById("nextBtn").onclick = () => transitionToModel((currentIndex + 1) % models.length);
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
                }, 400); // Trigger analyzer slightly faster
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
        transitionToModel((currentIndex + 1) % models.length);
    }, SLIDE_DELAY);
}

function resetTimers() {
    clearTimeout(idleTimer);
    clearTimeout(slideTimer);
    startTimers();
}

initShowroom();
