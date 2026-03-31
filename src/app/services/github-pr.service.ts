import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user: GitHubUser;
  assignees: GitHubUser[];
  requested_reviewers: GitHubUser[];
  labels: GitHubLabel[];
  repository: GitHubRepo;
  repository_url: string;
  comments: number;
  review_comments: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubPullRequest[];
}

export type PrFilter = 'assigned' | 'review-requested' | 'all';

export interface DiagnosticInfo {
  lastQuery: string | null;
  totalCount: number | null;
  httpStatus: number | null;
  httpMessage: string | null;
  resolvedUsername: string | null;
}

const STORAGE_KEY = 'github-pr-token';
const STORAGE_USERNAME_KEY = 'github-pr-username';

@Injectable({
  providedIn: 'root'
})
export class GitHubPrService {
  private readonly apiBase = '/github-api';

  private token = '';
  private username = '';

  private prsSubject = new BehaviorSubject<GitHubPullRequest[]>([]);
  public prs$ = this.prsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();

  private diagnosticSubject = new BehaviorSubject<DiagnosticInfo>({
    lastQuery: null, totalCount: null, httpStatus: null, httpMessage: null, resolvedUsername: null
  });
  public diagnostic$ = this.diagnosticSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfiguration();
  }

  // ── Configuration ────────────────────────────────────────────

  initialize(token: string, username: string): void {
    this.token = token.trim();
    this.username = username.trim();
    this.saveConfiguration();
    this.connectedSubject.next(true);

    // Auto-resolve username from the API if not provided
    if (!this.username) {
      this.fetchAuthenticatedUser().subscribe({
        next: user => {
          this.username = user.login;
          localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: user.login });
        },
        error: () => { /* non-fatal — queries will fall back to @me */ }
      });
    } else {
      this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: this.username });
    }
  }

  clearConfiguration(): void {
    this.token = '';
    this.username = '';
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USERNAME_KEY);
    this.connectedSubject.next(false);
    this.prsSubject.next([]);
    this.errorSubject.next(null);
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  getUsername(): string {
    return this.username;
  }

  /** Re-run the /user call and update diagnostics — useful for manual troubleshooting. */
  verifyToken(): void {
    this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: '(verifying…)' });
    this.fetchAuthenticatedUser().subscribe({
      next: user => {
        if (user.login !== this.username) {
          this.username = user.login;
          localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
        }
        this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: user.login, httpStatus: 200, httpMessage: null });
      },
      error: (err: HttpErrorResponse) => {
        const status = err?.status ?? null;
        const msg = err?.error?.message ?? null;
        this.diagnosticSubject.next({
          ...this.diagnosticSubject.value,
          resolvedUsername: `ERROR ${status ?? '?'}${msg ? ': ' + msg : ''}`,
          httpStatus: status,
          httpMessage: msg
        });
      }
    });
  }

  private saveConfiguration(): void {
    localStorage.setItem(STORAGE_KEY, this.token);
    localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
  }

  private loadConfiguration(): void {
    this.token = localStorage.getItem(STORAGE_KEY) || '';
    this.username = localStorage.getItem(STORAGE_USERNAME_KEY) || '';
    this.connectedSubject.next(!!this.token);

    if (this.token) {
      // Immediately populate diagnostics with whatever is stored
      this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: this.username || '(verifying…)' });

      // Verify actual identity from the token — corrects a wrong/missing stored username
      this.fetchAuthenticatedUser().subscribe({
        next: user => {
          if (user.login !== this.username) {
            this.username = user.login;
            localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
          }
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: user.login });
        },
        error: (err: HttpErrorResponse) => {
          const status = err?.status ?? null;
          const msg = err?.error?.message ?? null;
          this.diagnosticSubject.next({
            ...this.diagnosticSubject.value,
            resolvedUsername: `ERROR ${status ?? '?'}${msg ? ': ' + msg : ''}`,
            httpStatus: status,
            httpMessage: msg
          });
        }
      });
    }
  }

  // ── HTTP helpers ─────────────────────────────────────────────

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    });
  }

  // ── Core API calls ───────────────────────────────────────────

  /**
   * Fetch the authenticated user's login (to verify token and auto-fill username).
   */
  fetchAuthenticatedUser(): Observable<GitHubUser> {
    return this.http.get<GitHubUser>(`${this.apiBase}/user`, {
      headers: this.headers()
    });
  }

  /**
   * Search for open pull requests by filter type.
   *   'assigned'         – PRs where you are an assignee
   *   'review-requested' – PRs where your review is requested
   *   'all'              – both of the above combined
   */
  fetchPullRequests(filter: PrFilter = 'assigned'): Observable<GitHubPullRequest[]> {
    if (!this.token) {
      this.errorSubject.next('GitHub token not configured.');
      return of([]);
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    let query: string;
    const actor = this.username || '@me';

    if (filter === 'all') {
      query = `is:pr is:open involves:${actor} archived:false`;
    } else if (filter === 'review-requested') {
      query = `is:pr is:open review-requested:${actor} archived:false`;
    } else {
      query = `is:pr is:open assignee:${actor} archived:false`;
    }

    const url = `${this.apiBase}/search/issues?q=${encodeURIComponent(query)}&per_page=50&sort=updated&order=desc`;

    this.diagnosticSubject.next({ ...this.diagnosticSubject.value, lastQuery: query, totalCount: null, httpStatus: null, httpMessage: null });

    return this.http
      .get<GitHubSearchResult>(url, { headers: this.headers() })
      .pipe(
        map(result => {
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, totalCount: result.total_count, httpStatus: 200, httpMessage: null });
          return this.normalizeSearchItems(result.items);
        }),
        tap(prs => {
          this.prsSubject.next(prs);
          this.loadingSubject.next(false);
        }),
        catchError(err => {
          const httpErr = err as HttpErrorResponse;
          const status = httpErr?.status ?? null;
          const apiMessage = httpErr?.error?.message ?? null;
          const message = apiMessage
            ? `GitHub API error ${status}: ${apiMessage}`
            : `HTTP ${status ?? '?'}: Failed to fetch pull requests.`;
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, httpStatus: status, httpMessage: message });
          this.errorSubject.next(message);
          this.loadingSubject.next(false);
          return of([]);
        })
      );
  }

  /**
   * The Search API returns issues/PRs. Normalize into GitHubPullRequest shape
   * and add the repository info parsed from repository_url.
   */
  private normalizeSearchItems(items: any[]): GitHubPullRequest[] {
    return items.map(item => {
      const repoFullName = this.repoFullNameFromUrl(item.repository_url ?? '');
      return {
        ...item,
        state: item.state as 'open' | 'closed',
        draft: item.draft ?? false,
        assignees: item.assignees ?? [],
        requested_reviewers: item.requested_reviewers ?? [],
        labels: item.labels ?? [],
        comments: item.comments ?? 0,
        review_comments: item.review_comments ?? 0,
        repository: {
          id: 0,
          name: repoFullName.split('/')[1] ?? '',
          full_name: repoFullName,
          html_url: `https://github.com/${repoFullName}`
        }
      } as GitHubPullRequest;
    });
  }

  private repoFullNameFromUrl(repositoryUrl: string): string {
    // e.g. https://api.github.com/repos/owner/repo → owner/repo
    const match = repositoryUrl.match(/\/repos\/(.+)$/);
    return match ? match[1] : '';
  }
}
