// client/src/api/i18n.js
// Đa ngôn ngữ đơn giản: tiếng Việt (mặc định, từ dễ hiểu) / tiếng Anh.
// Lưu lựa chọn vào localStorage. Mặc định 'vi' — dùng từ ngữ phổ thông,
// chỉ dùng thuật ngữ chuyên môn khi cần (trong bảng thông tin có ghi chú).

const DICT = {
  vi: {
    reset: 'Đặt lại góc nhìn',
    orbits: 'Đường quỹ đạo',
    labels: 'Nhãn tên',
    belts: 'Vành đai tiểu hành tinh',
    settings: 'Cài đặt',
    hideUI: 'Ẩn giao diện (xem bao quát)',
    showUI: 'Hiện giao diện',
    pause: 'Tạm dừng thời gian',
    play: 'Tiếp tục thời gian',
    rewind: 'Lùi 1 ngày',
    forward: 'Tiến 1 ngày',
    speed: 'Tốc độ thời gian',
    pickPlanet: 'Chọn hành tinh',
    online: 'Trực tuyến',
    offline: 'Ngoại tuyến',
    language: 'Ngôn ngữ',
    close: 'Đóng',
    collapse: 'Thu gọn',
    expand: 'Mở rộng',
    sun: 'Mặt Trời',
    sourceJpl: 'Dữ liệu thực từ NASA/JPL',
    sourceKepler: 'Mô hình xấp xỉ (Kepler)',
    dataAge: 'Dữ liệu cách đây',
    minutes: 'phút',
  },
  en: {
    reset: 'Reset camera',
    orbits: 'Orbit lines',
    labels: 'Labels',
    belts: 'Asteroid & Kuiper belts',
    settings: 'Settings',
    hideUI: 'Hide UI (immersive)',
    showUI: 'Show UI',
    pause: 'Pause time',
    play: 'Resume time',
    rewind: 'Rewind 1 day',
    forward: 'Forward 1 day',
    speed: 'Time speed',
    pickPlanet: 'Select a body',
    online: 'Online',
    offline: 'Offline',
    language: 'Language',
    close: 'Close',
    collapse: 'Collapse',
    expand: 'Expand',
    sun: 'Sun',
    sourceJpl: 'Real data from NASA/JPL',
    sourceKepler: 'Approx. model (Kepler)',
    dataAge: 'Data age',
    minutes: 'min',
  },
};

const LANG_KEY = 'ss3d-lang';
let current = (() => {
  try { return localStorage.getItem(LANG_KEY) || 'vi'; } catch { return 'vi'; }
})();

export function t(key) { return (DICT[current] && DICT[current][key]) || (DICT.vi[key]) || key; }
export function getLang() { return current; }
export function setLang(l) {
  if (!DICT[l]) return;
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
}
