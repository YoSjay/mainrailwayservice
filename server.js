/**
 * SJTweaks Main API — own PostgreSQL on Railway for everything except raw credentials.
 * Sign-up flow: client -> this API -> forwards to Auth service (hashes password there).
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL || '').replace(/\/$/, '');
const INTERNAL_AUTH_KEY = process.env.INTERNAL_AUTH_KEY;

async function forwardRegister(email, password) {
  const url = `${AUTH_SERVICE_URL}/auth/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': INTERNAL_AUTH_KEY
    },
    body: JSON.stringify({ email, password })
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sjtweaks-main-api' });
});

/**
 * Public entry for launcher / website sign-up.
 * 1) Creates auth row in Auth DB (via auth service).
 * 2) Creates profile row in THIS database.
 */
app.post('/v1/signup', async (req, res) => {
  if (!AUTH_SERVICE_URL || !INTERNAL_AUTH_KEY) {
    return res.status(503).json({ error: 'Auth forwarding not configured' });
  }

  const email = (req.body.email || '').trim();
  const password = req.body.password;
  const displayName = (req.body.displayName || '').trim() || null;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  const authResult = await forwardRegister(email, password);
  if (!authResult.ok) {
    return res.status(authResult.status).json(authResult.data);
  }

  const userId = authResult.data.userId;
  if (!userId) {
    return res.status(502).json({ error: 'Auth service returned no user id' });
  }

  try {
    await pool.query(
      `INSERT INTO user_profiles (user_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name), updated_at = now()`,
      [userId, displayName]
    );
    res.status(201).json({
      userId,
      email: authResult.data.email,
      message: 'Account created; profile stored in main database.'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Profile creation failed' });
  }
});

/** Later: JWT validation middleware, game catalog, entitlements, etc. */

const PORT = Number(process.env.PORT) || 3000;
// Dual-stack so Railway's IPv6-only private network can route to us as well.
const PREFERRED_HOST = process.env.LISTEN_HOST || '::';

const server = app.listen(PORT, PREFERRED_HOST, () => {
  console.log(`sjtweaks-main-api listening on [${PREFERRED_HOST}]:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') {
    console.warn(`IPv6 bind failed (${err.code}); falling back to 0.0.0.0`);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`sjtweaks-main-api listening on 0.0.0.0:${PORT}`);
    });
  } else {
    console.error('Listen error:', err);
    process.exit(1);
  }
});
