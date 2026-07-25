import { AuditEntry, VaultData } from '../models/vault.models';
import { createId, nowIso } from '../utils/id';

export const AUDIT_LOG_MAX = 5000;

export function appendAudit(
  vault: VaultData,
  input: { action: string; summary: string; meta?: Record<string, string | number | boolean> },
): AuditEntry {
  if (!Array.isArray(vault.auditLog)) vault.auditLog = [];
  const entry: AuditEntry = {
    id: createId('aud'),
    at: nowIso(),
    action: input.action,
    summary: input.summary,
    meta: input.meta || {},
  };
  vault.auditLog.unshift(entry);
  if (vault.auditLog.length > AUDIT_LOG_MAX) vault.auditLog.length = AUDIT_LOG_MAX;
  return entry;
}
