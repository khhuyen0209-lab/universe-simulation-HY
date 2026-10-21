// client/src/components/InfoPanel.js
// Bảng thông tin thiên thể dạng overlay bên phải, có thể thu gọn thành tab nhỏ.
// Hỗ trợ cả hành tinh và sao (Mặt Trời) — các trường hiển thị khác nhau.
export default class InfoPanel {
  constructor() {
    this.el = document.getElementById('info-panel');
    this.collapsed = false;
  }

  show({ planet, positionAu, source, dataTime, distanceAu }) {
    this.el.hidden = false;
    const isStar = planet.type === 'star';
    const srcText = source === 'JPL'
      ? 'NASA/JPL Horizons (dữ liệu thực)'
      : source === 'CACHE' || source === 'OFFLINE_CACHE'
        ? 'JPL Horizons (đã cache)'
        : source === 'PHYSICAL'
          ? 'Hằng số vật lý (chính xác)'
          : 'Mô hình Kepler (xấp xỉ, offline)';
    const srcClass = (source === 'JPL' || source === 'CACHE' || source === 'OFFLINE_CACHE' || source === 'PHYSICAL') ? 'src-jpl' : 'src-kepler';

    let rows = '';
    if (isStar) {
      rows = `
        <dt>Loại thiên thể</dt><dd>Sao (G2V — sao lùn vàng)</dd>
        <dt>Bán kính</dt><dd>${planet.radiusKm.toLocaleString('vi-VN')} km</dd>
        <dt>Nhiệt độ bề mặt</dt><dd>${planet.temperatureSurfaceK ? planet.temperatureSurfaceK.toLocaleString('vi-VN') + ' K (~' + Math.round(planet.temperatureSurfaceK - 273) + '°C)' : '—'}</dd>
        <dt>Khối lượng</dt><dd>${planet.massEarths ? planet.massEarths.toLocaleString('vi-VN') + ' lần Trái Đất (99.8% hệ Mặt Trời)' : '—'}</dd>
        <dt>Nguồn dữ liệu</dt><dd class="${srcClass}">${srcText}</dd>
      `;
    } else {
      rows = `
        <dt>Loại thiên thể</dt><dd>Hành tinh</dd>
        <dt>Bán kính</dt><dd>${planet.radiusKm.toLocaleString('vi-VN')} km</dd>
        <dt>Khoảng cách TB tới Mặt Trời</dt><dd>${planet.semiMajorAxisAu} AU (${(planet.semiMajorAxisAu * 149.6).toFixed(1)} triệu km)</dd>
        <dt>Chu kỳ quay quanh Mặt Trời</dt><dd>${planet.orbitalPeriodDays.toLocaleString('vi-VN')} ngày (~${(planet.orbitalPeriodDays / 365.25).toFixed(2)} năm Trái Đất)</dd>
        <dt>Khoảng cách hiện tại</dt><dd>${distanceAu != null ? distanceAu.toFixed(3) + ' AU' : '—'}</dd>
        <dt>Vị trí hiện tại (tọa độ AU)</dt>
        <dd class="coord">
          X = ${positionAu ? positionAu.x.toFixed(3) : '—'}<br/>
          Y = ${positionAu ? positionAu.y.toFixed(3) : '—'}<br/>
          Z = ${positionAu ? positionAu.z.toFixed(3) : '—'}
        </dd>
        <dt>Nguồn dữ liệu</dt><dd class="${srcClass}">${srcText}</dd>
        <dt>Thời điểm dữ liệu</dt><dd>${dataTime ? new Date(dataTime).toLocaleString('vi-VN') : '—'}</dd>
      `;
    }

    this.el.innerHTML = `
      <div class="info-header">
        <span class="info-title">${planet.name} <span class="planet-en">${planet.nameEn}</span></span>
        <button class="info-icon-btn info-collapse" title="Thu gọn">−</button>
        <button class="info-icon-btn info-close" title="Đóng">×</button>
      </div>
      <div class="info-body">
        <p class="info-desc">${planet.description}</p>
        <dl class="info-grid">${rows}</dl>
        <p class="info-note">Kích thước & khoảng cách hiển thị đã nén tỷ lệ để quan sát. Tọa độ là hình học tâm Mặt Trời (hoàng đạo J2000), không phải tọa độ quan sát từ Trái Đất.</p>
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
