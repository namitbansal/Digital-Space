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
import { LoggerService } from './core/services/logger.service';

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
    this.log.enter('AppComponent.ngOnInit');
    try {
      this.theme.init();
      this.sync.init();
      void this.oauthConfig.preload();
      this.hasVault = await this.vault.hasAnyVault();
      const pendingGoogle = loadPendingGoogleOAuth();
      if (pendingGoogle?.flow === 'create-vault' && (pendingGoogle.accessToken || pendingGoogle.oauthError)) {
        this.log.step('Routing to create-vault to resume Google OAuth', {
          hasToken: Boolean(pendingGoogle.accessToken),
          hasError: Boolean(pendingGoogle.oauthError),
        });
        this.screen = 'create';
      } else {
        this.screen = 'welcome';
      }
      this.log.exit('AppComponent.ngOnInit', { screen: this.screen, hasVault: this.hasVault });
    } catch (err) {
      this.log.error('App init failed', err);
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
