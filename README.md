# Digital Space — Personal Vault

**Digital Space** is the repository and deployment name. **Personal Vault** is the in-app product name (browser tab on welcome uses “Digital Space”; vault UI and Google Drive folder use “Personal Vault”).

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
├── public/                      # Static assets (copied to build output)
│   ├── favicon.ico
│   ├── manifest.webmanifest
│   └── icons/                   # SVG toolbar icons
├── recovery-api/                  # Optional Express API (port 3333)
│   ├── server.mjs
│   └── data/                    # registry.json (gitignored at runtime)
├── src/
│   ├── index.html
│   ├── main.ts
│   ├── styles.css               # Imports styles/main.css chain
│   ├── styles/                  # tokens, base, components, layout
│   └── app/
│       ├── app.component.*      # Root screen router
│       ├── app.config.ts
│       ├── core/
│       │   ├── auth/            # Google OAuth
│       │   ├── constants/       # App name, version, OAuth, guidance copy
│       │   ├── crypto/          # PBKDF2, AES-GCM, recovery crypto
│       │   ├── items/           # Item type field definitions
│       │   ├── models/          # Vault, profile, registry types
│       │   ├── services/        # Vault, session, recovery, audit, theme
│       │   ├── storage/         # IndexedDB envelope + attachments
│       │   ├── sync/            # Google Drive API + merge logic
│       │   └── utils/           # Username rules, IDs
│       ├── features/
│       │   ├── welcome/
│       │   ├── create-vault/
│       │   ├── unlock/
│       │   ├── forgot-password/
│       │   ├── shell/             # Main UI (dashboard, items, topbar)
│       │   ├── account-settings/
│       │   └── activity-history/
│       └── shared/
│           ├── icon/              # Inline SVG icon set
│           └── guidance-panel/    # Contextual help panels
├── .github/workflows/
│   ├── ci.yml                   # test + build on PR/push
│   └── deploy-pages.yml         # GitHub Pages deploy
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
| Attachment bytes | IndexedDB `attachments` store (`id`, `iv`, `ciphertext`) | Yes |
| Attachment metadata (name, size) | Inside vault item records | Yes |

### What stays plaintext (by design)

| Data | Why |
|------|-----|
| `hasVault` flag | Show welcome vs unlock without password |
| KDF salt, iterations, IV | Required to decrypt; not secret |
| Device theme, revision counter | Non-sensitive UI prefs |
| **Server registry** (recovery API) | Username hashes, email, Drive folder ids — **not** vault contents |

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

### IndexedDB schema (per user DB, version 1)

| Store | Key | Value |
|-------|-----|-------|
| `kv` | `vaultEnvelope` | Encrypted vault JSON |
| `kv` | `hasVault` | `true` if vault exists |
| `kv` | `settings` | Device prefs |
| `attachments` | attachment `id` | `{ id, iv, ciphertext }` |

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

1. [Google Cloud Console](https://console.cloud.google.com/) → enable **Google Drive API** (APIs & Services → Library).  
2. Create an OAuth 2.0 Client ID (Web application).  
3. **Authorized JavaScript origins:**  
   - `http://localhost:5173`  
   - `https://namitbansal.github.io`  
4. Add your Client ID using either:
   - Copy `public/config/google-oauth.example.json` → `public/config/google-oauth.json` and paste your Client ID, **or**
   - Set `DEFAULT_GOOGLE_CLIENT_ID` in `src/app/core/constants/google-oauth.config.ts`, **or**
   - Paste it in Account settings → Google OAuth Client ID (advanced).

After connecting Google, the app **verifies Drive access** by creating your encrypted folder (`Personal Vault / username`) before backup is enabled.

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
| `npm start` | Dev server on port **5173** |
| `npm run start:api` | Recovery API on port **3333** |
| `npm run build` | Production build → `dist/digital-space` |
| `npm run watch` | Dev build watch mode |
| `npm test` | Vitest unit tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run smoke` | Tests + production build |

---

## Testing

Vitest specs cover:

- `kdf.spec.ts` — extractable AES key (vault creation safety)  
- `username.spec.ts` — username validation rules  
- `drive-layout.util.spec.ts` — Drive folder path labels  
- `audit-display.spec.ts` — activity history profile labels  

CI (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on pushes/PRs to `main`.  
Deploy workflow runs tests before publishing to GitHub Pages.

---

## Deploy (GitHub Pages)

Production `baseHref` is `/digital_space/` (`angular.json`).

1. Push to `main` with GitHub Pages source = **GitHub Actions**.  
2. Workflow builds, tests, and deploys `dist/digital-space/browser`.  
3. SPA fallback: `404.html` copy of `index.html`.

---

## Static assets

Required under `public/`:

| Asset | Used by |
|-------|---------|
| `favicon.ico`, `icons/icon.svg` | Tab icon, PWA manifest |
| `icons/*.svg` | Shell topbar (history, account, logout) |
| `images/welcome-mobile.png`, `welcome-desktop.png` | Welcome screen hero |

Add welcome images to `public/images/` if the welcome hero does not appear.

---

## Security notes

- Use a strong, unique master password.  
- Lock the vault when leaving the device.  
- Clearing browser site data **deletes** the local vault.  
- Only encrypted blobs go to Google Drive.  
- Run recovery API only on trusted infrastructure; protect `OTP_SECRET` and SMTP credentials.  
- Do not commit `recovery-api/data/registry.json` or `.env` files with secrets.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Username always “taken” | Start recovery API: `npm run start:api` |
| Google connect fails | Set Client ID; check OAuth origins |
| Email PIN not received | Configure SMTP on recovery API |
| Search dropdown clipped | Hard refresh; topbar uses `overflow: visible` |
| Welcome image missing | Add PNGs to `public/images/` |

---

## License

Private project — see repository owner for terms.
