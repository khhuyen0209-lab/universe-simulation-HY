// client/src/scene/SolarSystemScene.js
// Lớp quản lý không gian 3D Three.js.
// Cải tiến:
//   - Đường quỹ đạo dùng chính hàm tính vị trí (orbitDisplayPoints) -> khớp 100% với hành tinh.
//   - Texture chi tiết riêng cho từng hành tinh (procedural canvas, offline được).
//   - Mặt Trời rõ ràng, có vầng sáng + nhãn.
//   - Vành đai tiểu hành tinh (giữa Hỏa - Mộc) và vành đai Kuiper (ngoài Hải Vương), tắt được.
//   - Chọn hành tinh -> camera bay tới và theo dõi, giới hạn zoom gần nhất.
//   - Hiệu năng mobile: clamp pixelRatio, giảm segment, không shadow.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN, PLANETS, PLANET_MAP } from '../astronomy/constants.js';
import { orbitDisplayPoints, auToDisplay } from '../astronomy/kepler.js';
import { loadBodyTexture } from '../api/textureLoader.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Texture chi tiết riêng cho từng hành tinh (canvas procedural).
function makePlanetTexture(key, baseColor) {
  const w = 512, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(baseColor);
  const rnd = mulberry32(key.length * 977 + key.charCodeAt(0));
  const fill = (c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); };

  if (key === 'earth') {
    // Đại dương xanh dương.
    fill('#1a4f8a');
    // Lục địa: các mảng xanh lá/nâu.
    for (let i = 0; i < 14; i++) {
      const cx = rnd() * w, cy = rnd() * h, r = 15 + rnd() * 45;
      ctx.fillStyle = rnd() > 0.5 ? '#2d7a3a' : '#8a6a3a';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        const rr = r * (0.6 + rnd() * 0.6);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.7;
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }
    // Mây trắng.
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 25, 3 + rnd() * 6, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (key === 'jupiter') {
    // Các dải ngang đặc trưng.
    const bands = ['#c9b896', '#e8dcc0', '#b89a6a', '#e0d0b0', '#a08060', '#d8c8a8', '#c0a880'];
    let y = 0;
    while (y < h) {
      const bh = 8 + rnd() * 22;
      ctx.fillStyle = bands[Math.floor(rnd() * bands.length)];
      ctx.fillRect(0, y, w, bh);
      y += bh;
    }
    // Vệt Đỏ Lớn.
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#b84020';
    ctx.beginPath();
    ctx.ellipse(w * 0.65, h * 0.6, 28, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (key === 'saturn') {
    const bands = ['#e3dcc0', '#d4c89a', '#c8b880', '#ece4c8'];
    let y = 0;
    while (y < h) {
      const bh = 10 + rnd() * 18;
      ctx.fillStyle = bands[Math.floor(rnd() * bands.length)];
      ctx.fillRect(0, y, w, bh);
      y += bh;
    }
  } else if (key === 'mars') {
    fill('#c1440e');
    // Điểm tối (biển) + cực băng trắng.
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#7a2a08';
    for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 8 + rnd() * 25, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#f0e8e0';
    ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 8, w, 8);
    ctx.globalAlpha = 1;
  } else if (key === 'venus') {
    fill('#e8c07a');
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff4d0';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 50, 4 + rnd() * 8, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (key === 'mercury') {
    fill('#9c8a7a');
    ctx.globalAlpha = 0.4; ctx.fillStyle = '#5a4a3a';
    for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 2 + rnd() * 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (key === 'uranus' || key === 'neptune') {
    fill('#' + base.getHexString());
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 15 + rnd() * 40, 3 + rnd() * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (key === 'neptune') { ctx.globalAlpha = 0.6; ctx.fillStyle = '#1a2a8a'; ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.4, 16, 9, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else {
    fill('#' + base.getHexString());
    ctx.globalAlpha = 0.2; ctx.fillStyle = '#000000';
    for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 3 + rnd() * 12, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default class SolarSystemScene {
  constructor(container) {
    this.container = container;
    this.planetMeshes = new Map();
    this.orbitLines = new Map();
    this.labelEls = new Map();
    this.selectedKey = null;
    this.focusKey = null; // hành tinh đang được camera theo dõi
    this.lastPositions = {};
    this.onSelect = null;
    this.orbitsVisible = true;
    this.labelsVisible = true;
    this.beltsVisible = true;
    this._disposed = false;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    const maxPixelRatio = isMobile ? 1.5 : 2;
    const sphereSeg = isMobile ? 32 : 48;

    this.renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060f);
    this._addStars(isMobile ? 1500 : 4000);

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 2000);
    this.defaultCameraPos = new THREE.Vector3(0, 55, 85);
    this.camera.position.copy(this.defaultCameraPos);
    this.defaultMinDistance = 6;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = this.defaultMinDistance;
    this.controls.maxDistance = 400;

    const sunLight = new THREE.PointLight(0xffffff, 2.5, 0, 0);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);
    this.scene.add(new THREE.AmbientLight(0x334466, 0.4));

    // Mặt Trời (rõ ràng, có vầng sáng lớn).
    const sunGeo = new THREE.SphereGeometry(SUN.displayRadius, sphereSeg, sphereSeg / 2);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd55 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.userData.planetKey = 'sun';
    this.scene.add(this.sun);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    const gg = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gg.addColorStop(0, 'rgba(255,220,100,0.95)');
    gg.addColorStop(0.3, 'rgba(255,170,50,0.4)');
    gg.addColorStop(0.7, 'rgba(255,120,20,0.12)');
    gg.addColorStop(1, 'rgba(255,100,0,0)');
    gctx.fillStyle = gg; gctx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sunGlow = new THREE.Sprite(glowMat);
    this.sunGlow.scale.set(SUN.displayRadius * 6, SUN.displayRadius * 6, 1);
    this.scene.add(this.sunGlow);

    const labelsLayer = document.getElementById('labels-layer');
    // Nhãn Mặt Trời.
    const sunLabel = document.createElement('div');
    sunLabel.className = 'planet-label sun-label';
    sunLabel.textContent = 'Mặt Trời';
    labelsLayer.appendChild(sunLabel);
    this.sunLabelEl = sunLabel;

    PLANETS.forEach((p, idx) => {
      const geo = new THREE.SphereGeometry(p.displayRadius, sphereSeg, sphereSeg / 2);
      const tex = makePlanetTexture(p.key, p.color);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.05 });
      // Tải bản đồ thật từ internet khi có mạng (cache), nếu chưa có thì dùng canvas vẽ sẵn.
      loadBodyTexture(p.key, tex).then((t) => { if (t !== tex) { mat.map = t; mat.needsUpdate = true; } });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.planetKey = p.key;
      this.scene.add(mesh);
      this.planetMeshes.set(p.key, mesh);

      if (p.hasRing) {
        // Vành đai Sao Thổ chi tiết: nhiều vòng với màu/độ trong khác nhau + khe Cassini (khoảng trống).
        const ringGroup = new THREE.Group();
        const rings = [
          { inner: 1.35, outer: 1.70, color: 0xc8b88a, opacity: 0.45 },  // vành C (trong, mờ)
          { inner: 1.75, outer: 2.15, color: 0xe8dcb0, opacity: 0.8 },   // vành B (sáng nhất)
          { inner: 2.18, outer: 2.30, color: 0x000000, opacity: 0.0 },   // khe Cassini (trống)
          { inner: 2.33, outer: 2.62, color: 0xd8c890, opacity: 0.55 },  // vành A
          { inner: 2.66, outer: 2.82, color: 0xb8a878, opacity: 0.25 },  // vành F (ngoài, mờ)
        ];
        rings.forEach((r) => {
          if (r.opacity <= 0) return;
          const g = new THREE.RingGeometry(p.displayRadius * r.inner, p.displayRadius * r.outer, 96);
          const m = new THREE.MeshBasicMaterial({ color: r.color, side: THREE.DoubleSide, transparent: true, opacity: r.opacity, depthWrite: false });
          ringGroup.add(new THREE.Mesh(g, m));
        });
        ringGroup.rotation.x = Math.PI / 2 - 0.35;
        mesh.add(ringGroup);
      }

      // Đường quỹ đạo: dùng orbitDisplayPoints -> khớp 100% vị trí hành tinh.
      const pts = orbitDisplayPoints(p.orbit, 160).map((v) => new THREE.Vector3(v.x, v.y, v.z));
      const geoLine = new THREE.BufferGeometry().setFromPoints(pts);
      const matLine = new THREE.LineBasicMaterial({ color: 0x4a5a8a, transparent: true, opacity: 0.55 });
      const line = new THREE.Line(geoLine, matLine);
      this.scene.add(line);
      this.orbitLines.set(p.key, line);

      const el = document.createElement('div');
      el.className = 'planet-label';
      el.textContent = p.name;
      labelsLayer.appendChild(el);
      this.labelEls.set(p.key, el);
    });

    // Vành đai tiểu hành tinh (2.2 - 3.2 AU) và vành đai Kuiper (30 - 48 AU).
    this.asteroidBelt = this._makeBelt(2.2, 3.2, isMobile ? 600 : 1500, 0x8a8070, 0.35);
    this.kuiperBelt = this._makeBelt(30, 48, isMobile ? 800 : 2000, 0x6a7a9a, 0.3);
    this.scene.add(this.asteroidBelt, this.kuiperBelt);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._onClick = this._onClick.bind(this);
    this.renderer.domElement.addEventListener('click', this._onClick);

    this._clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    this._animate();
  }

  _makeBelt(rMinAu, rMaxAu, count, color, opacity) {
    const positions = new Float32Array(count * 3);
    const rnd = mulberry32(Math.floor(rMinAu * 1000 + rMaxAu));
    for (let i = 0; i < count; i++) {
      const r = rMinAu + rnd() * (rMaxAu - rMinAu);
      const theta = rnd() * Math.PI * 2;
      const inc = (rnd() - 0.5) * 0.15; // nghiêng nhỏ ngẫu nhiên (rad)
      const au = { x: r * Math.cos(theta), y: r * Math.sin(theta), z: r * Math.sin(inc) };
      const d = auToDisplay(au);
      positions[i * 3] = d.x;
      positions[i * 3 + 1] = d.y + (rnd() - 0.5) * 0.5;
      positions[i * 3 + 2] = d.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity, sizeAttenuation: true, depthWrite: false });
    return new THREE.Points(geo, mat);
  }

  _addStars(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = mulberry32(42);
    for (let i = 0; i < count; i++) {
      const r = 600 + rnd() * 400;
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.8 });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _onClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [this.sun, ...Array.from(this.planetMeshes.values())];
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) this.selectPlanet(hits[0].object.userData.planetKey);
    else this.selectPlanet(null);
  }

  selectPlanet(key) {
    this.selectedKey = key;
    this.focusKey = key; // camera bay tới hành tinh đã chọn
    this.planetMeshes.forEach((mesh, k) => {
      const base = PLANET_MAP[k].displayRadius;
      mesh.scale.setScalar(k === key ? 1.3 : 1);
    });
    if (this.onSelect) this.onSelect(key);
  }

  updatePositions(positionsMap) {
    this.lastPositions = positionsMap;
    for (const [key, pos] of Object.entries(positionsMap)) {
      const mesh = this.planetMeshes.get(key);
      if (mesh && pos) mesh.position.set(pos.x, pos.y, pos.z);
    }
  }

  setOrbitsVisible(v) { this.orbitsVisible = v; this.orbitLines.forEach((l) => (l.visible = v)); }
  setLabelsVisible(v) { this.labelsVisible = v; this.labelEls.forEach((el) => (el.style.display = v ? '' : 'none')); if (this.sunLabelEl) this.sunLabelEl.style.display = v ? '' : 'none'; }
  setBeltsVisible(v) { this.beltsVisible = v; this.asteroidBelt.visible = v; this.kuiperBelt.visible = v; }

  resetCamera() {
    this.focusKey = null;
    this.controls.minDistance = this.defaultMinDistance;
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  _updateLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    const project = (pos3, el) => {
      v.copy(pos3);
      v.project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) { el.style.display = 'none'; return; }
      el.style.display = '';
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
    };
    if (this.labelsVisible) project(new THREE.Vector3(0, SUN.displayRadius + 1, 0), this.sunLabelEl);
    this.labelEls.forEach((el, key) => {
      if (!this.labelsVisible) return;
      const mesh = this.planetMeshes.get(key);
      if (mesh) project(mesh.position, el);
    });
  }

  _animate() {
    if (this._disposed) return;
    requestAnimationFrame(this._animate);
    const dt = this._clock.getDelta();
    this.planetMeshes.forEach((mesh) => { mesh.rotation.y += dt * 0.15; });
    this.sun.rotation.y += dt * 0.05;

    // Camera theo dõi thiên thể đang chọn (bay tới, giới hạn zoom gần).
    if (this.focusKey) {
      let target = null, bodyR = 1;
      if (this.focusKey === 'sun') { target = new THREE.Vector3(0, 0, 0); bodyR = SUN.displayRadius; }
      else if (this.lastPositions[this.focusKey]) {
        const lp = this.lastPositions[this.focusKey];
        target = new THREE.Vector3(lp.x, lp.y, lp.z);
        bodyR = PLANET_MAP[this.focusKey].displayRadius;
      }
      if (target) {
        this.controls.minDistance = Math.max(bodyR * 1.2, 0.8);
        this.controls.target.lerp(target, 0.08);
        const dir = this.camera.position.clone().sub(target);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 1);
        dir.normalize().multiplyScalar(bodyR * 5);
        this.camera.position.lerp(target.clone().add(dir), 0.04);
      }
    } else {
      this.controls.minDistance = this.defaultMinDistance;
    }

    this.controls.update();
    this._updateLabels();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this._disposed = true;
    this.renderer.domElement.removeEventListener('click', this._onClick);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    this.labelEls.forEach((el) => el.remove());
    if (this.sunLabelEl) this.sunLabelEl.remove();
  }
}
