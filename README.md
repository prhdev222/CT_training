# CT Brain NC Teaching Studio

แอปสอนอ่าน CT สมองแบบอินเทอร์แอคทีฟ — โหมดคลาวด์ใช้ **Turso** (ข้อความ/เมตาดาตาเคส) + **Cloudflare R2** (ไฟล์รูป) และ API แบบ **Node.js (Hono)**

---

## โครงสร้างที่ต้องเข้าใจก่อน deploy

| ส่วน | คืออะไร | Deploy ที่ไหนได้บ้าง |
|------|---------|----------------------|
| **Frontend** | โปรเจกต์ Vite/React → โฟลเดอร์ `dist/` | **Cloudflare Pages** (แนะนำ), Netlify, ฯลฯ |
| **API (`server/`)** | Node.js + Hono + `@hono/node-server` | **ไม่ใช่** static — ต้องรันบนเซิร์ฟเวอร์ที่รองรับ Node เช่น **Railway, Render, Fly.io, VPS** หรือเครื่องของคุณที่มี public URL |
| **Turso** | ฐานข้อมูล LibSQL | บริการของ Turso (คลาวด์) |
| **R2** | ที่เก็บไฟล์รูปแบบ S3 | บริการของ Cloudflare |

> **สำคัญ:** โฟลเดอร์ `server/` ใน repo นี้ **ออกแบบให้รันด้วย Node** ไม่ได้ถูกแปลงเป็น Cloudflare Workers/Pages Functions ให้แล้ว ดังนั้น **Cloudflare Pages ใช้เฉพาะโหลดหน้าเว็บ** ส่วน API ต้องมี URL แยก แล้วตั้ง `VITE_API_URL` ชี้ไปที่นั่น

---

## ตัวแปร env ใส่ที่ไหน (สรุป)

| ที่ใส่ | ตัวแปร | หมายเหตุ |
|--------|--------|----------|
| **Cloudflare Pages** (โปรเจกต์ Pages → **Settings** → **Environment variables**) | `VITE_USE_CLOUD` = `true` | เปิดโหมดเรียก API |
| เดียวกัน | `VITE_API_URL` = `https://โดเมน-api-ของคุณ` | **ไม่มี** `/` ท้าย — ชี้ไปที่เซิร์ฟเวอร์ที่รัน `npm run server` |
| **โฮสต์ API (Node)** เช่น Railway / Render / Fly.io / VPS — ส่วน **Variables** / **Secrets** ของบริการนั้น **หรือ** ไฟล์ `.env` บนเครื่องที่รัน API | `PORT`, `TURSO_*`, `R2_*`, `ADMIN_WEB_PASSWORD`, `ADMIN_API_KEY`, `CORS_ORIGIN` | ทุกตัวใน `.env.example` ที่**ไม่**ขึ้นต้น `VITE_` เป็นของ **API เท่านั้น** — **ห้าม** ใส่ใน Pages (เดี๋ยวรั่วใน bundle หรือใช้ไม่ได้) |

**ตั้งค่า env บน Cloudflare Pages (หน้าเว็บ):**

1. เข้า [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → เลือกโปรเจกต์ **Pages** ของคุณ  
2. แท็บ **Settings** → เลื่อนไป **Environment variables**  
3. **Add variable** — เลือก **Production** (และถ้าต้องการ **Preview** แยก)  
4. ใส่ชื่อ `VITE_USE_CLOUD` ค่า `true` แล้วบันทึก  
5. ใส่ `VITE_API_URL` ค่า URL จริงของ API  
6. ไปที่ **Deployments** → **Retry deployment** / **Create deployment** ใหม่ เพราะตัวแปร `VITE_*` ถูกอ่านตอน **build** เท่านั้น

**API env ใส่ที่ไหน:** ที่แดชบอร์ดของผู้ให้บริการที่คุณ deploy `server/index.mjs` (ไม่ใช่ Cloudflare Pages) — สร้างตัวแปรชื่อเดียวกับในตารางหัวข้อ **3)** ด้านล่าง แล้ว redeploy / restart service

---

## ภาพรวมขั้นตอน (ลำดับแนะนำ)

1. สร้าง **Turso database** + เก็บ `TURSO_DATABASE_URL` และ `TURSO_AUTH_TOKEN`
2. สร้าง **R2 bucket** + API Token + เปิด URL สาธารณะ → เก็บ `R2_*` และ `R2_PUBLIC_BASE_URL`
3. Deploy **API (Node)** ไปที่โฮสต์ใดก็ได้ที่รัน Node ได้ → ได้ URL เช่น `https://api.example.com`
4. ตั้งค่า **CORS** บน API ให้รวมโดเมนหน้าเว็บ (Pages)
5. Push โค้ดขึ้น **GitHub** และเชื่อม **Cloudflare Pages** — build หน้าเว็บ + ตั้งตัวแปร `VITE_*`
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

## 4) Deploy API (Node) — เลือกอย่างใดอย่างหนึ่ง

แนวทางทั่วไป (ไม่ผูกกับผู้ให้บริการรายใดรายหนึ่ง):

1. สร้างบริการ **Web Service** ที่รัน **Node 18+**
2. **Root directory** = root ของ repo นี้
3. **Build command** (ถ้าแพลตฟอร์มต้องการ): `npm install` หรือเว้นว่าง
4. **Start command**: `npm run server` หรือ `node -r dotenv/config server/index.mjs`
5. ใส่ตัวแปร environment ทั้งหมดในตารางด้านบน
6. เปิด **HTTPS** และคัดลอก URL สาธารณะ → ใช้เป็นฐานของ `VITE_API_URL`

ตรวจว่าแพลตฟอร์มอนุญาต **อัปโหลดไฟล์ขนาดใหญ่** (multipart) ตามที่แอปใช้

---

## 5) GitHub

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

## 6) Cloudflare Pages (Frontend เท่านั้น)

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

## 7) เชื่อมวงจรให้ครบ

1. **API** รันอยู่ + `GET /api/health` ผ่าน  
2. **CORS:** บน API ตั้ง `CORS_ORIGIN` ให้ตรงกับ URL Pages เช่น `https://<project>.pages.dev`  
3. **Pages** build สำเร็จ + ตั้ง `VITE_USE_CLOUD=true` และ `VITE_API_URL=https://...`  
4. เปิดหน้าเว็บ Pages → ล็อกอินแอดมินด้วย `ADMIN_WEB_PASSWORD` → สร้างเคส + อัปโหลดรูป → ตรวจว่ารูปโหลดจาก `R2_PUBLIC_BASE_URL` และรายการเคสมาจาก Turso

---

## 8) การพัฒนาในเครื่อง (อ้างอิง)

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

## 9) ข้อจำกัดและทางเลือกในอนาคต

- **ไม่มี Workers เวอร์ชันใน repo:** ถ้าต้องการให้ API อยู่บน Cloudflare ทั้งหมด ต้องพอร์ต `server/` ไป **Cloudflare Workers + R2 binding + D1/Turso HTTP** — งานแยกจากการ deploy แบบในเอกสารนี้
- **ขีดจำกัดขนาดข้อความ/รูป:** ดู `server/limits.mjs` และ endpoint `GET /api/limits`

### 9.1 ไม่มีโฮสต์ API แยก — เอาไว้ Cloudflare ที่เดียวได้ไหม (แบบฟรี)?

**ได้ในเชิงสถาปัตยกรรม** โดยใช้บัญชี Cloudflare ชุดเดียวกับ Pages แต่ **ไม่ใช่การเอา `server/index.mjs` ไปรันบน Pages** เพราะ Pages ไม่รัน Node แบบนั้น

แนวทางที่นิยม (โควต้าฟรีมีจำกัด — ดูเอกสาร Cloudflare ล่าสุด):

| ชั้น | บน Cloudflare | หมายเหตุ |
|------|----------------|----------|
| หน้าเว็บ | **Pages** | static จาก `dist/` เหมือนเดิม |
| API | **Workers** หรือ **Pages Functions** | รันโค้ดแบบ V8 isolate ไม่ใช่ Node เต็มรูปแบบ |
| รูป | **R2** + **binding** ใน Worker | ไม่จำเป็นต้องใช้ S3 access key ใน Worker ถ้าผูก bucket ผ่าน `wrangler` |
| ข้อมูลเคส | **D1** (SQLite บน Cloudflare) *หรือ* ยังใช้ **Turso** ผ่าน HTTP จาก Worker | Turso ยังเป็น “นอก Cloudflare” แต่มีแพ็กเกจฟรีของตัวเอง; ถ้าต้องการ “เก็บข้อมูลบน CF” จริงๆ ใช้ **D1** |

**สิ่งที่ต้องทำในโปรเจกต์นี้:** เขียน API ใหม่ (หรือพอร์ต) ให้เป็น **Hono บน Workers** (หรือ fetch handler) + อัปโหลดรูปด้วย **R2 binding** + คำสั่ง SQL ไปที่ **D1** หรือ client ไป **Turso** — แล้วตั้ง `VITE_API_URL` ชี้ไปที่โดเมน Worker (เช่น `https://ct-api.<user>.workers.dev`) หรือใช้ route ย่อยของโดเมนเดียวกับ Pages

**ข้อจำกัดแบบฟรีโดยทั่วไป:** จำนวนคำขอ Worker ต่อวัน, เวลา CPU ต่อคำขอ, ขนาด body อัปโหลด — โปรเจกต์สอน/ทดลองมักพอ แต่โหลดหนักต้องดูแผนจ่ายเงิน

> Repo นี้ยังไม่มีโฟลเดอร์ `workers/` หรือ `functions/` สำหรับ API — ถ้าต้องการให้ช่วยสเกลโฟลด Workers + D1 + R2 ให้สอดคล้อง endpoint เดิม (`/api/cases` ฯลฯ) แจ้งได้ในประเด็น implement แยก

---

## สรุปสั้นๆ

| สิ่งที่ deploy | ที่ไหน |
|----------------|--------|
| หน้าเว็บ (React) | **Cloudflare Pages** (`npm run build` → `dist`) |
| API (แบบใน repo ปัจจุบัน) | **Node host แยก** + env ตาม `.env.example` |
| API (ถ้าพอร์ตแล้ว) | **Workers / Pages Functions** + R2 binding (+ D1 หรือ Turso) — **ไม่ต้องโฮสต์ Node แยก** |
| ฐานข้อมูล | **Turso** (แบบปัจจุบัน) หรือ **D1** (ถ้าย้ายมา Cloudflare ทั้งก้อน) |
| ไฟล์รูป | **Cloudflare R2** + URL สาธารณะ |
