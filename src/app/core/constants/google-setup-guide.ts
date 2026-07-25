/** Shown in Account settings (advanced) — how to get a Google OAuth Client ID. */
export const GOOGLE_CLIENT_ID_STEPS = [
  'Open Google Cloud Console → APIs & Services → Credentials.',
  'Enable the Google Drive API for your project (APIs & Services → Library).',
  'Create an OAuth client ID (type: Web application).',
  'Add authorized JavaScript origins: http://localhost:5173 and your live app URL.',
  'Paste the Client ID in public/config/google-oauth.json (copy from google-oauth.example.json), or set DEFAULT_GOOGLE_CLIENT_ID in google-oauth.config.ts.',
] as const;

export const GOOGLE_ONBOARDING_HINTS = {
  optional:
    'Recommended if you save documents or want your vault on more than one device. Everything is encrypted before it leaves your phone.',
  connect:
    'One click to sign in with Google. Your passwords, documents, and attachments are backed up to Drive as encrypted files — not readable by Google.',
  driveDocuments:
    'We create a folder on your Google Drive (e.g. Personal Vault / your_username), then upload only encrypted files — vault.enc, document attachments, and recovery backups.',
  deviceOnly:
    'Your vault stays on this phone or browser only. Documents and attachments are not copied to the cloud.',
  deviceOnlyLater:
    'You can turn on Google Drive sync anytime later in Account settings → Storage & backup.',
  storageChoiceTitle: 'Choose where to keep your vault',
  storageChoiceSub:
    'Pick what fits you now. You can change this later in Account settings → Storage & backup.',
  storageDevice:
    'This device only — passwords and documents stay here. Works fully offline. No Google account needed.',
  storageGoogle:
    'This device + Google Drive (recommended) — encrypted backup of your vault, documents, and attachments. Sync across devices.',
  identity:
    'Used for encrypted Drive backup and email recovery if you forget your master password.',
  sameDrive:
    'Recommended — one Google account for identity and encrypted Drive backup.',
  differentDrive:
    'Use a separate Google account only for storing encrypted backups.',
  driveVerified:
    'We create your encrypted folder on Google Drive and confirm read/write access before continuing.',
  driveVerifiedOk: 'Drive verified — your encrypted backup folder is ready.',
  driveVerifyFailed: 'Could not verify Drive access. Enable the Google Drive API and try again.',
  password:
    'Re-enter your master password to finish setup.',
} as const;
