/**
 * ECW Studio - Real-Time RGB Auto-Parsing Color Engine
 */
const ColorEngine = {
    viewer: null,
    primaryMaterials: [],
    secondaryMaterials: [],
    
    // UI Elements
    primaryPicker: null,
    primaryHex: null,
    secondaryPicker: null,
    secondaryHex: null,
    brightnessSlider: null,
    
    // Reset Buttons
    resetPrimaryBtn: null,
    resetSecondaryBtn: null,
    resetBrightnessBtn: null,

    // State Memory (To remember original colors)
    initialPrimaryHex: "#FFFFFF",
    initialSecondaryHex: "#000000",

    isInitialized: false,

    init() {
        this.primaryPicker = document.getElementById("primaryColorPicker");
        this.primaryHex = document.getElementById("primaryHexDisplay");
        this.secondaryPicker = document.getElementById("secondaryColorPicker");
        this.secondaryHex = document.getElementById("secondaryHexDisplay");
        this.brightnessSlider = document.getElementById("brightnessSlider");
        
        this.resetPrimaryBtn = document.getElementById("resetPrimaryBtn");
        this.resetSecondaryBtn = document.getElementById("resetSecondaryBtn");
        this.resetBrightnessBtn = document.getElementById("resetBrightnessBtn");

        this.bindEvents();
        this.isInitialized = true;
    },

    rgbArrayToHex(rgbArray) {
        const r = Math.round(rgbArray[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgbArray[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgbArray[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
    },

    hexToNormalizedRGB(hex) {
        hex = hex.replace(/^#/, '');
        let r = parseInt(hex.substring(0, 2), 16) / 255;
        let g = parseInt(hex.substring(2, 4), 16) / 255;
        let b = parseInt(hex.substring(4, 6), 16) / 255;
        return [r, g, b, 1.0];
    },

    analyze(viewer) {
        this.viewer = viewer;
        if (!this.isInitialized) this.init();
        if (!viewer || !viewer.model || !viewer.model.materials) return;

        this.primaryMaterials = [];
        this.secondaryMaterials = [];

        const materials = viewer.model.materials;
        const colorClusters = {};
        
        // Exclude un-paintable parts strictly
        const ignoreList = ['glass', 'tire', 'rubber', 'window', 'transparent', 'chrome', 'wheel', 'lens', 'light', 'interior', 'dash', 'engine', 'grill', 'plastic', 'bolt', 'under'];
        
        // Priority Keywords: Finding these guarantees it's the actual car body
        const paintKeywords = ['paint', 'body', 'exterior', 'shell', 'skin', 'primary', 'secondary', 'stripe', 'livery', 'color', 'metal', 'hood', 'door'];

        materials.forEach(mat => {
            if (!mat.name) return;
            const matName = mat.name.toLowerCase();
            const isIgnored = ignoreList.some(word => matName.includes(word));
            
            if (isIgnored || !mat.pbrMetallicRoughness.baseColorFactor) return;

            const color = mat.pbrMetallicRoughness.baseColorFactor;
            
            // Grouping by rounding
            const r = (Math.round(color[0] * 10) / 10).toFixed(1);
            const g = (Math.round(color[1] * 10) / 10).toFixed(1);
            const b = (Math.round(color[2] * 10) / 10).toFixed(1);
            const clusterKey = `${r},${g},${b}`;

            // Semantic Scoring
            let score = 1; 
            if (paintKeywords.some(word => matName.includes(word))) {
                score += 50; 
            }

            if (!colorClusters[clusterKey]) {
                colorClusters[clusterKey] = { materials: [], originalRgb: color, score: 0 };
            }
            colorClusters[clusterKey].materials.push(mat);
            colorClusters[clusterKey].score += score;
        });

        // Sort by Semantic Score instead of array length
        const sortedKeys = Object.keys(colorClusters).sort((a, b) => {
            return colorClusters[b].score - colorClusters[a].score;
        });

        if (sortedKeys.length > 0) {
            this.primaryMaterials = colorClusters[sortedKeys[0]].materials;
            this.initialPrimaryHex = this.rgbArrayToHex(colorClusters[sortedKeys[0]].originalRgb); // Save to memory
            
            this.primaryPicker.value = this.initialPrimaryHex;
            this.primaryHex.innerText = this.initialPrimaryHex;
            this.primaryPicker.disabled = false;
        }

        if (sortedKeys.length > 1) {
            this.secondaryMaterials = colorClusters[sortedKeys[1]].materials;
            this.initialSecondaryHex = this.rgbArrayToHex(colorClusters[sortedKeys[1]].originalRgb); // Save to memory
            
            this.secondaryPicker.value = this.initialSecondaryHex;
            this.secondaryHex.innerText = this.initialSecondaryHex;
            this.secondaryPicker.disabled = false;
        }
        
        // Ensure brightness starts at default when analyzing a new model
        this.brightnessSlider.value = "1.0";
        this.viewer.exposure = 1.0;

        // Show dock
        const dock = document.getElementById('colorEditorDock');
        if (dock) {
            dock.classList.remove('hidden');
            dock.classList.add('active');
        }
    },

    bindEvents() {
        // Picker Events
        this.primaryPicker.addEventListener('input', (e) => {
            const hex = e.target.value;
            this.primaryHex.innerText = hex.toUpperCase();
            const rgba = this.hexToNormalizedRGB(hex);
            requestAnimationFrame(() => {
                this.primaryMaterials.forEach(mat => mat.pbrMetallicRoughness.setBaseColorFactor(rgba));
            });
        });

        this.secondaryPicker.addEventListener('input', (e) => {
            const hex = e.target.value;
            this.secondaryHex.innerText = hex.toUpperCase();
            const rgba = this.hexToNormalizedRGB(hex);
            requestAnimationFrame(() => {
                this.secondaryMaterials.forEach(mat => mat.pbrMetallicRoughness.setBaseColorFactor(rgba));
            });
        });

        this.brightnessSlider.addEventListener('input', (e) => {
            if (this.viewer) this.viewer.exposure = parseFloat(e.target.value);
        });

        // Reset Button Events
        this.resetPrimaryBtn.addEventListener('click', () => {
            if(this.primaryMaterials.length === 0) return;
            this.primaryPicker.value = this.initialPrimaryHex;
            this.primaryHex.innerText = this.initialPrimaryHex;
            const rgba = this.hexToNormalizedRGB(this.initialPrimaryHex);
            this.primaryMaterials.forEach(mat => mat.pbrMetallicRoughness.setBaseColorFactor(rgba));
        });

        this.resetSecondaryBtn.addEventListener('click', () => {
            if(this.secondaryMaterials.length === 0) return;
            this.secondaryPicker.value = this.initialSecondaryHex;
            this.secondaryHex.innerText = this.initialSecondaryHex;
            const rgba = this.hexToNormalizedRGB(this.initialSecondaryHex);
            this.secondaryMaterials.forEach(mat => mat.pbrMetallicRoughness.setBaseColorFactor(rgba));
        });

        this.resetBrightnessBtn.addEventListener('click', () => {
            this.brightnessSlider.value = "1.0";
            if(this.viewer) this.viewer.exposure = 1.0;
        });
    },

    reset() {
        this.primaryMaterials = [];
        this.secondaryMaterials = [];
        if (this.primaryPicker) {
            this.primaryPicker.value = "#ffffff";
            this.primaryHex.innerText = "#FFFFFF";
            this.primaryPicker.disabled = true;
        }
        if (this.secondaryPicker) {
            this.secondaryPicker.value = "#000000";
            this.secondaryHex.innerText = "#000000";
            this.secondaryPicker.disabled = true;
        }
        if (this.brightnessSlider) {
            this.brightnessSlider.value = "1.0";
            if(this.viewer) this.viewer.exposure = 1.0;
        }
        
        const dock = document.getElementById('colorEditorDock');
        if (dock) {
            dock.classList.remove('active');
            dock.classList.add('hidden');
        }
    }
};

// Auto-run when model loads natively
document.addEventListener("DOMContentLoaded", () => {
    const viewer = document.getElementById("viewer3d");
    if(viewer) {
        viewer.addEventListener('load', () => {
            ColorEngine.analyze(viewer);
        });
    }
});
