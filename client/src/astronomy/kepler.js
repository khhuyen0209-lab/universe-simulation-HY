// client/src/astronomy/kepler.js
// Mô hình quỹ đạo Kepler (2 thể) với elements trung bình J2000.
// Dùng làm dự phòng offline và nội suy khi tua thời gian.
// GIỚI HẠN: không tính nhiễu do các hành tinh khác, không tính thiên vi phân.
// Sai số vị trí góc thường < 1° trong vài thập kỷ quanh J2000.
// Nguồn elements: JPL Solar System Dynamics (ssd.jpl.nasa.gov).

import { EPOCH_J2000_JD, DEG } from './constants.js';

// Chuyển ISO 8601 sang Julian Date (UTC). Đủ chính xác cho mô phỏng.
export function isoToJulianDate(iso) {
  const ms = new Date(iso).getTime();
  // JD 2440587.5 = 1970-01-01 00:00 UTC
  return 2440587.5 + ms / 86_400_000;
}

export function julianDateToIso(jd) {
  const ms = (jd - 2440587.5) * 86_400_000;
  return new Date(ms).toISOString();
}

// Giải phương trình Kepler: M = E - e*sin(E) (đơn vị radian).
function solveKepler(M, e, tol = 1e-8) {
  let E = M; // xấp xỉ ban đầu
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// Chuẩn hóa góc về [0, 360).
function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Tính vị trí hành tinh trong hệ tọa độ hoàng đạo J2000 (đơn vị AU), tâm Mặt Trời.
 * @param {object} orbit - { a, e, i, L, peri, node } (độ cho góc, AU cho a)
 * @param {number} jd - Julian Date
 * @returns {{x:number,y:number,z:number, meanAnomalyDeg:number}}
 */
export function keplerPosition(orbit, jd) {
  const { a, e, i, L, peri, node } = orbit;
  const d = jd - EPOCH_J2000_JD; // số ngày từ J2000

  // Chuyển động trung bình: n = 360 / chu kỳ. Chu kỳ (ngày) = a^1.5 * 365.256363 (năm sao).
  const periodDays = Math.pow(a, 1.5) * 365.256363;
  const nDeg = 360 / periodDays;

  // Kinh độ trung bình tại thời điểm cần tính.
  const LNow = norm360(L + nDeg * d);
  // Sai lệch trung bình M = L - kinh độ điểm cận nhật (peri).
  const M = norm360(LNow - peri) * DEG;
  // Sai lệch lập phương E.
  const E = solveKepler(M, e);

  // Tọa độ trong mặt phẳng quỹ đạo (hướng từ tâm đến điểm cận nhật).
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Argument of perihelion: omega = peri - node.
  const omega = (peri - node) * DEG;
  const inc = i * DEG;
  const Omega = node * DEG;

  // Xoay về hệ hoàng đạo: theo omega (trong mặt phẳng quỹ đạo), rồi i, rồi Omega.
  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const coso = Math.cos(omega), sino = Math.sin(omega);
  const cosi = Math.cos(inc), sini = Math.sin(inc);

  // Xoay trục z một góc omega.
  const x1 = xp * coso - yp * sino;
  const y1 = xp * sino + yp * coso;
  // Nghiêng theo trục x một góc i.
  const x2 = x1;
  const y2 = y1 * cosi;
  const z2 = y1 * sini;
  // Xoay trục z một góc Omega (kinh độ điểm thăng).
  const x = x2 * cosO - y2 * sinO;
  const y = x2 * sinO + y2 * cosO;
  const z = z2;

  return { x, y, z, meanAnomalyDeg: (M / DEG) };
}

/**
 * Tính tọa độ hiển thị (đơn vị cảnh Three.js) từ vị trí AU.
 * Dùng hàm nén căn bậc hai để các hành tinh trong cùng khung nhìn.
 * PHÂN BIỆT RÕ: đây là tỷ lệ TRỰC QUAN, không phải tỷ lệ vật lý.
 */
export function auToDisplay(auVec) {
  const r = Math.hypot(auVec.x, auVec.y, auVec.z);
  if (r < 1e-9) return { x: 0, y: 0, z: 0 };
  // Nén khoảng cách: displayR = 6 + 10*sqrt(r) (AU). 6 offset để Mặt Trời không chạm Sao Thủy.
  const displayR = 6 + 10 * Math.sqrt(r);
  const scale = displayR / r;
  return { x: auVec.x * scale, y: auVec.z * scale, z: auVec.y * scale }; // map ecliptic z -> three y
}
