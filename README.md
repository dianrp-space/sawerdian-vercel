# <img src="images/drp-coffe.webp" width="80" height="80" align="top"> Sawerdian

Website sawer (tipping) mirip Saweria/Trakteer, khusus pembayaran via **QRIS**.
Dibangun dengan Node.js + Express + PostgreSQL + daisyUI (Tailwind CSS).
QRIS payment diproses otomatis oleh **payment.dianrp.com**.

## ✨ Fitur

- 🎯 **Halaman sawer** dengan preset nominal + custom amount
- 💬 **Pesan/dukungan** opsional yang disimpan ke database
- 🏆 **Leaderboard publik** dengan mask nama untuk privasi
- 🎨 **Dashboard admin** untuk kelola branding, identitas, webhooks, social links
- 🔔 **Webhook notifikasi** ke Discord / Telegram / Custom JSON
- 💳 **Auto-confirm via payment.dianrp.com** — polling cek status PAID/EXPIRED
- 📊 **Statistik lengkap**: total, harian, mingguan, top 5 sawer
- 📥 **Export CSV** untuk rekap donasi
- 🌓 **Dark mode** (daisyUI theme)
- 📱 **Responsive** untuk mobile & desktop

## 🚀 Quick Start

### 1. Clone & Install

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://sawerdian:your_password@localhost:5432/sawerdian
ADMIN_PASSWORD=ganti_password_admin
SESSION_SECRET=ganti_dengan_string_random_panjang
PAYMENT_API_KEY=drp_live_xxxx
WEBHOOK_SECRET=ganti_string_random
```

### 2. Migrate Database
```bash
npm run migrate
```

### 3. Jalankan Server
```bash
npm start
```

Akses:
- 🌐 Halaman sawer: http://localhost:3003
- 💳 Halaman bayar: http://localhost:3003/pay
- 🏆 Leaderboard: http://localhost:3003/leaderboard
- 🔐 Admin: http://localhost:3003/admin (default: `admin` / `admin123`)
- 📖 API Docs: http://localhost:3003/api-documentation

## 📁 Struktur Project

```
.
├── api/
│   └── index.js          # Vercel serverless entry point
├── assets/
│   ├── css/style.css     # Neo Brutalism theme
│   └── js/
│       ├── sawer.js      # Logic halaman sawer
│       ├── pay.js        # Logic halaman bayar
│       ├── leaderboard.js# Logic leaderboard
│       └── admin.js      # Logic dashboard admin
├── images/               # Asset statis (logo, banner)
├── backend/
│   ├── index.js          # Main server (local dev)
│   ├── db.js             # PostgreSQL connection
│   ├── auth.js           # Session admin
│   ├── sawer-routes.js   # API publik
│   ├── admin-routes.js   # API admin
│   ├── payment.js        # payment.dianrp.com client
│   ├── s3.js             # S3-compatible storage client
│   ├── webhook.js        # Webhook dispatcher
│   ├── migrate.js        # Schema migration
│   └── .env.example
├── vercel.json           # Vercel deployment config
└── package.json          # Root package.json
```

## 🔌 API Endpoints

Lihat dokumentasi lengkap di [api-documentation.html](api-documentation.html) atau akses `/api-documentation` saat server berjalan.

### Ringkasan

| Method | Path | Auth | Keterangan |
|--------|------|------|------------|
| GET | `/api/health` | — | Status server |
| GET | `/api/config` | — | Konfigurasi publik |
| POST | `/api/donations` | — | Buat donasi + QRIS via payment API |
| GET | `/api/donations/:token` | — | Cek status donasi + auto-confirm |
| POST | `/api/donations/:token/paid` | WEBHOOK_SECRET | Konfirmasi donasi by token (legacy) |
| GET | `/api/leaderboard` | — | Top sawer |
| GET | `/api/leaderboard/stats` | — | Statistik sawer |
| POST | `/api/admin/login` | — | Login admin |
| POST | `/api/admin/logout` | Session | Logout |
| GET | `/api/admin/me` | Session | Info session |
| GET | `/api/admin/dashboard` | Session | Statistik dashboard |
| GET/PUT | `/api/admin/settings` | Session | Kelola settings |
| POST | `/api/admin/branding/logo` | Session | Upload logo |
| POST | `/api/admin/branding/banner` | Session | Upload banner |
| DELETE | `/api/admin/branding/:type` | Session | Reset branding |
| GET/POST/PUT/DELETE | `/api/admin/webhooks` | Session | CRUD webhook |
| POST | `/api/admin/webhooks/:id/test` | Session | Test webhook |
| GET | `/api/admin/webhook-logs` | Session | Log webhook |
| GET/POST/PUT/DELETE | `/api/admin/socials` | Session | CRUD social links |
| GET | `/api/admin/donations` | Session | List donasi |
| GET | `/api/admin/donations/:id` | Session | Detail donasi |
| PATCH | `/api/admin/donations/:id/status` | Session | Update status donasi |
| DELETE | `/api/admin/donations/:id` | Session | Hapus donasi |
| GET | `/api/admin/donations/export.csv` | Session | Export CSV |

## 💳 Payment Flow

1. User pilih nominal di halaman sawer
2. Backend panggil `payment.dianrp.com/v2/qris` → dapat QRIS + transactionId
3. User scan QRIS dan bayar via e-wallet / mobile banking
4. Frontend polling `GET /api/donations/:token` setiap 3 detik
5. Backend auto-cek status ke `payment.dianrp.com/v2/payment-status`
6. Jika **PAID** → mark paid, trigger webhook notifikasi
7. Jika **EXPIRED** → mark expired

## 🚀 Deployment (Vercel)

### Prasyarat
- Repo dihubungkan ke Vercel
- Database PostgreSQL (bisa di VPS seperti sekarang)
- S3-compatible storage untuk file upload (MinIO di s3.dianrp.com)
- API key payment.dianrp.com

### Env Vars di Vercel Dashboard

```
DATABASE_URL=postgresql://user:pass@host:5432/db
PAYMENT_API_KEY=drp_live_xxxx
PAYMENT_API_BASE=https://payment.dianrp.com
S3_ENDPOINT=https://s3.dianrp.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=public-bucket
S3_PATH_PREFIX=app_url
SESSION_SECRET=...
ADMIN_PASSWORD=...
WEBHOOK_SECRET=...
BASE_URL=https://sawer.vercel.app
```

### Catatan
- File statis (HTML, CSS, JS, images) di-serve langsung oleh Vercel CDN.
- Semua endpoint `/api/*` di-handle oleh serverless function di `api/index.js`.
- Jalan `npm run migrate` sekali untuk update schema database.

## 🚀 Deployment (VPS / aaPanel)

Backend tetap bisa jalan sebagai server mandiri di VPS pakai `backend/index.js`:

```bash
cd backend
npm install
cp .env.example .env
# edit .env
npm run migrate
npm start
```
