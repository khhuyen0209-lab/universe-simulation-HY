# Triển khai nhanh (đã cấu hình sẵn)

Backend: Render (https://universe-simulation-hy.onrender.com) — đã đặt sẵn trong config.
Client: Firebase Hosting (project: hy-solar-3d) — đã đặt sẵn trong .firebaserc.

## Bước 1 — Deploy backend lên Render
1. Đẩy toàn bộ thư mục này lên GitHub (không cần node_modules, đã có .gitignore).
2. Render Dashboard → **New → Web Service** → chọn repo.
   - Render sẽ tự đọc `render.yaml` (rootDir=server, build=`npm install`, start=`npm start`).
   - Hoặc tạo thủ công: Root Directory = `server`, Build Command = `npm install`, Start Command = `npm start`, Health Check = `/health`.
3. Environment đã cấu hình sẵn trong `render.yaml` (CORS cho phép Firebase hy-solar-3d).
4. Deploy xong, backend chạy tại URL đã cấu hình.

## Bước 2 — Deploy client lên Firebase Hosting
Client **đã build sẵn** trong `client/dist/` (đã trỏ về backend Render). Không cần cài Node/npm hay build lại.

```bash
npm install -g firebase-tools
firebase login
cd client
firebase deploy --only hosting
```

Kết quả: `https://hy-solar-3d.web.app` và `https://hy-solar-3d.firebaseapp.com`.

## Khi sửa mã
- Sửa backend → `git push` → Render tự build lại.
- Sửa frontend → nếu chỉ sửa `client/public/config.js` hoặc file trong `public/`, copy vào `client/dist/` rồi `firebase deploy`. Nếu sửa mã trong `client/src/`, cần build lại (`cd client && npm install && npm run build`) rồi deploy.
