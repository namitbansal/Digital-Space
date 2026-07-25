import { Injectable, inject } from '@angular/core';
import { describeDriveLayout } from '../sync/drive-layout.util';
import { DriveApiService } from '../sync/drive-api.service';
import { APP_NAME } from '../constants/app-name';
import { nowIso } from '../utils/id';
import { GoogleAccountService } from './google-account.service';
import { GoogleOAuthConfigService } from './google-oauth-config.service';

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

  async prepareSignIn(clientId?: string): Promise<string> {
    const id = await this.oauth.resolve(clientId);
    if (!id) {
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }
    await this.google.prepareSignIn(id);
    return id;
  }

  /** Call from a button click — opens Google popup synchronously (no await before this). */
  connectAndVerifyFromGesture(options: {
    clientId: string;
    username?: string;
    persist?: boolean;
    selectAccount?: boolean;
    verifyDrive?: boolean;
  }): Promise<GoogleDriveLinkResult> {
    const clientId = options.clientId.trim();
    if (!clientId) {
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      return Promise.reject(err);
    }

    return this.google
      .connectFromUserGesture(clientId, {
        persist: options.persist,
        selectAccount: options.selectAccount,
      })
      .then((account) => this.verifyAfterConnect(account, clientId, options));
  }

  async connectAndVerify(options: {
    clientId?: string;
    username?: string;
    persist?: boolean;
    selectAccount?: boolean;
    verifyDrive?: boolean;
  }): Promise<GoogleDriveLinkResult> {
    const clientId = await this.oauth.resolve(options.clientId);
    if (!clientId) {
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }

    const account = await this.google.connect(clientId, {
      persist: options.persist,
      selectAccount: options.selectAccount,
    });

    return this.verifyAfterConnect(account, clientId, options);
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
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }

    const sync = this.google.getAccount();
    const email = sync.googleAccountEmail || sync.googleIdentityEmail || '';
    const id = sync.googleAccountId || sync.googleIdentityId || '';
    if (!email || !id) {
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
