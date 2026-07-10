import express from 'express';
import crypto from 'crypto';
import { query } from './db.js';
import { dispatchWebhooks } from './webhook.js';
import { safeEqual } from './auth.js';
import { createQrisPayment, checkPaymentStatus } from './payment.js';
import {
  donationLimiter,
  commentLimiter,
  commentGlobalLimiter,
  leaderboardReadLimiter,
} from './rate-limit-config.js';

const router = express.Router();

async function getAllSettings() {
  const res = await query(`SELECT key, value FROM settings`);
  const obj = {};
  res.rows.forEach((row) => (obj[row.key] = row.value));
  return obj;
}

async function getEnabledSocials() {
  const res = await query(
    `SELECT platform, label, url, icon FROM social_links
     WHERE enabled = true ORDER BY display_order ASC, id ASC`
  );
  return res.rows;
}

function formatIDR(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);
}

function normalizeCommentRow(row) {
  return {
    id: row.id,
    donationId: row.donation_id || row.donationId,
    authorName: row.author_name || row.authorName || 'Anonim',
    content: row.content,
    createdAt: row.created_at || row.createdAt,
  };
}

function isValidCommentAuthorName(name) {
  return /^[A-Za-zÀ-ÿ\s]+$/.test(name);
}

function maskName(name) {
  if (!name) return 'Anonim';
  name = String(name).trim();
  if (name.length <= 2) return name[0] + '*';
  if (name.length <= 4) return name[0] + '***' + name[name.length - 1];
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

function toAbsoluteUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const baseUrl = process.env.BASE_URL || '';
  if (!baseUrl) return url;
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = url.startsWith('/') ? url : '/' + url;
  return cleanBase + cleanPath;
}

router.get('/api/config', async (req, res) => {
  try {
    const settings = await getAllSettings();
    const socials = await getEnabledSocials();

    const presetAmounts = (settings.preset_amounts || '5000,10000,20000,50000,100000')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    res.json({
      creator: {
        name: settings.creator_name || 'DRP Network',
        tagline: settings.creator_tagline || '',
        website: settings.website_url || '',
        avatar: toAbsoluteUrl(settings.avatar_url || '/images/avatar.png'),
        banner: toAbsoluteUrl(settings.banner_url || ''),
        primaryColor: settings.primary_color || '#6c5ce7',
      },
      donation: {
        presets: presetAmounts,
        minAmount: parseInt(settings.min_amount || '2000', 10),
        maxAmount: parseInt(settings.max_amount || '5000000', 10),
        customEnabled: settings.custom_amount_enabled !== 'false',
        donorNameEnabled: settings.donor_name_enabled !== 'false',
        messageEnabled: settings.message_enabled !== 'false',
        qrExpiryHours: parseInt(settings.qr_expiry_hours || '24', 10),
      },
      socials,
      footer: settings.footer_text || ' 2026 DRP Network',
    });
  } catch (err) {
    console.error('/api/config error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/donations', donationLimiter, async (req, res) => {
  try {
    const { amount, donorName, message, isAnonymous } = req.body || {};
    const baseAmount = parseInt(amount, 10);

    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return res.status(400).json({ error: 'Nominal tidak valid' });
    }

    const settings = await getAllSettings();
    const minAmount = parseInt(settings.min_amount || '2000', 10);
    const maxAmount = parseInt(settings.max_amount || '5000000', 10);

    if (baseAmount < minAmount) {
      return res.status(400).json({ error: `Nominal minimum ${formatIDR(minAmount)}` });
    }
    if (baseAmount > maxAmount) {
      return res.status(400).json({ error: `Nominal maksimum ${formatIDR(maxAmount)}` });
    }

    if (!process.env.PAYMENT_API_KEY) {
      return res.status(500).json({ error: 'Payment API key belum dikonfigurasi' });
    }

    const qrToken = crypto.randomBytes(16).toString('hex');
    const referenceId = qrToken;

    const payment = await createQrisPayment({
      referenceId,
      amount: baseAmount,
      fee: 0,
      expiresInMinutes: 15,
    });

    const totalAmount = payment.totalAmount || baseAmount;
    const uniqueCode = payment.uniqueDigit || 0;
    const transactionId = payment.transactionId;
    const qrisImageBase64 = payment.qrisImageBase64 || '';
    const qrisString = payment.qrisString || '';
    const expiresAt = payment.expiresAt ? new Date(payment.expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const cleanName = donorName ? String(donorName).trim().substring(0, 100) : null;
    const cleanMessage = message ? String(message).trim().substring(0, 500) : null;

    const insertRes = await query(
      `INSERT INTO donations
         (qr_token, amount, base_amount, unique_code, donor_name, message, ip_address, user_agent, is_anonymous, transaction_id, reference_id, qris_string)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        qrToken,
        totalAmount,
        baseAmount,
        uniqueCode,
        cleanName,
        cleanMessage,
        req.ip || req.headers['x-forwarded-for'] || null,
        (req.headers['user-agent'] || '').substring(0, 500),
        isAnonymous === true,
        transactionId,
        referenceId,
        qrisString,
      ]
    );
    const donation = insertRes.rows[0];

    dispatchWebhooks('created', donation, settings).catch((e) =>
      console.error('webhook create error:', e.message)
    );

    res.json({
      ok: true,
      donationId: donation.id,
      qrToken: donation.qr_token,
      transactionId: donation.transaction_id,
      referenceId: donation.reference_id,
      baseAmount: donation.base_amount,
      baseAmountFormatted: formatIDR(donation.base_amount),
      uniqueCode: donation.unique_code,
      amount: donation.amount,
      amountFormatted: formatIDR(donation.amount),
      qrImage: qrisImageBase64,
      qrisString: donation.qris_string,
      expiresAt: expiresAt.toISOString(),
      message: `Bayar tepat ${formatIDR(donation.amount)} agar donasi terdeteksi otomatis.`,
    });
  } catch (err) {
    console.error('POST /api/donations error:', err.message);
    res.status(500).json({ error: 'Gagal membuat donasi: ' + err.message });
  }
});

router.get('/api/donations/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const res2 = await query(
      `SELECT * FROM donations WHERE qr_token = $1`,
      [token]
    );
    if (res2.rows.length === 0) {
      return res.status(404).json({ error: 'Donasi tidak ditemukan' });
    }
    const d = res2.rows[0];

    if (d.status === 'pending' && d.transaction_id && process.env.PAYMENT_API_KEY) {
      try {
        const paymentStatus = await checkPaymentStatus({
          referenceId: d.reference_id || d.qr_token,
          transactionId: d.transaction_id,
        });

        if (paymentStatus.status === 'PAID') {
          const updRes = await query(
            `UPDATE donations
             SET status = 'paid', paid_at = NOW(), paid_via = 'payment-api'
             WHERE id = $1 AND status = 'pending'
             RETURNING *`,
            [d.id]
          );
          if (updRes.rows.length > 0) {
            const updated = updRes.rows[0];
            const settings = await getAllSettings();
            dispatchWebhooks('paid', updated, settings).catch((e) =>
              console.error('webhook paid error:', e.message)
            );
            d.status = updated.status;
            d.paid_at = updated.paid_at;
            d.paid_via = updated.paid_via;
          }
        } else if (paymentStatus.status === 'EXPIRED') {
          await query(
            `UPDATE donations SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
            [d.id]
          );
          d.status = 'expired';
        }
      } catch (err) {
        console.error('Payment status check error:', err.message);
      }
    }

    res.json({
      id: d.id,
      baseAmount: d.base_amount,
      uniqueCode: d.unique_code,
      amount: d.amount,
      amountFormatted: formatIDR(d.amount),
      donorName: d.donor_name,
      message: d.message,
      status: d.status,
      createdAt: d.created_at,
      paidAt: d.paid_at,
    });
  } catch (err) {
    console.error('GET /api/donations/:token error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/donations/:token/paid', async (req, res) => {
  try {
    const { token } = req.params;
    const providedSecret = req.headers['x-webhook-secret'] || req.body?.secret;
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret) {
      return res.status(500).json({ error: 'WEBHOOK_SECRET belum diset di server' });
    }
    if (!safeEqual(providedSecret || '', expectedSecret)) {
      return res.status(401).json({ error: 'Invalid secret' });
    }

    const res1 = await query(`SELECT * FROM donations WHERE qr_token = $1`, [token]);
    if (res1.rows.length === 0) {
      return res.status(404).json({ error: 'Donasi tidak ditemukan' });
    }
    const donation = res1.rows[0];

    if (donation.status === 'paid') {
      return res.json({ ok: true, message: 'Donasi sudah paid', donation });
    }

    const res2 = await query(
      `UPDATE donations
       SET status = 'paid', paid_at = NOW(), paid_via = 'webhook'
       WHERE qr_token = $1
       RETURNING *`,
      [token]
    );
    const updated = res2.rows[0];

    const settings = await getAllSettings();
    dispatchWebhooks('paid', updated, settings).catch((e) =>
      console.error('webhook paid error:', e.message)
    );

    res.json({ ok: true, message: 'Donasi dikonfirmasi', donation: updated });
  } catch (err) {
    console.error('POST /api/donations/:token/paid error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/leaderboard', leaderboardReadLimiter, async (req, res) => {
  try {
    const period = req.query.period || 'all';
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    let dateFilter = '';
    if (period === 'today') {
      dateFilter = `AND d.paid_at >= CURRENT_DATE`;
    } else if (period === 'month') {
      dateFilter = `AND d.paid_at >= DATE_TRUNC('month', NOW())`;
    }

    const totalRes = await query(
      `SELECT COUNT(*)::int AS total FROM donations d WHERE d.status = 'paid' ${dateFilter}`
    );
    const total = totalRes.rows[0]?.total || 0;

    const result = await query(
      `SELECT
         d.id,
         d.amount,
         d.base_amount,
         d.unique_code,
         d.donor_name,
         d.message,
         d.paid_at,
         d.is_anonymous,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', dc.id,
               'donationId', dc.donation_id,
               'authorName', dc.author_name,
               'content', dc.content,
               'createdAt', dc.created_at
             )
             ORDER BY dc.created_at ASC
           ) FILTER (WHERE dc.id IS NOT NULL),
           '[]'::json
         ) AS comments
       FROM donations d
       LEFT JOIN donation_comments dc ON dc.donation_id = d.id
       WHERE d.status = 'paid' ${dateFilter}
       GROUP BY d.id
       ORDER BY d.amount DESC, d.paid_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      period,
      limit,
      offset,
      count: result.rows.length,
      total,
      items: result.rows.map((d, i) => ({
        id: d.id,
        rank: i + 1,
        baseAmount: d.base_amount,
        uniqueCode: d.unique_code,
        amount: d.amount,
        amountFormatted: formatIDR(d.amount),
        donorName: d.is_anonymous ? maskName(d.donor_name) : (d.donor_name || 'Anonim'),
        message: d.message || null,
        paidAt: d.paid_at,
        comments: Array.isArray(d.comments) ? d.comments.map(normalizeCommentRow) : [],
        commentCount: Array.isArray(d.comments) ? d.comments.length : 0,
      })),
    });
  } catch (err) {
    console.error('/api/leaderboard error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/leaderboard/:donationId/comments', async (req, res) => {
  try {
    const donationId = parseInt(req.params.donationId, 10);
    if (!Number.isFinite(donationId) || donationId <= 0) {
      return res.status(400).json({ error: 'ID donasi tidak valid' });
    }

    const donationRes = await query(
      `SELECT id, status, message FROM donations WHERE id = $1`,
      [donationId]
    );

    if (donationRes.rows.length === 0 || donationRes.rows[0].status !== 'paid') {
      return res.status(404).json({ error: 'Pesan tidak ditemukan' });
    }

    const commentsRes = await query(
      `SELECT id, donation_id, author_name, content, created_at
       FROM donation_comments
       WHERE donation_id = $1
       ORDER BY created_at ASC
       LIMIT 100`,
      [donationId]
    );

    res.json({
      donationId,
      message: donationRes.rows[0].message || null,
      count: commentsRes.rows.length,
      limit: 100,
      items: commentsRes.rows.map(normalizeCommentRow),
    });
  } catch (err) {
    console.error('GET /api/leaderboard/:donationId/comments error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/leaderboard/:donationId/comments', commentLimiter, commentGlobalLimiter, async (req, res) => {
  try {
    const donationId = parseInt(req.params.donationId, 10);
    const { authorName, content } = req.body || {};

    if (!Number.isFinite(donationId) || donationId <= 0) {
      return res.status(400).json({ error: 'ID donasi tidak valid' });
    }

    const cleanAuthorName = String(authorName || '').trim().substring(0, 100);
    const cleanContent = String(content || '').trim().substring(0, 500);

    if (!cleanAuthorName) {
      return res.status(400).json({ error: 'Nama komentar wajib diisi' });
    }

    if (!isValidCommentAuthorName(cleanAuthorName)) {
      return res.status(400).json({ error: 'Nama komentar hanya boleh berisi huruf dan spasi' });
    }

    if (!cleanContent) {
      return res.status(400).json({ error: 'Komentar tidak boleh kosong' });
    }

    const donationRes = await query(
      `SELECT id, status, message FROM donations WHERE id = $1`,
      [donationId]
    );

    if (donationRes.rows.length === 0 || donationRes.rows[0].status !== 'paid') {
      return res.status(404).json({ error: 'Pesan tidak ditemukan' });
    }

    if (!donationRes.rows[0].message) {
      return res.status(400).json({ error: 'Donasi ini tidak memiliki pesan untuk dikomentari' });
    }

    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM donation_comments WHERE donation_id = $1`,
      [donationId]
    );

    if (countRes.rows[0].count >= 100) {
      return res.status(400).json({
        error: 'Batas maksimum 100 komentar untuk pesan ini telah tercapai',
      });
    }

    const insertRes = await query(
      `INSERT INTO donation_comments
         (donation_id, author_name, content, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, donation_id, author_name, content, created_at`,
      [
        donationId,
        cleanAuthorName,
        cleanContent,
        req.ip || req.headers['x-forwarded-for'] || null,
        (req.headers['user-agent'] || '').substring(0, 500),
      ]
    );

    const comment = normalizeCommentRow(insertRes.rows[0]);

    res.status(201).json({
      ok: true,
      message: 'Komentar berhasil ditambahkan',
      comment,
      remaining: Math.max(0, 99 - countRes.rows[0].count),
      limit: 100,
    });
  } catch (err) {
    console.error('POST /api/leaderboard/:donationId/comments error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/leaderboard/stats', async (req, res) => {
  try {
    const all = await query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total, MAX(amount) as max_amount
       FROM donations WHERE status = 'paid'`
    );
    const today = await query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
       FROM donations WHERE status = 'paid' AND paid_at >= CURRENT_DATE`
    );
    const month = await query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
       FROM donations WHERE status = 'paid' AND paid_at >= DATE_TRUNC('month', NOW())`
    );

    res.json({
      all: {
        count: parseInt(all.rows[0].cnt, 10),
        total: parseInt(all.rows[0].total, 10),
        totalFormatted: formatIDR(all.rows[0].total),
        maxAmount: parseInt(all.rows[0].max_amount || 0, 10),
        maxAmountFormatted: formatIDR(all.rows[0].max_amount || 0),
      },
      today: {
        count: parseInt(today.rows[0].cnt, 10),
        total: parseInt(today.rows[0].total, 10),
        totalFormatted: formatIDR(today.rows[0].total),
      },
      month: {
        count: parseInt(month.rows[0].cnt, 10),
        total: parseInt(month.rows[0].total, 10),
        totalFormatted: formatIDR(month.rows[0].total),
      },
    });
  } catch (err) {
    console.error('/api/leaderboard/stats error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
