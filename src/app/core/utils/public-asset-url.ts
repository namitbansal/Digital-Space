/** Build a URL for files copied from public/ (respects production base href). */
export function publicAssetUrl(baseHref: string, path: string): string {
  const base = baseHref.endsWith('/') ? baseHref : baseHref + '/';
  const asset = path.replace(/^\//, '');
  return base + asset;
}
