export interface UserRegistryRecord {
  username: string;
  displayName?: string;
  recoveryEmail?: string;
  googleClientId?: string;
  driveFolderId?: string;
  driveAccountEmail?: string;
  googleIdentityEmail?: string;
  hasRecoveryCode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterUserInput {
  username: string;
  password: string;
  recoveryCode: string;
  displayName?: string;
  recoveryEmail?: string;
  googleClientId?: string;
  driveFolderId?: string;
  driveAccountEmail?: string;
  googleIdentityEmail?: string;
}

export interface UpdateUserRegistryInput {
  recoveryEmail?: string;
  googleClientId?: string;
  driveFolderId?: string;
  driveAccountEmail?: string;
  googleIdentityEmail?: string;
  recoveryCode?: string;
  password?: string;
}
