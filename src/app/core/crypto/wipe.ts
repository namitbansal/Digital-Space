export function wipeObjectStrings(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (typeof val === 'string') record[key] = '';
    else if (Array.isArray(val)) val.length = 0;
    else if (val && typeof val === 'object') wipeObjectStrings(val);
  }
}
