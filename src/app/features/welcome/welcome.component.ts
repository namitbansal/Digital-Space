import { Component, EventEmitter, Input, Output } from '@angular/core';
import { APP_NAME } from '../../core/constants/app-name';
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
  @Input() hasVault = false;
  @Output() create = new EventEmitter<void>();
  @Output() unlock = new EventEmitter<void>();
}
