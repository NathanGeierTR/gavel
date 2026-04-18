import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type AppView = 'dashboard' | 'connections' | 'journal' | 'goals' | 'open-arena-chat';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private _navigate$ = new Subject<AppView>();
  readonly navigate$ = this._navigate$.asObservable();

  navigateTo(view: AppView): void {
    this._navigate$.next(view);
  }
}
