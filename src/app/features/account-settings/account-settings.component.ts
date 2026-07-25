import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GoogleAccountService } from '../../core/auth/google-account.service';
import { googleErrorMessage } from '../../core/auth/google-errors';
import { GoogleDriveLinkService } from '../../core/auth/google-drive-link.service';
import { GoogleOAuthConfigService } from '../../core/auth/google-oauth-config.service';
import { APP_NAME } from '../../core/constants/app-name';
import { APP_VERSION_LABEL } from '../../core/constants/app-version';
import { hasBuiltInGoogleClientId } from '../../core/constants/google-oauth.config';
import { GOOGLE_CLIENT_ID_STEPS, GOOGLE_ONBOARDING_HINTS } from '../../core/constants/google-setup-guide';
import { VaultSyncAccount } from '../../core/models/vault.models';
import { SyncService } from '../../core/sync/sync.service';
import { VaultService } from '../../core/services/vault.service';
import { describeDriveLayout } from '../../core/sync/drive-layout.util';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';
import { GuidanceService } from '../../core/services/guidance.service';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [FormsModule, IconComponent, GuidancePanelComponent],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.css',
})
export class AccountSettingsComponent implements OnChanges {
  private readonly vault = inject(VaultService);
  private readonly googleAccount = inject(GoogleAccountService);
  private readonly googleLink = inject(GoogleDriveLinkService);
  private readonly oauthConfig = inject(GoogleOAuthConfigService);
  private readonly guidance = inject(GuidanceService);
  readonly sync = inject(SyncService);
  readonly appName = APP_NAME;
  readonly appVersionLabel = APP_VERSION_LABEL;
  readonly clientIdSteps = GOOGLE_CLIENT_ID_STEPS;
  readonly hints = GOOGLE_ONBOARDING_HINTS;
  readonly googleBuiltIn = hasBuiltInGoogleClientId();

  @Input() open = false;
  @Input() focusSection: 'password' | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  ownerName = '';
  ownerError = '';
  ownerSuccess = '';
  ownerBusy = false;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordSuccess = '';
  passwordBusy = false;

  googleAccountEmail = '';
  googleIdentityEmail = '';
  driveUsesSameAccount = true;
  googleClientId = '';
  storageMode: VaultSyncAccount['storageMode'] = 'device';
  syncError = '';
  syncSuccess = '';
  syncBusy = false;
  googleError = '';
  googleSuccess = '';
  googleBusy = false;
  driveVerifiedAt: string | null = null;
  driveVerifyBusy = false;

  regenPassword = '';
  recoveryCodeBusy = false;
  recoveryCodeError = '';
  recoveryCodeSuccess = '';
  newRecoveryCode = '';
  codeRecoveryReady = false;
  showGoogleConfirm = false;
  googleConfirmTitle = '';
  googleConfirmMessage = '';
  guidanceResetSuccess = '';
  private googleConfirmAction: (() => void | Promise<void>) | null = null;

  ngOnChanges(): void {
    if (this.open) {
      this.load();
      if (this.focusSection === 'password') {
        queueMicrotask(() => {
          document.getElementById('settings-recovery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  }

  load(): void {
    this.ownerError = '';
    this.ownerSuccess = '';
    this.passwordError = '';
    this.passwordSuccess = '';
    this.googleError = '';
    this.googleSuccess = '';
    this.guidanceResetSuccess = '';
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.ownerName = this.vault.getSelfProfile()?.name || '';
    const sync = this.googleAccount.getAccount();
    this.googleIdentityEmail = sync.googleIdentityEmail || sync.googleAccountEmail || '';
    this.googleAccountEmail = sync.googleAccountEmail || '';
    this.driveUsesSameAccount = sync.driveUsesSameGoogleAccount !== false;
    this.driveVerifiedAt = sync.driveVerifiedAt ?? null;
    this.storageMode = sync.storageMode || 'device';
    this.sync.refreshStatusMessage();
    void this.resolveClientId(sync.googleClientId);
    void this.vault.hasCodeRecovery().then((ready) => {
      this.codeRecoveryReady = ready;
    });
  }

  get vaultUsername(): string {
    return this.vault.getVault()?.meta.username || '';
  }

  get driveFolderPath(): string {
    return describeDriveLayout(this.appName, this.vaultUsername);
  }

  get driveIsVerified(): boolean {
    return Boolean(this.driveVerifiedAt);
  }

  private async resolveClientId(preferred?: string): Promise<void> {
    this.googleClientId = await this.oauthConfig.resolve(preferred);
  }

  async resetGuidanceTips(): Promise<void> {
    this.guidanceResetSuccess = '';
    await this.guidance.resetAll();
    this.guidanceResetSuccess = 'Tips will show again on each screen. Close settings and navigate to see them.';
  }

  close(): void {
    this.closed.emit();
  }

  async saveOwnerName(): Promise<void> {
    this.ownerError = '';
    this.ownerSuccess = '';
    if (!this.ownerName.trim()) {
      this.ownerError = 'Name is required';
      return;
    }
    this.ownerBusy = true;
    try {
      await this.vault.updateOwnerName(this.ownerName);
      this.ownerSuccess = 'Your name was updated.';
      this.updated.emit();
    } catch {
      this.ownerError = 'Could not update your name. Try again.';
    } finally {
      this.ownerBusy = false;
    }
  }

  async regenerateRecoveryCode(): Promise<void> {
    this.recoveryCodeError = '';
    this.recoveryCodeSuccess = '';
    this.newRecoveryCode = '';
    if (!this.regenPassword) {
      this.recoveryCodeError = 'Enter your current master password.';
      return;
    }
    this.recoveryCodeBusy = true;
    try {
      this.newRecoveryCode = await this.vault.regenerateRecoveryCode(this.regenPassword);
      this.recoveryCodeSuccess = 'New recovery code generated. Save it now.';
      this.codeRecoveryReady = true;
      this.regenPassword = '';
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      this.recoveryCodeError =
        code === 'WRONG_PASSWORD' ? 'Current master password is incorrect.' : 'Could not generate a new recovery code.';
    } finally {
      this.recoveryCodeBusy = false;
    }
  }

  async saveMasterPassword(): Promise<void> {
    this.passwordError = '';
    this.passwordSuccess = '';
    if (!this.currentPassword) {
      this.passwordError = 'Enter your current master password.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordError = 'New password must be at least 8 characters.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New passwords do not match.';
      return;
    }
    this.passwordBusy = true;
    try {
      await this.vault.changeMasterPassword(this.currentPassword, this.newPassword);
      this.passwordSuccess = 'Master password updated.';
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      this.passwordError =
        code === 'WRONG_PASSWORD' ? 'Current master password is incorrect.' : 'Could not change password. Try again.';
    } finally {
      this.passwordBusy = false;
    }
  }

  async saveStorageMode(): Promise<void> {
    this.syncError = '';
    this.syncSuccess = '';
    try {
      await this.vault.updateSyncAccount({ storageMode: this.storageMode });
      this.sync.refreshStatusMessage();
      this.syncSuccess =
        this.storageMode === 'device'
          ? 'Phone only — data stays on this device.'
          : 'Google Drive backup enabled. Syncs when online.';
      if (this.storageMode !== 'device') void this.sync.pushSync();
    } catch {
      this.syncError = 'Could not save storage preference.';
    }
  }

  async syncNow(): Promise<void> {
    this.syncBusy = true;
    this.syncError = '';
    this.syncSuccess = '';
    try {
      const result = await this.sync.pushSync();
      if (result.ok) {
        this.syncSuccess = 'Synced to Google Drive.';
      } else if (result.reason === 'OFFLINE') {
        this.syncError = 'You are offline. Changes are saved on this device.';
      } else if (result.reason === 'CONFLICT') {
        this.syncError = this.sync.syncState().message;
      } else if (result.reason === 'NO_GOOGLE') {
        this.syncError = 'Connect your Google account first.';
      } else {
        this.syncError = 'Sync failed. Your data is safe on this device.';
      }
    } finally {
      this.syncBusy = false;
    }
  }

  async pullFromDrive(): Promise<void> {
    this.syncBusy = true;
    this.syncError = '';
    this.syncSuccess = '';
    try {
      const result = await this.sync.pullSync(false);
      if (result.ok && result.imported) {
        this.syncSuccess = 'Downloaded from Google Drive. Lock and unlock to load.';
      } else if (result.ok) {
        this.syncSuccess = 'No backup found on Google Drive yet.';
      } else if (result.reason === 'CONFLICT') {
        this.syncError = this.sync.syncState().message;
      } else {
        this.syncError = 'Could not download from Google Drive.';
      }
    } finally {
      this.syncBusy = false;
    }
  }

  async connectGoogle(): Promise<void> {
    await this.connectIdentityGoogle();
  }

  async connectIdentityGoogle(): Promise<void> {
    this.googleError = '';
    this.googleSuccess = '';
    this.googleBusy = true;
    try {
      const clientId = await this.oauthConfig.resolve(this.googleClientId);
      if (clientId) {
        await this.googleAccount.saveClientId(clientId);
        this.googleClientId = clientId;
      }
      const verifyDrive = this.storageMode !== 'device';
      const result = await this.googleLink.connectAndVerify({
        clientId,
        username: this.vaultUsername,
        selectAccount: true,
        verifyDrive,
      });
      this.googleIdentityEmail = result.email;
      await this.vault.syncRecoveryEmail(result.email);
      const syncPatch: Partial<VaultSyncAccount> = {
        googleClientId: result.clientId,
        googleIdentityEmail: result.email,
        googleIdentityId: result.id,
        googleOnboardingComplete: true,
      };
      if (this.driveUsesSameAccount) {
        this.googleAccountEmail = result.email;
        syncPatch.googleAccountEmail = result.email;
        syncPatch.googleAccountId = result.id;
        syncPatch.driveUsesSameGoogleAccount = true;
      }
      if (result.driveVerified) {
        syncPatch.driveVerifiedAt = result.verifiedAt ?? null;
        syncPatch.driveFolderId = result.folderId ?? '';
        this.driveVerifiedAt = syncPatch.driveVerifiedAt ?? null;
      }
      await this.vault.updateSyncAccount(syncPatch);
      void this.vault.uploadRecoveryIfPossible();
      this.googleSuccess = result.driveVerified
        ? `Primary account connected and Drive verified (${result.email}).`
        : `Primary account connected as ${result.email}.`;
      this.updated.emit();
    } catch (e) {
      this.googleError = googleErrorMessage(e, 'Could not connect Google account. Try again.');
    } finally {
      this.googleBusy = false;
    }
  }

  async connectDriveGoogle(): Promise<void> {
    this.googleError = '';
    this.googleSuccess = '';
    this.googleBusy = true;
    try {
      const clientId = await this.oauthConfig.resolve(this.googleClientId);
      if (clientId) {
        await this.googleAccount.saveClientId(clientId);
        this.googleClientId = clientId;
      }
      this.googleAccount.clearAuth();
      const result = await this.googleLink.connectAndVerify({
        clientId,
        username: this.vaultUsername,
        selectAccount: true,
        verifyDrive: true,
      });
      this.googleAccountEmail = result.email;
      await this.vault.updateSyncAccount({
        googleClientId: result.clientId,
        googleAccountEmail: result.email,
        googleAccountId: result.id,
        driveUsesSameGoogleAccount: false,
        driveVerifiedAt: result.verifiedAt ?? null,
        driveFolderId: result.folderId ?? '',
      });
      this.driveVerifiedAt = result.verifiedAt ?? null;
      void this.vault.uploadRecoveryIfPossible();
      void this.sync.pushSync();
      this.googleSuccess = `Drive backup connected and verified (${result.email}).`;
      this.updated.emit();
    } catch (e) {
      this.googleError = googleErrorMessage(e, 'Could not connect the Drive Google account. Try again.');
    } finally {
      this.googleBusy = false;
    }
  }

  async verifyDriveAccess(): Promise<void> {
    this.googleError = '';
    this.googleSuccess = '';
    this.driveVerifyBusy = true;
    try {
      const clientId = await this.oauthConfig.resolve(this.googleClientId);
      const result = await this.googleLink.verifyDriveAccess(clientId, this.vaultUsername);
      await this.vault.updateSyncAccount({
        driveVerifiedAt: result.verifiedAt ?? null,
        driveFolderId: result.folderId ?? '',
      });
      this.driveVerifiedAt = result.verifiedAt ?? null;
      this.googleSuccess = `Drive verified — folder ready at ${result.folderPath}.`;
    } catch (e) {
      this.googleError = googleErrorMessage(e, this.hints.driveVerifyFailed);
    } finally {
      this.driveVerifyBusy = false;
    }
  }

  changeGoogleAccount(): void {
    this.openGoogleConfirm(
      'Change Drive backup account?',
      'Pick a different Google account for encrypted Drive backup. Your primary account stays used for recovery.',
      async () => {
        await this.connectDriveGoogle();
      },
    );
  }

  changeIdentityGoogleAccount(): void {
    this.openGoogleConfirm(
      'Change primary Google account?',
      'Your primary account is used for password recovery. Changing it requires syncing recovery again.',
      async () => {
        await this.connectIdentityGoogle();
      },
    );
  }

  disconnectGoogleAccount(): void {
    this.openGoogleConfirm(
      'Disconnect Google accounts?',
      `Remove Google from ${APP_NAME}? Drive backup and Google password recovery will stop working until you link accounts again.`,
      async () => {
        await this.googleAccount.disconnect();
        this.googleAccountEmail = '';
        this.googleIdentityEmail = '';
        this.driveVerifiedAt = null;
        this.googleSuccess = 'Google accounts disconnected.';
        this.googleError = '';
        this.updated.emit();
      },
    );
  }

  private openGoogleConfirm(title: string, message: string, action: () => void | Promise<void>): void {
    this.googleConfirmTitle = title;
    this.googleConfirmMessage = message;
    this.googleConfirmAction = action;
    this.showGoogleConfirm = true;
  }

  closeGoogleConfirm(): void {
    this.showGoogleConfirm = false;
    this.googleConfirmAction = null;
  }

  confirmGoogleAction(): void {
    const action = this.googleConfirmAction;
    this.closeGoogleConfirm();
    if (action) void action();
  }
}
