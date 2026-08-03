import { Injectable, inject } from '@angular/core';
import { describeDriveLayout } from '../sync/drive-layout.util';
import { DriveApiService } from '../sync/drive-api.service';
import { APP_NAME } from '../constants/app-name';
import { nowIso } from '../utils/id';
import { GoogleAccountService } from './google-account.service';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { googleErrorMessage } from './google-errors';
import {
  clearPendingGoogleOAuth,
  loadPendingGoogleOAuth,
  startGoogleOAuthRedirect,
  stashGoogleOAuthUiMessage,
} from './google-oauth-redirect.util';
import { VaultService } from '../services/vault.service';
import { SyncService } from '../sync/sync.service';
import { VaultSyncAccount } from '../models/vault.models';
import { LoggerService } from '../services/logger.service';

export interface GoogleDriveLinkResult {
  email: string;
  id: string;
  clientId: string;
  driveVerified: boolean;
  folderPath?: string;
  folderId?: string;
  verifiedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleDriveLinkService {
  private readonly log = inject(LoggerService);
  private readonly google = inject(GoogleAccountService);
  private readonly drive = inject(DriveApiService);
  private readonly oauth = inject(GoogleOAuthConfigService);
  private readonly vault = inject(VaultService);
  private readonly sync = inject(SyncService);

  /** Same-tab Google sign-in — avoids popup / gsi/transform issues. */
  startRedirectConnect(options: {
    clientId: string;
    username?: string;
    persist?: boolean;
    selectAccount?: boolean;
    verifyDrive?: boolean;
    flow: 'account-identity' | 'account-drive' | 'create-vault';
    openSettings?: boolean;
  }): void {
    this.log.enter('startRedirectConnect', options);
    const clientId = options.clientId.trim();
    if (!clientId) {
      this.log.error('startRedirectConnect: missing client ID');
      throw new Error('NO_CLIENT_ID');
    }
    this.log.step('Starting same-tab Google OAuth redirect');
    startGoogleOAuthRedirect({
      clientId,
      username: options.username,
      verifyDrive: options.verifyDrive !== false,
      persist: options.persist !== false,
      selectAccount: options.selectAccount !== false,
      flow: options.flow,
      openSettings: options.openSettings,
    });
    this.log.exit('startRedirectConnect');
  }

  async resumePendingConnect(): Promise<{
    openSettings: boolean;
    success?: string;
    error?: string;
    resumeCreateVault?: boolean;
  } | null> {
    this.log.enter('resumePendingConnect');
    const pending = loadPendingGoogleOAuth();
    if (!pending) {
      this.log.step('No pending OAuth to resume');
      this.log.exit('resumePendingConnect', null);
      return null;
    }

    this.log.step('Found pending OAuth', {
      flow: pending.flow,
      hasToken: Boolean(pending.accessToken),
      hasError: Boolean(pending.oauthError),
      openSettings: pending.openSettings,
    });

    if (pending.flow === 'create-vault') {
      if (!pending.accessToken && !pending.oauthError) {
        this.log.step('Create-vault flow waiting for token');
        this.log.exit('resumePendingConnect', null);
        return null;
      }
      const result = {
        openSettings: false,
        resumeCreateVault: Boolean(pending.accessToken && !pending.oauthError),
      };
      this.log.exit('resumePendingConnect', result);
      return result;
    }

    if (pending.oauthError) {
      const error = googleErrorMessage({ message: pending.oauthError });
      const openSettings = Boolean(pending.openSettings);
      this.log.error('Pending OAuth has error', { error, openSettings });
      clearPendingGoogleOAuth();
      stashGoogleOAuthUiMessage(undefined, error);
      const result = { openSettings, error };
      this.log.exit('resumePendingConnect', result);
      return result;
    }

    if (!pending.accessToken) {
      this.log.step('Pending OAuth has no access token yet');
      this.log.exit('resumePendingConnect', null);
      return null;
    }

    try {
      this.log.step('Applying access token and finishing connect');
      this.google.setAccessToken(pending.accessToken, pending.expiresIn || 3600);
      const account = await this.google.finishConnectAfterToken(pending.clientId, { persist: pending.persist });
      this.log.step('Google account connected', { email: account.email, id: account.id });
      const result = await this.verifyAfterConnect(account, pending.clientId, {
        username: pending.username,
        verifyDrive: pending.verifyDrive,
      });
      this.log.step('Drive verification finished', {
        driveVerified: result.driveVerified,
        folderId: result.folderId,
      });
      const message = await this.applyAccountFlow(pending.flow, result);
      clearPendingGoogleOAuth();
      stashGoogleOAuthUiMessage(message);
      const successResult = { openSettings: Boolean(pending.openSettings), success: message };
      this.log.exit('resumePendingConnect', successResult);
      return successResult;
    } catch (e) {
      const error = googleErrorMessage(e);
      const openSettings = Boolean(pending.openSettings);
      this.log.error('resumePendingConnect failed', e);
      clearPendingGoogleOAuth();
      stashGoogleOAuthUiMessage(undefined, error);
      const result = { openSettings, error };
      this.log.exit('resumePendingConnect', result);
      return result;
    }
  }

  async consumeCreateVaultPending(): Promise<GoogleDriveLinkResult | null> {
    this.log.enter('consumeCreateVaultPending');
    const pending = loadPendingGoogleOAuth();
    if (!pending || pending.flow !== 'create-vault' || !pending.accessToken) {
      this.log.exit('consumeCreateVaultPending', null);
      return null;
    }

    try {
      this.log.step('Consuming create-vault OAuth token');
      this.google.setAccessToken(pending.accessToken, pending.expiresIn || 3600);
      const account = await this.google.finishConnectAfterToken(pending.clientId, { persist: false });
      const result = await this.verifyAfterConnect(account, pending.clientId, {
        username: pending.username,
        verifyDrive: true,
      });
      clearPendingGoogleOAuth();
      this.log.exit('consumeCreateVaultPending', { email: result.email, driveVerified: result.driveVerified });
      return result;
    } catch (e) {
      this.log.error('consumeCreateVaultPending failed', e);
      clearPendingGoogleOAuth();
      throw e;
    }
  }

  private async applyAccountFlow(
    flow: 'account-identity' | 'account-drive',
    result: GoogleDriveLinkResult,
  ): Promise<string> {
    this.log.enter('applyAccountFlow', { flow, email: result.email, driveVerified: result.driveVerified });
    if (flow === 'account-drive') {
      this.log.step('Updating vault sync account for Drive-only flow');
      await this.vault.updateSyncAccount({
        googleClientId: result.clientId,
        googleAccountEmail: result.email,
        googleAccountId: result.id,
        driveUsesSameGoogleAccount: false,
        driveVerifiedAt: result.verifiedAt ?? null,
        driveFolderId: result.folderId ?? '',
      });
      void this.vault.uploadRecoveryIfPossible();
      void this.sync.pushSync();
      const message = 'Drive backup connected and verified (' + result.email + ').';
      this.log.exit('applyAccountFlow', { message });
      return message;
    }

    this.log.step('Updating vault sync account for identity flow');
    await this.vault.syncRecoveryEmail(result.email);
    const sync = this.google.getAccount();
    const driveUsesSame = sync.driveUsesSameGoogleAccount !== false;
    const syncPatch: Partial<VaultSyncAccount> = {
      googleClientId: result.clientId,
      googleIdentityEmail: result.email,
      googleIdentityId: result.id,
      googleOnboardingComplete: true,
    };
    if (driveUsesSame) {
      syncPatch.googleAccountEmail = result.email;
      syncPatch.googleAccountId = result.id;
      syncPatch.driveUsesSameGoogleAccount = true;
    }
    if (result.driveVerified) {
      syncPatch.driveVerifiedAt = result.verifiedAt ?? null;
      syncPatch.driveFolderId = result.folderId ?? '';
    }
    await this.vault.updateSyncAccount(syncPatch);
    void this.vault.uploadRecoveryIfPossible();
    const message = result.driveVerified
      ? 'Primary account connected and Drive verified (' + result.email + ').'
      : 'Primary account connected as ' + result.email + '.';
    this.log.exit('applyAccountFlow', { message });
    return message;
  }

  private async verifyAfterConnect(
    account: { email: string; id: string },
    clientId: string,
    options: { username?: string; verifyDrive?: boolean },
  ): Promise<GoogleDriveLinkResult> {
    this.log.enter('verifyAfterConnect', { email: account.email, verifyDrive: options.verifyDrive });
    if (options.verifyDrive === false) {
      const result = { ...account, clientId, driveVerified: false };
      this.log.exit('verifyAfterConnect', { driveVerified: false });
      return result;
    }

    try {
      this.log.step('Ensuring Drive layout exists');
      const layout = await this.drive.ensureDriveLayout(clientId, options.username?.trim().toLowerCase());
      const folderPath = describeDriveLayout(APP_NAME, options.username);
      const result = {
        ...account,
        clientId,
        driveVerified: true,
        folderPath,
        folderId: layout.rootId,
        verifiedAt: nowIso(),
      };
      this.log.exit('verifyAfterConnect', { driveVerified: true, folderId: layout.rootId });
      return result;
    } catch (e) {
      this.log.error('Drive verification failed after connect', e);
      const err = new Error(
        `Signed in as ${account.email}, but Drive verification failed: ${(e as Error).message || 'unknown error'}`,
      ) as Error & {
        code?: string;
        partial?: GoogleDriveLinkResult;
      };
      err.code = 'DRIVE_VERIFY_FAILED';
      err.partial = { ...account, clientId, driveVerified: false };
      throw err;
    }
  }

  async verifyDriveAccess(clientId: string, username?: string): Promise<GoogleDriveLinkResult> {
    this.log.enter('verifyDriveAccess', { username });
    const resolved = await this.oauth.resolve(clientId);
    if (!resolved) {
      this.log.error('verifyDriveAccess: NO_CLIENT_ID');
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }

    const sync = this.google.getAccount();
    const email = sync.googleAccountEmail || sync.googleIdentityEmail || '';
    const id = sync.googleAccountId || sync.googleIdentityId || '';
    if (!email || !id) {
      this.log.error('verifyDriveAccess: NO_GOOGLE_ACCOUNT');
      const err = new Error('NO_GOOGLE_ACCOUNT') as Error & { code?: string };
      err.code = 'NO_GOOGLE_ACCOUNT';
      throw err;
    }

    this.log.step('Ensuring access token before Drive verification');
    await this.google.ensureAccessToken(resolved);
    const layout = await this.drive.ensureDriveLayout(resolved, username?.trim().toLowerCase());
    const folderPath = describeDriveLayout(APP_NAME, username);

    const result = {
      email,
      id,
      clientId: resolved,
      driveVerified: true,
      folderPath,
      folderId: layout.rootId,
      verifiedAt: nowIso(),
    };
    this.log.exit('verifyDriveAccess', { email, folderId: layout.rootId });
    return result;
  }
}
