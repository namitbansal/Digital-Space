/**
 * Two-level logging switches.
 *
 * Level 1 — IMPORTANT (`IMPORTANT_LOGGING_ENABLED`):
 *   error, warn, important() — failures, warnings, and key milestones.
 *
 * Level 2 — VERBOSE (`VERBOSE_LOGGING_ENABLED`, requires IMPORTANT on):
 *   enter(), exit(), step(), debug() — full step-by-step flow trace.
 *
 * | IMPORTANT | VERBOSE | What prints                          |
 * |-----------|---------|--------------------------------------|
 * | false     | false   | Nothing (production default)         |
 * | true      | false   | Important only                       |
 * | true      | true    | Important + verbose trace            |
 */
export const IMPORTANT_LOGGING_ENABLED = false;
export const VERBOSE_LOGGING_ENABLED = false;
