// client/src/main.js
// Entry point: khởi tạo scene, API, UI; quản lý thời gian mô phỏng và đồng bộ dữ liệu.
//
// Chiến lược vị trí:
//   - Mỗi frame: tính vị trí 8 hành tinh theo simTime.
//   - Nếu có dữ liệu JPL cho bucket gần (|delta| <= 15 phút): nội suy tuyến tính bằng vận tốc.
//   - Nếu không: dùng mô hình Kepler (xấp xỉ). Nguồn được hiển thị rõ.
//   - Khi tua thời gian vượt quá bucket hiện có: debounce gọi API, trong khi chờ dùng Kepler.
//   - Không bao giờ gọi API theo từng frame.

import './styles/main.css';
import SolarSystemScene from './scene/SolarSystemScene.js';
import EphemerisAPI from './api/ephemerisApi.js';
import OrientationGuard from './components/OrientationGuard.js';
import Toolbar from './components/Toolbar.js';
import InfoPanel from './components/InfoPanel.js';
import StatusBar from './components/StatusBar.js';
import { PLANETS, PLANET_MAP, AU_KM } from './astronomy/constants.js';
import { keplerPosition, isoToJulianDate, auToDisplay } from './astronomy/kepler.js';

const container = document.getElementById('scene-container');
const scene = new SolarSystemScene(container);
const api = new EphemerisAPI({ apiBase: window.__API_BASE__ || '', autoSyncIntervalMs: 30 * 60 * 1000 });
const orientationGuard = new OrientationGuard();
const infoPanel = new InfoPanel();
const statusBar = new StatusBar();

// Trạng thái thời gian mô phỏng.
const state = {
  simTime: new Date(), // Date object
  paused: false,
  speed: 60, // giây mô phỏng / giây thực (mặc định 60×)
  jplData: null, // bản JPL gần nhất { data, timeBucket, source, ageMs, stale }
  jplBucket: null,
  selectedKey: null,
};

const toolbar = new Toolbar({
  planets: PLANETS,
  onResetCamera: () => scene.resetCamera(),
  onToggleOrbits: (v) => scene.setOrbitsVisible(v),
  onToggleLabels: (v) => scene.setLabelsVisible(v),
  onSelectPlanet: (key) => { if (key) scene.selectPlanet(key); else scene.selectPlanet(null); },
  onTimeControl: (cmd) => {
    if (cmd.type === 'pause') state.paused = cmd.paused;
    else if (cmd.type === 'speed') state.speed = cmd.value;
    else if (cmd.type === 'jump') {
      state.simTime = new Date(state.simTime.getTime() + cmd.deltaDays * 86400 * 1000);
      scheduleFetch();
    }
  },
});

// Khi chọn hành tinh -> hiển thị info panel.
scene.onSelect = (key) => {
  state.selectedKey = key;
  const sel = document.querySelector('.planet-select');
  if (sel) sel.value = key || '';
  if (!key) { infoPanel.hide(); return; }
  updateInfoPanel();
};

function updateInfoPanel() {
  const key = state.selectedKey;
  if (!key) return;
  const planet = PLANET_MAP[key];
  const pos = computePlanetPosition(key, state.simTime.toISOString());
  const distanceAu = pos.positionAu ? Math.hypot(pos.positionAu.x, pos.positionAu.y, pos.positionAu.z) : null;
  infoPanel.show({
    planet,
    positionAu: pos.positionAu,
    source: pos.source,
    dataTime: state.jplData && state.jplData.data ? state.jplData.data.fetchedAt : null,
    distanceAu,
  });
}

// Tính vị trí một hành tinh tại isoTime. Trả về { display, positionAu, source }.
function computePlanetPosition(key, isoTime) {
  const planet = PLANET_MAP[key];
  const jd = isoToJulianDate(isoTime);

  // Thử JPL nội suy.
  const jpl = state.jplData && state.jplData.data ? state.jplData.data.bodies[key] : null;
  if (jpl && jpl.positionKm && jpl.velocityKmS) {
    const t0 = new Date(jpl.requestedTime || state.jplData.data.requestedTime).getTime();
    const deltaSec = (new Date(isoTime).getTime() - t0) / 1000;
    if (Math.abs(deltaSec) <= 15 * 60) {
      // Nội suy tuyến tính bằng vận tốc (chính xác trong khoảng ngắn).
      const xKm = jpl.positionKm.x + jpl.velocityKmS.x * deltaSec;
      const yKm = jpl.positionKm.y + jpl.velocityKmS.y * deltaSec;
      const zKm = jpl.positionKm.z + jpl.velocityKmS.z * deltaSec;
      const positionAu = { x: xKm / AU_KM, y: yKm / AU_KM, z: zKm / AU_KM };
      return { display: auToDisplay(positionAu), positionAu, source: state.jplData.source === 'OFFLINE_CACHE' ? 'OFFLINE_CACHE' : 'JPL' };
    }
  }

  // Fallback: Kepler.
  const kp = keplerPosition(planet.orbit, jd);
  const positionAu = { x: kp.x, y: kp.y, z: kp.z };
  return { display: auToDisplay(positionAu), positionAu, source: 'KEPLER' };
}

// Debounce fetch khi tua thời gian.
let fetchTimer = null;
function scheduleFetch() {
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(async () => {
    const result = await api.getPositions(state.simTime.toISOString());
    if (result.data) {
      state.jplData = result;
      state.jplBucket = result.timeBucket;
    }
    refreshStatus();
  }, 500);
}

function refreshStatus() {
  const j = state.jplData;
  statusBar.update({
    online: api.online,
    source: j ? j.source : 'NONE',
    ageMs: j ? j.ageMs : null,
    stale: j ? j.stale : true,
  });
}

// Vòng lặp cập nhật thời gian + vị trí (độc lập với render loop của Three.js).
let lastTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (!state.paused) {
    state.simTime = new Date(state.simTime.getTime() + dt * state.speed * 1000);
  }
  toolbar.setSimTime(state.simTime.toISOString());

  // Tính vị trí 8 hành tinh.
  const positionsMap = {};
  let anyJpl = false;
  for (const p of PLANETS) {
    const r = computePlanetPosition(p.key, state.simTime.toISOString());
    positionsMap[p.key] = r.display;
    if (r.source === 'JPL' || r.source === 'CACHE' || r.source === 'OFFLINE_CACHE') anyJpl = true;
  }
  scene.updatePositions(positionsMap);

  // Nếu đang xem một thời điểm xa bucket JPL hiện có, lên lịch fetch (không chặn).
  if (state.jplBucket) {
    const diff = Math.abs(new Date(state.simTime.toISOString()).getTime() - new Date(state.jplBucket).getTime());
    if (diff > 15 * 60 * 1000 && !fetchTimer && api.online) scheduleFetch();
  }

  if (state.selectedKey) updateInfoPanel();
  requestAnimationFrame(tick);
}

// Resize.
function onResize() {
  scene.resize();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationguard:resume', onResize);

// Lắng nghe thay đổi trạng thái mạng.
api.onChange(() => refreshStatus());

// Khởi động: fetch dữ liệu ban đầu + đồng bộ định kỳ.
(async function init() {
  const result = await api.getPositions(new Date().toISOString());
  if (result.data) { state.jplData = result; state.jplBucket = result.timeBucket; }
  refreshStatus();
  api.startAutoSync();
  tick();
})();

// Đăng ký service worker (hỗ trợ offline sau lần truy cập đầu).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed:', err));
  });
}
