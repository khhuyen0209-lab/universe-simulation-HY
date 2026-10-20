// server/src/services/jplService.js
// Proxy tới NASA/JPL Horizons REST API.
// Tài liệu: https://ssd-api.jpl.nasa.gov/doc/horizons.html
// API không yêu cầu API key, nhưng có giới hạn tốc độ ngầm định -> cần cache + retry.
//
// Hệ tọa độ sử dụng:
//   - Tâm: Mặt Trời (CENTER = '500@10')
//   - Mặt phẳng tham chiếu: Hoàng đạo (REF_PLANE = 'ECLIPTIC'), J2000
//   - Đơn vị: km (vị trí), km/s (vận tốc)
//   - Thời gian: TDB (Barycentric Dynamical Time), gần UTC (sai khác vài giây).
// Các giá trị này được trả về kèm meta để client hiển thị nguồn và giới hạn.

import config from '../config/index.js';

// Mã body Horizons cho 8 hành tinh. Mặt Trời = 10 (đặt làm gốc tọa độ).
export const BODIES = {
  mercury: { id: '199', name: 'Sao Thuy', nameEn: 'Mercury' },
  venus:   { id: '299', name: 'Sao Kim',  nameEn: 'Venus' },
  earth:   { id: '399', name: 'Trai Dat', nameEn: 'Earth' },
  mars:    { id: '499', name: 'Sao Hoa',  nameEn: 'Mars' },
  jupiter: { id: '599', name: 'Sao Moc',  nameEn: 'Jupiter' },
  saturn:  { id: '699', name: 'Sao Tho',  nameEn: 'Saturn' },
  uranus:  { id: '799', name: 'Sao Thien Vuong', nameEn: 'Uranus' },
  neptune: { id: '899', name: 'Sao Hai Vuong',   nameEn: 'Neptune' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Làm tròn thời gian đến 15 phút gần nhất để tăng tỉ lệ trúng cache.
export function normalizeTime(isoTime) {
  const d = isoTime ? new Date(isoTime) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error('Thoi gian khong hop le (dinh dang ISO 8601).');
  const ms = 15 * 60 * 1000;
  return new Date(Math.round(d.getTime() / ms) * ms).toISOString();
}

// Xây URL query cho Horizons.
function buildQueryUrl(bodyId, isoTime) {
  // Lấy một mốc thời gian duy nhất: start = time, stop = time + 1h, step = 1h.
  const start = isoTime;
  const stop = new Date(new Date(isoTime).getTime() + 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${bodyId}'`,
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'500@10'", // tâm Mặt Trời
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1h'",
    OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'", // vị trí + vận tốc
    REF_PLANE: "'ECLIPTIC'",
    CSV_FORMAT: "'YES'",
  });
  return `${config.jpl.baseUrl}?${params.toString()}`;
}

// Parse block text trả về từ Horizons (trong field "result").
// Dòng dữ liệu có dạng (CSV_FORMAT=YES):
//   2461330.5,2026-Oct-20 00:00, X, Y, Z, VX, VY, VZ, LT, RG, RR
function parseHorizonsResult(resultText) {
  if (!resultText || typeof resultText !== 'string') {
    throw new Error('JPL tra ve ket qua rong.');
  }
  // Phát hiện lỗi từ JPL.
  if (/Error|No such|invalid|cannot|not found/i.test(resultText) && !/\$\$SOE/.test(resultText)) {
    const firstLine = resultText.split('\n').find((l) => /Error|invalid|No such/i.test(l)) || '';
    throw new Error(`JPL Horizons bao loi: ${firstLine.trim().slice(0, 200)}`);
  }
  const soe = resultText.indexOf('$$SOE');
  const eoe = resultText.indexOf('$$EOE');
  if (soe === -1 || eoe === -1) {
    throw new Error('Khong tim thay du lieu vector trong phan hoi JPL.');
  }
  const block = resultText.slice(soe + 5, eoe).trim();
  // Lấy dòng dữ liệu đầu tiên (đại diện cho thời điểm yêu cầu).
  const dataLine = block.split('\n').find((l) => l.trim() && !l.trim().startsWith('!'));
  if (!dataLine) throw new Error('Khong tim thay dong du lieu trong phan hoi JPL.');
  const cols = dataLine.split(',').map((c) => c.trim());
  // Cột: JD, CalendarDate, X, Y, Z, VX, VY, VZ, LT, RG, RR
  if (cols.length < 8) throw new Error('So cot du lieu JPL khong hop le.');
  const x = parseFloat(cols[2]);
  const y = parseFloat(cols[3]);
  const z = parseFloat(cols[4]);
  const vx = parseFloat(cols[5]);
  const vy = parseFloat(cols[6]);
  const vz = parseFloat(cols[7]);
  if ([x, y, z, vx, vy, vz].some((n) => !Number.isFinite(n))) {
    throw new Error('Gia tri vector JPL khong hop le.');
  }
  return {
    julianDate: parseFloat(cols[0]),
    calendarDate: cols[1],
    positionKm: { x, y, z },
    velocityKmS: { x: vx, y: vy, z: vz },
  };
}

// Gọi JPL một lần với timeout.
async function fetchOnce(bodyId, isoTime) {
  const url = buildQueryUrl(bodyId, isoTime);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.jpl.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} tu JPL Horizons.`);
    const json = await res.json();
    return parseHorizonsResult(json && json.result);
  } finally {
    clearTimeout(timer);
  }
}

// Gọi JPL với retry có kiểm soát (backoff tuyến tính).
export async function fetchEphemeris(bodyKey, isoTime) {
  const body = BODIES[bodyKey];
  if (!body) throw new Error(`Body khong ton tai: ${bodyKey}`);
  const normalized = normalizeTime(isoTime);
  let lastErr;
  for (let attempt = 0; attempt <= config.jpl.maxRetries; attempt++) {
    try {
      const parsed = await fetchOnce(body.id, normalized);
      return {
        body: bodyKey,
        bodyName: body.name,
        bodyNameEn: body.nameEn,
        source: 'JPL_HORIZONS',
        referenceFrame: 'ECLIPTIC_J2000',
        center: 'SUN (500@10)',
        units: { position: 'km', velocity: 'km/s' },
        timeType: 'TDB (xap xi UTC)',
        requestedTime: normalized,
        ...parsed,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      lastErr = err;
      if (attempt < config.jpl.maxRetries) {
        await sleep(800 * (attempt + 1)); // backoff: 0.8s, 1.6s
      }
    }
  }
  throw lastErr;
}

// Lấy vị trí tất cả 8 hành tinh song song.
export async function fetchAllEphemeris(isoTime) {
  const normalized = normalizeTime(isoTime);
  const keys = Object.keys(BODIES);
  const results = await Promise.allSettled(keys.map((k) => fetchEphemeris(k, normalized)));
  const bodies = {};
  const errors = {};
  keys.forEach((k, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') bodies[k] = r.value;
    else errors[k] = r.reason && r.reason.message ? r.reason.message : String(r.reason);
  });
  return {
    requestedTime: normalized,
    fetchedAt: new Date().toISOString(),
    source: 'JPL_HORIZONS',
    referenceFrame: 'ECLIPTIC_J2000',
    center: 'SUN (500@10)',
    units: { position: 'km', velocity: 'km/s' },
    bodies,
    errors,
    partial: Object.keys(errors).length > 0,
  };
}
