 # Sawerdian - Backend

Backend untuk website sawer dengan QRIS dinamis (via payment.dianrp.com), leaderboard publik, dan dashboard admin.

## 🚀 Cara Menjalankan

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Setup `.env`
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3003
DATABASE_URL=postgresql://sawerdian:your_password@localhost:5432/sawerdian
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ganti_dengan_password_kuat
SESSION_SECRET=ganti_dengan_string_random_panjang_min_32_karakter
PAYMENT_API_KEY=drp_live_xxxx
WEBHOOK_SECRET=ganti_dengan_string_random
BASE_URL=http://localhost:3003
```

### 3. Migrate database
```bash
npm run migrate
```

Akan create tables: `settings`, `donations`, `webhooks`, `webhook_logs`, `social_links`, `session` + seed default settings.

### 4. Jalankan server
```bash
npm start          # production
npm run dev        # development (auto-reload)
```

Default: http://localhost:3003

---

## 🔌 API Endpoints

### 🟢 PUBLIK (tanpa auth)

#### `GET /api/health`
Cek status server + database.
```bash
curl http://localhost:3003/api/health
```
Response:
```json
{
  "status": "OK",
  "timestamp": "2026-06-17T...",
  "database": "connected"
}
```

#### `GET /api/config`
Ambil konfigurasi publik (identitas, branding, preset nominal, socials).
```bash
curl http://localhost:3003/api/config
```

#### `POST /api/donations`
Buat donasi baru, return QR code + token. QRIS digenerate oleh payment.dianrp.com.
```bash
curl -X POST http://localhost:3003/api/donations \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "donorName": "John Doe",
    "message": "Semangat terus!"
  }'
```
Response:
```json
{
  "ok": true,
  "donationId": 1,
  "qrToken": "abc123...",
  "transactionId": "txn_xxx",
  "amount": 10000,
  "amountFormatted": "Rp 10.000",
  "qrImage": "data:image/png;base64,...",
  "qrisString": "00020101021226...",
  "expiresAt": "2026-07-10T11:17:33.548Z"
}
```
*Rate limit: 10 request / 5 menit per IP*

#### `GET /api/donations/:token`
Cek status donasi by token. Otomatis cek payment status ke payment.dianrp.com.

#### `POST /api/donations/:token/paid` 🔐
Konfirmasi donasi manual. Dilindungi `WEBHOOK_SECRET`.

#### `GET /api/leaderboard`
Top sawer (nama di-mask).

#### `GET /api/leaderboard/stats`
Statistik ringkasan.

---

### 🔐 ADMIN (perlu session login)

#### `POST /api/admin/login`
#### `POST /api/admin/logout`
#### `GET /api/admin/me`
#### `GET /api/admin/dashboard`
#### `GET /api/admin/settings` & `PUT /api/admin/settings`
#### `POST /api/admin/branding/:type` (type: `logo` | `banner`)
Upload logo/banner ke S3. `multipart/form-data` dengan field `file`.
#### `DELETE /api/admin/branding/:type`
#### CRUD `/api/admin/webhooks`
#### `POST /api/admin/webhooks/:id/test`
#### `GET /api/admin/webhook-logs`
#### CRUD `/api/admin/socials`
#### `GET /api/admin/donations` (dengan filter & pagination)
#### `GET /api/admin/donations/:id`
#### `PATCH /api/admin/donations/:id/status`
#### `DELETE /api/admin/donations/:id`
#### `GET /api/admin/donations/export.csv`

---

## 💳 Payment Flow

1. `POST /api/donations` → panggil `payment.dianrp.com/v2/qris` → simpan `transactionId`
2. User scan QRIS dan bayar
3. Frontend polling `GET /api/donations/:token` tiap 3 detik
4. Backend auto-cek `payment.dianrp.com/v2/payment-status`
5. Status **PAID** → mark paid + trigger webhook
6. Status **EXPIRED** → mark expired

---

## 🗄️ Database Schema

Tables:
- `settings` — key-value config
- `donations` — semua saweran (termasuk `transaction_id`, `reference_id`, `qris_string`)
- `webhooks` — konfigurasi webhook
- `webhook_logs` — history pengiriman webhook
- `social_links` — social media links
- `session` — session admin (express-session)

---

## 🐛 Troubleshooting

**Q: Error "Database connection failed"**
- Pastikan PostgreSQL running
- Cek `DATABASE_URL` di `.env`
- Jalankan `npm run migrate` dulu

**Q: Admin tidak bisa login**
- Default: `admin` / `admin123`
- Cek `ADMIN_USERNAME` dan `ADMIN_PASSWORD` di `.env`

**Q: Webhook tidak terkirim**
- Cek tab Webhooks di dashboard admin → lihat log
- Test webhook manual dari dashboard

---

Made with ❤️ by DRP Network
