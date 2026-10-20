// client/src/components/InfoPanel.js
// Bảng thông tin hành tinh đã chọn. Hiển thị tên, thông số vật lý (nguồn NASA),
// tọa độ hiện tại, nguồn dữ liệu (JPL thực / Kepler xấp xỉ) và thời điểm dữ liệu.

export default class InfoPanel {
  constructor() {
    this.el = document.getElementById('info-panel');
  }

  show({ planet, positionAu, source, dataTime, distanceAu }) {
    this.el.hidden = false;
    const srcText = source === 'JPL'
      ? 'NASA/JPL Horizons (dữ liệu thực)'
      : source === 'CACHE'
        ? 'JPL Horizons (đã cache)'
        : 'Mô hình Kepler (xấp xỉ, offline)';
    const srcClass = source === 'JPL' || source === 'CACHE' ? 'src-jpl' : 'src-kepler';
    this.el.innerHTML = `
      <button class="info-close" aria-label="Đóng bảng thông tin">×</button>
      <h2>${planet.name} <span class="planet-en">${planet.nameEn}</span></h2>
      <p class="info-desc">${planet.description}</p>
      <dl class="info-grid">
        <dt>Bán kính</dt><dd>${planet.radiusKm.toLocaleString('vi-VN')} km</dd>
        <dt>Khoảng cách TB tới Mặt Trời</dt><dd>${planet.semiMajorAxisAu} AU (${(planet.distanceFromSunKm / 1e6).toFixed(1)} triệu km)</dd>
        <dt>Chu kỳ quỹ đạo</dt><dd>${planet.orbitalPeriodDays.toLocaleString('vi-VN')} ngày</dd>
        <dt>Khoảng cách hiện tại</dt><dd>${distanceAu != null ? distanceAu.toFixed(3) + ' AU' : '—'}</dd>
        <dt>Tọa độ (hoàng đạo J2000, tâm Mặt Trời)</dt>
        <dd class="coord">
          X=${positionAu ? positionAu.x.toFixed(3) : '—'} AU<br/>
          Y=${positionAu ? positionAu.y.toFixed(3) : '—'} AU<br/>
          Z=${positionAu ? positionAu.z.toFixed(3) : '—'} AU
        </dd>
        <dt>Nguồn dữ liệu vị trí</dt><dd class="${srcClass}">${srcText}</dd>
        <dt>Thời điểm dữ liệu</dt><dd>${dataTime ? new Date(dataTime).toLocaleString('vi-VN') : '—'}</dd>
      </dl>
      <p class="info-note">Tọa độ là hệ hình học (heliocentric ecliptic), không phải tọa độ quan sát từ Trái Đất. Kích thước & khoảng cách hiển thị trên mô hình 3D đã được nén để dễ quan sát.</p>
    `;
    this.el.querySelector('.info-close').addEventListener('click', () => this.hide());
  }

  hide() {
    this.el.hidden = true;
  }
}
