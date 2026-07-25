import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, 'data', 'registry.json');

const PORT = Number(process.env.RECOVERY_API_PORT || 3333);
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_SECRET = process.env.OTP_SECRET || 'dev-change-me-in-production';
const APP_NAME = process.env.APP_NAME || 'Digital Space';

/** @type {Map<string, { hash: string; expires: number; attempts: number }>} */
const pendingPins = new Map();

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function generatePin() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashPin(email, pin) {
  return crypto.createHash('sha256').update(`${pin}:${email}:${OTP_SECRET}`).digest('hex');
}

function createMailer() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });
}

const mailer = createMailer();
const devMode = process.env.RECOVERY_DEV_MODE !== 'false';

const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

function normalizeUsername(input) {
  return String(input || '')
    .trim()
    .toLowerCase();
}

function isValidUsername(input) {
  return USERNAME_RE.test(normalizeUsername(input));
}

function normalizeRecoveryCode(input) {
  return String(input || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifySecret(secret, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const hash = crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

function loadRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return { users: {} };
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.users ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

function saveRegistry(registry) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

function publicProfile(user) {
  return {
    username: user.username,
    displayName: user.displayName || '',
    recoveryEmail: user.recoveryEmail || '',
    googleClientId: user.googleClientId || '',
    driveFolderId: user.driveFolderId || '',
    driveAccountEmail: user.driveAccountEmail || '',
    googleIdentityEmail: user.googleIdentityEmail || '',
    hasRecoveryCode: Boolean(user.recoveryCodeHash),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mailer: Boolean(mailer), devMode });
});

app.post('/api/recovery/send-pin', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'EMAIL_REQUIRED' });
  }

  const pin = generatePin();
  pendingPins.set(email, {
    hash: hashPin(email, pin),
    expires: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  const subject = `${APP_NAME} password recovery code`;
  const text = `Your ${APP_NAME} recovery code is: ${pin}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.`;

  try {
    if (mailer) {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject,
        text,
      });
    } else if (devMode) {
      console.log(`[recovery-api] PIN for ${email}: ${pin}`);
    } else {
      return res.status(503).json({ error: 'MAIL_NOT_CONFIGURED' });
    }
  } catch (err) {
    console.error('[recovery-api] send failed', err);
    pendingPins.delete(email);
    return res.status(500).json({ error: 'SEND_FAILED' });
  }

  const payload = { sent: true, expiresInSeconds: OTP_TTL_MS / 1000 };
  if (!mailer && devMode) {
    payload.devPin = pin;
  }
  res.json(payload);
});

app.post('/api/recovery/verify-pin', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const pin = String(req.body?.pin || '').replace(/\D/g, '');

  if (!email || !pin || pin.length !== 6) {
    return res.status(400).json({ error: 'PIN_INVALID' });
  }

  const entry = pendingPins.get(email);
  if (!entry || entry.expires < Date.now()) {
    pendingPins.delete(email);
    return res.status(400).json({ error: 'PIN_EXPIRED' });
  }

  if (entry.attempts >= 5) {
    pendingPins.delete(email);
    return res.status(429).json({ error: 'PIN_LOCKED' });
  }

  if (hashPin(email, pin) !== entry.hash) {
    entry.attempts += 1;
    return res.status(400).json({ error: 'PIN_WRONG' });
  }

  pendingPins.delete(email);
  const token = crypto.randomBytes(24).toString('hex');
  res.json({ verified: true, token, expiresInSeconds: 300 });
});

app.get('/api/users/:username/available', (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'USERNAME_INVALID' });
  }
  const registry = loadRegistry();
  res.json({ available: !registry.users[username] });
});

app.get('/api/users/:username', (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'USERNAME_INVALID' });
  }
  const registry = loadRegistry();
  const user = registry.users[username];
  if (!user) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  res.json(publicProfile(user));
});

app.post('/api/users/register', (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const recoveryCode = normalizeRecoveryCode(req.body?.recoveryCode);

  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'USERNAME_INVALID' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
  }
  if (!recoveryCode || recoveryCode.length < 16) {
    return res.status(400).json({ error: 'RECOVERY_CODE_REQUIRED' });
  }

  const registry = loadRegistry();
  if (registry.users[username]) {
    return res.status(409).json({ error: 'USERNAME_TAKEN' });
  }

  const now = new Date().toISOString();
  registry.users[username] = {
    username,
    displayName: String(req.body?.displayName || '').trim(),
    passwordHash: hashSecret(password),
    recoveryCodeHash: hashSecret(recoveryCode),
    recoveryEmail: normalizeEmail(req.body?.recoveryEmail || ''),
    googleClientId: String(req.body?.googleClientId || '').trim(),
    driveFolderId: String(req.body?.driveFolderId || '').trim(),
    driveAccountEmail: normalizeEmail(req.body?.driveAccountEmail || ''),
    googleIdentityEmail: normalizeEmail(req.body?.googleIdentityEmail || ''),
    createdAt: now,
    updatedAt: now,
  };
  saveRegistry(registry);
  console.log(`[recovery-api] registered user: ${username}`);
  res.status(201).json(publicProfile(registry.users[username]));
});

app.post('/api/users/verify-login', (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  if (!isValidUsername(username) || !password) {
    return res.status(400).json({ error: 'LOGIN_INVALID' });
  }
  const registry = loadRegistry();
  const user = registry.users[username];
  if (!user || !verifySecret(password, user.passwordHash)) {
    return res.status(401).json({ error: 'LOGIN_FAILED' });
  }
  res.json({ ok: true, profile: publicProfile(user) });
});

app.patch('/api/users/:username', (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'USERNAME_INVALID' });
  }
  const registry = loadRegistry();
  const user = registry.users[username];
  if (!user) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const body = req.body || {};
  if (body.password) {
    if (String(body.password).length < 8) {
      return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    }
    user.passwordHash = hashSecret(String(body.password));
  }
  if (body.recoveryCode) {
    const code = normalizeRecoveryCode(body.recoveryCode);
    if (code.length < 16) {
      return res.status(400).json({ error: 'RECOVERY_CODE_REQUIRED' });
    }
    user.recoveryCodeHash = hashSecret(code);
  }
  if (body.displayName !== undefined) user.displayName = String(body.displayName || '').trim();
  if (body.recoveryEmail !== undefined) user.recoveryEmail = normalizeEmail(body.recoveryEmail);
  if (body.googleClientId !== undefined) user.googleClientId = String(body.googleClientId || '').trim();
  if (body.driveFolderId !== undefined) user.driveFolderId = String(body.driveFolderId || '').trim();
  if (body.driveAccountEmail !== undefined) user.driveAccountEmail = normalizeEmail(body.driveAccountEmail);
  if (body.googleIdentityEmail !== undefined) user.googleIdentityEmail = normalizeEmail(body.googleIdentityEmail);

  user.updatedAt = new Date().toISOString();
  saveRegistry(registry);
  res.json(publicProfile(user));
});

app.listen(PORT, () => {
  console.log(`[recovery-api] listening on http://localhost:${PORT}`);
  if (!mailer) {
    console.log('[recovery-api] SMTP not configured — PINs logged to console (dev mode)');
  }
});
