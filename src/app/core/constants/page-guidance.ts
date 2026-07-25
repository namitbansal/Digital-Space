export type GuidanceId =
  | 'welcome'
  | 'create-form'
  | 'create-recovery'
  | 'create-storage'
  | 'create-google'
  | 'unlock'
  | 'forgot-password'
  | 'shell-dash'
  | 'shell-list'
  | 'shell-detail'
  | 'shell-editor'
  | 'account-settings';

export interface PageGuidanceContent {
  title: string;
  tips: string[];
}

export const PAGE_GUIDANCE: Record<GuidanceId, PageGuidanceContent> = {
  welcome: {
    title: 'Welcome',
    tips: [
      'Create a new vault if this is your first time, or unlock an existing vault on this device.',
      'Your data stays encrypted on your phone. Google Drive backup is optional but recommended.',
      'You will set a master password and recovery code. Google Drive backup is optional during setup.',
    ],
  },
  'create-form': {
    title: 'Create your vault',
    tips: [
      'Choose a strong master password — you need it every time you open the app.',
      'Write your name as you want it shown on your home dashboard.',
      'If you forget your master password later, you will need your recovery code or Google account.',
    ],
  },
  'create-recovery': {
    title: 'Save your recovery code',
    tips: [
      'This code lets you reset your master password if you forget it.',
      'Store it somewhere safe — a password manager, printed copy, or secure note.',
      'You will not see this code again unless you generate a new one in settings.',
    ],
  },
  'create-storage': {
    title: 'Storage choice',
    tips: [
      'Device only — everything stays on this phone or browser. Good if you do not need cloud backup.',
      'Device + Google Drive — encrypted backup for documents and your full vault. Recommended if you save files.',
      'You can switch or add Google sync later in Account settings → Storage & backup.',
    ],
  },
  'create-google': {
    title: 'Google Drive backup',
    tips: [
      'Connect Google to back up documents, attachments, and your full vault to Drive (all encrypted).',
      'Without Google, everything still works on this device — but nothing is copied to the cloud.',
      'You can link Google later from Account settings if you skip this step.',
    ],
  },
  unlock: {
    title: 'Unlock your vault',
    tips: [
      'Enter the master password you chose when creating the vault.',
      'Use Forgot master password if you cannot remember it — you need your recovery email PIN or recovery code.',
      'Lock the vault from the top bar when you are done to keep data private.',
    ],
  },
  'forgot-password': {
    title: 'Reset master password',
    tips: [
      'Email PIN sends a 6-digit code to the email you linked when creating your vault.',
      'Recovery code works offline — enter the code you saved when creating the vault.',
      'Without a recovery option set up earlier, your data cannot be recovered.',
    ],
  },
  'shell-dash': {
    title: 'Home dashboard',
    tips: [
      'Switch profiles at the top to manage family members separately.',
      'Tap a category card to browse passwords, cards, documents, and more.',
      'Use Add item to save something new, or Search to find items quickly.',
    ],
  },
  'shell-list': {
    title: 'Item list',
    tips: [
      'Tap an item to view full details on the right (or below on mobile).',
      'Use Search to filter by title within the current category.',
      'Press Back to return to the home dashboard.',
    ],
  },
  'shell-detail': {
    title: 'Item details',
    tips: [
      'Tap Edit to change fields, add custom data, or attach documents.',
      'Favorites and tags help you find important items faster.',
      'Delete removes the item permanently — there is no undo.',
    ],
  },
  'shell-editor': {
    title: 'Add or edit item',
    tips: [
      'Pick a type (password, bank card, document, etc.) — fields change per type.',
      'Custom fields let you store extra labels and secret values.',
      'Attach files for IDs, certificates, or scans — they are encrypted like everything else.',
    ],
  },
  'account-settings': {
    title: 'Account settings',
    tips: [
      'Change your master password, regenerate a recovery code, or manage Google accounts here.',
      'Hybrid storage keeps a copy on this device and syncs encrypted backups to Google Drive.',
      'Use Sync now after big changes, or Pull from Drive to restore on a new device.',
    ],
  },
};

export const ALL_GUIDANCE_IDS = Object.keys(PAGE_GUIDANCE) as GuidanceId[];
