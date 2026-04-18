import { Directive, Input, HostListener, OnDestroy } from '@angular/core';
import { TouchTooltipAlign, TouchTooltipService } from '../services/touch-tooltip.service';

@Directive({
  selector: '[appTouchTooltip]',
  standalone: true
})
export class TouchTooltipDirective implements OnDestroy {
  @Input('appTouchTooltip') label = '';
  @Input() touchTooltipAlign: TouchTooltipAlign = 'above';

  constructor(private service: TouchTooltipService) {}

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (this.label) {
      this.service.startPress(event, this.label, this.touchTooltipAlign);
    }
  }

  @HostListener('touchend')
  @HostListener('touchcancel')
  onTouchEnd(): void {
    this.service.cancelPress();
  }

  ngOnDestroy(): void {
    this.service.cancelPress();
  }
}
