// client/src/scene/SolarSystemScene.js
// Lớp quản lý không gian 3D Three.js: renderer, camera, ánh sáng, Mặt Trời,
// 8 hành tinh, vành đai Sao Thổ, đường quỹ đạo, nhãn HTML, chọn hành tinh.
//
// LƯU Ý HIỆU NĂNG:
//   - pixelRatio được clamp theo thiết bị (mobile <= 1.5, desktop <= 2).
//   - Số đoạn hình cầu giảm trên mobile. Không dùng shadow (tốn GPU).
//   - Vị trí hành tinh được cập nhật từ bên ngoài (main.js) qua updatePositions().

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN, PLANETS } from '../astronomy/constants.js';

// Tạo texture procedural đơn giản bằng canvas (không phụ thuộc file ngoài -> offline được).
function makePlanetTexture(baseColorHex, variant = 0) {
  const w = 256, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(baseColorHex);
  // Nền gradient dọc.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#' + base.clone().multiplyScalar(1.25).getHexString());
  grad.addColorStop(0.5, '#' + base.getHexString());
  grad.addColorStop(1, '#' + base.clone().multiplyScalar(0.7).getHexString());
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Các đốm noise để trông giống bề mặt.
  const rnd = mulberry32(1000 + variant * 77);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 10;
    const shade = 0.75 + rnd() * 0.5;
    const c = base.clone().multiplyScalar(shade);
    ctx.globalAlpha = 0.18 + rnd() * 0.25;
    ctx.fillStyle = '#' + c.getHexString();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default class SolarSystemScene {
  constructor(container) {
    this.container = container;
    this.planetMeshes = new Map(); // key -> mesh
    this.orbitLines = new Map();
    this.labelEls = new Map(); // key -> div
    this.selectedKey = null;
    this.onSelect = null; // callback(key|null)
    this.orbitsVisible = true;
    this.labelsVisible = true;
    this._disposed = false;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    const maxPixelRatio = isMobile ? 1.5 : 2;
    const sphereSeg = isMobile ? 24 : 48;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Scene + camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060f);
    // Sao nền (points)
    this._addStars(isMobile ? 1500 : 4000);

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 2000);
    this.defaultCameraPos = new THREE.Vector3(0, 45, 70);
    this.camera.position.copy(this.defaultCameraPos);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 300;

    // Ánh sáng: điểm sáng tại Mặt Trời + ambient yếu để mặt tối vẫn thấy.
    const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);
    this.scene.add(new THREE.AmbientLight(0x334466, 0.35));

    // Mặt Trời
    const sunGeo = new THREE.SphereGeometry(SUN.displayRadius, sphereSeg, sphereSeg / 2);
    const sunMat = new THREE.MeshBasicMaterial({ color: SUN.color });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.scene.add(this.sun);
    // Vầng sáng đơn giản (sprite lớn hơn, trong suốt)
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d');
    const gg = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,200,80,0.9)');
    gg.addColorStop(0.4, 'rgba(255,160,40,0.35)');
    gg.addColorStop(1, 'rgba(255,120,0,0)');
    gctx.fillStyle = gg; gctx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sunGlow = new THREE.Sprite(glowMat);
    this.sunGlow.scale.set(SUN.displayRadius * 4.5, SUN.displayRadius * 4.5, 1);
    this.scene.add(this.sunGlow);

    // Hành tinh + quỹ đạo + nhãn
    const labelsLayer = document.getElementById('labels-layer');
    PLANETS.forEach((p, idx) => {
      const geo = new THREE.SphereGeometry(p.displayRadius, sphereSeg, sphereSeg / 2);
      const tex = makePlanetTexture(p.color, idx);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.planetKey = p.key;
      this.scene.add(mesh);
      this.planetMeshes.set(p.key, mesh);

      // Vành đai Sao Thổ
      if (p.hasRing) {
        const ringGeo = new THREE.RingGeometry(p.displayRadius * 1.4, p.displayRadius * 2.3, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8cfa8, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 - 0.35;
        mesh.add(ring);
      }

      // Đường quỹ đạo (ellipse nén theo tỷ lệ hiển thị — dùng displayOrbitRadius,
      // độ lệch tâm e làm ellipse). Đây là hình minh họa quỹ đạo, không phải vạch tọa độ chính xác.
      const orbitLine = this._buildOrbitLine(p);
      this.scene.add(orbitLine);
      this.orbitLines.set(p.key, orbitLine);

      // Nhãn HTML
      const el = document.createElement('div');
      el.className = 'planet-label';
      el.textContent = p.name;
      labelsLayer.appendChild(el);
      this.labelEls.set(p.key, el);
    });

    // Raycaster chọn hành tinh
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._onClick = this._onClick.bind(this);
    this.renderer.domElement.addEventListener('click', this._onClick);

    this._clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    this._animate();
  }

  _addStars(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = mulberry32(42);
    for (let i = 0; i < count; i++) {
      // Phân bố trên hình cầu lớn.
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

  // Xây đường ellipse quỹ đạo theo tỷ lệ hiển thị.
  _buildOrbitLine(p) {
    const { a, e } = p.orbit;
    const scale = p.displayOrbitRadius / a; // tỷ lệ nén từ AU sang đơn vị cảnh
    const semiMajor = a * scale;
    const semiMinor = semiMajor * Math.sqrt(1 - e * e);
    const cx = -e * semiMajor; // tâm ellipse lệch so với tiêu điểm (Mặt Trời)
    const pts = [];
    const seg = 128;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      // Tọa độ trong mặt phẳng quỹ đạo, rồi xoay theo node/i/omega — nhưng để
      // đường quỹ đạo dễ nhìn, ta vẽ trong mặt phẳng XZ với nghiêng nhỏ theo i.
      const x0 = cx + semiMajor * Math.cos(t);
      const z0 = semiMinor * Math.sin(t);
      // Nghiêng nhẹ theo độ nghiêng quỹ đạo (i) quanh trục z? Đơn giản: nghiêng quanh trục X.
      const inc = (p.orbit.i || 0) * Math.PI / 180;
      const y = z0 * Math.sin(inc);
      const z = z0 * Math.cos(inc);
      pts.push(new THREE.Vector3(x0, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x3a4a7a, transparent: true, opacity: 0.5 });
    return new THREE.Line(geo, mat);
  }

  _onClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = Array.from(this.planetMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const key = hits[0].object.userData.planetKey;
      this.selectPlanet(key);
    } else {
      this.selectPlanet(null);
    }
  }

  selectPlanet(key) {
    this.selectedKey = key;
    // Đánh dấu visual: phóng to nhẹ hành tinh được chọn.
    this.planetMeshes.forEach((mesh, k) => {
      const base = PLANETS.find((p) => p.key === k).displayRadius;
      mesh.scale.setScalar(k === key ? 1.35 : 1);
    });
    if (this.onSelect) this.onSelect(key);
  }

  // Cập nhật vị trí hiển thị. positionsMap: { key: {x,y,z} } (đơn vị cảnh Three.js)
  updatePositions(positionsMap) {
    for (const [key, pos] of Object.entries(positionsMap)) {
      const mesh = this.planetMeshes.get(key);
      if (mesh && pos) mesh.position.set(pos.x, pos.y, pos.z);
    }
  }

  setOrbitsVisible(v) {
    this.orbitsVisible = v;
    this.orbitLines.forEach((l) => (l.visible = v));
  }
  setLabelsVisible(v) {
    this.labelsVisible = v;
    this.labelEls.forEach((el) => (el.style.display = v ? '' : 'none'));
  }

  resetCamera() {
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // Cập nhật vị trí nhãn HTML (project 3D -> 2D). Gọi mỗi frame.
  _updateLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    this.labelEls.forEach((el, key) => {
      if (!this.labelsVisible) return;
      const mesh = this.planetMeshes.get(key);
      if (!mesh) return;
      v.copy(mesh.position);
      v.project(this.camera);
      const behind = v.z > 1;
      if (behind || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
    });
  }

  _animate() {
    if (this._disposed) return;
    requestAnimationFrame(this._animate);
    const dt = this._clock.getDelta();
    // Hành tinh tự quay quanh trục (chậm, để thấy bề mặt).
    this.planetMeshes.forEach((mesh, key) => { mesh.rotation.y += dt * 0.15; });
    this.sun.rotation.y += dt * 0.05;
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
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.labelEls.forEach((el) => el.remove());
  }
}
