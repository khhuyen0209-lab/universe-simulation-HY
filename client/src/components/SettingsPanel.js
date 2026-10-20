// client/src/components/SettingsPanel.js
// Panel cài đặt bố cục: chọn vị trí mặc định của overlay, bật/tắt từng nút chức năng,
// đặt lại mặc định. Lưu vào localStorage (qua saveSettings từ Toolbar.js).

import { saveSettings, DEFAULT_SETTINGS } from './Toolbar.js';

export default class SettingsPanel {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'settings-panel';
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  open(settings) {
    this.settings = JSON.parse(JSON.stringify(settings));
    this.el.hidden = false;
    this._render();
  }

  close() { this.el.hidden = true; }

  _render() {
    const s = this.settings;
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const posLabels = { 'top-left': 'Trên-Trái', 'top-right': 'Trên-Phải', 'bottom-left': 'Dưới-Trái', 'bottom-right': 'Dưới-Phải' };
    const buttons = [
      ['reset', 'Nút Mặc định (camera)'],
      ['orbits', 'Nút bật/tắt Quỹ đạo'],
      ['labels', 'Nút bật/tắt Nhãn'],
      ['time', 'Điều khiển thời gian (tua/tốc độ)'],
      ['picker', 'Danh sách chọn hành tinh'],
    ];
    this.el.innerHTML = `
      <div class="settings-card">
        <div class="settings-header">
          <h3>Cài đặt giao diện</h3>
          <button class="settings-close" aria-label="Đóng">×</button>
        </div>
        <div class="settings-section">
          <h4>Vị trí mặc định của thanh công cụ</h4>
          <div class="pos-grid">
            ${positions.map((p) => `
              <button class="pos-btn ${s.position === p ? 'active' : ''}" data-pos="${p}">${posLabels[p]}</button>
            `).join('')}
          </div>
          <p class="settings-hint">Bạn cũng có thể kéo trực tiếp thanh công cụ (vùng có ký tự ⠿) để đặt ở bất kỳ đâu.</p>
        </div>
        <div class="settings-section">
          <h4>Hiển thị các nút chức năng</h4>
          ${buttons.map(([key, label]) => `
            <label class="toggle-row">
              <input type="checkbox" data-btn="${key}" ${s.showButtons[key] ? 'checked' : ''} />
              <span>${label}</span>
            </label>
          `).join('')}
        </div>
        <div class="settings-actions">
          <button class="ft-btn" data-act="reset">Đặt lại mặc định</button>
          <button class="ft-btn primary" data-act="done">Xong</button>
        </div>
      </div>
    `;

    this.el.querySelector('.settings-close').addEventListener('click', () => this.close());
    this.el.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', () => {
      this.settings.position = b.dataset.pos;
      saveSettings(this.settings);
      this.onChange(this.settings);
      this._render();
    }));
    this.el.querySelectorAll('[data-btn]').forEach((cb) => cb.addEventListener('change', () => {
      this.settings.showButtons[cb.dataset.btn] = cb.checked;
      saveSettings(this.settings);
      this.onChange(this.settings);
    }));
    this.el.querySelector('[data-act="reset"]').addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS, showButtons: { ...DEFAULT_SETTINGS.showButtons } };
      saveSettings(this.settings);
      this.onChange(this.settings);
      this._render();
    });
    this.el.querySelector('[data-act="done"]').addEventListener('click', () => this.close());
  }
}
