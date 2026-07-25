/** Human-readable Drive folder path — for UI only. */
export function describeDriveLayout(appName: string, username?: string): string {
  const user = username?.trim().toLowerCase();
  return user ? `${appName} / ${user}` : appName;
}
