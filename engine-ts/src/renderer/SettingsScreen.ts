import { locales } from '../locales';

export class SettingsScreen {
    private container: HTMLElement;
    private onBack: () => void;
    private onLanguageChange: (lang: string) => void;

    // Dummy settings state
    private settings = {
        volume: 50,
        graphics: 'high',
        language: 'en'
    };

    constructor(onBack: () => void, onLanguageChange: (lang: string) => void) {
        this.onBack = onBack;
        this.onLanguageChange = onLanguageChange;
        this.container = document.createElement('div');
        this.container.id = 'settings-screen';
        this.setupUI();
    }

    private setupUI() {
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.display = 'none';
        this.container.style.flexDirection = 'column';
        this.container.style.alignItems = 'center';
        this.container.style.justifyContent = 'center';
        this.container.style.backgroundColor = 'rgba(10, 10, 10, 0.95)';
        this.container.style.color = '#fff';
        this.container.style.zIndex = '60'; // Higher than title screen
        this.container.style.backdropFilter = 'blur(10px)';

        const title = document.createElement('h2');
        title.id = 'settings-title';
        title.innerText = locales['en'].settings_button;
        title.style.fontFamily = "'Segoe UI', sans-serif";
        title.style.fontSize = '3rem';
        title.style.marginBottom = '3rem';
        title.style.textShadow = '0 0 10px rgba(0, 100, 255, 0.5)';
        title.style.letterSpacing = '3px';
        this.container.appendChild(title);

        // Volume Control
        const volumeContainer = this.createSettingRow('Master Volume', 'settings-volume-label');
        const volumeSlider = document.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.min = '0';
        volumeSlider.max = '100';
        volumeSlider.value = this.settings.volume.toString();
        volumeSlider.style.width = '200px';
        volumeSlider.oninput = (e) => {
            this.settings.volume = parseInt((e.target as HTMLInputElement).value);
            // In a real app, apply volume change here
        };
        volumeContainer.appendChild(volumeSlider);
        this.container.appendChild(volumeContainer);

        // Graphics Control
        const graphicsContainer = this.createSettingRow('Graphics Quality', 'settings-graphics-label');
        const graphicsSelect = document.createElement('select');
        graphicsSelect.id = 'settings-graphics-select';
        ['Low', 'Medium', 'High'].forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.toLowerCase();
            option.innerText = opt;
            if (opt.toLowerCase() === this.settings.graphics) option.selected = true;
            graphicsSelect.appendChild(option);
        });
        graphicsSelect.style.padding = '5px';
        graphicsSelect.style.background = '#222';
        graphicsSelect.style.color = '#fff';
        graphicsSelect.style.border = '1px solid #555';
        graphicsSelect.onchange = (e) => {
            this.settings.graphics = (e.target as HTMLSelectElement).value;
        };
        graphicsContainer.appendChild(graphicsSelect);
        this.container.appendChild(graphicsContainer);

        // Language Control
        const langContainer = this.createSettingRow('Language', 'settings-language-label');
        const langSelect = document.createElement('select');
        langSelect.id = 'settings-language-select';
        [
            { value: 'en', label: 'English' },
            { value: 'cn', label: 'Chinese' }
        ].forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.innerText = opt.label;
            if (opt.value === this.settings.language) option.selected = true;
            langSelect.appendChild(option);
        });
        langSelect.style.padding = '5px';
        langSelect.style.background = '#222';
        langSelect.style.color = '#fff';
        langSelect.style.border = '1px solid #555';
        langSelect.onchange = (e) => {
            const newLang = (e.target as HTMLSelectElement).value;
            this.settings.language = newLang;
            this.onLanguageChange(newLang);
        };
        langContainer.appendChild(langSelect);
        this.container.appendChild(langContainer);



        const backBtn = document.createElement('button');
        backBtn.id = 'settings-back-btn';
        backBtn.innerText = locales['en'].back_button;
        backBtn.style.marginTop = '4rem';
        backBtn.style.background = 'transparent';
        backBtn.style.border = '1px solid #555';
        backBtn.style.color = '#888';
        backBtn.style.padding = '0.8rem 2rem';
        backBtn.style.fontFamily = 'monospace';
        backBtn.style.fontSize = '1.2rem';
        backBtn.style.cursor = 'pointer';
        backBtn.style.transition = 'all 0.2s';

        backBtn.onmouseover = () => {
            backBtn.style.color = '#fff';
            backBtn.style.border = '1px solid #fff';
        };
        backBtn.onmouseout = () => {
            backBtn.style.color = '#888';
            backBtn.style.border = '1px solid #555';
        };
        backBtn.onclick = () => {
            this.onBack();
        };

        this.container.appendChild(backBtn);

        document.getElementById('app')?.appendChild(this.container);
    }

    setLanguage(lang: string) {
        const t = locales[lang];
        if (!t) return;

        const title = document.getElementById('settings-title');
        if (title) title.innerText = t.settings_button;

        const backBtn = document.getElementById('settings-back-btn');
        if (backBtn) backBtn.innerText = t.back_button;

        const volLabel = document.getElementById('settings-volume-label');
        if (volLabel) volLabel.innerText = t.volume;

        const gfxLabel = document.getElementById('settings-graphics-label');
        if (gfxLabel) gfxLabel.innerText = t.graphics;

        const langLabel = document.getElementById('settings-language-label');
        if (langLabel) langLabel.innerText = t.language;

        // Update Graphics Options
        const gfxSelect = document.getElementById('settings-graphics-select') as HTMLSelectElement;
        if (gfxSelect) {
            Array.from(gfxSelect.options).forEach(opt => {
                const val = opt.value.toLowerCase();
                if (val === 'low') opt.text = t.quality_low;
                if (val === 'medium') opt.text = t.quality_medium;
                if (val === 'high') opt.text = t.quality_high;
            });
        }

        // Update Language Options
        const langSelect = document.getElementById('settings-language-select') as HTMLSelectElement;
        if (langSelect) {
            Array.from(langSelect.options).forEach(opt => {
                if (opt.value === 'en') opt.text = t.lang_en;
                if (opt.value === 'cn') opt.text = t.lang_cn;
            });
        }
    }

    private createSettingRow(label: string, id?: string): HTMLElement {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.width = '400px';
        row.style.marginBottom = '1.5rem';

        const labelEl = document.createElement('span');
        if (id) labelEl.id = id;
        labelEl.innerText = label;
        labelEl.style.fontFamily = 'monospace';
        labelEl.style.fontSize = '1.2rem';
        labelEl.style.color = '#ccc';

        row.appendChild(labelEl);
        return row;
    }

    show() {
        this.container.style.display = 'flex';
        this.container.style.opacity = '0';
        requestAnimationFrame(() => {
            this.container.style.transition = 'opacity 0.3s ease';
            this.container.style.opacity = '1';
        });
    }

    hide() {
        this.container.style.opacity = '0';
        setTimeout(() => {
            this.container.style.display = 'none';
        }, 300);
    }
}
