import { Injectable } from '@angular/core';
import { normalizeUsername } from '../utils/username';

const GLOBAL_KEY = 'digital-space-global';

interface GlobalUserIndex {
  knownUsernames: string[];
  activeUsername: string | null;
}

@Injectable({ providedIn: 'root' })
export class UserContextService {
  private activeUsername: string | null = null;

  private readIndex(): GlobalUserIndex {
    try {
      const raw = localStorage.getItem(GLOBAL_KEY);
      if (!raw) return { knownUsernames: [], activeUsername: null };
      const parsed = JSON.parse(raw) as Partial<GlobalUserIndex>;
      return {
        knownUsernames: Array.isArray(parsed.knownUsernames) ? parsed.knownUsernames : [],
        activeUsername: parsed.activeUsername ?? null,
      };
    } catch {
      return { knownUsernames: [], activeUsername: null };
    }
  }

  private writeIndex(index: GlobalUserIndex): void {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(index));
  }

  getKnownUsernames(): string[] {
    return this.readIndex().knownUsernames.slice();
  }

  getActiveUsername(): string | null {
    return this.activeUsername ?? this.readIndex().activeUsername;
  }

  setActiveUsername(username: string): void {
    const normalized = normalizeUsername(username);
    this.activeUsername = normalized;
    const index = this.readIndex();
    index.activeUsername = normalized;
    if (!index.knownUsernames.includes(normalized)) {
      index.knownUsernames.unshift(normalized);
    }
    this.writeIndex(index);
  }

  rememberUsername(username: string): void {
    const normalized = normalizeUsername(username);
    const index = this.readIndex();
    if (!index.knownUsernames.includes(normalized)) {
      index.knownUsernames.unshift(normalized);
      this.writeIndex(index);
    }
  }

  hasAnyUser(): boolean {
    return this.getKnownUsernames().length > 0;
  }
}
