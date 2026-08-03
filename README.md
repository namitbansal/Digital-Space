# Digital Space — Personal Vault

**Digital Space** is the repository and deployment name. **Personal Vault** is the in-app product name (browser tab uses “Digital Space”; vault UI and Google Drive folder use “Personal Vault”).

Personal Vault is a **zero-knowledge**, client-side encrypted password and document manager. All sensitive data is encrypted in the browser before storage. The master password never leaves your device.

| | |
|---|---|
| **Live app** | [namitbansal.github.io/digital_space](https://namitbansal.github.io/digital_space/) |
| **Repository** | [github.com/namitbansal/digital_space](https://github.com/namitbansal/digital_space) |
| **Stack** | Angular 19 (standalone), IndexedDB, Web Crypto API, optional Google Drive sync |
| **Version** | See `src/app/core/constants/app-version.ts` |

---

## Quick start

### 1. Install and run the app

```bash
cd digital_space
npm install
npm start
```

Open [http://localhost:5173](http://localhost:5173)

**LAN / phone testing** (same Wi‑Fi):

```bash
npm run start:lan
```

Then open `http://<your-pc-ip>:5173` in Chrome on another device.

### 2. (Recommended) Run the recovery API

Username uniqueness, email PIN recovery, and the server-side user registry need the local API:

```bash
# Terminal 2
npm run start:api
```

The dev server proxies `/api/*` to `http://localhost:3333` (`proxy.conf.json`).

### 3. Verify before deploy

```bash
npm run smoke    # unit tests + production build
```

---

## URLs

| Environment | App URL | Recovery API |
|---|---|---|
| Local | `http://localhost:5173` | `http://localhost:3333` |
| LAN | `http://<your-ip>:5173` | `http://<your-ip>:3333` |
| Production | `https://namitbansal.github.io/digital_space/` | Not hosted on GitHub Pages |

Recovery API health check: `GET /api/health` (no HTML UI at `/`).

---

## What the app does

- **Encrypted vault** — logins, bank details, cards, vehicles, documents, custom items
- **Categories** — built-in types plus custom folders per family profile
- **Family profiles** — separate item sets per person on one vault (Me, Spouse, Child, …)
- **Encrypted attachments** — PDFs, images, and other files stored in IndexedDB
- **Activity history** — audit log with timestamps and **profile** on each action
- **Recovery** — recovery code, email PIN (via API), Google Drive backup
- **Optional Google Drive sync** — encrypted `vault.enc` and attachments in `Personal Vault/{username}/`
- **Offline-first** — full use without internet; sync when online if configured

---

## App flow (no Angular Router)

`AppComponent` switches screens with a `screen` state:

```
welcome → create-vault | unlock | forgot-password → shell (main app)
```

| Screen | Purpose |
|--------|---------|
| **Welcome** | Create vault or unlock existing |
| **Create vault** | Username, password, storage choice (device / Google), recovery code |
| **Unlock** | Username + master password |
| **Forgot password** | Email PIN or recovery code reset |
| **Shell** | Dashboard, categories, items, search, profiles, lock |

Modals inside shell: **Account settings**, **Activity history**, item editor, family profiles, categories.

---

## Project structure

```
digital_space/
├── public/
│   ├── config/
│   │   ├── google-oauth.example.json   # Copy → google-oauth.json (gitignored)
│   │   └── google-oauth.json
│   ├── icons/                          # Topbar SVGs + icon.svg
│   ├── images/                         # Welcome hero images
│   ├── favicon.ico, favicon.png
│   └── manifest.webmanifest
├── recovery-api/                         # Optional Express API (port 3333)
│   ├── server.mjs
│   └── data/                           # registry.json (gitignored at runtime)
├── scripts/
│   └── generate-favicon.mjs
├── src/
│   ├── index.html
│   ├── main.ts
│   ├── styles.css                      # Imports styles/main.css
│   ├── styles/
│   │   ├── tokens.css, base.css, components.css, layout.css
│   │   ├── shell-topbar.css            # Global header (style budget)
│   │   └── main.css
│   └── app/
│       ├── app.component.*             # Root screen router
│       ├── app.config.ts
│       ├── core/
│       │   ├── auth/                   # Google OAuth (redirect flow)
│       │   ├── constants/              # App name, version, OAuth, debug flag
│       │   ├── crypto/                 # PBKDF2, AES-GCM, recovery crypto
│       │   ├── items/                  # Item type field definitions
│       │   ├── models/                 # Vault, profile, registry types
│       │   ├── services/               # Vault, session, recovery, logger, audit
│       │   ├── storage/                # IndexedDB envelope + attachments
│       │   ├── sync/                   # Google Drive API + merge logic
│       │   └── utils/                  # Username rules, IDs
│       ├── features/
│       │   ├── welcome/
│       │   ├── create-vault/
│       │   ├── unlock/
│       │   ├── forgot-password/
│       │   ├── shell/                  # Main UI (dashboard, items, topbar)
│       │   ├── account-settings/
│       │   └── activity-history/
│       └── shared/
│           ├── icon/                   # Inline SVG icon set
│           └── guidance-panel/         # Contextual help panels
├── .github/workflows/
│   ├── ci.yml
│   └── deploy-pages.yml
├── angular.json
├── vitest.config.ts
├── proxy.conf.json
└── package.json
```

### Design choices

- **Standalone components** — no NgModules; no `@angular/router` (simple state machine in root).
- **Per-user IndexedDB** — database name `vault-{username}`; legacy single DB `vault` migrated on login.
- **Global CSS** — feature components use shared `styles/`; only shell, welcome, account-settings, and activity-history have component CSS.
- **Vitest** — unit tests for crypto, username rules, audit display, drive layout (no Karma).
- **Google OAuth** — same-tab redirect flow (no popup); resume after unlock on full page reload.

---

## Source code index

### Entry & shell

| File | Role |
|------|------|
| `src/main.ts` | Bootstrap; captures OAuth hash before Angular starts |
| `src/app/app.component.ts` | Screen router (`welcome` / `create` / `unlock` / `forgot` / `app`) |
| `src/app/features/shell/shell.component.*` | Main vault UI, topbar, search, item editor |

### Auth & Google

| File | Role |
|------|------|
| `core/auth/google-oauth-redirect.util.ts` | Redirect URI, pending OAuth state, hash capture |
| `core/auth/google-drive-link.service.ts` | Connect, resume, verify Drive, apply account |
| `core/auth/google-account.service.ts` | Access token, GIS script, user profile |
| `core/auth/google-oauth-config.service.ts` | Resolve Client ID (built-in / runtime JSON) |
| `core/auth/google-errors.ts` | User-facing OAuth error messages |
| `core/constants/google-oauth.config.ts` | Built-in Client ID |
| `public/config/google-oauth.json` | Runtime Client ID (optional, gitignored) |

### Vault & sync

| File | Role |
|------|------|
| `core/services/vault.service.ts` | Create, unlock, lock, items, profiles, onboarding |
| `core/storage/vault-store.service.ts` | IndexedDB read/write |
| `core/sync/sync.service.ts` | Push/pull encrypted vault to Drive |
| `core/sync/drive-api.service.ts` | Google Drive REST calls |

### Recovery

| File | Role |
|------|------|
| `recovery-api/server.mjs` | Username registry, email PIN API |
| `core/services/recovery.service.ts` | Recovery code / email unlock logic |
| `core/services/email-recovery-api.service.ts` | Client for recovery API |

### Debug logging

| File | Role |
|------|------|
| `core/constants/debug-logging.config.ts` | Master on/off switch (`DEBUG_LOGGING_ENABLED`) |
| `core/services/logger.util.ts` | Stack-aware logger (file, function, line, caller) |
| `core/services/logger.service.ts` | Injectable wrapper for components/services |

Set `DEBUG_LOGGING_ENABLED = true` in `debug-logging.config.ts`, reproduce Google sign-in, and read the browser console. Set back to `false` for production.

Log format example:

```
[google-drive-link.service.ts:resumePendingConnect:72 <- shell.component.ts:resumeGoogleOAuth:131] → ENTER resumePendingConnect
```

---

## Encryption model

### Algorithms

| Step | Algorithm |
|------|-----------|
| Key derivation | PBKDF2-SHA256, **600,000** iterations, random 16-byte salt |
| Vault payload | **AES-256-GCM** (random 12-byte IV per save) |
| File attachments | **AES-256-GCM** with the same session key |

### What is encrypted

| Data | Storage | Encrypted? |
|------|---------|------------|
| Profiles, items, passwords, fields, audit log | `vaultEnvelope` ciphertext | Yes |
| Google account, sync settings | Inside vault `sync` object | Yes |
| Attachment bytes | IndexedDB `attachments` store | Yes |
| Attachment metadata | Inside vault item records | Yes |

### What stays plaintext (by design)

| Data | Why |
|------|-----|
| `hasVault` flag | Show welcome vs unlock without password |
| KDF salt, iterations, IV | Required to decrypt; not secret |
| Device theme, revision counter | Non-sensitive UI prefs |
| **Server registry** (recovery API) | Username hashes, email — **not** vault contents |

The master password is **never** written to disk.

### Session lifecycle

1. **Unlock** — Password → PBKDF2 → `CryptoKey` in memory
2. **Edit** — In-memory vault updated, then `resealVault()`
3. **Lock** — Session cleared; keys wiped

---

## Storage architecture

### Local (always)

| Location | Contents |
|----------|----------|
| IndexedDB `vault-{username}` | `kv` (envelope, settings), `attachments` |
| `localStorage` `digital-space-global` | Known usernames list |
| Device settings | Theme, install date, vault revision |

### Google Drive (optional)

Folder layout: **`Personal Vault / {username} /`**

| Path | Contents |
|------|----------|
| `vault.enc` | Encrypted full vault |
| `attachments/*.enc` | Encrypted files |
| `backups/*.enc` | Conflict snapshots |
| Recovery `*.enc` | Recovery bundles |

Sync is **last-write-wins** with revision checks; manual pull/push in Account settings.

### Storage modes

| Mode | Behavior |
|------|----------|
| **This device only** | IndexedDB only; works offline |
| **This device + Google Drive** | Local first; encrypted upload when online |

---

## Recovery API (`recovery-api/`)

Lightweight Express server for features that cannot run purely in the browser.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/users/:username/available` | Username taken check |
| GET | `/api/users/:username` | Registry lookup |
| POST | `/api/users/register` | Register username + email |
| POST | `/api/users/verify-login` | Login verification metadata |
| POST | `/api/recovery/send-pin` | Email PIN (needs SMTP) |
| POST | `/api/recovery/verify-pin` | Verify PIN |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `RECOVERY_API_PORT` | Default `3333` |
| `OTP_SECRET` | PIN hashing secret (set in production) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery |
| `RECOVERY_DEV_MODE` | Dev PIN logging when SMTP absent |

### Data file

`recovery-api/data/registry.json` — created on first registration; **gitignored**.

---

## Recovery options

1. **Recovery code** — shown once at vault creation; stored encrypted on Drive
2. **Email PIN** — requires recovery API + SMTP
3. **Google Drive** — `vault-recovery.enc` with master backup key
4. **Universal dev code** — see `master-recovery-code.ts` (development only)

---

## Account settings

- **Your name** — owner profile display name
- **Master password** — re-encrypts entire vault
- **Storage & backup** — device-only vs hybrid, sync status
- **Google account** — OAuth; Client ID in advanced section for self-hosted builds
- **Version** — app version and release date (only place version is shown in UI)

### Google OAuth setup

1. [Google Cloud Console](https://console.cloud.google.com/) → enable **Google Drive API**.
2. Create an OAuth 2.0 Client ID (Web application).
3. **Authorized JavaScript origins:**

   | Environment | Origin |
   |---|---|
   | Local | `http://localhost:5173` |
   | LAN | `http://<your-ip>:5173` |
   | Production | `https://namitbansal.github.io` |

4. **Authorized redirect URIs:**

   | Environment | Redirect URI |
   |---|---|
   | Local | `http://localhost:5173/` |
   | LAN | `http://<your-ip>:5173/` |
   | Production | `https://namitbansal.github.io/digital_space/` |

5. Add your Client ID using either:
   - Copy `public/config/google-oauth.example.json` → `public/config/google-oauth.json` and paste your Client ID, **or**
   - Set `DEFAULT_GOOGLE_CLIENT_ID` in `src/app/core/constants/google-oauth.config.ts`, **or**
   - Paste it in Account settings → Google OAuth Client ID (advanced).

### Google sign-in flow

1. User clicks **Connect Google** → same-tab redirect to Google (no popup).
2. Google returns with `#access_token=...` in the URL.
3. App stores token in `sessionStorage` and strips the hash.
4. User **unlocks vault** (session lost on full page reload).
5. App resumes OAuth: fetches profile, verifies Drive folder, updates account.

Use Chrome (not embedded preview browsers) and allow the redirect URI exactly as configured.

---

## Family profiles & access control

- Each profile has its own items and custom categories.
- UI lists only the **active profile**’s data.
- Switch profile from the top bar dropdown on Home.
- Activity history records **which profile** each action belonged to.

---

## Item types

| Type | Use case |
|------|----------|
| `password` | Website logins |
| `social` | Social accounts |
| `bankAccount` | Bank details |
| `creditCard` | Cards |
| `vehicle` | Vehicle documents |
| `document` | IDs, certificates |
| `custom` | Anything else |

---

## npm scripts

| Script | Command |
|--------|---------|
| `npm start` | Dev server on port **5173** (localhost only) |
| `npm run start:lan` | Dev server on **0.0.0.0** (LAN / phone testing) |
| `npm run start:api` | Recovery API on port **3333** |
| `npm run build` | Production build → `dist/digital-space` |
| `npm run watch` | Dev build watch mode |
| `npm test` | Vitest unit tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run smoke` | Tests + production build |
| `npm run icons` | Regenerate `favicon.ico` / `favicon.png` from `icons/icon.svg` |

---

## Testing

Vitest specs cover:

- `kdf.spec.ts` — extractable AES key (vault creation safety)
- `username.spec.ts` — username validation rules
- `drive-layout.util.spec.ts` — Drive folder path labels
- `audit-display.spec.ts` — activity history profile labels
- `google-errors.spec.ts` — OAuth error message mapping

CI (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on pushes/PRs to `main`.
Deploy workflow runs tests before publishing to GitHub Pages.

---

## Deploy (GitHub Pages)

Production `baseHref` is `/digital_space/` (`angular.json`).

1. Push to `main` with GitHub Pages source = **GitHub Actions**.
2. Workflow builds, tests, and deploys `dist/digital-space/browser`.
3. SPA fallback: `404.html` copy of `index.html`.

Before deploy: set `DEBUG_LOGGING_ENABLED = false` in `debug-logging.config.ts`.

---

## Static assets

| Asset | Used by |
|-------|---------|
| `favicon.ico`, `favicon.png`, `icons/icon.svg` | Tab icon, PWA manifest |
| `icons/activity-history.svg`, `account-settings.svg`, `logout.svg` | Shell topbar |
| `images/welcome-mobile.png`, `welcome-desktop.png` | Welcome screen hero |

Regenerate favicons after changing `icon.svg`:

```bash
npm run icons
```

---

## Security notes

- Use a strong, unique master password.
- Lock the vault when leaving the device.
- Clearing browser site data **deletes** the local vault.
- Only encrypted blobs go to Google Drive.
- Run recovery API only on trusted infrastructure; protect `OTP_SECRET` and SMTP credentials.
- Do not commit `recovery-api/data/registry.json`, `public/config/google-oauth.json`, or `.env` files with secrets.
- Keep debug logging disabled in production.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Username always “taken” | Start recovery API: `npm run start:api` |
| Google connect fails | Set Client ID; check OAuth origins **and** redirect URIs |
| Stuck on `accounts.google.com` | Use Chrome; same-tab redirect flow; check redirect URI |
| Unlock required after Google sign-in | Expected — unlock vault to finish connecting |
| Email PIN not received | Configure SMTP on recovery API |
| `ERR_CONNECTION_REFUSED` on LAN IP | Use `npm run start:lan` |
| Search dropdown clipped | Hard refresh; topbar uses global `shell-topbar.css` |
| Welcome image missing | Add PNGs to `public/images/` |
| Debug Google login | Set `DEBUG_LOGGING_ENABLED = true`; open DevTools Console |

---

## License

Private project — see repository owner for terms.
