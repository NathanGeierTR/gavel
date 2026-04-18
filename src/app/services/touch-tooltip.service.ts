import { Injectable, OnDestroy } from '@angular/core';

export type TouchTooltipAlign = 'above' | 'bottom-right' | 'bottom-left';

@Injectable({ providedIn: 'root' })
export class TouchTooltipService implements OnDestroy {
  private el: HTMLSpanElement | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  private ensure(): void {
    if (this.el) return;
    const span = document.createElement('span');
    span.className = 'touch-tooltip';
    span.style.display = 'none';
    document.body.appendChild(span);
    this.el = span;
  }

  startPress(event: TouchEvent, label: string, align: TouchTooltipAlign = 'above'): void {
    // Cancel any pending show or auto-hide from a previous press
    if (this.longPressTimer !== null) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.hide();

    const touch = event.touches[0];
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.show(touch.clientX, touch.clientY, label, align);
      // Auto-hide after 1.5 s so the user can read it
      this.hideTimer = setTimeout(() => this.hide(), 1500);
    }, 400);
  }

  /** Called on touchend/touchcancel — only cancels a pending show; does NOT hide a visible tooltip. */
  cancelPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    // Leave a visible tooltip in place — the auto-hide timer will dismiss it.
  }

  private show(x: number, y: number, label: string, align: TouchTooltipAlign): void {
    this.ensure();
    const el = this.el!;
    el.textContent = label;
    el.style.display = '';

    let left = x;
    let top = y;
    let transform = 'translateX(-50%)';

    if (align === 'bottom-right') {
      transform = 'none';
      top = y + 20;
    } else if (align === 'bottom-left') {
      transform = 'translateX(-100%)';
      top = y + 20;
    } else {
      top = y - 44;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transform = transform;
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  ngOnDestroy(): void {
    this.el?.remove();
    if (this.longPressTimer !== null) clearTimeout(this.longPressTimer);
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
  }
}
