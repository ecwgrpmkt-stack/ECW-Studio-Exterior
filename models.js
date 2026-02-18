// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const MODEL_FOLDER = "models";

// STATE
let models = []; 
let currentIndex = 0;
const viewer = document.querySelector("#viewer3d");
let idleTimer = null;
const IDLE_DELAY = 3000;

// --- 1. INITIALIZATION ---
async function initShowroom() {
    const loader = document.getElementById('ecwLoader');
    loader.classList.add('active');
    
    try {
        // Fetch File List
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${MODEL_FOLDER}`);
        if (!response.ok) throw new Error("Failed to load models. Check API/Folder.");
        
        const files = await response.json();
        
        // Filter for GLB files
        const glbFiles = files.filter(f => f.name.match(/\.(glb|gltf)$/i) && !f.name.startsWith('disabled_'));
        
        // Build Model Objects
        models = glbFiles.map(file => {
            const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
            
            // Try to find matching PNG in the file list
            const thumbFile = files.find(f => f.name === `${baseName}.png`);
            
            // If no thumb, use a generic placeholder or the model itself (less efficient)
            const thumbUrl = thumbFile ? thumbFile.download_url : 'https://placehold.co/200x200/333/fff?text=No+Preview';
            
            // Parse Name (Optional: "Year_ModelName.glb")
            const parts = baseName.split('_');
            const displayYear = parts.length > 1 && !isNaN(parts[0]) ? parts[0] : "----";
            const displayName = parts.length > 1 ? parts.slice(1).join(' ') : baseName;

            return {
                src: file.download_url,
                poster: thumbUrl, // Use the PNG as the poster
                name: displayName.replace(/-/g, ' '),
                year: displayYear
            };
        });

        if (models.length === 0) throw new Error("No 3D models found in /models folder.");

        buildThumbnails();
        loadModel(0); // Load first model
        setupEvents();

    } catch (error) {
        console.error(error);
        document.getElementById('infoName').innerText = "Error";
        document.getElementById('infoModel').innerText = "No Models Found";
    } finally {
        setTimeout(() => loader.classList.remove('active'), 1000);
    }
}

// --- 2. LOADING LOGIC ---
function loadModel(index) {
    if(!models[index]) return;
    const data = models[index];
    
    // Update Text Info
    document.getElementById('infoName').innerText = data.name;
    document.getElementById('infoYear').innerText = data.year;
    document.getElementById('infoModel').innerText = "Exterior";

    // Set 3D Viewer Attributes
    // Setting POSTER first creates the "Optimization"
    viewer.poster = data.poster; 
    viewer.src = data.src;
    viewer.alt = data.name;

    updateThumbs();
    resetIdleTimer();
}

// --- 3. UI BUILDER ---
function buildThumbnails() {
    const panel = document.getElementById("thumbPanel");
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
        if(i === currentIndex) t.scrollIntoView({ behavior: "smooth", block: "center" });
    });
}

// --- 4. INTERACTION ---
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

    // Auto-Rotate Logic
    viewer.addEventListener('camera-change', (e) => {
        if (e.detail.source === 'user-interaction') stopAutoRotate();
    });
}

function stopAutoRotate() {
    viewer.autoRotate = false;
    document.getElementById('idleIndicator').classList.remove('visible');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        viewer.autoRotate = true; // Resume spin
    }, IDLE_DELAY);
}

function resetIdleTimer() {
    viewer.autoRotate = true;
    clearTimeout(idleTimer);
}

// Start
initShowroom();