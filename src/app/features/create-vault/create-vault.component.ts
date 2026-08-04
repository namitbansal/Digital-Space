import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { googleErrorMessage } from '../../core/auth/google-errors';
import { GoogleDriveLinkService } from '../../core/auth/google-drive-link.service';
import {
  clearCreateVaultDraft,
  clearPendingGoogleOAuth,
  loadCreateVaultDraft,
  loadPendingGoogleOAuth,
  saveCreateVaultDraft,
} from '../../core/auth/google-oauth-redirect.util';
import { GoogleOAuthConfigService } from '../../core/auth/google-oauth-config.service';
import { APP_NAME } from '../../core/constants/app-name';
import { GOOGLE_ONBOARDING_HINTS } from '../../core/constants/google-setup-guide';
import { GuidanceId } from '../../core/constants/page-guidance';
import { SettingsService } from '../../core/storage/settings.service';
import { UserRegistryApiService } from '../../core/services/user-registry-api.service';
import { VaultService } from '../../core/services/vault.service';
import { USERNAME_FORMAT_HINT, USERNAME_TAKEN_MESSAGE, usernameError } from '../../core/utils/username';
import { describeDriveLayout } from '../../core/sync/drive-layout.util';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';
import { LoggerService } from '../../core/services/logger.util';

type StorageChoice = 'device' | 'google';
type CreateStep = 'form' | 'storage' | 'google' | 'recovery';

@Component({
  selector: 'app-create-vault',
  standalone: true,
  imports: [FormsModule, GuidancePanelComponent],
  templateUrl: './create-vault.component.html',
})
export class CreateVaultComponent {
  readonly appName = APP_NAME;
  readonly hints = GOOGLE_ONBOARDING_HINTS;
  readonly usernameFormatHint = USERNAME_FORMAT_HINT;
  readonly usernameTakenMessage = USERNAME_TAKEN_MESSAGE;
  googleConfigured = false;

  private readonly vault = inject(VaultService);
  private readonly registry = inject(UserRegistryApiService);
  private readonly googleLink = inject(GoogleDriveLinkService);
  private readonly oauthConfig = inject(GoogleOAuthConfigService);
  private readonly settings = inject(SettingsService);
  private readonly log = inject(LoggerService);

  @Output() created = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  step: CreateStep = 'form';
  storageChoice: StorageChoice = 'google';
  loginUsername = '';
  userName = '';
  password = '';
  confirm = '';
  recoveryCode = '';
  savedCode = false;
  usernameHint = '';
  usernameChecking = false;

  verifyPassword = '';
  identityEmail = '';
  identityId = '';
  syncToDrive = true;
  googleClientId = '';
  driveVerified = false;
  driveVerifyBusy = false;
  driveFolderId = '';

  error = '';
  busy = false;
  googleBusy = false;

  get guidanceId(): GuidanceId {
    if (this.step === 'recovery') return 'create-recovery';
    if (this.step === 'storage') return 'create-storage';
    if (this.step === 'google') return 'create-google';
    return 'create-form';
  }

  get wantsGoogleSync(): boolean {
    return this.storageChoice === 'google';
  }

  get resolvedGoogleClientId(): string {
    return this.googleClientId.trim();
  }

  get driveFolderPath(): string {
    return describeDriveLayout(this.appName, this.loginUsername);
  }

  get finishButtonLabel(): string {
    if (this.wantsGoogleSync && this.identityEmail) {
      return 'Finish and open vault with Drive backup';
    }
    return 'Finish and open vault';
  }

  async ngOnInit(): Promise<void> {
    await this.loadGoogleConfig();
    this.restoreCreateVaultDraft();
    await this.tryResumeGoogleFromRedirect();
  }

  private restoreCreateVaultDraft(): void {
    const draft = loadCreateVaultDraft();
    if (!draft) return;

    this.loginUsername = draft.loginUsername;
    this.userName = draft.userName;
    this.recoveryCode = draft.recoveryCode;
    this.storageChoice = draft.storageChoice;
    this.syncToDrive = draft.syncToDrive;
    if (this.step === 'form') {
      this.step = draft.storageChoice === 'google' ? 'google' : 'recovery';
    }
  }

  private persistCreateVaultDraft(): void {
    if (!this.loginUsername || !this.recoveryCode) {
      this.log.warn('CreateVaultComponent.persistCreateVaultDraft: skipped — missing username or recovery code');
      return;
    }
    saveCreateVaultDraft({
      loginUsername: this.loginUsername,
      userName: this.userName,
      recoveryCode: this.recoveryCode,
      storageChoice: this.storageChoice,
      syncToDrive: this.syncToDrive,
    });
  }

  private goToStep(step: CreateStep, reason: string): void {
    this.step = step;
  }

  private async tryResumeGoogleFromRedirect(): Promise<void> {
    const pending = loadPendingGoogleOAuth();
    if (!pending || pending.flow !== 'create-vault') {
      return;
    }

    this.storageChoice = 'google';
    this.step = 'google';

    if (pending.oauthError) {
      this.error = googleErrorMessage({ message: pending.oauthError });
      clearPendingGoogleOAuth();
      return;
    }

    if (!pending.accessToken) {
      return;
    }

    this.googleBusy = true;
    try {
      const result = await this.googleLink.consumeCreateVaultPending();
      if (result) {
        this.googleClientId = result.clientId;
        this.identityEmail = result.email;
        this.identityId = result.id;
        this.driveVerified = result.driveVerified;
        this.driveFolderId = result.folderId || '';
        this.goToStep('recovery', 'google oauth resume succeeded');
      }
    } catch (e) {
      this.error = googleErrorMessage(
        e,
        'Could not connect Google. Try again, or go back and choose this device only.',
      );
      this.log.error('CreateVaultComponent.tryResumeGoogleFromRedirect failed', e);
    } finally {
      this.googleBusy = false;
    }
  }

  private async loadGoogleConfig(): Promise<void> {
    const settings = await this.settings.load();
    this.googleClientId = await this.oauthConfig.resolve(settings.googleClientId);
    this.googleConfigured = Boolean(this.googleClientId);
  }

  async checkUsername(): Promise<void> {
    this.usernameHint = '';
    const err = usernameError(this.loginUsername);
    if (err) {
      this.usernameHint = err;
      return;
    }
    this.usernameChecking = true;
    try {
      const res = await this.registry.checkUsernameAvailable(this.loginUsername);
      this.usernameHint = res.available ? 'Username is available.' : USERNAME_TAKEN_MESSAGE;
    } catch {
      this.usernameHint = 'Could not check username (registry offline). You can still continue locally.';
    } finally {
      this.usernameChecking = false;
    }
  }

  async submit(): Promise<void> {
    this.error = '';
    const loginErr = usernameError(this.loginUsername);
    if (loginErr) {
      this.error = loginErr;
      this.log.warn('CreateVaultComponent.submit: invalid username', { loginErr });
      return;
    }
    const name = this.userName.trim();
    if (!name) {
      this.error = 'Please enter your display name.';
      this.log.warn('CreateVaultComponent.submit: missing display name');
      return;
    }
    if (this.password !== this.confirm) {
      this.error = 'Passwords do not match.';
      this.log.warn('CreateVaultComponent.submit: passwords do not match');
      return;
    }
    if (this.password.length < 8) {
      this.error = 'Use at least 8 characters for your Master Password.';
      this.log.warn('CreateVaultComponent.submit: password too short');
      return;
    }
    this.busy = true;
    try {
      try {
        const available = await this.registry.checkUsernameAvailable(this.loginUsername);
        if (!available.available) {
          this.error = USERNAME_TAKEN_MESSAGE;
          this.usernameHint = USERNAME_TAKEN_MESSAGE;
          this.log.warn('CreateVaultComponent.submit: username taken', { username: this.loginUsername });
          return;
        }
      } catch {
        this.usernameHint = 'Could not verify username (registry offline). Continuing locally.';
        this.log.warn('CreateVaultComponent.submit: registry offline — continuing locally');
      }
      const result = await this.vault.createVault(this.loginUsername, this.password, name);
      this.recoveryCode = result.recoveryCode;
      this.verifyPassword = this.password;
      this.password = '';
      this.confirm = '';
      this.persistCreateVaultDraft();
      this.goToStep('storage', 'vault created');
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'USERNAME_LOCAL_EXISTS') {
        this.error = 'This username already has a vault on this device.';
      } else {
        this.error = e instanceof Error ? e.message : 'Could not create vault.';
      }
      this.log.error('CreateVaultComponent.submit failed', { code, err: e });
    } finally {
      this.busy = false;
    }
  }

  continueFromStorage(): void {
    this.error = '';
    this.goToStep(this.wantsGoogleSync ? 'google' : 'recovery', 'storage choice confirmed');
  }

  continueFromGoogle(): void {
    this.error = '';
    this.goToStep('recovery', 'google step complete');
  }

  backFromGoogle(): void {
    this.error = '';
    this.goToStep('storage', 'back from google');
  }

  backFromStorage(): void {
    this.error = '';
    clearCreateVaultDraft();
    this.back.emit();
  }

  backFromRecovery(): void {
    this.error = '';
    this.goToStep(this.wantsGoogleSync ? 'google' : 'storage', 'back from recovery');
  }

  connectGoogle(): void {
    this.error = '';
    if (!this.resolvedGoogleClientId) {
      this.error = 'Google sign-in is not configured on this site.';
      this.log.warn('CreateVaultComponent.connectGoogle: no client ID');
      return;
    }

    this.driveVerified = false;
    this.driveFolderId = '';
    this.persistCreateVaultDraft();
    this.googleLink.startRedirectConnect({
      clientId: this.resolvedGoogleClientId,
      username: this.loginUsername,
      selectAccount: true,
      verifyDrive: true,
      persist: false,
      flow: 'create-vault',
    });
  }

  async verifyDriveAgain(): Promise<void> {
    if (!this.identityEmail || !this.resolvedGoogleClientId) {
      return;
    }
    this.error = '';
    this.driveVerifyBusy = true;
    try {
      const result = await this.googleLink.verifyDriveAccess(this.resolvedGoogleClientId, this.loginUsername);
      this.driveVerified = true;
      this.driveFolderId = result.folderId || '';
    } catch (e) {
      this.driveVerified = false;
      this.error = googleErrorMessage(e, this.hints.driveVerifyFailed);
      this.log.error('CreateVaultComponent.verifyDriveAgain failed', e);
    } finally {
      this.driveVerifyBusy = false;
    }
  }

  canContinueFromGoogle(): boolean {
    if (!this.identityEmail) return true;
    return this.driveVerified;
  }

  async finishSetup(): Promise<void> {
    if (!this.savedCode) {
      this.error = 'Please confirm you saved your recovery code.';
      this.log.warn('CreateVaultComponent.finishSetup: recovery code not confirmed');
      return;
    }
    await this.openVault();
  }

  async openVault(): Promise<void> {
    this.error = '';
    if (!this.verifyPassword) {
      this.error = 'Enter your master password to confirm.';
      this.log.warn('CreateVaultComponent.openVault: missing verify password');
      return;
    }
    if (!this.loginUsername) {
      this.error = 'Setup session expired. Go back and start again.';
      this.log.error('CreateVaultComponent.openVault: missing username');
      return;
    }
    if (!this.recoveryCode) {
      this.error = 'Recovery code is missing. Go back and restart setup.';
      this.log.error('CreateVaultComponent.openVault: missing recovery code');
      return;
    }

    this.busy = true;
    try {
      await this.vault.unlockVault(this.loginUsername, this.verifyPassword);

      if (this.wantsGoogleSync && this.identityEmail && this.identityId) {
        await this.vault.completeGoogleOnboarding({
          masterPassword: this.verifyPassword,
          recoveryCode: this.recoveryCode,
          googleClientId: this.resolvedGoogleClientId,
          identityEmail: this.identityEmail,
          identityId: this.identityId,
          driveUsesSameAccount: true,
          driveEmail: this.identityEmail,
          driveId: this.identityId,
          saveOnPhone: true,
          syncToDrive: this.syncToDrive,
          driveFolderId: this.driveFolderId,
          driveVerifiedAt: this.driveVerified ? new Date().toISOString() : null,
        });
      } else {
        await this.vault.completeDeviceOnlyOnboarding({
          masterPassword: this.verifyPassword,
          recoveryCode: this.recoveryCode,
        });
      }
      this.verifyPassword = '';
      clearCreateVaultDraft();
      this.log.info('Create-vault setup complete', {
        username: this.loginUsername,
        googleSync: this.wantsGoogleSync && Boolean(this.identityEmail),
      });
      this.created.emit();
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      const message = e instanceof Error ? e.message : '';
      if (code === 'WRONG_PASSWORD') {
        this.error = 'Master password is incorrect.';
      } else if (code === 'NO_GOOGLE_IDENTITY' || code === 'NO_DRIVE_ACCOUNT') {
        this.error = 'Google account is not connected. Go back and connect Google again.';
      } else if (message === 'LOCKED') {
        this.error = 'Could not unlock your vault. Check your master password and try again.';
      } else {
        this.error = 'Could not finish setup. Try again.';
      }
      this.log.error('CreateVaultComponent.openVault failed', { code, message, err: e });
    } finally {
      this.busy = false;
    }
  }
}
