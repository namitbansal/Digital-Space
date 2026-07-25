import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditEntry } from '../../core/models/vault.models';
import { auditCategory, auditMetaLine, auditProfileLabel, formatAuditTimestamp } from '../../core/services/audit-display';
import { VaultService } from '../../core/services/vault.service';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-activity-history',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './activity-history.component.html',
  styleUrl: './activity-history.component.css',
})
export class ActivityHistoryComponent implements OnChanges {
  private readonly vault = inject(VaultService);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  entries: AuditEntry[] = [];
  filter = 'all';
  private profileNameById = new Map<string, string>();

  readonly formatTime = formatAuditTimestamp;
  readonly category = auditCategory;

  ngOnChanges(): void {
    if (this.open) this.load();
  }

  load(): void {
    this.entries = this.vault.listAuditLog();
    this.profileNameById = new Map(this.vault.listProfiles().map((p) => [p.id, p.name]));
  }

  profileLabel(entry: AuditEntry): string | null {
    return auditProfileLabel(entry, this.profileNameById);
  }

  metaLine(entry: AuditEntry): string | null {
    return auditMetaLine(entry, this.profileNameById);
  }

  get filteredEntries(): AuditEntry[] {
    if (this.filter === 'all') return this.entries;
    return this.entries.filter((e) => this.category(e.action).toLowerCase() === this.filter);
  }

  close(): void {
    this.closed.emit();
  }
}
