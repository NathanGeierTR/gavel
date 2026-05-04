import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, merge, Subject } from 'rxjs';
import { pairwise, filter, debounceTime } from 'rxjs/operators';
import { MicrosoftCalendarService } from './microsoft-calendar.service';
import { MicrosoftMailService } from './microsoft-mail.service';
import { MicrosoftTeamsService } from './microsoft-teams.service';

/**
 * Keys we track to detect "was connected last session, but token was cleared"
 * (e.g. a 401 wiped localStorage mid-session and the user reloaded).
 */
const SENTINEL_KEY = 'ms-graph-was-connected';

@Injectable({ providedIn: 'root' })
export class MsGraphConnectService {
  private modalOpenSubject = new BehaviorSubject<boolean>(false);
  readonly modalOpen$ = this.modalOpenSubject.asObservable();

  /**
   * Emits once whenever any MS Graph service transitions from connected → disconnected,
   * OR when the app loads and the user was previously connected but the token is now absent
   * (cleared by a prior 401). One emission per page-load, collapsed via debounceTime.
   */
  readonly tokenExpired$: Observable<unknown>;

  constructor(
    private calendarService: MicrosoftCalendarService,
    private mailService: MicrosoftMailService,
    private teamsService: MicrosoftTeamsService
  ) {
    // Fired when a live transition occurs (token expires during the session)
    const liveExpiry$ = merge(
      calendarService.isConfigured$.pipe(
        pairwise(), filter(([prev, curr]) => prev && !curr)
      ),
      mailService.isConfigured$.pipe(
        pairwise(), filter(([prev, curr]) => prev && !curr)
      ),
      teamsService.isAuthenticated$.pipe(
        pairwise(), filter(([prev, curr]) => prev && !curr)
      )
    ).pipe(debounceTime(100));

    // Fired once on startup if the user was previously connected but all tokens are now gone
    const startupExpiry$ = new Subject<void>();
    this.tokenExpired$ = merge(liveExpiry$, startupExpiry$);

    // Check after services have initialised (they run synchronously in their constructors)
    const wasConnected = localStorage.getItem(SENTINEL_KEY) === 'true';
    const anyConnectedNow =
      calendarService.isConfigured() ||
      mailService.isConfigured() ||
      !!localStorage.getItem('ms-teams-token');

    if (wasConnected && !anyConnectedNow) {
      // Emit asynchronously so subscribers in app.component.ts have time to subscribe
      Promise.resolve().then(() => startupExpiry$.next());
    }

    // Keep the sentinel in sync: set when connected, clear when fully disconnected
    merge(
      calendarService.isConfigured$,
      mailService.isConfigured$,
      teamsService.isAuthenticated$
    ).subscribe(() => {
      const connected =
        calendarService.isConfigured() ||
        mailService.isConfigured() ||
        !!localStorage.getItem('ms-teams-token');
      if (connected) {
        localStorage.setItem(SENTINEL_KEY, 'true');
      } else {
        localStorage.removeItem(SENTINEL_KEY);
      }
    });
  }

  openModal(): void {
    this.modalOpenSubject.next(true);
  }

  closeModal(): void {
    this.modalOpenSubject.next(false);
  }

  /**
   * Apply one MS Graph token to all three MS services at once.
   * Each service stores it independently under its own localStorage key,
   * so they can also be managed individually on the Connections page.
   */
  applyToken(token: string): void {
    const t = token.trim();
    this.calendarService.initialize(t);
    this.mailService.initialize(t);
    this.teamsService.setAccessToken(t);
    this.closeModal();
  }
}
