import { APP_BASE_HREF } from '@angular/common';
import { Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import { APP_NAME } from '../../core/constants/app-name';
import { publicAssetUrl } from '../../core/utils/public-asset-url';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [IconComponent, GuidancePanelComponent],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
})
export class WelcomeComponent {
  readonly appName = APP_NAME;
  readonly welcomeMobileSrc: string;
  readonly welcomeDesktopSrc: string;

  @Input() hasVault = false;
  @Output() create = new EventEmitter<void>();
  @Output() unlock = new EventEmitter<void>();

  constructor(@Inject(APP_BASE_HREF) baseHref: string) {
    this.welcomeMobileSrc = publicAssetUrl(baseHref, 'images/welcome-mobile.png');
    this.welcomeDesktopSrc = publicAssetUrl(baseHref, 'images/welcome-desktop.png');
  }
}
