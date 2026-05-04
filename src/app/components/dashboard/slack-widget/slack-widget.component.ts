import { Component, OnInit, OnDestroy } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SlackService, SlackChannel, SlackMessage } from '../../../services/slack.service';
import { NavigationService } from '../../../services/navigation.service';
import { TouchTooltipDirective } from '../../../directives/touch-tooltip.directive';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-slack-widget',
  standalone: true,
  imports: [CommonModule, TouchTooltipDirective],
  templateUrl: './slack-widget.component.html',
  styleUrl: './slack-widget.component.scss',
})
export class SlackWidgetComponent implements OnInit, OnDestroy {
  channels: SlackChannel[] = [];
  loading = false;
  error: string | null = null;
  isConfigured = false;
  itemsHidden = false;
  activeView: 'channels' | 'dms' = 'channels';
  showUnreadOnly = localStorage.getItem('slack-show-unread-only') !== 'false';

  expandedChannels = new Set<string>();
  loadingMessages = new Set<string>();

  /** Hidden channel IDs: Record<id, true> for change-detection-safe mutations */
  hiddenChannelIds: Record<string, true> = this.loadHiddenChannelIds();
  showFilterPanel = false;
  filterConfigured = localStorage.getItem('slack-filter-configured') === 'true';

  private renderedMessages = new Map<string, SafeHtml>();
  private destroy$ = new Subject<void>();

  constructor(
    private slackService: SlackService,
    private navigationService: NavigationService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.slackService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        const justConfigured = !this.isConfigured && configured;
        this.isConfigured = configured;
        if (justConfigured) {
          this.loadChannels();
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadChannels());
        }
        if (!configured) this.channels = [];
      });

    this.slackService.channels$
      .pipe(takeUntil(this.destroy$))
      .subscribe(channels => {
        this.channels = channels;
        if (channels.length > 0 && !this.filterConfigured) {
          this.showFilterPanel = true;
        }
      });

    this.slackService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(l => this.loading = l);

    this.slackService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => this.error = e);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Views ──────────────────────────────────────────────────────────────────

  loadChannels(): void {
    this.slackService.fetchChannels().subscribe();
  }

  switchView(v: 'channels' | 'dms'): void {
    this.activeView = v;
  }

  get channelList(): SlackChannel[] {
    return this.channels.filter(c => c.type === 'channel' || c.type === 'group');
  }

  get dmList(): SlackChannel[] {
    return this.channels.filter(c => c.type === 'im' || c.type === 'mpim');
  }

  get filteredChannels(): SlackChannel[] {
    const list = this.activeView === 'channels' ? this.channelList : this.dmList;
    const visible = list.filter(c => !this.hiddenChannelIds[c.id]);
    if (this.showUnreadOnly) return visible.filter(c => (c.unreadCount ?? 0) > 0 || !!c.messages?.length);
    return visible;
  }

  get unreadChannelCount(): number {
    return this.channelList.filter(c => !this.hiddenChannelIds[c.id] && (c.unreadCount ?? 0) > 0).length;
  }

  get unreadDmCount(): number {
    return this.dmList.filter(c => !this.hiddenChannelIds[c.id] && (c.unreadCount ?? 0) > 0).length;
  }

  toggleUnreadOnly(): void {
    this.showUnreadOnly = !this.showUnreadOnly;
    localStorage.setItem('slack-show-unread-only', String(this.showUnreadOnly));
  }

  toggleItemVisibility(): void {
    this.itemsHidden = !this.itemsHidden;
  }

  // ─── Expand / messages ──────────────────────────────────────────────────────

  toggleChannel(ch: SlackChannel): void {
    if (this.expandedChannels.has(ch.id)) {
      this.expandedChannels.delete(ch.id);
    } else {
      this.expandedChannels.add(ch.id);
      if (!ch.messages) {
        this.loadingMessages.add(ch.id);
        this.slackService.fetchMessages(ch.id, 20).subscribe(() => {
          this.loadingMessages.delete(ch.id);
        });
      } else {
        ch.messages.forEach(m => this.renderedMessages.delete(m.ts));
      }
    }
    // force new Set reference for change detection
    this.expandedChannels = new Set(this.expandedChannels);
    this.loadingMessages = new Set(this.loadingMessages);
  }

  isExpanded(id: string): boolean { return this.expandedChannels.has(id); }
  isLoadingMessages(id: string): boolean { return this.loadingMessages.has(id); }

  retryMessages(ch: SlackChannel): void {
    this.loadingMessages.add(ch.id);
    this.loadingMessages = new Set(this.loadingMessages);
    this.slackService.fetchMessages(ch.id, 20).subscribe(() => {
      this.loadingMessages.delete(ch.id);
      this.loadingMessages = new Set(this.loadingMessages);
    });
  }

  // ─── Filter panel ───────────────────────────────────────────────────────────

  private loadHiddenChannelIds(): Record<string, true> {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('slack-hidden-channel-ids') ?? '[]');
      return Object.fromEntries(ids.map(id => [id, true as const]));
    } catch { return {}; }
  }

  private saveHiddenChannelIds(): void {
    localStorage.setItem('slack-hidden-channel-ids', JSON.stringify(Object.keys(this.hiddenChannelIds)));
  }

  isChannelVisible(id: string): boolean { return !this.hiddenChannelIds[id]; }

  toggleChannelFilter(id: string): void {
    if (this.hiddenChannelIds[id]) {
      const { [id]: _, ...rest } = this.hiddenChannelIds;
      this.hiddenChannelIds = rest as Record<string, true>;
    } else {
      this.hiddenChannelIds = { ...this.hiddenChannelIds, [id]: true };
    }
    this.saveHiddenChannelIds();
  }

  get allFilterListSelected(): boolean {
    const list = this.activeView === 'channels' ? this.channelList : this.dmList;
    return list.length > 0 && list.every(c => !this.hiddenChannelIds[c.id]);
  }

  get someFilterListSelected(): boolean {
    const list = this.activeView === 'channels' ? this.channelList : this.dmList;
    const visible = list.filter(c => !this.hiddenChannelIds[c.id]).length;
    return visible > 0 && visible < list.length;
  }

  toggleAllFilter(): void {
    const list = this.activeView === 'channels' ? this.channelList : this.dmList;
    if (this.allFilterListSelected) {
      const newHidden = { ...this.hiddenChannelIds };
      list.forEach(c => newHidden[c.id] = true);
      this.hiddenChannelIds = newHidden as Record<string, true>;
    } else {
      const newHidden = { ...this.hiddenChannelIds };
      list.forEach(c => delete newHidden[c.id]);
      this.hiddenChannelIds = newHidden;
    }
    this.saveHiddenChannelIds();
  }

  toggleFilterPanel(): void { this.showFilterPanel = !this.showFilterPanel; }

  confirmFilter(): void {
    this.showFilterPanel = false;
    this.filterConfigured = true;
    localStorage.setItem('slack-filter-configured', 'true');
  }

  // ─── Rendering helpers ──────────────────────────────────────────────────────

  getChannelName(ch: SlackChannel): string {
    if (ch.type === 'im') return ch.dmUserName ?? 'Direct Message';
    if (ch.type === 'mpim') return ch.name.replace(/^mpdm-/, '').replace(/-\d+$/, '').replace(/-/g, ', ');
    return `#${ch.name}`;
  }

  getChannelIcon(ch: SlackChannel): string {
    if (ch.type === 'im') return 'fa-user';
    if (ch.type === 'mpim') return 'fa-users';
    if (ch.type === 'group') return 'fa-lock';
    return 'fa-hashtag';
  }

  getPreview(ch: SlackChannel): string {
    const msg = ch.latestMessage ?? ch.messages?.[0];
    if (!msg) return '';
    const text = this.slackMarkdownToText(msg.text);
    return text.trim().slice(0, 80) + (text.trim().length > 80 ? '…' : '');
  }

  /** Convert Slack mrkdwn to plain text for previews */
  private slackMarkdownToText(text: string): string {
    return text
      .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')
      .replace(/<@[A-Z0-9]+>/g, '@user')
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
      .replace(/<([^>|]+)\|([^>]+)>/g, '$2')
      .replace(/<([^>]+)>/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~([^~]+)~/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  renderMessageText(msg: SlackMessage): SafeHtml {
    const cached = this.renderedMessages.get(msg.ts);
    if (cached) return cached;

    // Convert Slack mrkdwn to safe HTML
    let html = msg.text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // undo entity escaping for Slack's own link syntax (re-apply after)
      ;

    // Re-parse the original text for Slack syntax before entity-encoding
    html = msg.text
      .replace(/&/g, '&amp;')
      // Slack links: <url|label> or <url>
      .replace(/&lt;(https?:\/\/[^|&]+)\|([^&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/&lt;(https?:\/\/[^&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      // @mentions
      .replace(/&lt;@[A-Z0-9]+\|([^&>]+)&gt;/g, '<strong class="slack-mention">@$1</strong>')
      .replace(/&lt;@[A-Z0-9]+&gt;/g, '<strong class="slack-mention">@user</strong>')
      // #channels
      .replace(/&lt;#[A-Z0-9]+\|([^&>]+)&gt;/g, '<span class="slack-channel-ref">#$1</span>')
      // bold, italic, strikethrough, code
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/~([^~\n]+)~/g, '<del>$1</del>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // newlines
      .replace(/\n/g, '<br>');

    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    const result = this.sanitizer.bypassSecurityTrustHtml(sanitized);
    this.renderedMessages.set(msg.ts, result);
    return result;
  }

  openInSlack(ch: SlackChannel): void {
    window.open(`https://slack.com/app_redirect?channel=${ch.id}`, '_blank', 'noopener,noreferrer');
  }

  goToConnections(): void {
    this.navigationService.navigateTo('connections');
  }

  formatTime(ts: string): string {
    const date = new Date(parseFloat(ts) * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 1) {
      const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
      return `${mins}m ago`;
    }
    if (diffHours < 24) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatFullTime(ts: string): string {
    return new Date(parseFloat(ts) * 1000).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }
}
