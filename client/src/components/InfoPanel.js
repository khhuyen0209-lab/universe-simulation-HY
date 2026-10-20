// client/src/components/InfoPanel.js
// Bảng thông tin hành tinh dạng overlay bên phải, có thể thu gọn thành tab nhỏ ở mép.
export default class InfoPanel {
  constructor() {
    this.el = document.getElementById('info-panel');
    this.collapsed = false;
  }

  show({ planet, positionAu, source, dataTime, distanceAu }) {
    this.el.hidden = false;
    const srcText = source === 'JPL'
      ? 'NASA/JPL Horizons (dữ liệu thực)'
      : source === 'CACHE' || source === 'OFFLINE_CACHE'
        ? 'JPL Horizons (đã cache)'
        : 'Mô hình Kepler (xấp xỉ, offline)';
    const srcClass = source === 'JPL' || source === 'CACHE' || source === 'OFFLINE_CACHE' ? 'src-jpl' : 'src-kepler';
    this.el.innerHTML = `
      <div class="info-header">
        <span class="info-title">${planet.name} <span class="planet-en">${planet.nameEn}</span></span>
        <button class="info-icon-btn info-collapse" title="Thu gọn">−</button>
        <button class="info-icon-btn info-close" title="Đóng">×</button>
      </div>
      <div class="info-body">
        <p class="info-desc">${planet.description}</p>
        <dl class="info-grid">
          <dt>Bán kính</dt><dd>${planet.radiusKm.toLocaleString('vi-VN')} km</dd>
          <dt>Khoảng cách TB tới Mặt Trời</dt><dd>${planet.semiMajorAxisAu} AU</dd>
          <dt>Chu kỳ quỹ đạo</dt><dd>${planet.orbitalPeriodDays.toLocaleString('vi-VN')} ngày</dd>
          <dt>Khoảng cách hiện tại</dt><dd>${distanceAu != null ? distanceAu.toFixed(3) + ' AU' : '—'}</dd>
          <dt>Tọa độ (hoàng đạo J2000)</dt>
          <dd class="coord">
            X=${positionAu ? positionAu.x.toFixed(3) : '—'}<br/>
            Y=${positionAu ? positionAu.y.toFixed(3) : '—'}<br/>
            Z=${positionAu ? positionAu.z.toFixed(3) : '—'} AU
          </dd>
          <dt>Nguồn dữ liệu</dt><dd class="${srcClass}">${srcText}</dd>
          <dt>Thời điểm dữ liệu</dt><dd>${dataTime ? new Date(dataTime).toLocaleString('vi-VN') : '—'}</dd>
        </dl>
        <p class="info-note">Tọa độ hình học heliocentric, không phải tọa độ quan sát từ Trái Đất. Kích thước & khoảng cách hiển thị đã nén tỷ lệ.</p>
      </div>
    `;
    this.el.querySelector('.info-close').addEventListener('click', () => this.hide());
    this.el.querySelector('.info-collapse').addEventListener('click', () => this.toggleCollapse());
    this.el.querySelector('.info-header').addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (this.collapsed) this.toggleCollapse();
    });
    if (this.collapsed) this.el.classList.add('collapsed');
    else this.el.classList.remove('collapsed');
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.el.classList.toggle('collapsed', this.collapsed);
    const btn = this.el.querySelector('.info-collapse');
    if (btn) btn.textContent = this.collapsed ? '+' : '−';
  }

  hide() {
    this.el.hidden = true;
    this.collapsed = false;
  }
}
