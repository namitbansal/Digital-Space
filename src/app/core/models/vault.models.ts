export interface VaultEnvelope {
  version: number;
  kdf: {
    algo: string;
    hash: string;
    iterations: number;
    salt: string;
  };
  cipher: {
    algo: string;
    iv: string;
    ciphertext: string;
  };
  /** Vault key sealed with the universal master recovery code — works even when locked. */
  masterRecovery?: VaultCodeRecoveryRecord;
}

export interface Profile {
  id: string;
  name: string;
  relationship: string;
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Folder {
  id: string;
  name: string;
  profileId: string;
  icon?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomField {
  label: string;
  value: string;
  secret?: boolean;
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt?: string;
}

/** Encrypted inside the vault blob — never stored in plaintext IndexedDB. */
export interface VaultSyncAccount {
  storageMode?: 'hybrid' | 'device' | 'drive';
  googleClientId?: string;
  /** Primary Google account — required for identity & password recovery. */
  googleIdentityEmail?: string;
  googleIdentityId?: string;
  /** When true, Drive backup uses the identity account below. */
  driveUsesSameGoogleAccount?: boolean;
  /** Google account used for encrypted Drive backup (may match identity). */
  googleAccountEmail?: string;
  googleAccountId?: string;
  googleOnboardingComplete?: boolean;
  driveFolderId?: string;
  /** Set after a successful Drive folder check (create or find). */
  driveVerifiedAt?: string | null;
  lastSyncedAt?: string | null;
}

export interface VaultItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  favorite?: boolean;
  tags?: string[];
  profileId: string;
  folderIds: string[];
  collectionIds?: string[];
  fields: Record<string, string>;
  customFields: CustomField[];
  attachments: AttachmentMeta[];
  attachmentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

export interface VaultData {
  meta: {
    name: string;
    username?: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
  };
  profiles: Profile[];
  activeProfileId: string;
  folders: Folder[];
  collections: unknown[];
  items: VaultItem[];
  tags: string[];
  auditLog: AuditEntry[];
  sync?: VaultSyncAccount;
}

/** Device-only preferences — no vault secrets. */
export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  vaultRevision: number;
  installedAt: string | null;
  /** Copy of Google OAuth client ID for password recovery when vault is locked. */
  googleClientId?: string;
  /** Primary Google email for email PIN recovery (readable while vault is locked). */
  recoveryEmail?: string;
  /** Per-screen guidance dismissed by the user (shown once). */
  guidanceDismissed?: Partial<Record<string, boolean>>;
  /** User chose to hide all first-time tips. */
  guidanceSkipAll?: boolean;
}

export interface EncryptedAttachmentRecord {
  id: string;
  iv: string;
  ciphertext: string;
}

/** Lets you reset the master password via the same Google account used for Drive backup. */
export interface VaultRecoveryRecord {
  version: 1;
  googleAccountId: string;
  createdAt: string;
  kdf: {
    algo: string;
    hash: string;
    iterations: number;
    salt: string;
  };
  cipher: {
    algo: string;
    iv: string;
    ciphertext: string;
  };
}

/** Recovery code backup — vault key encrypted with a user-saved code. */
export interface VaultCodeRecoveryRecord {
  version: 1;
  createdAt: string;
  kdf: {
    algo: string;
    hash: string;
    iterations: number;
    salt: string;
  };
  cipher: {
    algo: string;
    iv: string;
    ciphertext: string;
  };
}

/** Email recovery — vault key encrypted with the registered Google email. */
export interface VaultEmailRecoveryRecord extends VaultCodeRecoveryRecord {
  email: string;
}

/** Device storage: code record + code wrapped with vault key (refresh after password change). */
export interface VaultRecoveryBundle {
  codeRecord: VaultCodeRecoveryRecord;
  /** Sealed with the universal master backup recovery code. */
  masterCodeRecord?: VaultCodeRecoveryRecord;
  /** Sealed with the registered recovery email. */
  emailRecord?: VaultEmailRecoveryRecord;
  wrappedCode: { iv: string; ciphertext: string };
}

export interface FieldDef {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  monospaced?: boolean;
  options?: { value: string; label: string }[] | null;
}

export interface ItemTypeDef {
  id: string;
  label: string;
  icon: string;
  fields: FieldDef[];
}
