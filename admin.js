// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";

// STATE: Default to images to keep existing gallery working
let currentFolder = "images"; 

// --- 1. AUTH ---
if (sessionStorage.getItem('ecw_auth') !== 'true') window.location.href = 'index.html';
function logout() { sessionStorage.removeItem('ecw_auth'); window.location.href = 'index.html'; }

// --- 2. CONTEXT SWITCHING (THE FIX) ---
function switchContext(folder) {
    currentFolder = folder;
    
    // Toggle Button Styles
    const btnImg = document.getElementById('tab-images');
    const btnMod = document.getElementById('tab-models');
    
    if (folder === 'images') {
        btnImg.style.background = '#3399ff'; btnImg.style.color = 'white';
        btnMod.style.background = '#111'; btnMod.style.color = '#888';
    } else {
        btnMod.style.background = '#3399ff'; btnMod.style.color = 'white';
        btnImg.style.background = '#111'; btnImg.style.color = '#888';
    }

    const isModel = folder === 'models';
    document.getElementById('uploadTitle').innerText = isModel ? "Upload 3D Models & Posters" : "Upload 360 Images";
    document.getElementById('uploadHint').innerText = isModel ? "Required: .GLB (Model) AND .PNG (Poster)" : "Supported: JPG, PNG";
    
    // Change Accepted File Types
    document.getElementById('fileInput').accept = isModel ? ".glb, .png" : ".jpg, .jpeg, .png";
    document.getElementById('repoUrl').value = `/${folder}`;
    
    loadFiles();
}

// Initialize Tabs on Load
switchContext('images');

// --- 3. TOKEN LOGIC ---
const tokenInput = document.getElementById('githubToken');
const tokenLockBtn = document.getElementById('tokenLockBtn');
let isTokenLocked = true; 
const savedToken = localStorage.getItem('ecw_gh_token');

if (savedToken) { tokenInput.value = savedToken; lockTokenField(); } 
else { unlockTokenField(); }

function unlockTokenField() {
    tokenInput.readOnly = false; tokenInput.disabled = false; tokenInput.type = 'text';         
    tokenInput.style.backgroundColor = "rgba(255,255,255,0.1)"; tokenInput.style.color = "#ffffff";
    tokenLockBtn.innerText = '🔓'; isTokenLocked = false;
}
function lockTokenField() {
    tokenInput.readOnly = true; tokenInput.type = 'password';     
    tokenInput.style.backgroundColor = "rgba(0,0,0,0.5)"; tokenInput.style.color = "#888888";
    tokenLockBtn.innerText = '🔒'; isTokenLocked = true;
    if (tokenInput.value.trim() !== '') localStorage.setItem('ecw_gh_token', tokenInput.value.trim());
}
tokenLockBtn.addEventListener('click', () => isTokenLocked ? (unlockTokenField(), tokenInput.focus()) : lockTokenField());

// --- 4. DATA FETCHING ---
async function loadFiles() {
    const tableBody = document.getElementById('fileTableBody');
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">Fetching /${currentFolder}...</td></tr>`;
    
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${currentFolder}?t=${Date.now()}`);
        
        // HANDLE MISSING FOLDER (Fixes the System Info Error)
        if (response.status === 404) {
             tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:orange;">Folder '/${currentFolder}' does not exist yet.<br>Upload a file above to create it automatically.</td></tr>`;
             return;
        }
        
        if (!response.ok) throw new Error("GitHub API Error. Check Token.");
        
        const data = await response.json();
        
        // STRICT FILTERING
        const files = data.filter(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (currentFolder === 'images') return ['jpg', 'jpeg', 'png'].includes(ext);
            if (currentFolder === 'models') return ['glb', 'gltf', 'png'].includes(ext);
            return false;
        });

        tableBody.innerHTML = ""; 
        for (const file of files) {
            const row = document.createElement('tr');
            row.id = `row-${file.sha}`; 
            row.innerHTML = buildRowHTML(file);
            tableBody.appendChild(row);
        }
        if(files.length === 0) tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No files found.</td></tr>`;

    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">${error.message}</td></tr>`;
    }
}

function buildRowHTML(file) {
    const isDisabled = file.name.startsWith("disabled_");
    const cleanName = isDisabled ? file.name.replace("disabled_", "") : file.name;
    const ext = file.name.split('.').pop().toLowerCase();
    
    const statusBadge = isDisabled 
        ? `<span class="badge warning">Hidden</span>` 
        : `<span class="badge success">Live</span>`;
    
    let preview = "";
    if (['jpg','jpeg','png'].includes(ext)) {
        preview = `<img src="${file.download_url}" class="admin-thumb" style="width:50px; height:30px; object-fit:cover; opacity: ${isDisabled ? 0.5 : 1}">`;
    } else if (ext === 'glb') {
        preview = `<div style="background:#333; color:white; font-size:10px; padding:2px;">📦 3D</div>`;
    }

    return `
        <td>${preview}</td>
        <td style="color: ${isDisabled ? '#888' : '#fff'}; word-break: break-all;">${cleanName}</td>
        <td class="dim-cell">${(file.size / 1024).toFixed(0)} KB</td>
        <td>${statusBadge}</td>
        <td>
            <div class="action-buttons">
                <button onclick="openDeleteModal('${file.name}', '${file.sha}')" class="btn-mini btn-red" title="Delete">🗑️</button>
            </div>
        </td>
    `;
}

// --- 5. API HELPER ---
async function githubRequest(endpoint, method = 'GET', body = null) {
    const rawToken = document.getElementById('githubToken').value.trim();
    if (!rawToken) { if(isTokenLocked) unlockTokenField(); tokenInput.focus(); throw new Error("GitHub Token required."); }
    
    const options = {
        method: method,
        headers: { 
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${rawToken}`, 
            'X-GitHub-Api-Version': '2022-11-28'
        }
    };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/${endpoint}`, options);
    if (!response.ok) throw new Error(`API Error ${response.status}`);
    return response;
}

// --- 6. ACTIONS ---
const modal = document.getElementById('customModal');
function closeModal() { modal.classList.remove('active'); }

function openDeleteModal(filename, sha) {
    document.getElementById('modalTitle').innerText = "Delete Asset";
    document.getElementById('modalBody').innerHTML = `<p>Delete <strong>${filename}</strong>?</p>`;
    document.getElementById('modalFooter').innerHTML = `
        <button class="modal-btn btn-cancel" onclick="closeModal()">Cancel</button>
        <button class="modal-btn btn-confirm" onclick="executeDelete('${filename}', '${sha}')">Delete</button>`;
    modal.classList.add('active');
}

async function executeDelete(filename, sha) {
    try {
        await githubRequest(`contents/${currentFolder}/${encodeURIComponent(filename)}`, 'DELETE', { 
            message: `Delete ${filename}`, sha: sha 
        });
        document.getElementById(`row-${sha}`).remove(); closeModal();
    } catch(e) { alert(e.message); }
}

// --- 7. UPLOAD LOGIC ---
document.getElementById('fileInput').addEventListener('change', async function() {
    const files = Array.from(this.files);
    if(files.length === 0) return;
    
    const statusMsg = document.getElementById('uploadStatus');
    const token = document.getElementById('githubToken').value;
    if(!token) { alert("Please lock in your GitHub Token."); return; }

    for (const file of files) {
        statusMsg.innerHTML = `<span style="color:orange">Uploading ${file.name}...</span>`;
        const limitMB = (file.name.endsWith('.glb')) ? 50 : 25;
        
        if (file.size / 1024 / 1024 > limitMB) {
            alert(`${file.name} is too large (> ${limitMB}MB).`); continue;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function() {
            const content = reader.result.split(',')[1];
            try {
                let sha = null;
                try {
                    const check = await githubRequest(`contents/${currentFolder}/${encodeURIComponent(file.name)}`, 'GET');
                    const json = await check.json();
                    sha = json.sha;
                } catch(e) {}

                const body = { message: `Upload ${file.name}`, content: content };
                if(sha) body.sha = sha;

                await githubRequest(`contents/${currentFolder}/${encodeURIComponent(file.name)}`, 'PUT', body);
            } catch(e) { console.error(e); }
        };
    }
    
    setTimeout(() => {
        statusMsg.innerHTML = `<span style="color:#00ff00">Complete</span>`;
        loadFiles();
    }, 2000 * files.length + 1000);
});
