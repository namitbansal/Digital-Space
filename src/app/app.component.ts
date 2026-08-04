import { Component, OnInit, inject } from '@angular/core';
import { CreateVaultComponent } from './features/create-vault/create-vault.component';
import { ShellComponent } from './features/shell/shell.component';
import { UnlockComponent } from './features/unlock/unlock.component';
import { ForgotPasswordComponent } from './features/forgot-password/forgot-password.component';
import { WelcomeComponent } from './features/welcome/welcome.component';
import { SessionService } from './core/services/session.service';
import { ThemeService } from './core/services/theme.service';
import { VaultService } from './core/services/vault.service';
import { SyncService } from './core/sync/sync.service';
import { GoogleOAuthConfigService } from './core/auth/google-oauth-config.service';
import { loadPendingGoogleOAuth } from './core/auth/google-oauth-redirect.util';
import { LoggerService } from './core/services/logger.util';

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
  private readonly log = inject(LoggerService);

  screen: Screen = 'welcome';
  hasVault = false;

  async ngOnInit(): Promise<void> {
    try {
      this.theme.init();
      this.sync.init();
      void this.oauthConfig.preload();
      this.hasVault = await this.vault.hasAnyVault();
      const pendingGoogle = loadPendingGoogleOAuth();
      if (pendingGoogle?.flow === 'create-vault' && (pendingGoogle.accessToken || pendingGoogle.oauthError)) {
        this.screen = 'create';
        this.log.info('Resume create-vault after OAuth', {
          hasToken: Boolean(pendingGoogle.accessToken),
          hasError: Boolean(pendingGoogle.oauthError),
        });
      } else {
        this.screen = 'welcome';
      }
    } catch (err) {
      this.log.error('App init failed', err);
      this.screen = 'welcome';
      this.hasVault = false;
    }
  }

  goWelcome(): void {
    this.navigate('welcome');
  }
  goCreate(): void {
    this.navigate('create');
  }
  goUnlock(): void {
    this.navigate('unlock');
  }
  goForgot(): void {
    this.navigate('forgot');
  }
  onReady(): void {
    this.log.info('Vault ready — opening app');
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

  private navigate(screen: Screen): void {
    this.log.info(`Screen: ${screen}`, { from: this.screen });
    this.screen = screen;
  }
}
