import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface SlackChannel {
  id: string;
  name: string;
  /** 'channel' | 'im' | 'mpim' | 'group' */
  type: 'channel' | 'im' | 'mpim' | 'group';
  isMember: boolean;
  unreadCount?: number;
  latestMessage?: SlackMessage;
  messages?: SlackMessage[];
  loadError?: string;
  /** For IM channels: the display name of the other user */
  dmUserName?: string;
  dmUserAvatar?: string;
}

export interface SlackMessage {
  ts: string;
  text: string;
  user?: string;
  username?: string;
  /** resolved from users.info */
  displayName?: string;
  subtype?: string;
  files?: Array<{ name: string; permalink: string }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SlackService {
  private readonly BASE_URL = '/slack-api';
  private readonly STORAGE_KEY = 'slack-token';

  private tokenSubject = new BehaviorSubject<string | null>(localStorage.getItem(this.STORAGE_KEY));

  private isConfiguredSubject = new BehaviorSubject<boolean>(!!localStorage.getItem(this.STORAGE_KEY));
  readonly isConfigured$ = this.isConfiguredSubject.asObservable();

  private channelsSubject = new BehaviorSubject<SlackChannel[]>([]);
  readonly channels$ = this.channelsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  readonly error$ = this.errorSubject.asObservable();

  /** Cache of userId → display name */
  private userCache = new Map<string, string>();

  constructor(private http: HttpClient) {}

  setToken(token: string): void {
    localStorage.setItem(this.STORAGE_KEY, token);
    this.tokenSubject.next(token);
    this.isConfiguredSubject.next(true);
  }

  clearToken(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.tokenSubject.next(null);
    this.isConfiguredSubject.next(false);
    this.channelsSubject.next([]);
    this.userCache.clear();
  }

  private get token(): string | null {
    return this.tokenSubject.value;
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.token}` });
  }

  private slackGet<T>(method: string, params: Record<string, string> = {}): Observable<T> {
    const query = new URLSearchParams({ limit: '200', ...params }).toString();
    return this.http.get<T>(`${this.BASE_URL}/${method}?${query}`, { headers: this.headers() });
  }

  // ─── Channels ───────────────────────────────────────────────────────────────

  fetchChannels(): Observable<SlackChannel[]> {
    if (!this.token) {
      this.errorSubject.next('No Slack token configured');
      return of([]);
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    // Fetch both public/private channels (member=true) and DMs in parallel
    return forkJoin([
      this.slackGet<any>('conversations.list', {
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
        limit: '200',
      }).pipe(catchError(() => of({ ok: false, channels: [] }))),
      this.slackGet<any>('conversations.list', {
        types: 'im,mpim',
        exclude_archived: 'true',
        limit: '50',
      }).pipe(catchError(() => of({ ok: false, channels: [] }))),
    ]).pipe(
      switchMap(([chanResp, dmResp]) => {
        // Check for auth errors in either response first
        const authError = [chanResp, dmResp].find(
          r => !r.ok && (r.error === 'invalid_auth' || r.error === 'token_revoked' || r.error === 'not_authed')
        );
        if (authError) {
          this.clearToken();
          throw new Error('Token invalid or expired — please reconnect Slack');
        }

        // Surface missing_scope errors with the specific scope needed
        const scopeError = [chanResp, dmResp].find(r => !r.ok && r.error === 'missing_scope');
        if (scopeError) {
          const needed = scopeError.needed ?? 'unknown scope';
          throw new Error(
            `Missing Slack scope: ${needed}. Go to Connections → Slack and ensure all required scopes are added to your app.`
          );
        }

        // If both failed for another reason, surface the error
        if (!chanResp.ok && !dmResp.ok) {
          throw new Error(chanResp.error ?? dmResp.error ?? 'unknown_error');
        }

        const rawChannels: any[] = (chanResp.channels ?? []).filter((c: any) => c.is_member);
        const rawDMs: any[] = dmResp.channels ?? [];

        const channels: SlackChannel[] = rawChannels.map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.is_private ? 'group' : 'channel',
          isMember: true,
          unreadCount: c.unread_count ?? 0,
        }));

        const dmChannels: SlackChannel[] = rawDMs.map((c: any) => ({
          id: c.id,
          name: c.id,
          type: c.is_mpim ? 'mpim' : 'im',
          isMember: true,
          unreadCount: c.unread_count ?? 0,
          dmUserName: c.user ?? undefined,
        }));

        const all = [...channels, ...dmChannels];

        // Resolve DM user names
        const dmUserIds = dmChannels
          .filter(c => c.type === 'im' && c.dmUserName && !this.userCache.has(c.dmUserName!))
          .map(c => c.dmUserName!);

        if (!dmUserIds.length) {
          this.channelsSubject.next(all);
          this.loadingSubject.next(false);
          return of(all);
        }

        return forkJoin(
          dmUserIds.map(uid =>
            this.slackGet<any>('users.info', { user: uid }).pipe(
              map((r: any) => ({ uid, name: r.user?.real_name ?? r.user?.name ?? uid })),
              catchError(() => of({ uid, name: uid }))
            )
          )
        ).pipe(
          map((resolved: Array<{ uid: string; name: string }>) => {
            resolved.forEach(r => this.userCache.set(r.uid, r.name));
            const withNames = all.map(ch =>
              ch.type === 'im' && ch.dmUserName
                ? { ...ch, dmUserName: this.userCache.get(ch.dmUserName) ?? ch.dmUserName }
                : ch
            );
            this.channelsSubject.next(withNames);
            this.loadingSubject.next(false);
            return withNames;
          })
        );
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        this.errorSubject.next(error.message || 'Failed to load Slack channels');
        return of([]);
      })
    );
  }

  // ─── Messages ───────────────────────────────────────────────────────────────

  fetchMessages(channelId: string, limit = 20): Observable<SlackMessage[]> {
    if (!this.token) return of([]);

    return this.slackGet<any>('conversations.history', {
      channel: channelId,
      limit: String(limit),
    }).pipe(
      switchMap(resp => {
        if (!resp.ok) {
          const err = resp.error ?? 'unknown';
          throw new Error(err === 'channel_not_found' ? 'Channel not found or no access' : err);
        }

        const messages: SlackMessage[] = (resp.messages ?? [])
          .filter((m: any) => !m.subtype || m.subtype === 'bot_message')
          .map((m: any) => ({
            ts: m.ts,
            text: m.text ?? '',
            user: m.user,
            username: m.username,
            displayName: m.user ? (this.userCache.get(m.user) ?? m.user) : (m.username ?? 'App'),
          }));

        // Resolve any user IDs not yet in cache
        const unknownIds = [...new Set(
          messages.filter(m => m.user && !this.userCache.has(m.user)).map(m => m.user!)
        )];

        if (!unknownIds.length) {
          this.patchChannelMessages(channelId, messages);
          return of(messages);
        }

        return forkJoin(
          unknownIds.map(uid =>
            this.slackGet<any>('users.info', { user: uid }).pipe(
              map((r: any) => ({ uid, name: r.user?.real_name ?? r.user?.name ?? uid })),
              catchError(() => of({ uid, name: uid }))
            )
          )
        ).pipe(
          map((resolved: Array<{ uid: string; name: string }>) => {
            resolved.forEach(r => this.userCache.set(r.uid, r.name));
            const withNames = messages.map(m =>
              m.user ? { ...m, displayName: this.userCache.get(m.user) ?? m.user } : m
            );
            this.patchChannelMessages(channelId, withNames);
            return withNames;
          })
        );
      }),
      catchError(error => {
        this.patchChannelError(channelId, error.message || 'Failed to load messages');
        return of([]);
      })
    );
  }

  private patchChannelMessages(channelId: string, messages: SlackMessage[]): void {
    const updated = this.channelsSubject.getValue().map(ch =>
      ch.id === channelId ? { ...ch, messages, latestMessage: messages[0], loadError: undefined } : ch
    );
    this.channelsSubject.next(updated);
  }

  private patchChannelError(channelId: string, error: string): void {
    const updated = this.channelsSubject.getValue().map(ch =>
      ch.id === channelId ? { ...ch, messages: [], loadError: error } : ch
    );
    this.channelsSubject.next(updated);
  }
}
