import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { captureGoogleOAuthRedirectFromUrl } from './app/core/auth/google-oauth-redirect.util';
import { AppLogger } from './app/core/services/logger.util';

captureGoogleOAuthRedirectFromUrl();

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  AppLogger.error('App bootstrap failed', err);
  console.error(err);
});
