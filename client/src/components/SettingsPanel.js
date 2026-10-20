// client/src/components/SettingsPanel.js
// Panel cài đặt: vị trí mặc định (không còn dùng vì toolbar cố định, giữ tương thích),
// bật/tắt từng nút, đổi ngôn ngữ Việt/Anh, đặt lại mặc định.
import { saveSettings, DEFAULT_SETTINGS } from './Toolbar.js';
import { t, setLang, getLang } from '../api/i18n.js';

export default class SettingsPanel {
  constructor({ onChange, onLangChange }) {
    this.onChange = onChange;
    this.onLangChange = onLangChange;
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
    const buttons = [
      ['reset', 'Nút Đặt lại góc nhìn'],
      ['orbits', 'Nút bật/tắt Đường quỹ đạo'],
      ['labels', 'Nút bật/tắt Nhãn'],
      ['belts', 'Nút bật/tắt Vành đai'],
      ['picker', 'Danh sách chọn hành tinh'],
    ];
    const lang = getLang();
    this.el.innerHTML = `
      <div class="settings-card">
        <div class="settings-header">
          <h3>${t('settings')}</h3>
          <button class="settings-close" aria-label="${t('close')}">×</button>
        </div>
        <div class="settings-section">
          <h4>${t('language')}</h4>
          <div class="pos-grid">
            <button class="pos-btn ${lang === 'vi' ? 'active' : ''}" data-lang="vi">Tiếng Việt</button>
            <button class="pos-btn ${lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
          </div>
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
    this.el.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
      setLang(b.dataset.lang);
      this.onLangChange && this.onLangChange(b.dataset.lang);
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
