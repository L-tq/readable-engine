import { ScenarioList, ScenarioInfo } from './ScenarioList';
import { locales } from '../locales';

export class MapSelectionScreen {
    private container: HTMLElement;
    private onStart: (scenario: ScenarioInfo) => void;
    private onBack: () => void;

    constructor(onStart: (scenario: ScenarioInfo) => void, onBack: () => void) {
        this.onStart = onStart;
        this.onBack = onBack;
        this.container = document.createElement('div');
        this.container.id = 'map-selection-screen';
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
        this.container.style.zIndex = '60';
        this.container.style.backdropFilter = 'blur(10px)';

        const title = document.createElement('h2');
        title.id = 'map-selection-title';
        title.innerText = locales['en'].select_scenario;
        title.style.fontFamily = "'Segoe UI', sans-serif";
        title.style.fontSize = '3rem';
        title.style.marginBottom = '2rem';
        title.style.textShadow = '0 0 10px rgba(0, 255, 100, 0.5)';
        title.style.letterSpacing = '3px';
        this.container.appendChild(title);

        const listContainer = document.createElement('div');
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.gap = '1rem';
        listContainer.style.width = '60%';
        listContainer.style.maxWidth = '600px';
        listContainer.style.maxHeight = '50vh';
        listContainer.style.overflowY = 'auto';
        this.container.appendChild(listContainer);

        ScenarioList.forEach(scenario => {
            const item = document.createElement('div');
            item.style.background = 'rgba(255, 255, 255, 0.05)';
            item.style.border = '1px solid #444';
            item.style.padding = '1.5rem';
            item.style.cursor = 'pointer';
            item.style.transition = 'all 0.2s ease';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';

            item.innerHTML = `
                <div>
                    <h3 style="margin: 0; font-family: monospace; font-size: 1.2rem; color: #0f0;">${scenario.name}</h3>
                    <p style="margin: 5px 0 0 0; color: #aaa; font-size: 0.9rem;">${scenario.description}</p>
                </div>
                <div style="font-size: 1.5rem; color: #555;">&gt;</div>
            `;

            item.onmouseover = () => {
                item.style.background = 'rgba(0, 255, 100, 0.1)';
                item.style.borderColor = '#0f0';
            };
            item.onmouseout = () => {
                item.style.background = 'rgba(255, 255, 255, 0.05)';
                item.style.borderColor = '#444';
            };
            item.onclick = () => {
                this.onStart(scenario);
            };

            listContainer.appendChild(item);
        });

        const backBtn = document.createElement('button');
        backBtn.id = 'map-selection-back-btn';
        backBtn.innerText = locales['en'].back_button;
        backBtn.style.marginTop = '3rem';
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

    show() {
        this.container.style.display = 'flex';
        // Add a small fade-in animation
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
    setLanguage(lang: string) {
        const t = locales[lang];
        if (!t) return;

        const title = document.getElementById('map-selection-title');
        if (title) title.innerText = t.select_scenario;

        const backBtn = document.getElementById('map-selection-back-btn');
        if (backBtn) backBtn.innerText = t.back_button;
    }
}
