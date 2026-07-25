/**
 * Version format: {product}.{major changes}.{minor changes}
 * - product: release generation (1 = vanilla, 2 = Angular, 3 = Digital Space)
 * - major changes: new features, security, architecture
 * - minor changes: UI polish, bug fixes, small tweaks
 *
 * Bump APP_VERSION_DATE when you ship an update.
 */
export const APP_VERSION_MAJOR = 3;

export const APP_MAJOR_CHANGES = 18;

export const APP_MINOR_CHANGES = 82;

export const APP_VERSION = `${APP_VERSION_MAJOR}.${APP_MAJOR_CHANGES}.${APP_MINOR_CHANGES}`;

/** ISO date of this version release. */
export const APP_VERSION_DATE = '2026-07-25';

/** Shown in Account settings footer. */
export const APP_VERSION_DATE_LABEL = '25 Jul 2026';

export const APP_VERSION_LABEL = `v${APP_VERSION} · ${APP_VERSION_DATE_LABEL}`;
