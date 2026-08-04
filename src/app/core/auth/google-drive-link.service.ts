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
import { AppLogger } from '../services/logger.util';

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
    const clientId = options.clientId.trim();
    if (!clientId) {
      AppLogger.error('startRedirectConnect: missing client ID');
      throw new Error('NO_CLIENT_ID');
    }
    startGoogleOAuthRedirect({
      clientId,
      username: options.username,
      verifyDrive: options.verifyDrive !== false,
      persist: options.persist !== false,
      selectAccount: options.selectAccount !== false,
      flow: options.flow,
      openSettings: options.openSettings,
    });
  }

  async resumePendingConnect(): Promise<{
    openSettings: boolean;
    success?: string;
    error?: string;
    resumeCreateVault?: boolean;
  } | null> {
    const pending = loadPendingGoogleOAuth();
    if (!pending) return null;

    if (pending.flow === 'create-vault') {
      if (!pending.accessToken && !pending.oauthError) return null;
      return {
        openSettings: false,
        resumeCreateVault: Boolean(pending.accessToken && !pending.oauthError),
      };
    }

    if (pending.oauthError) {
      const error = googleErrorMessage({ message: pending.oauthError });
      const openSettings = Boolean(pending.openSettings);
      AppLogger.error('Pending OAuth has error', { error, openSettings });
      clearPendingGoogleOAuth();
      stashGoogleOAuthUiMessage(undefined, error);
      return { openSettings, error };
    }

    if (!pending.accessToken) return null;

    try {
      this.google.setAccessToken(pending.accessToken, pending.expiresIn || 3600);
      const account = await this.google.finishConnectAfterToken(pending.clientId, { persist: pending.persist });
      const result = await this.verifyAfterConnect(account, pending.clientId, {
        username: pending.username,
        verifyDrive: pending.verifyDrive,
      });
      const message = await this.applyAccountFlow(pending.flow, result);
      clearPendingGoogleOAuth();
      stashGoogleOAuthUiMessage(message);
      AppLogger.info('Google OAuth resume complete', { email: result.email, flow: pending.flow });
      return { openSettings: Boolean(pending.openSettings), success: message };
    } catch (e) {
      const error = googleErrorMessage(e);
      const openSettings = Boolean(pending.openSettings);
      AppLogger.error('resumePendingConnect failed', e);
      clearPendingGoogleOAuth();
      stashGoogleOAuthUiMessage(undefined, error);
      return { openSettings, error };
    }
  }

  async consumeCreateVaultPending(): Promise<GoogleDriveLinkResult | null> {
    const pending = loadPendingGoogleOAuth();
    if (!pending || pending.flow !== 'create-vault' || !pending.accessToken) {
      return null;
    }

    try {
      this.google.setAccessToken(pending.accessToken, pending.expiresIn || 3600);
      const account = await this.google.finishConnectAfterToken(pending.clientId, { persist: false });
      const result = await this.verifyAfterConnect(account, pending.clientId, {
        username: pending.username,
        verifyDrive: true,
      });
      clearPendingGoogleOAuth();
      AppLogger.info('Create-vault Google OAuth consumed', {
        email: result.email,
        driveVerified: result.driveVerified,
      });
      return result;
    } catch (e) {
      AppLogger.error('consumeCreateVaultPending failed', e);
      clearPendingGoogleOAuth();
      throw e;
    }
  }

  private async applyAccountFlow(
    flow: 'account-identity' | 'account-drive',
    result: GoogleDriveLinkResult,
  ): Promise<string> {
    if (flow === 'account-drive') {
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
      return 'Drive backup connected and verified (' + result.email + ').';
    }

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
    return result.driveVerified
      ? 'Primary account connected and Drive verified (' + result.email + ').'
      : 'Primary account connected as ' + result.email + '.';
  }

  private async verifyAfterConnect(
    account: { email: string; id: string },
    clientId: string,
    options: { username?: string; verifyDrive?: boolean },
  ): Promise<GoogleDriveLinkResult> {
    if (options.verifyDrive === false) {
      return { ...account, clientId, driveVerified: false };
    }

    try {
      const layout = await this.drive.ensureDriveLayout(clientId, options.username?.trim().toLowerCase());
      const folderPath = describeDriveLayout(APP_NAME, options.username);
      return {
        ...account,
        clientId,
        driveVerified: true,
        folderPath,
        folderId: layout.rootId,
        verifiedAt: nowIso(),
      };
    } catch (e) {
      AppLogger.error('Drive verification failed after connect', e);
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
    const resolved = await this.oauth.resolve(clientId);
    if (!resolved) {
      AppLogger.error('verifyDriveAccess: NO_CLIENT_ID');
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }

    const sync = this.google.getAccount();
    const email = sync.googleAccountEmail || sync.googleIdentityEmail || '';
    const id = sync.googleAccountId || sync.googleIdentityId || '';
    if (!email || !id) {
      AppLogger.error('verifyDriveAccess: NO_GOOGLE_ACCOUNT');
      const err = new Error('NO_GOOGLE_ACCOUNT') as Error & { code?: string };
      err.code = 'NO_GOOGLE_ACCOUNT';
      throw err;
    }

    await this.google.ensureAccessToken(resolved);
    const layout = await this.drive.ensureDriveLayout(resolved, username?.trim().toLowerCase());
    const folderPath = describeDriveLayout(APP_NAME, username);

    return {
      email,
      id,
      clientId: resolved,
      driveVerified: true,
      folderPath,
      folderId: layout.rootId,
      verifiedAt: nowIso(),
    };
  }
}
