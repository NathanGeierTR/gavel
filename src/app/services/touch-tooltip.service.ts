import { Injectable, OnDestroy } from '@angular/core';

export type TooltipAlign = 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'top-left';

@Injectable({ providedIn: 'root' })
export class TouchTooltipService implements OnDestroy {
  private el: HTMLSpanElement | null = null;
  private dismissHandler: (() => void) | null = null;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;

  private ensure(): void {
    if (this.el) return;
    const span = document.createElement('span');
    span.className = 'touch-tooltip';
    span.style.display = 'none';
    document.body.appendChild(span);
    this.el = span;
  }

  /** Show on tap — defers the dismiss listener so the current touchend doesn't immediately dismiss. */
  showOnTap(rect: DOMRect, label: string, align: TooltipAlign = 'top'): void {
    this.clearDismissListener();
    this.showForElement(rect, label, align);
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null;
      this.dismissHandler = () => this.hide();
      document.addEventListener('touchstart', this.dismissHandler, { once: true, capture: true });
    }, 0);
  }

  showForElement(rect: DOMRect, label: string, align: TooltipAlign = 'top'): void {
    this.ensure();
    const el = this.el!;
    el.textContent = label;
    el.style.display = '';
    el.style.transform = '';

    const sx = window.scrollX;
    const sy = window.scrollY;
    const gap = 6;
    const cx = rect.left + sx + rect.width / 2;
    const cy = rect.top + sy + rect.height / 2;

    switch (align) {
      case 'top':
        el.style.left = `${cx}px`;
        el.style.top = `${rect.top + sy - gap}px`;
        el.style.transform = 'translate(-50%, -100%)';
        break;
      case 'top-right':
        el.style.left = `${rect.right + sx}px`;
        el.style.top = `${rect.top + sy - gap}px`;
        el.style.transform = 'translateY(-100%)';
        break;
      case 'right':
        el.style.left = `${rect.right + sx + gap}px`;
        el.style.top = `${cy}px`;
        el.style.transform = 'translateY(-50%)';
        break;
      case 'bottom-right':
        el.style.left = `${rect.right + sx}px`;
        el.style.top = `${rect.bottom + sy + gap}px`;
        el.style.transform = 'none';
        break;
      case 'bottom':
        el.style.left = `${cx}px`;
        el.style.top = `${rect.bottom + sy + gap}px`;
        el.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-left':
        el.style.left = `${rect.left + sx}px`;
        el.style.top = `${rect.bottom + sy + gap}px`;
        el.style.transform = 'translateX(-100%)';
        break;
      case 'left':
        el.style.left = `${rect.left + sx - gap}px`;
        el.style.top = `${cy}px`;
        el.style.transform = 'translate(-100%, -50%)';
        break;
      case 'top-left':
        el.style.left = `${rect.left + sx}px`;
        el.style.top = `${rect.top + sy - gap}px`;
        el.style.transform = 'translate(-100%, -100%)';
        break;
    }
  }

  private clearDismissListener(): void {
    if (this.scheduleTimer !== null) { clearTimeout(this.scheduleTimer); this.scheduleTimer = null; }
    if (this.dismissHandler) {
      document.removeEventListener('touchstart', this.dismissHandler, { capture: true });
      this.dismissHandler = null;
    }
  }

  hide(): void {
    this.clearDismissListener();
    if (this.el) this.el.style.display = 'none';
  }

  ngOnDestroy(): void {
    this.clearDismissListener();
    this.el?.remove();
  }
}
