// client/src/astronomy/constants.js
// Tham số hành tinh. Nguồn: NASA Planetary Fact Sheet & JPL Keplerian Elements (J2000).
// LƯU Ý KHOA HỌC:
//   - radiusKm, semiMajorAxisAu, orbitalPeriodDays... là giá trị vật lý thực.
//   - displayRadius, displayOrbitRadius là giá trị NÉN để dễ quan sát, KHÔNG phải tỷ lệ vật lý.
//   - Elements Kepler (eccentricity, inclination...) là giá trị trung bình tại epoch J2000,
//     dùng để tính xấp xỉ vị trí khi offline hoặc khi tua thời gian. Sai số góc thường < 1°
//     trong vòng vài thập kỷ quanh J2000; không dùng cho tác vụ đòi hỏi độ chính xác cao.

export const AU_KM = 149_597_870.7; // 1 đơn vị thiên văn = km (giá trị chính xác, IAU 2012)
export const EPOCH_J2000_JD = 2451545.0; // 2000-01-01 12:00 TT
export const DEG = Math.PI / 180;

// Mặt Trời
export const SUN = {
  key: 'sun',
  name: 'Mặt Trời',
  nameEn: 'Sun',
  radiusKm: 696_340,
  displayRadius: 4.2,
  color: 0xffcc33,
  emissive: 0xffaa00,
};

// 8 hành tinh. `orbit` = elements Kepler trung bình J2000.
//   a = bán trục lớn (AU), e = độ lệch tâm, i = độ nghiêng (°),
//   L = kinh độ trung bình tại epoch (°), peri = kinh độ điểm cận nhật (°),
//   node = kinh độ điểm thăng hoàng (°). periodDays tính từ a^1.5 * 365.25.
export const PLANETS = [
  {
    key: 'mercury', name: 'Sao Thủy', nameEn: 'Mercury',
    radiusKm: 2439.7, displayRadius: 0.45, color: 0x9c8a7a,
    semiMajorAxisAu: 0.3871, distanceFromSunKm: 57.9e6, orbitalPeriodDays: 87.97,
    orbit: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.25032350, peri: 77.45779628, node: 48.33076593 },
    displayOrbitRadius: 11,
    description: 'Hành tinh nhỏ nhất và gần Mặt Trời nhất.',
  },
  {
    key: 'venus', name: 'Sao Kim', nameEn: 'Venus',
    radiusKm: 6051.8, displayRadius: 0.85, color: 0xe8c07a,
    semiMajorAxisAu: 0.7233, distanceFromSunKm: 108.2e6, orbitalPeriodDays: 224.7,
    orbit: { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.97909950, peri: 131.60246718, node: 76.67984255 },
    displayOrbitRadius: 15,
    description: 'Hành tinh nóng nhất do hiệu ứng nhà kính dày đặc.',
  },
  {
    key: 'earth', name: 'Trái Đất', nameEn: 'Earth',
    radiusKm: 6371.0, displayRadius: 0.9, color: 0x3b7dd8,
    semiMajorAxisAu: 1.0, distanceFromSunKm: 149.6e6, orbitalPeriodDays: 365.25,
    orbit: { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0.0 },
    displayOrbitRadius: 19,
    description: 'Hành tinh duy nhất được biết là có sự sống.',
  },
  {
    key: 'mars', name: 'Sao Hỏa', nameEn: 'Mars',
    radiusKm: 3389.5, displayRadius: 0.6, color: 0xc1440e,
    semiMajorAxisAu: 1.5237, distanceFromSunKm: 227.9e6, orbitalPeriodDays: 686.98,
    orbit: { a: 1.52371034, e: 0.09339410, i: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891 },
    displayOrbitRadius: 24,
    description: 'Hành tinh đỏ, có đỉnh núi lửa lớn nhất Hệ Mặt Trời.',
  },
  {
    key: 'jupiter', name: 'Sao Mộc', nameEn: 'Jupiter',
    radiusKm: 69911, displayRadius: 2.2, color: 0xd8ca9d,
    semiMajorAxisAu: 5.2029, distanceFromSunKm: 778.5e6, orbitalPeriodDays: 4332.59,
    orbit: { a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909 },
    displayOrbitRadius: 34,
    description: 'Hành tinh lớn nhất, có Vệt Đỏ Lớn là cơn bão tồn tại hàng trăm năm.',
  },
  {
    key: 'saturn', name: 'Sao Thổ', nameEn: 'Saturn',
    radiusKm: 58232, displayRadius: 1.9, color: 0xe3dcc0, hasRing: true,
    semiMajorAxisAu: 9.5367, distanceFromSunKm: 1434e6, orbitalPeriodDays: 10759.22,
    orbit: { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448 },
    displayOrbitRadius: 44,
    description: 'Nổi tiếng với hệ vành đai băng và đá rộng lớn.',
  },
  {
    key: 'uranus', name: 'Sao Thiên Vương', nameEn: 'Uranus',
    radiusKm: 25362, displayRadius: 1.3, color: 0x9fd8e0,
    semiMajorAxisAu: 19.189, distanceFromSunKm: 2871e6, orbitalPeriodDays: 30688.5,
    orbit: { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, peri: 170.95427630, node: 74.01692503 },
    displayOrbitRadius: 54,
    description: 'Hành tinh băng khổng lồ, trục quay nghiêng gần 98° (lăn trên quỹ đạo).',
  },
  {
    key: 'neptune', name: 'Sao Hải Vương', nameEn: 'Neptune',
    radiusKm: 24622, displayRadius: 1.25, color: 0x3b5bdb,
    semiMajorAxisAu: 30.0699, distanceFromSunKm: 4495e6, orbitalPeriodDays: 60182,
    orbit: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, peri: 44.96476227, node: 131.78422574 },
    displayOrbitRadius: 63,
    description: 'Hành tinh xa nhất, có gió mạnh nhất Hệ Mặt Trời (trên 2000 km/h).',
  },
];

export const PLANET_MAP = Object.fromEntries(PLANETS.map((p) => [p.key, p]));

// Ánh xạ tọa độ: hệ hoàng đạo J2000 (x,y trong mặt phẳng hoàng đạo, z vuông góc)
// sang hệ tọa độ Three.js (y lên). Quỹ đạo nằm trong mặt phẳng XZ.
//   ecliptic.x -> three.x
//   ecliptic.y -> three.z
//   ecliptic.z -> three.y
export function eclipticToThree(vec) {
  return { x: vec.x, y: vec.z || 0, z: vec.y };
}
