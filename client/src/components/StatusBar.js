// client/src/components/StatusBar.js
// Hiển thị trạng thái: online/offline, nguồn dữ liệu, tuổi dữ liệu, cảnh báo dữ liệu cũ.

export default class StatusBar {
  constructor() {
    this.el = document.getElementById('status-bar');
    this.staleEl = document.getElementById('stale-warning');
  }

  update({ online, source, ageMs, stale }) {
    const net = online ? '<span class="dot dot-online"></span>Trực tuyến' : '<span class="dot dot-offline"></span>Ngoại tuyến';
    let src;
    if (source === 'JPL') src = 'Nguồn: NASA/JPL Horizons (thực)';
    else if (source === 'CACHE') src = 'Nguồn: JPL (cache)';
    else if (source === 'OFFLINE_CACHE') src = 'Nguồn: JPL cache ngoại tuyến';
    else src = 'Nguồn: mô hình Kepler (xấp xỉ)';
    const ageMin = ageMs != null && Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null;
    const ageText = ageMin != null ? `Dữ liệu cách đây: ${ageMin} phút` : 'Chưa có dữ liệu JPL';
    this.el.innerHTML = `${net} · ${src} · ${ageText}`;

    // Cảnh báo dữ liệu cũ (> 1 giờ) — hiển thị rõ, không giả vờ dữ liệu mới.
    if (stale || (ageMin != null && ageMin > 60)) {
      this.staleEl.hidden = false;
      this.staleEl.textContent = ageMin != null
        ? `Cảnh báo: dữ liệu vị trí đã cũ (${ageMin} phút). Hiển thị vị trí xấp xỉ. Kiểm tra kết nối mạng.`
        : 'Cảnh báo: không lấy được dữ liệu JPL. Đang dùng mô hình quỹ đạo xấp xỉ.';
    } else {
      this.staleEl.hidden = true;
    }
  }
}
