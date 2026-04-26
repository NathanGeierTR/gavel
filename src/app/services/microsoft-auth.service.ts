import { Injectable } from '@angular/core';
import { PublicClientApplication, AccountInfo, Configuration } from '@azure/msal-browser';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

const MSAL_CONFIG: Configuration = {
  auth: {
    clientId: '81487b5a-7593-4e79-b638-d86866336f6d',
    authority: 'https://login.microsoftonline.com/organizations',
    redirectUri: environment.msalRedirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

// Only scopes that are user-consentable (no admin approval required).
// Presence.Read.All and User.ReadBasic.All require admin consent and are excluded.
const LOGIN_SCOPES = [
  'User.Read',
  'Calendars.Read',
  'MailboxSettings.Read',
];

@Injectable({ providedIn: 'root' })
export class MicrosoftAuthService {
  private msalInstance = new PublicClientApplication(MSAL_CONFIG);
  private initPromise: Promise<void>;

  private accountSubject = new BehaviorSubject<AccountInfo | null>(null);
  account$: Observable<AccountInfo | null> = this.accountSubject.asObservable();
  isAuthenticated$: Observable<boolean> = this.account$.pipe(map(a => !!a));

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.msalInstance.initialize();
    // Handle redirect response in case the app was loaded as a redirect target
    await this.msalInstance.handleRedirectPromise().catch(() => {});
    // Restore previously authenticated account from MSAL cache
    const accounts = this.msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      this.msalInstance.setActiveAccount(accounts[0]);
      this.accountSubject.next(accounts[0]);
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  async signIn(): Promise<void> {
    await this.ensureInitialized();
    const result = await this.msalInstance.loginPopup({ scopes: LOGIN_SCOPES });
    this.msalInstance.setActiveAccount(result.account);
    this.accountSubject.next(result.account);
  }

  async signOut(): Promise<void> {
    await this.ensureInitialized();
    const account = this.accountSubject.value ?? undefined;
    await this.msalInstance.logoutPopup({ account });
    this.accountSubject.next(null);
  }

  async getToken(scopes: string[]): Promise<string | null> {
    await this.ensureInitialized();
    const account = this.accountSubject.value ?? this.msalInstance.getActiveAccount();
    if (!account) return null;
    try {
      const result = await this.msalInstance.acquireTokenSilent({ scopes, account });
      return result.accessToken;
    } catch (silentError: any) {
      // If the error is a consent/interaction-required error for a scope that wasn't
      // consented at login, don't show a popup — just return null so callers can
      // fail gracefully. Only fall back to popup for actual token-expiry errors.
      const interactionCodes = ['interaction_required', 'consent_required', 'login_required'];
      const code: string = silentError?.errorCode ?? '';
      if (interactionCodes.some(c => code.includes(c))) {
        // Try a popup only for session/token expiry, not for missing consent
        const isConsentError = code.includes('consent_required');
        if (isConsentError) return null;
        try {
          const result = await this.msalInstance.acquireTokenPopup({ scopes, account });
          return result.accessToken;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  getAccount(): AccountInfo | null {
    return this.accountSubject.value;
  }
}
