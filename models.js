// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "ECW-Studio"; // FIXED: Correct Repo Name
const MODEL_FOLDER = "models";

let models = []; 
let currentIndex = 0;
const viewer = document.querySelector("#viewer3d");
let idleTimer = null;
const IDLE_DELAY = 3000;

async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    if(loader) loader.classList.add('active');

    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${MODEL_FOLDER}`);
        
        if (response.status === 404) throw new Error("Models folder not found.");
        if (!response.ok) throw new Error("GitHub API Error.");
        
        const files = await response.json();
        
        // Filter for GLB files (Case insensitive)
        const glbFiles = files.filter(f => f.name.toLowerCase().endsWith('.glb') && !f.name.startsWith('disabled_'));

        if (glbFiles.length === 0) throw new Error("No 3D models found in repository.");

        models = glbFiles.map(glb => {
            const baseName = glb.name.substring(0, glb.name.lastIndexOf('.'));
            const pngName = `${baseName}.png`;
            // Try to find matching PNG
            const posterFile = files.find(f => f.name === pngName);
            
            // Format Name
            let niceName = baseName.replace(/_/g, ' ').replace(/-/g, ' ');
            niceName = niceName.replace(/\b\w/g, l => l.toUpperCase());

            return {
                src: glb.download_url,
                // If poster exists use it, otherwise use placeholder text
                poster: posterFile ? posterFile.download_url : 'https://placehold.co/400x300/222/FFF.png?text=No+Preview',
                name: niceName,
                year: (niceName.match(/\d{4}/) || ["Model"])[0] 
            };
        });

        // Initialize
        buildThumbnails();
        loadModel(0);
        setupEvents();

    } catch (error) {
        console.error(error);
        // Show error on screen so you know what happened
        document.getElementById('infoName').innerText = "ERROR";
        document.getElementById('infoYear').innerText = "Check Console";
    } finally {
        if(loader) setTimeout(() => loader.classList.remove('active'), 500);
    }
}

function loadModel(index) {
    if (!models[index]) return;
    const data = models[index];
    
    document.getElementById('infoName').innerText = data.name;
    document.getElementById('infoYear').innerText = data.year;

    if(viewer) {
        // Load Model
        viewer.poster = data.poster; 
        viewer.src = data.src;
        viewer.alt = `3D Model of ${data.name}`;
        
        // Force Auto-Rotate on load
        viewer.currentTime = 0;
        viewer.autoRotate = true; 
    }
    
    updateThumbs();
    resetIdleTimer();
}

function buildThumbnails() {
    const panel = document.getElementById("thumbPanel");
    if(!panel) return;
    panel.innerHTML = "";
    
    models.forEach((item, i) => {
        const thumb = document.createElement("img");
        thumb.src = item.poster; 
        thumb.className = "thumb";
        thumb.onclick = () => { currentIndex = i; loadModel(currentIndex); };
        panel.appendChild(thumb);
    });
}

function updateThumbs() {
    document.querySelectorAll(".thumb").forEach((t, i) => {
        t.classList.toggle("active", i === currentIndex);
        if(i === currentIndex) t.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
}

function setupEvents() {
    document.getElementById("prevBtn").onclick = () => {
        currentIndex = (currentIndex - 1 + models.length) % models.length;
        loadModel(currentIndex);
    };
    document.getElementById("nextBtn").onclick = () => {
        currentIndex = (currentIndex + 1) % models.length;
        loadModel(currentIndex);
    };
    document.getElementById("fsBtn").onclick = () => {
        const app = document.getElementById("app");
        !document.fullscreenElement ? app.requestFullscreen() : document.exitFullscreen();
    };

    if(viewer) {
        // Pause rotation when user grabs the car
        viewer.addEventListener('camera-change', (e) => {
            if (e.detail.source === 'user-interaction') stopAutoRotate();
        });
    }
}

function stopAutoRotate() {
    if(!viewer) return;
    viewer.autoRotate = false;
    document.getElementById('idleIndicator').classList.remove('visible');
    
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { viewer.autoRotate = true; }, IDLE_DELAY);
}

function resetIdleTimer() {
    clearTimeout(idleTimer);
    if(viewer) viewer.autoRotate = true;
}

// Start
initShowroom();
