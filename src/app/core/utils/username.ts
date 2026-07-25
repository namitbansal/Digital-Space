/** Login username: 3–32 chars, letters, numbers, underscore. */
const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

export const USERNAME_FORMAT_HINT = 'Lowercase letters, numbers, underscore only.';

export const USERNAME_TAKEN_MESSAGE = `This username is already taken. Please choose something new. ${USERNAME_FORMAT_HINT}`;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  return USERNAME_RE.test(normalizeUsername(input));
}

export function usernameError(input: string): string | null {
  const value = normalizeUsername(input);
  if (!value) return 'Username is required.';
  if (value.length < 3) return 'Username must be at least 3 characters.';
  if (value.length > 32) return 'Username must be at most 32 characters.';
  if (!USERNAME_RE.test(value)) {
    return 'Use lowercase letters, numbers, and underscore only. Must start with a letter.';
  }
  return null;
}
