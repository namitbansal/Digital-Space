import { Injectable, OnDestroy, signal } from '@angular/core';

export type ResolvedTheme = 'light' | 'dark';

/** Follows OS light/dark. No manual theme toggle — system only. */
@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  readonly theme = signal<ResolvedTheme>('light');

  private mq?: MediaQueryList;
  private onChange?: () => void;

  init(): void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      this.apply('light');
      return;
    }
    this.mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.onChange = () => this.apply(this.mq!.matches ? 'dark' : 'light');
    this.onChange();
    this.mq.addEventListener('change', this.onChange);
  }

  ngOnDestroy(): void {
    if (this.mq && this.onChange) this.mq.removeEventListener('change', this.onChange);
  }

  private apply(mode: ResolvedTheme): void {
    this.theme.set(mode);
    const root = document.documentElement;
    root.dataset['theme'] = mode;
    root.style.colorScheme = mode;
  }
}
