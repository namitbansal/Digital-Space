import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { APP_NAME } from '../../core/constants/app-name';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';
import { EmailRecoveryApiService } from '../../core/services/email-recovery-api.service';
import { UserContextService } from '../../core/services/user-context.service';
import { VaultService } from '../../core/services/vault.service';
import { usernameError } from '../../core/utils/username';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, GuidancePanelComponent],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent implements OnInit {
  readonly appName = APP_NAME;
  private readonly vault = inject(VaultService);
  private readonly emailRecoveryApi = inject(EmailRecoveryApiService);
  private readonly users = inject(UserContextService);

  @Output() reset = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  mode: 'email' | 'code' = 'email';
  username = '';
  recoveryEmail = '';
  recoveryCode = '';
  emailPin = '';
  pinSent = false;
  pinHint = '';
  newPassword = '';
  confirmPassword = '';
  error = '';
  success = '';
  busy = false;
  pinBusy = false;

  async ngOnInit(): Promise<void> {
    this.username = this.users.getActiveUsername() || this.users.getKnownUsernames()[0] || '';
    if (this.username) {
      await this.loadRegistryHints();
    }
  }

  async loadRegistryHints(): Promise<void> {
    const err = usernameError(this.username);
    if (err) return;
    try {
      const profile = await this.vault.lookupUserProfile(this.username);
      if (profile.recoveryEmail && !this.recoveryEmail) {
        this.recoveryEmail = profile.recoveryEmail;
      }
    } catch {
      /* registry offline — user can enter email manually */
    }
  }

  private prepareUserScope(): void {
    const err = usernameError(this.username);
    if (err) throw Object.assign(new Error(err), { code: 'USERNAME_INVALID' });
    this.vault.prepareRecoveryForUser(this.username);
  }

  async sendEmailPin(): Promise<void> {
    this.error = '';
    this.pinHint = '';
    const email = this.recoveryEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      this.error = 'No recovery email on file. Set up your account with a linked email first.';
      return;
    }

    this.pinBusy = true;
    try {
      const res = await this.emailRecoveryApi.sendPin(email);
      this.pinSent = true;
      this.pinHint = res.devPin
        ? `Dev mode: your code is ${res.devPin} (also printed in recovery-api console).`
        : `A 6-digit code was sent to ${email}. It expires in ${Math.round(res.expiresInSeconds / 60)} minutes.`;
    } catch {
      this.error =
        'Could not send recovery email. Start the recovery API (npm run start:api) and check SMTP settings.';
    } finally {
      this.pinBusy = false;
    }
  }

  async submit(): Promise<void> {
    this.error = '';
    this.success = '';
    if (!this.newPassword || this.newPassword.length < 8) {
      this.error = 'New password must be at least 8 characters.';
      return;
    }
    if (!this.username.trim()) {
      this.error = 'Enter your username.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }
    if (this.mode === 'code' && !this.recoveryCode.trim()) {
      this.error = 'Enter your recovery code.';
      return;
    }
    if (this.mode === 'email') {
      if (!this.recoveryEmail.trim()) {
        this.error = 'No recovery email on file. Set up your account with a linked email first.';
        return;
      }
      if (!this.pinSent) {
        this.error = 'Send the 6-digit code to your email first.';
        return;
      }
      const pin = this.emailPin.replace(/\D/g, '');
      if (pin.length !== 6) {
        this.error = 'Enter the 6-digit code from your email.';
        return;
      }
    }

    this.busy = true;
    try {
      this.prepareUserScope();
      if (this.mode === 'email') {
        const email = this.recoveryEmail.trim().toLowerCase();
        const pin = this.emailPin.replace(/\D/g, '');
        await this.emailRecoveryApi.verifyPin(email, pin);
        await this.vault.resetMasterPasswordViaEmail(email, this.newPassword);
      } else {
        await this.vault.resetMasterPasswordViaCode(this.recoveryCode, this.newPassword);
      }

      this.newPassword = '';
      this.confirmPassword = '';
      this.recoveryCode = '';
      this.emailPin = '';
      this.success = 'Master password updated. Opening your vault…';
      this.reset.emit();
    } catch (err) {
      const httpError = (err as { error?: { error?: string } })?.error?.error;
      const code = httpError || (err as Error & { code?: string }).code;
      if (code === 'INVALID_RECOVERY_CODE' || code === 'CODE_RECOVERY_NOT_FOUND') {
        this.error = 'Recovery code is incorrect or no recovery file exists on this device.';
      } else if (code === 'MASTER_RECOVERY_NOT_FOUND') {
        this.error =
          'Universal backup recovery is not set up for this vault yet. Unlock once with your password or use email/personal recovery, then the universal code will work.';
      } else if (code === 'EMAIL_RECOVERY_NOT_FOUND') {
        this.error =
          'Email recovery is not set up yet. Unlock once with your password (email must be linked), then try again.';
      } else if (code === 'PIN_WRONG' || code === 'PIN_EXPIRED' || code === 'PIN_LOCKED') {
        this.error =
          code === 'PIN_EXPIRED'
            ? 'That code expired. Send a new 6-digit code.'
            : code === 'PIN_LOCKED'
              ? 'Too many wrong attempts. Send a new code.'
              : 'Incorrect 6-digit code. Check your email and try again.';
      } else if (code === 'USERNAME_INVALID') {
        this.error = 'Username is invalid.';
      } else {
        this.error = 'Could not reset password. Check your details and try again.';
      }
    } finally {
      this.busy = false;
    }
  }
}
