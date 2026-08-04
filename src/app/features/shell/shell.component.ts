import { Component, ElementRef, EventEmitter, HostListener, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { emptyFieldsForType, getItemType, listItemTypes } from '../../core/items/item-registry';
import { AttachmentMeta, CustomField, Folder, Profile, VaultItem } from '../../core/models/vault.models';
import { AttachmentService } from '../../core/services/attachment.service';
import { VaultService } from '../../core/services/vault.service';
import { GoogleDriveLinkService } from '../../core/auth/google-drive-link.service';
import { LoggerService } from '../../core/services/logger.util';
import { AccountSettingsComponent } from '../account-settings/account-settings.component';
import { ActivityHistoryComponent } from '../activity-history/activity-history.component';
import { GuidanceId } from '../../core/constants/page-guidance';
import { IconComponent } from '../../shared/icon/icon.component';
import { GuidancePanelComponent } from '../../shared/guidance-panel/guidance-panel.component';

const NONE_CATEGORY_ID = '__none__';
const SEARCH_MIN_LENGTH = 2;

type CategoryBar = { id: string; icon: string; label: string; count: number };
type CustomFolderBar = { id: string; name: string; count: number };
type ShellView = 'dash' | 'list' | 'detail';

const PROFILE_RELATIONSHIPS = [
  { value: 'self', label: 'Me' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [FormsModule, IconComponent, AccountSettingsComponent, ActivityHistoryComponent, GuidancePanelComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent implements OnInit {
  private readonly vault = inject(VaultService);
  private readonly attachments = inject(AttachmentService);
  private readonly googleLink = inject(GoogleDriveLinkService);
  private readonly log = inject(LoggerService);
  readonly profileRelationships = PROFILE_RELATIONSHIPS;

  @ViewChild('docInput') docInput?: ElementRef<HTMLInputElement>;

  @Output() locked = new EventEmitter<void>();

  profiles: Profile[] = [];
  customFolders: Folder[] = [];
  items: VaultItem[] = [];
  allForProfile: VaultItem[] = [];
  allVaultItems: VaultItem[] = [];
  allFolders: Folder[] = [];
  activeProfileId = '';
  selectedId: string | null = null;
  query = '';
  typeFilter = '';
  folderId = '';
  view: ShellView = 'dash';
  showEditor = false;
  showSearch = false;
  profileMenuOpen = false;
  showProfileModal = false;
  showCategoryModal = false;
  showSettingsModal = false;
  showHistoryModal = false;
  settingsFocusSection: 'password' | null = null;
  readonly types = listItemTypes();
  readonly defaultCategories = listItemTypes().filter((t) => t.id !== 'custom');
  categoryBars: CategoryBar[] = [];
  customFolderBars: CustomFolderBar[] = [];
  noneCategoryCount = 0;
  readonly noneCategoryId = NONE_CATEGORY_ID;

  showConfirmModal = false;
  confirmStep = 1;
  confirmTitle = '';
  confirmMessage = '';
  confirmSecondMessage = '';
  confirmDanger = false;
  confirmInfoOnly = false;
  private confirmAction: (() => void | Promise<void>) | null = null;

  draftType = 'password';
  draftTitle = '';
  draftFolderId = '';
  draftFields: Record<string, string> = {};
  draftCustom: CustomField[] = [];
  draftAttachments: AttachmentMeta[] = [];
  editingItemId: string | null = null;
  editorError = '';
  profileName = '';
  profileRelationship = 'spouse';
  profileError = '';
  profileEditingId: string | null = null;
  categoryName = '';
  categoryError = '';

  get shellGuidanceId(): GuidanceId | null {
    if (this.showEditor || this.showSettingsModal) return null;
    if (this.view === 'dash') return 'shell-dash';
    if (this.view === 'list') return 'shell-list';
    if (this.view === 'detail') return 'shell-detail';
    return null;
  }

  get searchSuggestions(): VaultItem[] {
    const q = this.query.trim().toLowerCase();
    if (q.length < SEARCH_MIN_LENGTH || !this.showSearch) return [];
    return this.allVaultItems
      .filter((item) => item.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const byProfile = this.getProfileName(a.profileId).localeCompare(this.getProfileName(b.profileId));
        if (byProfile !== 0) return byProfile;
        return a.title.localeCompare(b.title);
      })
      .slice(0, 10);
  }

  get searchQueryReady(): boolean {
    return this.query.trim().length >= SEARCH_MIN_LENGTH;
  }

  ngOnInit(): void {
    this.refresh();
    void this.resumeGoogleOAuth();
  }

  private async resumeGoogleOAuth(): Promise<void> {
    const resume = await this.googleLink.resumePendingConnect();
    if (!resume) {
      return;
    }
    if (resume.openSettings) {
      this.showSettingsModal = true;
    }
  }

  refresh(): void {
    const activeProfileId = this.vault.getActiveProfileId();
    if (!activeProfileId) return;
    this.profiles = this.vault.listProfiles();
    this.activeProfileId = activeProfileId;
    this.customFolders = this.vault.listFolders();
    this.allVaultItems = this.vault.listAllItems();
    this.allFolders = this.vault.getVault()?.folders.slice() || [];
    this.allForProfile = this.vault.listItems();
    const q = this.query.trim().toLowerCase();
    this.items = this.allForProfile
      .filter((i) => {
        if (this.typeFilter === NONE_CATEGORY_ID) {
          if (!this.isUncategorized(i)) return false;
        } else if (this.typeFilter) {
          if (i.type !== this.typeFilter) return false;
          if (i.folderIds?.length) return false;
        }
        if (this.folderId && !i.folderIds?.includes(this.folderId)) return false;
        if (q.length >= SEARCH_MIN_LENGTH && !i.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    if (this.selectedId && !this.allForProfile.some((i) => i.id === this.selectedId)) {
      this.selectedId = null;
      this.view = this.typeFilter || this.folderId ? 'list' : 'dash';
    }

    if (this.folderId && !this.customFolders.some((f) => f.id === this.folderId)) {
      this.folderId = '';
      if (this.view === 'list') this.view = 'dash';
    }

    this.buildCharts();
  }

  get selected(): VaultItem | null {
    if (!this.selectedId) return null;
    return this.allForProfile.find((i) => i.id === this.selectedId) || null;
  }

  get activeProfile(): Profile | undefined {
    return this.profiles.find((p) => p.id === this.activeProfileId);
  }

  get totalCount(): number {
    return this.allForProfile.length;
  }

  get documentCount(): number {
    return this.allForProfile.reduce((n, i) => n + (i.attachments?.length || 0), 0);
  }

  typeIcon(id: string): string {
    return getItemType(id).icon || 'sparkles';
  }

  typeLabel(id: string): string {
    return getItemType(id).label;
  }

  fieldEntries(item: VaultItem) {
    return getItemType(item.type)
      .fields.map((f) => ({
        label: f.label,
        value: item.fields?.[f.name] || '',
        secret: f.type === 'password' || f.type === 'multiline-secret',
      }))
      .filter((x) => x.value);
  }

  draftFieldDefs() {
    return getItemType(this.draftType).fields;
  }

  itemCategoryName(item: VaultItem): string {
    if (this.isUncategorized(item)) return 'None';
    const folderId = item.folderIds?.[0];
    if (folderId) {
      return this.customFolders.find((f) => f.id === folderId)?.name || 'None';
    }
    return this.typeLabel(item.type);
  }

  getProfileName(profileId: string): string {
    return this.profiles.find((p) => p.id === profileId)?.name || 'Profile';
  }

  itemCategoryNameFor(item: VaultItem, folders = this.allFolders): string {
    if (this.isUncategorizedItem(item, folders)) return 'None';
    const folderId = item.folderIds?.[0];
    if (folderId) {
      return folders.find((f) => f.id === folderId)?.name || 'None';
    }
    return this.typeLabel(item.type);
  }

  isUncategorized(item: VaultItem): boolean {
    return this.isUncategorizedItem(item, this.customFolders);
  }

  private isUncategorizedItem(item: VaultItem, folders: Folder[]): boolean {
    const profileFolders = folders.filter((f) => f.profileId === item.profileId);
    const folderIds = item.folderIds || [];
    const hasValidFolder = folderIds.some((id) => profileFolders.some((f) => f.id === id));
    if (hasValidFolder) return false;
    if (folderIds.length > 0) return true;
    const defaultTypeIds = new Set(this.defaultCategories.map((t) => t.id));
    return !defaultTypeIds.has(item.type);
  }

  private buildCharts(): void {
    this.categoryBars = this.defaultCategories.map((t) => ({
      id: t.id,
      icon: t.icon,
      label: t.label,
      count: this.allForProfile.filter((i) => i.type === t.id && !i.folderIds?.length).length,
    }));

    this.customFolderBars = this.customFolders
      .map((f) => ({
        id: f.id,
        name: f.name,
        count: this.allForProfile.filter((i) => i.folderIds?.includes(f.id)).length,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    this.noneCategoryCount = this.allForProfile.filter((i) => this.isUncategorized(i)).length;
  }

  get pageTitle(): string {
    if (this.view === 'detail' && this.selected) return this.selected.title;
    if (this.view === 'list' && this.typeFilter === NONE_CATEGORY_ID) return 'None';
    if (this.view === 'list' && this.folderId) return this.activeFolderName;
    if (this.view === 'list' && this.typeFilter) return this.typeLabel(this.typeFilter);
    if (this.view === 'dash') return '';
    return this.activeProfile?.name || 'Dashboard';
  }

  get categoryCount(): number {
    return this.defaultCategories.length + this.customFolders.length + 1;
  }

  get activeFolderName(): string {
    return this.customFolders.find((f) => f.id === this.folderId)?.name || 'Category';
  }

  activeFolderNameForDraft(): string {
    return this.customFolders.find((f) => f.id === this.draftFolderId)?.name || 'Custom category';
  }

  isDefaultCategoryActive(typeId: string): boolean {
    return !this.draftFolderId && this.draftType === typeId;
  }

  isCustomCategoryActive(folderId: string): boolean {
    return this.draftFolderId === folderId;
  }

  selectDefaultCategory(typeId: string): void {
    this.draftFolderId = '';
    this.draftType = typeId;
    this.onTypeChange();
  }

  selectCustomCategory(folderId: string): void {
    this.draftFolderId = folderId;
  }

  async onProfileChange(id: string): Promise<void> {
    await this.vault.setActiveProfile(id);
    this.typeFilter = '';
    this.folderId = '';
    this.selectedId = null;
    this.view = 'dash';
    this.refresh();
  }

  toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  async pickProfile(id: string): Promise<void> {
    this.profileMenuOpen = false;
    if (id !== this.activeProfileId) {
      await this.onProfileChange(id);
    }
  }

  @HostListener('document:click')
  closeProfileMenu(): void {
    this.profileMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.profileMenuOpen = false;
  }

  toggleSearch(): void {
    this.profileMenuOpen = false;
    this.showSearch = !this.showSearch;
    if (!this.showSearch) {
      this.query = '';
      this.refresh();
    }
  }

  onSearchQueryChange(): void {
    this.refresh();
  }

  openSearchResult(itemId: string): void {
    const item = this.allVaultItems.find((i) => i.id === itemId);
    if (!item) return;
    void this.navigateToSearchItem(item);
  }

  private async navigateToSearchItem(item: VaultItem): Promise<void> {
    if (item.profileId !== this.activeProfileId) {
      await this.vault.setActiveProfile(item.profileId);
    }
    this.typeFilter = '';
    this.folderId = '';
    this.selectedId = item.id;
    this.view = 'detail';
    this.query = '';
    this.showSearch = false;
    this.refresh();
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      if (!this.searchQueryReady) return;
      const first = this.searchSuggestions[0];
      if (first) {
        event.preventDefault();
        void this.navigateToSearchItem(first);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (this.query.trim()) {
        this.query = '';
        this.refresh();
      } else {
        this.toggleSearch();
      }
    }
  }

  back(): void {
    if (this.view === 'detail') {
      this.selectedId = null;
      this.view = this.typeFilter || this.folderId ? 'list' : 'dash';
      return;
    }
    if (this.view === 'list') {
      this.typeFilter = '';
      this.folderId = '';
      this.view = 'dash';
      this.refresh();
    }
  }

  openDash(): void {
    this.typeFilter = '';
    this.folderId = '';
    this.selectedId = null;
    this.view = 'dash';
    this.refresh();
  }

  openNoneCategory(): void {
    this.typeFilter = NONE_CATEGORY_ID;
    this.folderId = '';
    this.selectedId = null;
    this.view = 'list';
    this.refresh();
  }

  openCategory(typeId: string): void {
    this.typeFilter = typeId;
    this.folderId = '';
    this.selectedId = null;
    this.view = 'list';
    this.refresh();
  }

  openCustomFolder(id: string): void {
    this.folderId = id;
    this.typeFilter = '';
    this.selectedId = null;
    this.view = 'list';
    this.refresh();
  }

  selectItem(id: string): void {
    this.selectedId = id;
    this.view = 'detail';
  }

  openNew(): void {
    this.editingItemId = null;
    this.showEditor = true;
    this.draftType = this.typeFilter && this.typeFilter !== NONE_CATEGORY_ID ? this.typeFilter : 'password';
    this.draftTitle = '';
    this.draftFields = emptyFieldsForType(this.draftType);
    this.draftCustom = [];
    this.draftAttachments = [];
    this.draftFolderId = this.folderId || '';
    this.editorError = '';
  }

  openEdit(): void {
    const item = this.selected;
    if (!item) return;
    this.openConfirm({
      title: 'Edit item?',
      message: `You are about to change saved details for "${item.title}" (passwords, account numbers, notes, etc.).`,
      secondMessage: 'Are you sure you want to continue? Your changes will overwrite what is stored.',
      action: () => this.beginEdit(item),
    });
  }

  private beginEdit(item: VaultItem): void {
    this.editingItemId = item.id;
    this.showEditor = true;
    this.draftType = item.type;
    this.draftTitle = item.title;
    this.draftFields = { ...emptyFieldsForType(item.type), ...(item.fields || {}) };
    this.draftCustom = (item.customFields || []).map((c) => ({ ...c }));
    this.draftAttachments = [...(item.attachments || [])];
    this.draftFolderId = item.folderIds?.[0] || '';
    this.editorError = '';
  }

  closeEditor(): void {
    this.showEditor = false;
    this.editingItemId = null;
    this.editorError = '';
  }

  openConfirm(opts: {
    title: string;
    message: string;
    secondMessage: string;
    danger?: boolean;
    infoOnly?: boolean;
    action?: () => void | Promise<void>;
  }): void {
    this.confirmTitle = opts.title;
    this.confirmMessage = opts.message;
    this.confirmSecondMessage = opts.secondMessage;
    this.confirmDanger = opts.danger ?? false;
    this.confirmInfoOnly = opts.infoOnly ?? false;
    this.confirmAction = opts.action || null;
    this.confirmStep = 1;
    this.showConfirmModal = true;
  }

  closeConfirm(): void {
    this.showConfirmModal = false;
    this.confirmStep = 1;
    this.confirmAction = null;
    this.confirmInfoOnly = false;
  }

  confirmNext(): void {
    if (this.confirmInfoOnly) {
      this.closeConfirm();
      return;
    }
    if (this.confirmStep === 1) {
      this.confirmStep = 2;
      return;
    }
    const action = this.confirmAction;
    this.closeConfirm();
    if (action) void action();
  }

  get confirmBody(): string {
    if (this.confirmInfoOnly || this.confirmStep === 1) return this.confirmMessage;
    return this.confirmSecondMessage;
  }

  get confirmPrimaryLabel(): string {
    if (this.confirmInfoOnly) return 'OK';
    if (this.confirmStep === 1) return 'Continue';
    return this.confirmDanger ? 'Yes, delete' : 'Yes, confirm';
  }

  onBuiltInCategoryRemove(label: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.openConfirm({
      title: 'Built-in category',
      message: `"${label}" is a built-in category and cannot be removed.`,
      secondMessage: '',
      infoOnly: true,
    });
  }

  onTypeChange(): void {
    this.draftFields = emptyFieldsForType(this.draftType);
  }

  addCustomField(): void {
    this.draftCustom.push({ label: '', value: '', secret: false });
  }

  removeCustomField(i: number): void {
    const label = this.draftCustom[i]?.label?.trim() || 'this extra field';
    const index = i;
    this.openConfirm({
      title: 'Remove field?',
      message: `Remove the extra field "${label}" from this item?`,
      secondMessage: 'Are you sure? This cannot be undone after you save the item.',
      danger: true,
      action: () => {
        this.draftCustom.splice(index, 1);
      },
    });
  }

  get profileRelationshipsForAdd() {
    return PROFILE_RELATIONSHIPS.filter((r) => r.value !== 'self');
  }

  relationshipLabel(value: string): string {
    return PROFILE_RELATIONSHIPS.find((r) => r.value === value)?.label || value || 'Other';
  }

  /** "My vault" for self; otherwise "Mom's vault", etc. */
  profileVaultTitle(): string {
    const p = this.activeProfile;
    if (!p) return 'My vault';
    if (p.relationship === 'self' || p.name.trim().toLowerCase() === 'me') return 'My vault';
    return `${p.name}'s vault`;
  }

  openProfileModal(): void {
    this.profileError = '';
    this.startAddFamilyMember();
    this.showProfileModal = true;
  }

  closeProfileModal(): void {
    this.showProfileModal = false;
    this.profileError = '';
    this.profileEditingId = null;
  }

  startAddFamilyMember(): void {
    this.profileEditingId = null;
    this.profileName = '';
    this.profileRelationship = 'spouse';
    this.profileError = '';
  }

  startEditProfile(profile: Profile): void {
    this.profileEditingId = profile.id;
    this.profileName = profile.name;
    this.profileRelationship = profile.relationship || 'other';
    this.profileError = '';
  }

  async saveProfile(): Promise<void> {
    if (!this.profileName.trim()) {
      this.profileError = 'Name is required';
      return;
    }
    const creating = !this.profileEditingId;
    const profile = await this.vault.upsertProfile({
      id: this.profileEditingId || undefined,
      name: this.profileName.trim(),
      relationship: this.profileRelationship,
    });
    if (creating) {
      await this.vault.setActiveProfile(profile.id);
    }
    this.refresh();
    if (creating) {
      this.startAddFamilyMember();
      this.profileError = '';
    } else {
      this.closeProfileModal();
    }
  }

  async switchProfileInModal(id: string): Promise<void> {
    await this.onProfileChange(id);
    this.refresh();
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) return;
    this.openConfirm({
      title: 'Delete profile?',
      message: `Delete profile "${profile.name}" and all their items, categories, and documents? This cannot be undone.`,
      secondMessage: 'Are you absolutely sure? Everything for this profile will be permanently deleted.',
      danger: true,
      action: async () => {
        try {
          await this.vault.deleteProfile(id);
          this.refresh();
          if (this.profileEditingId === id) {
            this.startAddFamilyMember();
          }
        } catch {
          this.profileError = 'Could not delete this profile';
        }
      },
    });
  }

  pickDocument(): void {
    this.docInput?.nativeElement.click();
  }

  async onDocumentsSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files || [])];
    for (const file of files) {
      try {
        const meta = await this.attachments.save(file);
        this.draftAttachments.push(meta);
      } catch {
        this.editorError = 'Could not attach that file';
      }
    }
    input.value = '';
  }

  async removeDraftAttachment(id: string): Promise<void> {
    const file = this.draftAttachments.find((a) => a.id === id);
    const name = file?.fileName || 'this document';
    this.openConfirm({
      title: 'Remove document?',
      message: `Remove the document "${name}" from this item?`,
      secondMessage: 'Are you sure? The attachment will be removed when you save.',
      danger: true,
      action: async () => {
        this.draftAttachments = this.draftAttachments.filter((a) => a.id !== id);
        try {
          await this.attachments.remove(id);
        } catch {
          /* may already be gone */
        }
      },
    });
  }

  formatBytes(n: number): string {
    return this.attachments.formatBytes(n);
  }

  async saveItem(): Promise<void> {
    if (!this.draftTitle.trim()) {
      this.editorError = 'Title required';
      return;
    }
    const item = await this.vault.upsertItem({
      id: this.editingItemId || undefined,
      type: this.draftType,
      title: this.draftTitle.trim(),
      folderIds: this.draftFolderId ? [this.draftFolderId] : [],
      fields: { ...this.draftFields },
      customFields: this.draftCustom.filter((c) => c.label.trim() || c.value.trim()),
      attachments: [...this.draftAttachments],
    });
    this.closeEditor();
    this.selectedId = item.id;
    this.view = 'detail';
    this.refresh();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    const id = this.selectedId;
    const title = this.selected?.title || 'this item';
    this.openConfirm({
      title: 'Delete item?',
      message: `Delete "${title}" permanently? This will remove the item and all saved details. Deleted items cannot be retrieved.`,
      secondMessage: 'Are you absolutely sure? This is your final confirmation — the item cannot be recovered.',
      danger: true,
      action: async () => {
        await this.vault.deleteItem(id);
        this.selectedId = null;
        this.view = this.typeFilter || this.folderId ? 'list' : 'dash';
        this.refresh();
      },
    });
  }

  openAddCategoryModal(): void {
    this.categoryName = '';
    this.categoryError = '';
    this.showCategoryModal = true;
  }

  closeCategoryModal(): void {
    this.showCategoryModal = false;
    this.categoryError = '';
  }

  async saveCategory(): Promise<void> {
    const name = this.categoryName.trim();
    if (!name) {
      this.categoryError = 'Please enter a category name.';
      return;
    }
    try {
      const folder = await this.vault.upsertFolder({ name });
      this.closeCategoryModal();
      if (this.showEditor) {
        this.draftFolderId = folder.id;
      }
      this.refresh();
    } catch {
      this.categoryError = 'Could not create category. Try again.';
    }
  }

  deleteCustomCategory(categoryId: string, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    const category = this.customFolders.find((f) => f.id === categoryId);
    if (!category) return;
    this.openConfirm({
      title: 'Remove category?',
      message: `Remove category "${category.name}"? Items stay in your vault but will move to None if they have no other category.`,
      secondMessage: 'Are you absolutely sure? This custom category will be permanently removed.',
      danger: true,
      action: async () => {
        await this.vault.deleteFolder(categoryId);
        if (this.folderId === categoryId) {
          this.folderId = '';
          this.selectedId = null;
          this.view = 'dash';
        }
        this.refresh();
      },
    });
  }

  async lock(): Promise<void> {
    await this.vault.lockVault('manual');
    this.log.info('User locked vault from shell');
    this.locked.emit();
  }

  openSettingsModal(): void {
    this.settingsFocusSection = null;
    this.showSettingsModal = true;
  }

  openHistoryModal(): void {
    this.showHistoryModal = true;
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
  }

  openRecoverySettings(): void {
    this.settingsFocusSection = 'password';
    this.showSettingsModal = true;
  }

  closeSettingsModal(): void {
    this.showSettingsModal = false;
    this.settingsFocusSection = null;
  }
}
