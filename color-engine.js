/**
 * ECW Studio - Real-Time Material Color Engine
 */

const ColorEngine = {
    viewer: null,
    materialsData: [],
    groups: {},
    dock: null,

    // Math Helpers
    rgbToHsl(r, g, b) {
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; } 
        else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, l];
    },

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) { r = g = b = l; } 
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            let p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [r, g, b];
    },

    clamp(val, min, max) { return Math.min(Math.max(val, min), max); },

    // Analyzer
    analyze(viewer) {
        this.viewer = viewer;
        this.dock = document.getElementById('colorEditorDock');
        if (!viewer || !viewer.model || !viewer.model.materials) return;

        this.materialsData = [];
        const materials = viewer.model.materials;
        
        let blacks = [], whites = [], others = [];

        materials.forEach((mat, index) => {
            if (!mat.pbrMetallicRoughness) return;
            const baseColor = mat.pbrMetallicRoughness.baseColorFactor;
            if (!baseColor) return;

            const [r, g, b, a] = baseColor;
            const hsl = this.rgbToHsl(r, g, b);
            
            const matData = { index, mat, originalRgb: [r, g, b, a], hsl };
            this.materialsData.push(matData);

            if (hsl[2] < 0.25) { blacks.push(matData); } 
            else if (hsl[2] > 0.7 && hsl[1] < 0.2) { whites.push(matData); } 
            else { others.push(matData); }
        });

        let color1 = [], color2 = [];
        if (others.length > 0) {
            let buckets = Array(12).fill(0).map(() => []);
            others.forEach(m => buckets[Math.floor(m.hsl[0] * 11.99) || 0].push(m));
            buckets.sort((a, b) => b.length - a.length);
            
            color1 = buckets[0] || [];
            for (let i = 1; i < buckets.length; i++) {
                if (buckets[i].length > 0 && Math.abs(buckets[i][0].hsl[0] - color1[0].hsl[0]) > 0.15) {
                    color2 = buckets[i];
                    break;
                }
            }
        }

        this.groups = {
            'Darks & Blacks': blacks,
            'Lights & Whites': whites,
            'Primary Color': color1,
            'Secondary Color': color2
        };

        this.buildUI();
    },

    // UI Builder with Accordion Logic
    buildUI() {
        if (!this.dock) return;
        
        if (Object.keys(this.groups).every(k => this.groups[k].length === 0)) {
            this.dock.innerHTML = '<div class="ce-title">Material Tuner</div><div style="padding:10px;color:#888;font-size:0.8rem;text-align:center;">No editable colors detected.</div>';
            this.dock.classList.remove('hidden');
            this.dock.classList.add('active');
            return;
        }

        this.dock.innerHTML = '<div class="ce-title">Material Tuner</div>';
        
        Object.keys(this.groups).forEach(groupName => {
            const groupMats = this.groups[groupName];
            if (groupMats.length === 0) return;

            let avgR = 0, avgG = 0, avgB = 0;
            groupMats.forEach(m => { avgR += m.originalRgb[0]; avgG += m.originalRgb[1]; avgB += m.originalRgb[2]; });
            avgR /= groupMats.length; avgG /= groupMats.length; avgB /= groupMats.length;
            
            const hexColor = `#${Math.round(avgR*255).toString(16).padStart(2,'0')}${Math.round(avgG*255).toString(16).padStart(2,'0')}${Math.round(avgB*255).toString(16).padStart(2,'0')}`;

            // Determine if collapsed by default
            const isCollapsed = groupName.includes('Blacks') || groupName.includes('Whites');

            const section = document.createElement('div');
            section.className = `ce-section ${isCollapsed ? 'collapsed' : ''}`;
            
            section.innerHTML = `
                <div class="ce-header" title="Click to Expand/Collapse">
                    <span class="ce-toggle">▼</span>
                    <div class="ce-swatch" style="background-color: ${hexColor}"></div>
                    <span>${groupName}</span>
                    <button class="ce-reset" title="Restore Original">↺</button>
                </div>
                <div class="ce-sliders">
                    <div class="ce-slider-row">
                        <span>Hue</span>
                        <div class="range-wrap"><div class="range-tick"></div><input type="range" data-type="hue" min="-180" max="180" value="0"></div>
                    </div>
                    <div class="ce-slider-row">
                        <span>Sat</span>
                        <div class="range-wrap"><div class="range-tick"></div><input type="range" data-type="sat" min="-100" max="100" value="0"></div>
                    </div>
                    <div class="ce-slider-row">
                        <span>Con</span>
                        <div class="range-wrap"><div class="range-tick"></div><input type="range" data-type="con" min="-100" max="100" value="0"></div>
                    </div>
                </div>
            `;
            
            // Accordion Toggle Event
            const header = section.querySelector('.ce-header');
            header.addEventListener('click', (e) => {
                // Prevent toggle if the reset button was clicked
                if (e.target.classList.contains('ce-reset')) return;
                section.classList.toggle('collapsed');
            });

            // Slider Events
            const inputs = section.querySelectorAll('input');
            inputs.forEach(input => {
                input.addEventListener('input', () => this.applyColor(groupName, section));
            });

            // Reset Event
            const resetBtn = section.querySelector('.ce-reset');
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop accordion toggle
                inputs.forEach(input => input.value = 0);
                this.applyColor(groupName, section);
            });

            this.dock.appendChild(section);
        });

        this.dock.classList.remove('hidden');
        this.dock.classList.add('active');
    },

    // Apply Color (RGB readout logic removed)
    applyColor(groupName, section) {
        const hueShift = parseFloat(section.querySelector('[data-type="hue"]').value) / 360;
        const satShift = parseFloat(section.querySelector('[data-type="sat"]').value) / 100;
        const conShift = parseFloat(section.querySelector('[data-type="con"]').value); 

        const C = conShift * 2.55; 
        const factor = (259 * (C + 255)) / (255 * (259 - C));

        const groupMats = this.groups[groupName];

        groupMats.forEach((m) => {
            let [h, s, l] = m.hsl;
            
            h = (h + hueShift + 1) % 1; 
            s = this.clamp(s + satShift, 0, 1);
            
            let [r, g, b] = this.hslToRgb(h, s, l);

            r = this.clamp(factor * (r - 0.5) + 0.5, 0, 1);
            g = this.clamp(factor * (g - 0.5) + 0.5, 0, 1);
            b = this.clamp(factor * (b - 0.5) + 0.5, 0, 1);

            m.mat.pbrMetallicRoughness.setBaseColorFactor([r, g, b, m.originalRgb[3]]);
        });
    },

    reset() {
        if(this.dock) {
            this.dock.classList.remove('active');
            this.dock.classList.add('hidden');
            this.dock.innerHTML = '';
        }
        this.groups = {};
        this.materialsData = [];
    }
};
