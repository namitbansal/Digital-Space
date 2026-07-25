import { Injectable, inject } from '@angular/core';
import { ALL_GUIDANCE_IDS, GuidanceId } from '../constants/page-guidance';
import { AppSettings } from '../models/vault.models';
import { SettingsService } from '../storage/settings.service';

@Injectable({ providedIn: 'root' })
export class GuidanceService {
  private readonly settings = inject(SettingsService);
  private cache: AppSettings | null = null;

  async shouldShow(id: GuidanceId): Promise<boolean> {
    const current = await this.load();
    if (current.guidanceSkipAll) return false;
    return !current.guidanceDismissed?.[id];
  }

  async dismiss(id: GuidanceId): Promise<void> {
    const current = await this.load();
    const guidanceDismissed = { ...(current.guidanceDismissed || {}), [id]: true };
    this.cache = await this.settings.save({ guidanceDismissed });
  }

  async skipAll(): Promise<void> {
    const dismissed = ALL_GUIDANCE_IDS.reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    this.cache = await this.settings.save({ guidanceSkipAll: true, guidanceDismissed: dismissed });
  }

  async resetAll(): Promise<void> {
    this.cache = await this.settings.save({ guidanceSkipAll: false, guidanceDismissed: {} });
  }

  private async load(): Promise<AppSettings> {
    if (!this.cache) {
      this.cache = await this.settings.load();
    }
    return this.cache;
  }
}
