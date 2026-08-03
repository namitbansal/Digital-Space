import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { googleErrorMessage } from '../../core/auth/google-errors';
import { GoogleDriveLinkService } from '../../core/auth/google-drive-link.service';
import {
  clearPendingGoogleOAuth,
  loadPendingGoogleOAuth,
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
import { LoggerService } from '../../core/services/logger.service';

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
    this.log.enter('CreateVaultComponent.ngOnInit');
    await this.loadGoogleConfig();
    await this.tryResumeGoogleFromRedirect();
    this.log.exit('CreateVaultComponent.ngOnInit', { step: this.step });
  }

  private async tryResumeGoogleFromRedirect(): Promise<void> {
    this.log.enter('CreateVaultComponent.tryResumeGoogleFromRedirect');
    const pending = loadPendingGoogleOAuth();
    if (!pending || pending.flow !== 'create-vault') {
      this.log.exit('CreateVaultComponent.tryResumeGoogleFromRedirect', { skipped: true });
      return;
    }

    this.storageChoice = 'google';
    this.step = 'google';

    if (pending.oauthError) {
      this.error = googleErrorMessage({ message: pending.oauthError });
      clearPendingGoogleOAuth();
      this.log.exit('CreateVaultComponent.tryResumeGoogleFromRedirect', { oauthError: pending.oauthError });
      return;
    }

    if (!pending.accessToken) {
      this.log.exit('CreateVaultComponent.tryResumeGoogleFromRedirect', { waitingForToken: true });
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
        this.log.step('Create-vault Google connect succeeded', {
          email: result.email,
          driveVerified: result.driveVerified,
        });
      }
      this.log.exit('CreateVaultComponent.tryResumeGoogleFromRedirect', { success: Boolean(result) });
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
    this.log.enter('CreateVaultComponent.loadGoogleConfig');
    const settings = await this.settings.load();
    this.googleClientId = await this.oauthConfig.resolve(settings.googleClientId);
    this.googleConfigured = Boolean(this.googleClientId);
    this.log.exit('CreateVaultComponent.loadGoogleConfig', { googleConfigured: this.googleConfigured });
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
      return;
    }
    const name = this.userName.trim();
    if (!name) {
      this.error = 'Please enter your display name.';
      return;
    }
    if (this.password !== this.confirm) {
      this.error = 'Passwords do not match.';
      return;
    }
    if (this.password.length < 8) {
      this.error = 'Use at least 8 characters for your Master Password.';
      return;
    }
    this.busy = true;
    try {
      try {
        const available = await this.registry.checkUsernameAvailable(this.loginUsername);
        if (!available.available) {
          this.error = USERNAME_TAKEN_MESSAGE;
          this.usernameHint = USERNAME_TAKEN_MESSAGE;
          return;
        }
      } catch {
        this.usernameHint = 'Could not verify username (registry offline). Continuing locally.';
      }
      const result = await this.vault.createVault(this.loginUsername, this.password, name);
      this.recoveryCode = result.recoveryCode;
      this.verifyPassword = this.password;
      this.password = '';
      this.confirm = '';
      this.step = 'storage';
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'USERNAME_LOCAL_EXISTS') {
        this.error = 'This username already has a vault on this device.';
      } else {
        this.error = e instanceof Error ? e.message : 'Could not create vault.';
      }
    } finally {
      this.busy = false;
    }
  }

  continueFromStorage(): void {
    this.error = '';
    this.step = this.wantsGoogleSync ? 'google' : 'recovery';
  }

  continueFromGoogle(): void {
    this.error = '';
    this.step = 'recovery';
  }

  backFromGoogle(): void {
    this.error = '';
    this.step = 'storage';
  }

  backFromStorage(): void {
    this.error = '';
    this.back.emit();
  }

  backFromRecovery(): void {
    this.error = '';
    this.step = this.wantsGoogleSync ? 'google' : 'storage';
  }

  connectGoogle(): void {
    this.log.enter('CreateVaultComponent.connectGoogle');
    this.error = '';
    if (!this.resolvedGoogleClientId) {
      this.error = 'Google sign-in is not configured on this site.';
      this.log.warn('CreateVaultComponent.connectGoogle: no client ID');
      return;
    }

    this.driveVerified = false;
    this.driveFolderId = '';
    this.log.step('Starting create-vault Google redirect', { username: this.loginUsername });
    this.googleLink.startRedirectConnect({
      clientId: this.resolvedGoogleClientId,
      username: this.loginUsername,
      selectAccount: true,
      verifyDrive: true,
      persist: false,
      flow: 'create-vault',
    });
    this.log.exit('CreateVaultComponent.connectGoogle');
  }

  async verifyDriveAgain(): Promise<void> {
    this.log.enter('CreateVaultComponent.verifyDriveAgain');
    if (!this.identityEmail || !this.resolvedGoogleClientId) {
      this.log.exit('CreateVaultComponent.verifyDriveAgain', { skipped: true });
      return;
    }
    this.error = '';
    this.driveVerifyBusy = true;
    try {
      const result = await this.googleLink.verifyDriveAccess(this.resolvedGoogleClientId, this.loginUsername);
      this.driveVerified = true;
      this.driveFolderId = result.folderId || '';
      this.log.exit('CreateVaultComponent.verifyDriveAgain', { driveVerified: true, folderId: this.driveFolderId });
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
      return;
    }
    await this.openVault();
  }

  async openVault(): Promise<void> {
    this.error = '';
    if (!this.verifyPassword) {
      this.error = 'Enter your master password to confirm.';
      return;
    }

    this.busy = true;
    try {
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
      this.created.emit();
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      this.error =
        code === 'WRONG_PASSWORD' ? 'Master password is incorrect.' : 'Could not finish setup. Try again.';
    } finally {
      this.busy = false;
    }
  }
}
