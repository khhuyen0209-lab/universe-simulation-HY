// client/public/config.js
// File cấu hình DUY NHẤT. Đã đặt sẵn URL backend Render.
// File này được copy nguyên vào dist/config.js (không bị hash).
window.__API_BASE__ = 'https://universe-simulation-hy.onrender.com';

// (Tùy chọn) Ép độ phân giải bản đồ hành tinh: '2k' hoặc '8k'.
// Bỏ comment một dòng để ép; mặc định (không đặt) client tự chọn theo thiết bị.
// window.__TEXTURE_RES__ = '8k'; // desktop: nét nhất, tải ~3–15 MB/hành tinh
// window.__TEXTURE_RES__ = '2k'; // nhẹ, dùng cho mobile / mạng chậm
