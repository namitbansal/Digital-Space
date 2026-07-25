import { Component, Input, OnChanges, OnInit, inject } from '@angular/core';
import { GuidanceId, PAGE_GUIDANCE, PageGuidanceContent } from '../../core/constants/page-guidance';
import { GuidanceService } from '../../core/services/guidance.service';

@Component({
  selector: 'app-guidance-panel',
  standalone: true,
  templateUrl: './guidance-panel.component.html',
})
export class GuidancePanelComponent implements OnInit, OnChanges {
  private readonly guidance = inject(GuidanceService);

  @Input({ required: true }) guidanceId!: GuidanceId;

  visible = false;
  content: PageGuidanceContent | null = null;

  ngOnInit(): void {
    void this.refresh();
  }

  ngOnChanges(): void {
    void this.refresh();
  }

  async dismiss(): Promise<void> {
    await this.guidance.dismiss(this.guidanceId);
    this.visible = false;
  }

  async skipAll(): Promise<void> {
    await this.guidance.skipAll();
    this.visible = false;
  }

  private async refresh(): Promise<void> {
    this.content = PAGE_GUIDANCE[this.guidanceId] ?? null;
    if (!this.content) {
      this.visible = false;
      return;
    }
    this.visible = await this.guidance.shouldShow(this.guidanceId);
  }
}
