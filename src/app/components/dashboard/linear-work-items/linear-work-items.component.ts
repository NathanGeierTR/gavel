import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LinearService, LinearIssue } from '../../../services/linear.service';
import { NavigationService } from '../../../services/navigation.service';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-linear-work-items',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './linear-work-items.component.html',
  styleUrl: './linear-work-items.component.scss'
})
export class LinearWorkItemsComponent implements OnInit, OnDestroy {
  issues: LinearIssue[] = [];
  loading = false;
  error: string | null = null;
  isConfigured = false;
  viewerName: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private linearService: LinearService,
    private navigationService: NavigationService
  ) {}

  ngOnInit(): void {
    this.linearService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        const justConfigured = !this.isConfigured && configured;
        this.isConfigured = configured;
        if (justConfigured) {
          this.loadIssues();
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadIssues());
        }
      });

    this.linearService.issues$
      .pipe(takeUntil(this.destroy$))
      .subscribe(issues => (this.issues = issues));

    this.linearService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => (this.loading = loading));

    this.linearService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => (this.error = error));

    this.linearService.viewer$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => (this.viewerName = v?.name ?? null));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadIssues(): void {
    this.linearService.fetchMyIssues().subscribe();
  }

  goToConnections(): void {
    this.navigationService.navigateTo('connections');
  }

  openIssue(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  getPriorityLabel(priority: number): string {
    return ['None', 'Urgent', 'High', 'Medium', 'Low'][priority] ?? 'None';
  }

  getPriorityClass(priority: number): string {
    return ['priority-none', 'priority-urgent', 'priority-high', 'priority-medium', 'priority-low'][priority] ?? 'priority-none';
  }

  getPriorityIcon(priority: number): string {
    const icons = ['fa-minus', 'fa-angles-up', 'fa-angle-up', 'fa-equals', 'fa-angle-down'];
    return icons[priority] ?? 'fa-minus';
  }

  isOverdue(issue: LinearIssue): boolean {
    if (!issue.dueDate) return false;
    return new Date(issue.dueDate) < new Date();
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getStateClass(type: string): string {
    const map: Record<string, string> = {
      started: 'state-started',
      unstarted: 'state-unstarted',
      backlog: 'state-backlog',
      completed: 'state-completed',
      cancelled: 'state-cancelled',
    };
    return map[type] ?? 'state-backlog';
  }
}
