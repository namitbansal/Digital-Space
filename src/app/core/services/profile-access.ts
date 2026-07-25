import { VaultData } from '../models/vault.models';

export function profileAccessError(): Error & { code: string } {
  const err = new Error('PROFILE_ACCESS_DENIED') as Error & { code: string };
  err.code = 'PROFILE_ACCESS_DENIED';
  return err;
}

export function assertSameProfile(activeProfileId: string, resourceProfileId: string): void {
  if (resourceProfileId !== activeProfileId) {
    throw profileAccessError();
  }
}

export function folderIdsForProfile(vault: VaultData, profileId: string): Set<string> {
  return new Set(vault.folders.filter((f) => f.profileId === profileId).map((f) => f.id));
}
