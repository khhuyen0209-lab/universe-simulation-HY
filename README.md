# Hệ Mặt Trời 3D — Solar System 3D Full-Stack

Mô phỏng Hệ Mặt Trời 3D dựa trên dữ liệu thiên văn thực từ **NASA/JPL Horizons**,
có khả năng cập nhật trực tuyến và hoạt động dự phòng khi mất Internet.

- **Frontend**: HTML5 + CSS3 + JavaScript (ES Modules), Three.js, Vite.
- **Backend**: Node.js LTS + Express, proxy JPL Horizons (tránh CORS), cache RAM + đĩa, rate-limit.
- **Triển khai**: Render (một dịch vụ Web duy nhất, Express phục vụ cả API lẫn frontend build).
- **Offline**: Service Worker + IndexedDB + mô hình quỹ đạo Kepler chạy cục bộ.

---

## 1. Cấu trúc thư mục

```
solar-system-3d/
├── client/                 # Frontend (Vite + Three.js)
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── public/
│   │   └── sw.js           # Service Worker (offline)
│   └── src/
│       ├── main.js         # Entry point, vòng lặp thời gian mô phỏng
│       ├── scene/
│       │   └── SolarSystemScene.js   # Three.js: camera, ánh sáng, hành tinh, quỹ đạo, nhãn
│       ├── astronomy/
│       │   ├── constants.js          # Tham số hành tinh (NASA/JPL J2000) + tỷ lệ hiển thị
│       │   └── kepler.js             # Mô hình Kepler dự phòng (giải phương trình Kepler)
│       ├── api/
│       │   └── ephemerisApi.js       # Gọi backend, cache IndexedDB, đồng bộ định kỳ, online/offline
│       ├── components/
│       │   ├── OrientationGuard.js   # Màn hình yêu cầu xoay ngang (bắt buộc trên điện thoại)
│       │   ├── Toolbar.js            # Thanh công cụ: camera, quỹ đạo, nhãn, điều khiển thời gian
│       │   ├── InfoPanel.js          # Bảng thông tin hành tinh
│       │   └── StatusBar.js          # Trạng thái mạng + nguồn dữ liệu + cảnh báo dữ liệu cũ
│       └── styles/
│           └── main.css              # Giao diện responsive (desktop + mobile landscape)
├── server/                 # Backend (Express)
│   ├── package.json
│   └── src/
│       ├── index.js        # Entry point: Express, static, routes, error handler
│       ├── config/index.js # Đọc biến môi trường (không lộ ra client)
│       ├── cache/cacheStore.js  # Cache RAM (TTL) + snapshot đĩa best-effort
│       ├── services/jplService.js # Gọi + parse JPL Horizons, retry, timeout
│       └── routes/
│           ├── health.js   # GET /health
│           └── positions.js# GET /api/positions, /api/ephemeris/:body, /api/config
├── render.yaml             # Cấu hình Render Blueprint
├── package.json            # Root: script cài đặt & build cả hai phần
├── .env.example            # Mẫu biến môi trường (không chứa bí mật thật)
├── .gitignore
└── README.md
```

---

## 2. Yêu cầu hệ thống

- Node.js >= 20 (LTS khuyến nghị 20 hoặc 22).
- npm.
- Kết nối Internet để lấy dữ liệu JPL (lần đầu và đồng bộ định kỳ). Sau lần truy cập
  đầu, ứng dụng vẫn mở được khi offline (dùng cache + mô hình Kepler).

---

## 3. Chạy local

### 3.1 Cài đặt dependency

```bash
# Tại thư mục gốc của dự án:
npm run install:all
```

Lệnh này cài dependency cho cả `server/` và `client/`.

### 3.2 (Tùy chọn) Cấu hình biến môi trường

```bash
cp .env.example server/.env
# Chỉnh server/.env nếu cần. Mặc định đã chạy được không cần sửa.
```

### 3.3 Build frontend

```bash
npm run build:client
```

Kết quả nằm ở `client/dist/`.

### 3.4 Chạy server (phục vụ cả API lẫn frontend)

```bash
npm start
```

Mở trình duyệt: <http://localhost:10000>

### 3.5 Chạy chế độ phát triển (frontend hot-reload)

```bash
# Terminal 1: backend
npm run dev:server          # http://localhost:10000

# Terminal 2: frontend dev server (proxy /api sang backend)
npm run dev:client          # http://localhost:5173
```

---

## 4. Cấu hình môi trường (`.env`)

Xem `.env.example`. Các biến chính:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 10000 | Cổng server. Render tự động đặt. |
| `NODE_ENV` | development | `production` khi deploy. |
| `CORS_ORIGINS` | `*` | Danh sách origin được phép, cách nhau dấu phẩy. Để `*` hoặc rỗng = tất cả. Deploy chung origin thì không cần. |
| `JPL_TIMEOUT_MS` | 15000 | Timeout gọi JPL (ms). |
| `JPL_MAX_RETRIES` | 2 | Số lần thử lại khi JPL lỗi. |
| `CACHE_TTL_MS` | 1800000 | TTL cache RAM (30 phút). |
| `RATE_LIMIT_PER_MINUTE` | 60 | Giới hạn request/phút/IP (0 = vô hạn). |
| `PUBLIC_API_URL` | (rỗng) | URL backend khi frontend deploy riêng. Rỗng = cùng origin. |

**Không commit file `.env` thật** (đã có trong `.gitignore`). Dự án này **không cần API key**
vì JPL Horizons API mở.

---

## 5. Triển khai lên Render

### Phương án ưu tiên (đơn giản, chi phí thấp): một dịch vụ Web duy nhất

Express phục vụ cả API (`/api/*`, `/health`) và frontend build (`client/dist`).
Chỉ trả phí cho 1 dịch vụ (gói Free đủ dùng cho thử nghiệm; gói Starter nếu cần
thời gian chạy liên tục không ngủ).

### Các bước

1. **Đẩy mã lên GitHub**: tạo repository mới, commit toàn bộ dự án (không bao gồm
   `node_modules/`, `client/dist/`, `.env`).
2. **Tạo dịch vụ trên Render**:
   - Cách A (khuyến nghị): Render Dashboard → **New → Blueprint** → chọn repository.
     Render tự đọc `render.yaml` và tạo dịch vụ `solar-system-3d`.
   - Cách B: **New → Web Service** → chọn repository → cài đặt:
     - **Build Command**: `npm install && npm run install:all && npm run build:client`
     - **Start Command**: `npm start`
     - **Health Check Path**: `/health`
3. **Biến môi trường**: trong tab **Environment** của dịch vụ, thêm các biến theo
   `.env.example`. `PORT` Render tự cấp, không cần đặt. `PUBLIC_API_URL` để trống
   vì cùng origin. `CORS_ORIGINS` cũng để trống/mặc định.
4. **Deploy**: Render tự build và deploy. Mở URL dịch vụ để kiểm tra.
5. **Cập nhật sau khi sửa mã**: chỉ cần `git push` lên nhánh chính, Render tự build
   lại (`autoDeploy: true` trong `render.yaml`).

### Tách riêng: Server trên Render + Client trên Firebase Hosting

Đây là kiến trúc bạn hỏi: backend API chạy trên Render, frontend tĩnh deploy trên
Firebase Hosting (miễn phí, CDN toàn cầu, HTTPS mặc định).

#### Bước 1 — Deploy backend lên Render

1. Đẩy mã lên GitHub.
2. Render Dashboard → **New → Web Service** → chọn repo → cấu hình:
   - **Root Directory**: `server` (chỉ deploy phần backend, không cần client).
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
3. Tab **Environment** thêm biến (xem `.env.example`):
   - `NODE_ENV=production`
   - `CORS_ORIGINS=https://<firebase-app-id>.web.app,https://<firebase-app-id>.firebaseapp.com`
     (thay bằng origin Firebase của bạn, cách nhau dấu phẩy)
   - Các biến khác để mặc định. `PORT` Render tự cấp.
4. Deploy xong, ghi lại URL backend, ví dụ: `https://solar-system-3d.onrender.com`.

#### Bước 2 — Cấu hình client trỏ về backend Render

Mở `client/public/config.js`, sửa:
```js
window.__API_BASE__ = 'https://solar-system-3d.onrender.com';
```
(điền URL Render của bạn, **không** có dấu `/` ở cuối).

**Quan trọng**: `config.js` được copy nguyên vào `dist/config.js` (không bị hash).
Nếu bạn đã có sẵn `dist/` (ví dụ dùng bản build sẵn trong ZIP), bạn có thể sửa
trực tiếp `dist/config.js` rồi deploy lên Firebase **KHÔNG cần build lại**.

#### Bước 3 — Build client

```bash
cd client
npm install
npm run build
```
Kết quả ở `client/dist/`.

#### Bước 4 — Deploy lên Firebase Hosting

1. Cài Firebase CLI: `npm install -g firebase-tools`
2. Đăng nhập: `firebase login`
3. Tạo project trên <https://console.firebase.google.com> (bật Hosting).
4. Trong thư mục `client/`:
   ```bash
   cp .firebaserc.example .firebaserc
   # sửa .firebaserc: thay YOUR_FIREBASE_PROJECT_ID bằng project id của bạn
   firebase deploy --only hosting
   ```
   File `client/firebase.json` đã được cấu hình sẵn: `public: "dist"`, cache dài hạn
   cho assets có hash, không cache `index.html` và `sw.js`.
5. Firebase trả về URL: `https://<app-id>.web.app` và `https://<app-id>.firebaseapp.com`.

#### Bước 5 — Kiểm tra

- Mở URL Firebase: ứng dụng tải về, gọi API sang Render (xem tab Network của DevTools,
  request đến `https://<render-url>/api/positions` trả về 200).
- Nếu lỗi CORS: kiểm tra biến `CORS_ORIGINS` trên Render có khớp origin Firebase không
  (phải bao gồm cả `https://`, không có dấu `/` cuối).
- Khi cập nhật mã: `git push` (Render tự build lại server), rồi `cd client && npm run build && firebase deploy --only hosting`.

**Lưu ý**: gói Render Free sẽ ngủ sau 15 phút không có request. Lần truy cập đầu
sẽ chậm ~30-60 giây để server thức dậy. Nếu cần luôn phản hồi nhanh, nâng lên gói
Starter (~$7/tháng). Firebase Hosting luôn miễn phí và không ngủ.

### Lưu ý về cache trên Render

- Cache chính là **RAM** (TTL 30 phút) — mất khi server khởi động lại / sleep.
- Có **snapshot đĩa** best-effort trong `server/.cache/` để thử khôi phục, nhưng
  filesystem của Render (đặc biệt gói Free) **không bền** giữa các deploy/sleep.
  Không được coi là nguồn dữ liệu đáng tin cậy lâu dài. Khi cache mất, server tự gọi
  lại JPL — ứng dụng vẫn hoạt động bình thường.

---

## 6. Kiểm tra API

### Health check

```bash
curl http://localhost:10000/health
# {"status":"ok","service":"solar-system-3d-api",...}
```

### Vị trí 8 hành tinh tại thời điểm hiện tại

```bash
curl "http://localhost:10000/api/positions"
```

### Vị trí tại một thời điểm cụ thể (ISO 8601)

```bash
curl "http://localhost:10000/api/positions?time=2026-10-20T12:00:00Z"
```

### Một hành tinh duy nhất

```bash
curl "http://localhost:10000/api/ephemeris/earth?time=2026-10-20T00:00:00Z"
```

### Metadata công khai

```bash
curl http://localhost:10000/api/config
```

### Ví dụ phản hồi (rút gọn)

```json
{
  "requestedTime": "2026-10-20T12:00:00.000Z",
  "fetchedAt": "2026-10-20T12:00:05.123Z",
  "source": "JPL_HORIZONS",
  "referenceFrame": "ECLIPTIC_J2000",
  "center": "SUN (500@10)",
  "units": { "position": "km", "velocity": "km/s" },
  "bodies": {
    "earth": {
      "body": "earth",
      "positionKm": { "x": ..., "y": ..., "z": ... },
      "velocityKmS": { "x": ..., "y": ..., "z": ... },
      "julianDate": 2461330.0
    }
  },
  "errors": {},
  "partial": false,
  "fromCache": false,
  "cacheAgeSeconds": 0
}
```

**Đơn vị đo**: vị trí tính bằng **km**, vận tốc **km/s**, tâm **Mặt Trời**, hệ tọa độ
**hoàng đạo J2000 (ECLIPTIC)**, thời gian **TDB** (gần UTC, sai khác vài giây).
Khi hiển thị, client chuyển km → AU (1 AU = 149,597,870.7 km).

---

## 7. Ghi chú khoa học và giới hạn

- **Tỷ lệ hiển thị**: kích thước hành tinh và khoảng cách trên mô hình 3D **đã được nén**
  để dễ quan sát (hàm căn bậc hai + offset). Đây là tỷ lệ trực quan, **không phải tỷ lệ vật lý**.
  Bảng thông tin hiển thị giá trị vật lý thực (km, AU).
- **Nguồn vị trí**:
  - **NASA/JPL Horizons** (proxy qua server): dữ liệu thực, chính xác cao. Đồng bộ định kỳ
    30 phút (có thể cấu hình), dữ liệu tham chiếu không cũ quá 1 giờ khi mạng ổn định.
  - **Mô hình Kepler (J2000)**: dự phòng offline / khi tua thời gian. Sai số góc thường < 1°
    trong vài thập kỷ quanh J2000. Không tính nhiễu do các hành tinh khác.
  - Khi tua thời gian xa khỏi mốc JPL đã lấy, hệ thống tự gọi lại API cho thời điểm mới
    (debounce 500ms), không giữ nguyên vector cũ và tuyên bố chính xác.
- **Loại tọa độ**: tọa độ hiển thị là **tọa độ hình học heliocentric** (tâm Mặt Trời, mặt phẳng
  hoàng đạo J2000), **không phải** tọa độ quan sát từ Trái Đất (right ascension/declination).
- **Quỹ đạo vẽ trên mô hình** là elip trung bình theo elements Kepler, dùng để minh họa đường đi;
  vị trí thực của hành tinh được tính riêng từ JPL/Kepler.
- **Dữ liệu cũ**: nếu dữ liệu JPL cũ hơn 1 giờ, ứng dụng hiển thị cảnh báo rõ ràng
  (thanh màu cam) và chuyển sang nhãn "xấp xỉ", không giả vờ dữ liệu vẫn mới.

---

## 8. Offline (mất Internet)

- Sau lần truy cập đầu, Service Worker cache toàn bộ frontend (JS/CSS/HTML, bao gồm cả
  Three.js được đóng gói vào bundle — **không phụ thuộc CDN**).
- Dữ liệu vị trí JPL gần nhất được cache trong **IndexedDB**.
- Khi mất mạng: ứng dụng vẫn mở, hiển thị trạng thái "Ngoại tuyến", dùng cache JPL mới nhất
  (kèm tuổi dữ liệu) hoặc mô hình Kepler nếu không có cache.
- Khi có mạng trở lại: tự động đồng bộ lại mà không gián đoạn mô phỏng.
- Dữ liệu thiên văn **không cache vô hạn**: mọi entry đều được kiểm tra tuổi; quá hạn sẽ
  hiển thị cảnh báo.

---

## 9. Giao diện điện thoại (bắt buộc ngang)

- Trên điện thoại (thiết bị cảm ứng, màn hình nhỏ), nếu đang ở chế độ dọc (portrait),
  ứng dụng hiển thị **màn hình yêu cầu xoay ngang** với biểu tượng động và hướng dẫn.
- Thử khóa landscape bằng **Screen Orientation API** (nếu trình duyệt cho phép). Nếu bị
  từ chối/không hỗ trợ, hiển thị hướng dẫn người dùng tự xoay — **không bao giờ tuyên bố
  khóa thành công giả**.
- Khi đã ngang: tự động ẩn màn hình yêu cầu, hiển thị mô phỏng. Khi quay lại dọc: lập tức
  hiện lại. Xử lý cả `orientationchange`, `resize`, `visibilitychange`.
- Các nút tối thiểu 44px (dễ chạm), tự giảm chất lượng render (pixelRatio, số đoạn hình
  cầu, số sao nền) trên mobile để tiết kiệm pin và RAM.

---

## 10. Xử lý lỗi phổ biến

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `Cannot find module` | Chạy `npm run install:all` tại thư mục gốc. |
| Mở trang chỉ thấy chữ "Frontend chưa được build" | Chạy `npm run build:client`. |
| CORS error khi gọi API | Kiểm tra `CORS_ORIGINS` trong `server/.env`; nếu deploy riêng, đặt origin của frontend. |
| Dữ liệu luôn hiển thị "Kepler (xấp xỉ)" | Server không gọi được JPL. Kiểm tra kết nối mạng của server, xem log server (timeout/rate-limit). |
| Render build fail | Đảm bảo `npm run install:all && npm run build:client` chạy thành công local. |
| Trên điện thoại kẹt ở màn hình xoay | Xoay thật sang ngang; nếu vẫn kẹt, bật tự động xoay màn hình của hệ điều hành. |
| Service Worker không hoạt động | Yêu cầu HTTPS hoặc localhost. Mở bằng `http://localhost` hoặc domain HTTPS. |

---

## 11. Thư viện bên thứ ba & giấy phép

- **three.js** (MIT) — dựng không gian 3D.
- **vite** (MIT) — build & dev server frontend.
- **express** (MIT) — backend HTTP server.
- **cors** (MIT), **dotenv** (BSD-2), **express-rate-limit** (MIT).
- Dữ liệu thiên văn: **NASA/JPL Horizons** (miễn phí, công khai, không cần API key).
- Elements Kepler: **JPL Solar System Dynamics** (ssd.jpl.nasa.gov).

---

## 12. Kiểm thử đã thực hiện trước khi bàn giao

Xem mục "Kiểm thử" trong thông báo bàn giao kèm file ZIP.

---

Giấy phép: MIT. Dữ liệu thiên văn thuộc về NASA/JPL (công khai).
