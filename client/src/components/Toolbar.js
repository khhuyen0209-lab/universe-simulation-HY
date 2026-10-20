// client/src/components/Toolbar.js
// FloatingToolbar: overlay nổi, kéo được, thu gọn, chuyển cạnh, ẩn toàn bộ UI.
// Mặc định ở góc trên-trái (phù hợp mobile landscape), các nút xếp ngang.
// Cấu hình (vị trí, nút nào hiển thị) được lưu vào localStorage qua SettingsPanel.

const SETTINGS_KEY = 'ss3d-ui-settings';

export const DEFAULT_SETTINGS = {
  position: 'top-left', // top-left | top-right | bottom-left | bottom-right
  collapsed: false,
  showButtons: { reset: true, orbits: true, labels: true, time: true, picker: true },
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, showButtons: { ...DEFAULT_SETTINGS.showButtons } };
    const s = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      showButtons: { ...DEFAULT_SETTINGS.showButtons, ...(s.showButtons || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, showButtons: { ...DEFAULT_SETTINGS.showButtons } };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export default class FloatingToolbar {
  constructor({ settings, planets, onResetCamera, onToggleOrbits, onToggleLabels, onTimeControl, onSelectPlanet, onOpenSettings, onHideUI }) {
    this.settings = settings;
    this.planets = planets || [];
    this.callbacks = { onResetCamera, onToggleOrbits, onToggleLabels, onTimeControl, onSelectPlanet, onOpenSettings, onHideUI };
    this.paused = false;
    this.speedIndex = 1;
    this.speedLabels = ['1×', '60×', '1 ngày/s', '7 ngày/s'];
    this.speedValues = [1, 60, 86400, 7 * 86400];
    this.visible = true;
    this._customPos = null;

    this.el = document.createElement('div');
    this.el.className = 'floating-toolbar';
    this.el.id = 'floating-toolbar';
    document.body.appendChild(this.el);

    this._render();
    this._applyPosition();
    this._attachDrag();
    this._applyCollapsed();
  }

  _render() {
    const sb = this.settings.showButtons;
    this.el.innerHTML = `
      <div class="ft-handle" title="Kéo để di chuyển">
        <span class="ft-drag" aria-hidden="true">⠿</span>
        <button class="ft-icon-btn" data-act="collapse" title="Thu gọn / Mở rộng">−</button>
        <button class="ft-icon-btn" data-act="flip" title="Chuyển sang cạnh kia">⇄</button>
        <button class="ft-icon-btn" data-act="settings" title="Cài đặt bố cục">⚙</button>
        <button class="ft-icon-btn" data-act="hide" title="Ẩn toàn bộ UI (xem bao quát)">⛶</button>
      </div>
      <div class="ft-content">
        ${sb.reset ? '<button class="ft-btn" data-action="reset">Mặc định</button>' : ''}
        ${sb.orbits ? '<button class="ft-btn active" data-action="orbits">Quỹ đạo</button>' : ''}
        ${sb.labels ? '<button class="ft-btn active" data-action="labels">Nhãn</button>' : ''}
        ${sb.time ? `
          <button class="ft-btn" data-action="rewind">−1 ngày</button>
          <button class="ft-btn" data-action="pause">Tạm dừng</button>
          <button class="ft-btn" data-action="forward">+1 ngày</button>
          <button class="ft-btn" data-action="speed">Tốc độ: ${this.speedLabels[this.speedIndex]}</button>
          <span class="sim-time" id="sim-time-display"></span>
        ` : ''}
        ${sb.picker ? `
          <select class="planet-select" aria-label="Chọn hành tinh">
            <option value="">— Chọn hành tinh —</option>
            ${this.planets.map((p) => `<option value="${p.key}">${p.name}</option>`).join('')}
          </select>
        ` : ''}
      </div>
    `;

    this.el.addEventListener('click', (e) => {
      const iconBtn = e.target.closest('[data-act]');
      if (iconBtn) {
        const act = iconBtn.dataset.act;
        if (act === 'collapse') this.toggleCollapse();
        else if (act === 'flip') this.flipEdge();
        else if (act === 'settings') this.callbacks.onOpenSettings && this.callbacks.onOpenSettings();
        else if (act === 'hide') this.callbacks.onHideUI && this.callbacks.onHideUI();
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const cb = this.callbacks;
      if (action === 'reset') cb.onResetCamera();
      else if (action === 'orbits') { btn.classList.toggle('active'); cb.onToggleOrbits(btn.classList.contains('active')); }
      else if (action === 'labels') { btn.classList.toggle('active'); cb.onToggleLabels(btn.classList.contains('active')); }
      else if (action === 'rewind') cb.onTimeControl({ type: 'jump', deltaDays: -1 });
      else if (action === 'forward') cb.onTimeControl({ type: 'jump', deltaDays: +1 });
      else if (action === 'pause') {
        this.paused = !this.paused;
        btn.textContent = this.paused ? 'Tiếp tục' : 'Tạm dừng';
        cb.onTimeControl({ type: 'pause', paused: this.paused });
      }
      else if (action === 'speed') {
        this.speedIndex = (this.speedIndex + 1) % this.speedValues.length;
        btn.textContent = `Tốc độ: ${this.speedLabels[this.speedIndex]}`;
        cb.onTimeControl({ type: 'speed', value: this.speedValues[this.speedIndex] });
      }
    });

    const sel = this.el.querySelector('.planet-select');
    if (sel) sel.addEventListener('change', (e) => this.callbacks.onSelectPlanet(e.target.value || null));

    this.simTimeEl = document.getElementById('sim-time-display');
  }

  _applyPosition() {
    if (this._customPos) { this.el.style.left = this._customPos.x + 'px'; this.el.style.top = this._customPos.y + 'px'; return; }
    const p = this.settings.position;
    const margin = 10;
    this.el.style.left = p.includes('left') ? margin + 'px' : 'auto';
    this.el.style.right = p.includes('right') ? margin + 'px' : 'auto';
    this.el.style.top = p.includes('top') ? margin + 'px' : 'auto';
    this.el.style.bottom = p.includes('bottom') ? margin + 'px' : 'auto';
  }

  toggleCollapse() {
    this.settings.collapsed = !this.settings.collapsed;
    saveSettings(this.settings);
    this._applyCollapsed();
  }
  _applyCollapsed() {
    this.el.classList.toggle('collapsed', this.settings.collapsed);
    const btn = this.el.querySelector('[data-act="collapse"]');
    if (btn) btn.textContent = this.settings.collapsed ? '+' : '−';
  }

  flipEdge() {
    const p = this.settings.position;
    this.settings.position = p.includes('left') ? p.replace('left', 'right') : p.replace('right', 'left');
    this._customPos = null;
    saveSettings(this.settings);
    this._applyPosition();
  }

  _attachDrag() {
    const handle = this.el.querySelector('.ft-handle');
    let startX, startY, origX, origY, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      this.el.style.right = 'auto'; this.el.style.bottom = 'auto';
      this.el.style.left = origX + 'px'; this.el.style.top = origY + 'px';
      try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      let nx = origX + (e.clientX - startX);
      let ny = origY + (e.clientY - startY);
      const maxX = window.innerWidth - this.el.offsetWidth;
      const maxY = window.innerHeight - this.el.offsetHeight;
      nx = Math.max(0, Math.min(nx, Math.max(0, maxX)));
      ny = Math.max(0, Math.min(ny, Math.max(0, maxY)));
      this._customPos = { x: nx, y: ny };
      this.el.style.left = nx + 'px'; this.el.style.top = ny + 'px';
    });
    const end = () => { dragging = false; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  applySettings(s) {
    this.settings = s;
    this._customPos = null;
    this._render();
    this._applyPosition();
    this._applyCollapsed();
  }

  setSimTime(iso) {
    if (this.simTimeEl) {
      const d = new Date(iso);
      this.simTimeEl.textContent = d.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
    }
  }

  setVisible(v) {
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
  }

  dispose() { this.el.remove(); }
}
