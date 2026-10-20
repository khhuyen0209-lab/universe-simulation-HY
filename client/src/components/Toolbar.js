// client/src/components/Toolbar.js
// IconToolbar: cố định góc dưới-phải, dạng dọc, chỉ dùng icon SVG (không chữ, có tooltip).
// Có thể thu gọn còn một nút. Cấu hình hiển thị từng nút lưu trong localStorage.
import { t } from '../api/i18n.js';

const SETTINGS_KEY = 'ss3d-ui-settings';

export const DEFAULT_SETTINGS = {
  collapsed: false,
  showButtons: { reset: true, orbits: true, labels: true, belts: true, picker: true },
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, showButtons: { ...DEFAULT_SETTINGS.showButtons } };
    const s = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...s, showButtons: { ...DEFAULT_SETTINGS.showButtons, ...(s.showButtons || {}) } };
  } catch { return { ...DEFAULT_SETTINGS, showButtons: { ...DEFAULT_SETTINGS.showButtons } }; }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

const ICON = {
  reset: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  orbits: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/></svg>',
  labels: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>',
  belts: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="3.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  hide: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>',
};

export default class IconToolbar {
  constructor({ settings, planets, onResetCamera, onToggleOrbits, onToggleLabels, onToggleBelts, onSelectPlanet, onOpenSettings, onHideUI }) {
    this.settings = settings;
    this.planets = planets || [];
    this.cb = { onResetCamera, onToggleOrbits, onToggleLabels, onToggleBelts, onSelectPlanet, onOpenSettings, onHideUI };
    this.states = { orbits: true, labels: true, belts: true };
    this.el = document.createElement('div');
    this.el.className = 'icon-toolbar';
    document.body.appendChild(this.el);
    this._render();
  }

  _render() {
    const sb = this.settings.showButtons;
    const collapsed = this.settings.collapsed;
    this.el.innerHTML = `
      <button class="icon-btn" data-act="collapse" title="${collapsed ? t('expand') : t('collapse')}">${collapsed ? ICON.expand : ICON.collapse}</button>
      ${collapsed ? '' : `
        ${sb.reset ? `<button class="icon-btn" data-action="reset" title="${t('reset')}">${ICON.reset}</button>` : ''}
        ${sb.orbits ? `<button class="icon-btn active" data-action="orbits" title="${t('orbits')}">${ICON.orbits}</button>` : ''}
        ${sb.labels ? `<button class="icon-btn active" data-action="labels" title="${t('labels')}">${ICON.labels}</button>` : ''}
        ${sb.belts ? `<button class="icon-btn active" data-action="belts" title="${t('belts')}">${ICON.belts}</button>` : ''}
        ${sb.picker ? `
          <div class="icon-picker-wrap" title="${t('pickPlanet')}">
            <span class="icon-btn icon-picker-btn">${ICON.globe}</span>
            <select class="icon-planet-select" aria-label="${t('pickPlanet')}">
              <option value="">${t('pickPlanet')}</option>
              <option value="sun">${t('sun')}</option>
              ${this.planets.map((p) => `<option value="${p.key}">${p.name}</option>`).join('')}
            </select>
          </div>` : ''}
        <button class="icon-btn" data-action="settings" title="${t('settings')}">${ICON.settings}</button>
        <button class="icon-btn" data-action="hide" title="${t('hideUI')}">${ICON.hide}</button>
      `}
    `;
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'reset') this.cb.onResetCamera();
      else if (a === 'orbits') { this.states.orbits = !this.states.orbits; btn.classList.toggle('active', this.states.orbits); this.cb.onToggleOrbits(this.states.orbits); }
      else if (a === 'labels') { this.states.labels = !this.states.labels; btn.classList.toggle('active', this.states.labels); this.cb.onToggleLabels(this.states.labels); }
      else if (a === 'belts') { this.states.belts = !this.states.belts; btn.classList.toggle('active', this.states.belts); this.cb.onToggleBelts(this.states.belts); }
      else if (a === 'settings') this.cb.onOpenSettings();
      else if (a === 'hide') this.cb.onHideUI();
    });
    this.el.querySelector('[data-act="collapse"]').addEventListener('click', () => {
      this.settings.collapsed = !this.settings.collapsed;
      saveSettings(this.settings);
      this._render();
    });
    const sel = this.el.querySelector('.icon-planet-select');
    if (sel) sel.addEventListener('change', (e) => { this.cb.onSelectPlanet(e.target.value || null); sel.value = ''; });
  }

  applySettings(s) { this.settings = s; this._render(); }
  setVisible(v) { this.el.style.display = v ? '' : 'none'; }
  dispose() { this.el.remove(); }
}
