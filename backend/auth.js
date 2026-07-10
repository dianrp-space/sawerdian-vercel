import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { pool } from './db.js';

const PgSession = connectPgSimple(session);

function safeEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function buildSessionMiddleware(config = {}) {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET belum diset di environment');
  }
  if (isProduction && !process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD belum diset di environment');
  }

  return session({
    store: new PgSession({
      pool,
      tableName: 'session',
      createTableIfNotExists: false,
    }),
    name: 'drp.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true' ? true : 'auto',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    ...config,
  });
}

export function requireAdmin(req, res, next) {
  const hasSession = !!req.session;
  const isAdminSession = hasSession && req.session.admin === true;
  if (process.env.NODE_ENV !== 'production' || !isAdminSession) {
    console.log(`requireAdmin ${req.method} ${req.path}: sessionID=${req.sessionID} hasSession=${hasSession} admin=${isAdminSession}`);
  }
  if (isAdminSession) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized', code: 'NOT_LOGGED_IN' });
}

export function isAdmin(req) {
  return !!(req.session && req.session.admin === true);
}

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (!safeEqual(username, expectedUser)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  const isHashed = expectedPass.startsWith('$2');
  const valid = isHashed
    ? await bcrypt.compare(password, expectedPass)
    : safeEqual(password, expectedPass);

  if (!valid) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  req.session.admin = true;
  req.session.loginAt = new Date().toISOString();

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan session' });
    }
    console.log('Login OK, sessionID:', req.sessionID, 'admin:', req.session.admin);
    res.json({ ok: true, username: expectedUser });
  });
}

export function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Gagal logout' });
    }
    res.clearCookie('drp.sid');
    res.json({ ok: true });
  });
}

export function me(req, res) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({
    ok: true,
    username: process.env.ADMIN_USERNAME || 'admin',
    loginAt: req.session.loginAt,
  });
}

export { safeEqual };
export default { buildSessionMiddleware, requireAdmin, isAdmin, login, logout, me };
