# CT Brain NC Teaching Studio

แอปสอนอ่าน CT สมองแบบอินเทอร์แอคทีฟ — โหมดคลาวด์ใช้ **Turso** (ข้อความ/เมตาดาตาเคส) + **Cloudflare R2** (ไฟล์รูป) และ API แบบ **Hono** (รันได้ทั้ง **Node** กับ **Cloudflare Worker**)

---

## โครงสร้างที่ต้องเข้าใจก่อน deploy

| ส่วน | คืออะไร | Deploy ที่ไหนได้บ้าง |
|------|---------|----------------------|
| **Frontend** | โปรเจกต์ Vite/React → โฟลเดอร์ `dist/` | รวมกับ Worker (`wrangler deploy`) หรือ **Cloudflare Pages** / Netlify ฯลฯ |
| **API** | Hono — โค้ดเส้นทางร่วมใน `server/hono-routes.mjs` | **Worker** (`worker/index.js` + `wrangler.toml`) หรือ **Node** (`server/index.mjs`) |
| **Turso** | ฐานข้อมูล LibSQL | บริการของ Turso (คลาวด์) |
| **R2** | ที่เก็บไฟล์รูป | บริการของ Cloudflare — Node ใช้ S3 API; Worker ใช้ **R2 binding** (ไม่ต้องใส่ access key ใน Worker) |

> **Full-stack บน Cloudflare:** รัน `npm run deploy:cf` หลังตั้ง `wrangler.toml` + secrets — Worker จะเสิร์ฟทั้งไฟล์จาก `dist/` และ `/api/*` บนโดเมนเดียวกัน (ไม่ต้องตั้ง `VITE_API_URL` ตอน build)

---

## ตัวแปร env ใส่ที่ไหน (สรุป)

| ที่ใส่ | ตัวแปร | หมายเหตุ |
|--------|--------|----------|
| **ตอน build หน้าเว็บ** (Pages หรือ CI ก่อน `wrangler deploy`) | `VITE_USE_CLOUD` = `true` | เปิดโหมดเรียก API |
| เดียวกัน | `VITE_API_URL` | **ว่าง** = เรียก `/api` บนโดเมนเดียวกับหน้าเว็บ (แนะนำเมื่อ deploy Worker+assets); หรือใส่ URL API แยก (Node) **ไม่มี** `/` ท้าย |
| **โฮสต์ API (Node)** เช่น Railway / Render / Fly.io / VPS — ส่วน **Variables** / **Secrets** ของบริการนั้น **หรือ** ไฟล์ `.env` บนเครื่องที่รัน API | `PORT`, `TURSO_*`, `R2_*`, `ADMIN_WEB_PASSWORD`, `ADMIN_API_KEY`, `CORS_ORIGIN` | ทุกตัวใน `.env.example` ที่**ไม่**ขึ้นต้น `VITE_` เป็นของ **API เท่านั้น** — **ห้าม** ใส่ใน Pages (เดี๋ยวรั่วใน bundle หรือใช้ไม่ได้) |

**ตั้งค่า env บน Cloudflare Pages (หน้าเว็บ):**

1. เข้า [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → เลือกโปรเจกต์ **Pages** ของคุณ  
2. แท็บ **Settings** → เลื่อนไป **Environment variables**  
3. **Add variable** — เลือก **Production** (และถ้าต้องการ **Preview** แยก)  
4. ใส่ชื่อ `VITE_USE_CLOUD` ค่า `true` แล้วบันทึก  
5. ถ้า API แยกจาก Pages ให้ใส่ `VITE_API_URL` เป็น URL จริงของ API; ถ้าใช้ Worker full-stack ให้เว้น `VITE_API_URL` ว่าง  
6. ไปที่ **Deployments** → **Retry deployment** / **Create deployment** ใหม่ เพราะตัวแปร `VITE_*` ถูกอ่านตอน **build** เท่านั้น

**API env ใส่ที่ไหน:** ที่แดชบอร์ดของผู้ให้บริการที่คุณ deploy `server/index.mjs` (ไม่ใช่ Cloudflare Pages) — สร้างตัวแปรชื่อเดียวกับในตารางหัวข้อ **3)** ด้านล่าง แล้ว redeploy / restart service

---

## ภาพรวมขั้นตอน (ลำดับแนะนำ)

1. สร้าง **Turso database** + เก็บ `TURSO_DATABASE_URL` และ `TURSO_AUTH_TOKEN`
2. สร้าง **R2 bucket** + API Token + เปิด URL สาธารณะ → เก็บ `R2_*` และ `R2_PUBLIC_BASE_URL`
3. Deploy API — เลือก **Worker** (`npm run deploy:cf`) หรือ **Node** บนโฮสต์อื่น → ได้ URL ฐานของแอปหรือ `https://api.example.com`
4. ถ้าโดเมนหน้าเว็บกับ API คนละ origin ให้ตั้ง **CORS** (`CORS_ORIGIN`) บน API
5. Push โค้ดขึ้น **GitHub** และ deploy ตามแพลตฟอร์ม — build หน้าเว็บ + ตั้งตัวแปร `VITE_*` ให้ตรงกับ URL จริง
6. ทดสอบล็อกอินแอดมิน / สร้างเคส / อัปโหลดรูป

---

## 1) Turso

1. ไปที่ [Turso](https://turso.tech/) สมัครและติดตั้ง CLI (ถ้าต้องการใช้คำสั่งบนเครื่อง)
2. สร้าง database ใหม่ (ผ่านแดชบอร์ดหรือ CLI)
3. คัดลอกค่า:
   - **Database URL** รูปแบบ `libsql://....turso.io`
   - **Auth token** (สิทธิ์เข้าถึง DB)
4. ใส่ใน environment ของเซิร์ฟเวอร์ที่รัน API:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
5. ตาราง `cases` จะถูกสร้างอัตโนมัติเมื่อ API สตาร์ทครั้งแรก (ฟังก์ชัน `migrate()` ใน `server/db.mjs`)

---

## 2) Cloudflare R2

### 2.1 สร้างบัคเก็ต

1. เข้า Cloudflare Dashboard → **R2** → **Create bucket**
2. ตั้งชื่อบัคเก็ต → บันทึกชื่อไว้ใช้เป็น `R2_BUCKET_NAME`

### 2.2 API Token (S3-compatible) สำหรับ API

1. R2 → **Manage R2 API Tokens** → สร้าง token ที่มีสิทธิ์อ่าน/เขียนบัคเก็ตนี้
2. เก็บค่า:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
3. **Account ID** (แดชบอร์ด Cloudflare ด้านขวา) → `R2_ACCOUNT_ID`

โค้ด API ใช้ endpoint แบบ:

`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`

### 2.3 URL สาธารณะให้เบราว์เซอร์โหลดรูป

รูปเคสถูกแสดงในเว็บด้วย URL แบบ `R2_PUBLIC_BASE_URL/...` ดังนั้นต้องเปิดการเข้าถึงแบบ public อย่างใดอย่างหนึ่ง:

- **R2.dev subdomain** (ในการตั้งค่าบัคเก็ต / public access — ตามเอกสาร Cloudflare ณ เวลาที่ตั้งค่า)  
  หรือ  
- **Custom domain** ชี้มาที่ R2

คัดลอก URL ฐานที่ไม่มี `/` ท้าย เช่น `https://pub-xxxx.r2.dev` → ตั้งเป็น `R2_PUBLIC_BASE_URL`

> ถ้าไม่เปิด public read รูปในเคสจะโหลดในเว็บไม่ได้ แม้ API จะอัปโหลดสำเร็จ

---

## 3) ตัวแปรสภาพแวดล้อมของ API (เซิร์ฟเวอร์ Node)

คัดลอกจาก `.env.example` แล้วกรอกค่าจริง (บนโฮสต์ API ไม่ใช่แค่เครื่อง local):

| ตัวแปร | คำอธิบาย |
|--------|-----------|
| `PORT` | พอร์ตที่ API ฟัง (ค่าเริ่มต้นในโค้ด `8787`) |
| `TURSO_DATABASE_URL` | URL ของ Turso |
| `TURSO_AUTH_TOKEN` | Token Turso |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 S3 access key |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret |
| `R2_BUCKET_NAME` | ชื่อบัคเก็ต |
| `R2_PUBLIC_BASE_URL` | URL สาธารณะของบัคเก็ต (ไม่มี `/` ท้าย) |
| `ADMIN_WEB_PASSWORD` | รหัสผ่านล็อกอินแอดมินบนหน้าเว็บ |
| `ADMIN_API_KEY` | คีย์ลับยาวๆ ที่ API คืนให้หลังล็อกอินสำเร็จ — **ห้ามใช้ค่าเริ่มต้นใน production** |
| `CORS_ORIGIN` | โดเมนหน้าเว็บจริง คั่นหลายค่าด้วย `,` เช่น `https://xxx.pages.dev,https://yourdomain.com` |
| `MAX_CASES` | (ไม่บังคับ) จำนวนเคสสูงสุด — แต่ละเคสมีรูป **1** ไฟล์ใน R2; เว้นว่าง = ไม่จำกัด |

รัน API ในโฟลเดอร์โปรเจกต์:

```bash
npm install
npm run server
```

(สคริปต์ใช้ `node -r dotenv/config server/index.mjs` — วางไฟล์ `.env` ที่ root โปรเจกต์ หรือตั้งค่าบนแพลตฟอร์มโฮสต์)

ทดสอบ:

- `GET https://<API_HOST>/api/health` → ควรได้ `{ "ok": true }`

---

## 4) Deploy บน Cloudflare — Worker + static (`dist`) ชุดเดียว

โฟลเดอร์ `worker/` + `wrangler.toml` รวม **เส้นทาง `/api/*`** (เดียวกับ Node) กับ **ไฟล์จาก `dist/`** (SPA fallback ไป `index.html`)

### 4.1 เตรียม R2

1. สร้าง bucket ชื่อเดียวกับใน `wrangler.toml` → คีย์ `[[r2_buckets]]` → `bucket_name` (ค่าเริ่มต้นใน repo คือ `ct-training-cases` — แก้ให้ตรงชื่อจริงของคุณ)
2. เปิด URL สาธารณะของบัคเก็ต → ใช้เป็น `R2_PUBLIC_BASE_URL` (vars ของ Worker)

### 4.2 ติดตั้ง CLI และ build

```bash
npm install
npm run build
```

### 4.3 ตัวแปรและความลับของ Worker

| ชนิด | ชื่อ | หมายเหตุ |
|------|------|----------|
| Secret | `TURSO_DATABASE_URL` | `libsql://...` |
| Secret | `TURSO_AUTH_TOKEN` | token Turso |
| Secret | `ADMIN_API_KEY` | คีย์ยาวสุ่ม — ใช้ยืนยันตอนแก้ไขเคส |
| Var (ใน `wrangler.toml` หรือแดชบอร์ด) | `R2_PUBLIC_BASE_URL` | URL สาธารณะ R2 **ไม่มี** `/` ท้าย |
| Var (ไม่บังคับ) | `MAX_CASES`, `CORS_ORIGIN`, `ADMIN_WEB_PASSWORD` | เหมือน `.env.example` |

ใส่ secret จากเครื่อง (หลัง `npx wrangler login`):

```bash
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put ADMIN_API_KEY
```

### 4.4 Deploy

```bash
npm run deploy:cf
```

ได้ URL แบบ `https://ct-training.<subdomain>.workers.dev` — ตั้ง custom domain ได้ในแดชบอร์ด Workers

### 4.5 Build หน้าเว็บให้ชี้ API บนโดเมนเดียวกัน

ก่อน `npm run build` ที่ใช้คู่กับ Worker ให้ตั้งในไฟล์ `.env` บนเครื่องที่ build (หรือ export ก่อนรันคำสั่ง):

- `VITE_USE_CLOUD=true`
- **ไม่ตั้ง** `VITE_API_URL` (หรือเว้นว่าง) → คำขอไปที่ `/api/...` บนโดเมนเดียวกับ Worker

ทดสอบในเครื่องหลัง build:

```bash
npm run preview:cf
```

> Deploy ขึ้น Cloudflare ทำได้เองจากเครื่อง: ตั้งค่า `wrangler`/secret ตามหัวข้อ 4.3 แล้วรัน `npm run deploy:cf` (ไม่จำเป็นต้องใช้ GitHub Actions)

---

## 5) Deploy API (Node) — โฮสต์แยก (Railway / Render / VPS ฯลฯ)

แนวทางทั่วไป (ไม่ผูกกับผู้ให้บริการรายใดรายหนึ่ง):

1. สร้างบริการ **Web Service** ที่รัน **Node 18+**
2. **Root directory** = root ของ repo นี้
3. **Build command** (ถ้าแพลตฟอร์มต้องการ): `npm install` หรือเว้นว่าง
4. **Start command**: `npm run server` หรือ `node -r dotenv/config server/index.mjs`
5. ใส่ตัวแปร environment ทั้งหมดในตารางด้านบน
6. เปิด **HTTPS** และคัดลอก URL สาธารณะ → ใช้เป็นฐานของ `VITE_API_URL`

ตรวจว่าแพลตฟอร์มอนุญาต **อัปโหลดไฟล์ขนาดใหญ่** (multipart) ตามที่แอปใช้

---

## 6) GitHub

1. สร้าง repository ใหม่บน GitHub (public/private ตามต้องการ)
2. บนเครื่อง local:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<USER>/<REPO>.git
git branch -M main
git push -u origin main
```

อย่า commit ไฟล์ `.env` ที่มีความลับ — โปรเจกต์นี้มี `.gitignore` สำหรับ `.env` อยู่แล้ว

---

## 7) Cloudflare Pages (เฉพาะหน้าเว็บ — เมื่อ API รันแยกเป็น Node)

### 6.1 เชื่อมกับ GitHub

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. เลือก repo `CT_trainer` (หรือชื่อที่คุณตั้ง)
3. ตั้งค่า build:

| รายการ | ค่า |
|--------|-----|
| **Framework preset** | None หรือ Vite (ถ้ามี) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (root ของ repo) |

### 6.2 ตัวแปร Environment (Production) บน Pages

ตั้งใน **Settings → Environment variables** ของโปรเจกต์ Pages:

| ชื่อ | ตัวอย่างค่า |
|------|-------------|
| `VITE_USE_CLOUD` | `true` |
| `VITE_API_URL` | `https://your-api.example.com` **ไม่มี** `/` ท้าย — ชี้ไปที่โฮสต์ API Node ของคุณ |

> ตัวแปรที่ขึ้นต้นด้วย `VITE_` ถูกแทรกตอน **build** หากเปลี่ยนค่า ต้อง **Rebuild** deployment

### 6.3 SPA / client-side routing

โฟลเดอร์ `public/_redirects` มีกฎสำหรับ Cloudflare Pages ให้เส้นทางทั้งหมด fallback ไป `index.html` (เหมาะกับ SPA)

### 6.4 รูปใน `public/teaching-images`

ไฟล์ใน `public/` จะถูก copy ไป `dist/` เมื่อ build — รูปสอนแบบ static ยังใช้ได้บน Pages โดยไม่ผ่าน R2

หากอัปเดต manifest:

```bash
npm run teaching:scan
```

แล้ว commit ไฟล์ที่เปลี่ยนก่อน deploy

---

## 8) เชื่อมวงจรให้ครบ

1. **API** รันอยู่ + `GET /api/health` ผ่าน  
2. **CORS:** ถ้าโดเมนหน้าเว็บ ≠ API ให้ตั้ง `CORS_ORIGIN` บน API ให้ตรงกับ URL หน้าเว็บ  
3. **Build หน้าเว็บ:** `VITE_USE_CLOUD=true` และ `VITE_API_URL` ชี้ API แยก **หรือ** เว้นว่างเมื่อใช้ Worker บนโดเมนเดียวกัน  
4. เปิดหน้าเว็บ → ล็อกอินแอดมินด้วย `ADMIN_WEB_PASSWORD` → สร้างเคส + อัปโหลดรูป → ตรวจว่ารูปโหลดจาก `R2_PUBLIC_BASE_URL` และรายการเคสมาจาก Turso

---

## 9) การพัฒนาในเครื่อง (อ้างอิง)

```bash
npm install
cp .env.example .env
# แก้ .env ให้ครบสำหรับ Turso + R2 + ADMIN_*

# รัน API + Vite พร้อมกัน (proxy /api → พอร์ต API)
npm run dev:full
```

- หน้าเว็บมักอยู่ที่ `http://localhost:5173` (หรือพอร์ตที่ Vite แจ้ง)  
- ใน dev ไม่จำเป็นต้องตั้ง `VITE_API_URL` ถ้าใช้ proxy ใน `vite.config.js` (`/api` → `127.0.0.1:8787`)

---

## 10) ข้อจำกัดและทางเลือกในอนาคต

- **Worker vs Node:** Worker ใช้ Turso ผ่าน `@libsql/client/web` และ R2 ผ่าน binding — ไม่ต้องใส่ `R2_ACCESS_KEY_*` ใน Worker
- **ขีดจำกัดขนาดข้อความ/รูป:** ดู `server/limits.mjs` และ endpoint `GET /api/limits`
- **D1:** ถ้าต้องการย้ายจาก Turso ไป **D1** ต้องแก้เลเยอร์ `server/cases-db.mjs` ให้ใช้ D1 API — ยังไม่ได้ทำใน repo นี้

### 10.1 โควต้าและข้อจำกัด Worker (แบบฟรีมีเพดาน)

จำนวนคำขอต่อวัน, เวลา CPU ต่อคำขอ, ขนาด body อัปโหลด — ดู [เอกสาร Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/) ฉบับล่าสุด

---

## สรุปสั้นๆ

| สิ่งที่ deploy | ที่ไหน |
|----------------|--------|
| หน้าเว็บ + API ชุดเดียว (แนะนำบน CF) | **`npm run deploy:cf`** → Worker + static จาก `dist/` (`wrangler.toml`) |
| หน้าเว็บอย่างเดียว | **Cloudflare Pages** / โฮสต์ static อื่น (`npm run build` → `dist`) |
| API แบบ Node | **`npm run server`** บน Railway / Render / VPS + env ตาม `.env.example` |
| ฐานข้อมูล | **Turso** |
| ไฟล์รูป | **Cloudflare R2** + URL สาธารณะ |
