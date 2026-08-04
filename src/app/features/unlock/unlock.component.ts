import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { APP_NAME } from '../../core/constants/app-name';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';
import { UserContextService } from '../../core/services/user-context.service';
import { VaultService } from '../../core/services/vault.service';
import { hasPendingGoogleOAuthWithToken } from '../../core/auth/google-oauth-redirect.util';
import { LoggerService } from '../../core/services/logger.util';

@Component({
  selector: 'app-unlock',
  standalone: true,
  imports: [FormsModule, GuidancePanelComponent],
  templateUrl: './unlock.component.html',
})
export class UnlockComponent implements OnInit {
  readonly appName = APP_NAME;
  private readonly vault = inject(VaultService);
  private readonly users = inject(UserContextService);
  private readonly log = inject(LoggerService);

  @Output() unlocked = new EventEmitter<void>();
  @Output() forgot = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  username = '';
  password = '';
  error = '';
  busy = false;
  oauthResumeHint = '';

  ngOnInit(): void {
    this.username = this.users.getActiveUsername() || this.users.getKnownUsernames()[0] || '';
    if (hasPendingGoogleOAuthWithToken()) {
      this.oauthResumeHint = 'Unlock your vault to finish connecting Google.';
    }
  }

  async submit(): Promise<void> {
    this.error = '';
    if (!this.username.trim()) {
      this.error = 'Enter your username.';
      return;
    }
    this.busy = true;
    try {
      await this.vault.unlockVault(this.username, this.password);
      this.password = '';
      this.log.info('Unlock successful', { username: this.username });
      this.unlocked.emit();
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      this.log.error('UnlockComponent.submit failed', { code, err });
      if (code === 'NO_VAULT') {
        this.error = 'No vault found for this username on this device. Try another username or create a new vault.';
      } else if (code === 'USERNAME_INVALID') {
        this.error = 'Username is invalid. Use lowercase letters, numbers, and underscore.';
      } else {
        this.error = `We couldn't unlock ${APP_NAME}. Check your username and master password.`;
      }
    } finally {
      this.busy = false;
    }
  }
}
