// client/src/components/Toolbar.js
// Thanh công cụ: reset camera, bật/tắt quỹ đạo & nhãn, điều khiển thời gian mô phỏng.
// Các nút đủ lớn để chạm trên điện thoại (min 44px).

export default class Toolbar {
  constructor({ onResetCamera, onToggleOrbits, onToggleLabels, onTimeControl, onSelectPlanet, planets }) {
    this.el = document.getElementById('toolbar');
    this.paused = false;
    this.speedIndex = 1; // 0=1x,1=60x,2=1day/s,3=7day/s
    this.speedLabels = ['1×', '60×', '1 ngày/s', '7 ngày/s'];
    this.speedValues = [1, 60, 86400, 7 * 86400]; // giây mô phỏng / giây thực

    this.el.innerHTML = `
      <div class="toolbar-group">
        <button class="tool-btn" data-action="reset" title="Đưa camera về vị trí mặc định">Mặc định</button>
        <button class="tool-btn active" data-action="orbits" title="Bật/tắt đường quỹ đạo">Quỹ đạo</button>
        <button class="tool-btn active" data-action="labels" title="Bật/tắt nhãn thiên thể">Nhãn</button>
      </div>
      <div class="toolbar-group time-group">
        <button class="tool-btn" data-action="rewind" title="Tua lùi 1 ngày">−1 ngày</button>
        <button class="tool-btn" data-action="pause" title="Tạm dừng/tiếp tục">Tạm dừng</button>
        <button class="tool-btn" data-action="forward" title="Tua tiến 1 ngày">+1 ngày</button>
        <button class="tool-btn" data-action="speed" title="Đổi tốc độ thời gian">Tốc độ: ${this.speedLabels[this.speedIndex]}</button>
        <span class="sim-time" id="sim-time-display"></span>
      </div>
      <div class="toolbar-group planet-picker">
        <select class="planet-select" aria-label="Chọn hành tinh">
          <option value="">— Chọn hành tinh —</option>
          ${planets.map((p) => `<option value="${p.key}">${p.name}</option>`).join('')}
        </select>
      </div>
    `;

    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'reset') onResetCamera();
      else if (action === 'orbits') { btn.classList.toggle('active'); onToggleOrbits(btn.classList.contains('active')); }
      else if (action === 'labels') { btn.classList.toggle('active'); onToggleLabels(btn.classList.contains('active')); }
      else if (action === 'rewind') onTimeControl({ type: 'jump', deltaDays: -1 });
      else if (action === 'forward') onTimeControl({ type: 'jump', deltaDays: +1 });
      else if (action === 'pause') {
        this.paused = !this.paused;
        btn.textContent = this.paused ? 'Tiếp tục' : 'Tạm dừng';
        onTimeControl({ type: 'pause', paused: this.paused });
      }
      else if (action === 'speed') {
        this.speedIndex = (this.speedIndex + 1) % this.speedValues.length;
        btn.textContent = `Tốc độ: ${this.speedLabels[this.speedIndex]}`;
        onTimeControl({ type: 'speed', value: this.speedValues[this.speedIndex] });
      }
    });

    this.el.querySelector('.planet-select').addEventListener('change', (e) => {
      onSelectPlanet(e.target.value || null);
    });

    this.simTimeEl = document.getElementById('sim-time-display');
  }

  setSimTime(iso) {
    if (this.simTimeEl) {
      const d = new Date(iso);
      this.simTimeEl.textContent = d.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
    }
  }
}
