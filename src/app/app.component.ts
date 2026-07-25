import { Component, OnInit, inject } from '@angular/core';
import { CreateVaultComponent } from './features/create-vault/create-vault.component';
import { ShellComponent } from './features/shell/shell.component';
import { UnlockComponent } from './features/unlock/unlock.component';
import { ForgotPasswordComponent } from './features/forgot-password/forgot-password.component';
import { WelcomeComponent } from './features/welcome/welcome.component';
import { APP_NAME } from './core/constants/app-name';
import { SessionService } from './core/services/session.service';
import { ThemeService } from './core/services/theme.service';
import { VaultService } from './core/services/vault.service';
import { SyncService } from './core/sync/sync.service';
import { GoogleOAuthConfigService } from './core/auth/google-oauth-config.service';

type Screen = 'welcome' | 'create' | 'unlock' | 'forgot' | 'app';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [WelcomeComponent, CreateVaultComponent, UnlockComponent, ForgotPasswordComponent, ShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly vault = inject(VaultService);
  private readonly session = inject(SessionService);
  private readonly theme = inject(ThemeService);
  private readonly sync = inject(SyncService);
  private readonly oauthConfig = inject(GoogleOAuthConfigService);

  screen: Screen = 'welcome';
  hasVault = false;

  async ngOnInit(): Promise<void> {
    // document.title = APP_NAME;
    try {    
      this.theme.init();
      this.sync.init();
      void this.oauthConfig.preload();
      this.hasVault = await this.vault.hasAnyVault();
      this.screen = 'welcome';
    } catch (err) {
      console.error('App init failed', err);
      this.screen = 'welcome';
      this.hasVault = false;
    }
  }

  goWelcome(): void {
    this.screen = 'welcome';
  }
  goCreate(): void {
    this.screen = 'create';
  }
  goUnlock(): void {
    this.screen = 'unlock';
  }
  goForgot(): void {
    this.screen = 'forgot';
  }
  onReady(): void {
    this.hasVault = true;
    this.screen = 'app';
  }
  onLocked(): void {
    if (!this.session.isUnlocked()) {
      void this.vault.hasAnyVault().then((exists) => {
        this.hasVault = exists;
        this.screen = 'welcome';
      });
    }
  }
}
