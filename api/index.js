import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { buildSessionMiddleware } from '../backend/auth.js';
import sawerRoutes from '../backend/sawer-routes.js';
import adminRoutes from '../backend/admin-routes.js';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());
app.use(bodyParser.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    try { req.rawBody = buf && buf.length ? buf.toString('utf8') : ''; } catch { req.rawBody = ''; }
  },
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!isProduction) {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    if (
      allowedOrigins.length > 0 &&
      (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))
    ) {
      return callback(null, true);
    }
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
}));

app.set('trust proxy', 1);
app.use(buildSessionMiddleware());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.use(sawerRoutes);
app.use(adminRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint tidak ditemukan', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File terlalu besar' });
  }
  if (err.message === 'CORS not allowed') {
    return res.status(403).json({ error: 'Origin tidak diizinkan' });
  }
  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
  });
});

export default app;
