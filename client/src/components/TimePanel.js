// client/src/components/TimePanel.js
// Panel điều khiển thời gian riêng, cố định góc trên-trái, gọn, icon SVG.
import { t } from '../api/i18n.js';

const ICON = {
  clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  rewind: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm1.5-6 8.5 6V6l-8.5 6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  forward: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13 6v12l8.5-6L13 6zM4 18l8.5-6L4 6v12z"/></svg>',
  speed: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
};

export default class TimePanel {
  constructor({ onTimeControl }) {
    this.onTimeControl = onTimeControl;
    this.paused = false;
    this.speedIndex = 1;
    this.speedLabels = ['1×', '60×', '1d/s', '7d/s'];
    this.speedValues = [1, 60, 86400, 7 * 86400];

    this.el = document.createElement('div');
    this.el.className = 'time-panel';
    document.body.appendChild(this.el);
    this._render();
  }

  _render() {
    this.el.innerHTML = `
      <div class="time-head">
        <span class="time-icon">${ICON.clock}</span>
        <span class="time-text" id="sim-time-display"></span>
      </div>
      <div class="time-controls">
        <button class="icon-btn" data-act="rewind" title="${t('rewind')}">${ICON.rewind}</button>
        <button class="icon-btn" data-act="pause" title="${this.paused ? t('play') : t('pause')}">${this.paused ? ICON.play : ICON.pause}</button>
        <button class="icon-btn" data-act="forward" title="${t('forward')}">${ICON.forward}</button>
        <button class="icon-btn speed-btn" data-act="speed" title="${t('speed')}">${ICON.speed}<span>${this.speedLabels[this.speedIndex]}</span></button>
      </div>
    `;
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const a = btn.dataset.act;
      if (a === 'rewind') this.onTimeControl({ type: 'jump', deltaDays: -1 });
      else if (a === 'forward') this.onTimeControl({ type: 'jump', deltaDays: +1 });
      else if (a === 'pause') { this.paused = !this.paused; this.onTimeControl({ type: 'pause', paused: this.paused }); this._render(); }
      else if (a === 'speed') {
        this.speedIndex = (this.speedIndex + 1) % this.speedValues.length;
        this.onTimeControl({ type: 'speed', value: this.speedValues[this.speedIndex] });
        this._render();
      }
    });
    this.simTimeEl = document.getElementById('sim-time-display');
  }

  setSimTime(iso) {
    if (this.simTimeEl) {
      const d = new Date(iso);
      this.simTimeEl.textContent = d.toLocaleString(getLangSafe(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }

  setVisible(v) { this.el.style.display = v ? '' : 'none'; }
  dispose() { this.el.remove(); }
}

function getLangSafe() {
  try { return localStorage.getItem('ss3d-lang') || 'vi'; } catch { return 'vi'; }
}
