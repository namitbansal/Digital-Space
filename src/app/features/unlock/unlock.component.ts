import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { APP_NAME } from '../../core/constants/app-name';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';
import { UserContextService } from '../../core/services/user-context.service';
import { VaultService } from '../../core/services/vault.service';

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

  @Output() unlocked = new EventEmitter<void>();
  @Output() forgot = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  username = '';
  password = '';
  knownUsernames: string[] = [];
  error = '';
  busy = false;

  ngOnInit(): void {
    this.knownUsernames = this.users.getKnownUsernames();
    this.username = this.users.getActiveUsername() || this.knownUsernames[0] || '';
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
      this.unlocked.emit();
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
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
