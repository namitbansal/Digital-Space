import { Injectable } from '@angular/core';
import { ALL_GUIDANCE_IDS, GuidanceId } from '../constants/page-guidance';

const STORAGE_KEY = 'digital-space-guidance';

interface GuidanceState {
  guidanceDismissed?: Partial<Record<GuidanceId, boolean>>;
  guidanceSkipAll?: boolean;
}

@Injectable({ providedIn: 'root' })
export class GuidanceService {
  private cache: GuidanceState | null = null;

  async shouldShow(id: GuidanceId): Promise<boolean> {
    const current = this.read();
    if (current.guidanceSkipAll) return false;
    return !current.guidanceDismissed?.[id];
  }

  async dismiss(id: GuidanceId): Promise<void> {
    const current = this.read();
    const guidanceDismissed = { ...(current.guidanceDismissed || {}), [id]: true };
    this.write({ ...current, guidanceDismissed });
  }

  async skipAll(): Promise<void> {
    const dismissed = ALL_GUIDANCE_IDS.reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    this.write({ guidanceSkipAll: true, guidanceDismissed: dismissed });
  }

  async resetAll(): Promise<void> {
    this.write({ guidanceSkipAll: false, guidanceDismissed: {} });
  }

  private read(): GuidanceState {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.cache = raw ? (JSON.parse(raw) as GuidanceState) : {};
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private write(next: GuidanceState): void {
    this.cache = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}
