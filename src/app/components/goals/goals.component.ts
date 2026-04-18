import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoalsService, Goal } from '../../services/goals.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './goals.component.html',
  styleUrl: './goals.component.scss'
})
export class GoalsComponent implements OnInit, OnDestroy {
  goals: Goal[] = [];
  currentYear = new Date().getFullYear();
  years: number[] = [];

  // New goal form
  newTitle = '';
  newDescription = '';
  newYear = this.currentYear;
  isSubmitting = false;

  // Edit state
  editingId: string | null = null;
  editTitle = '';
  editDescription = '';
  editYear = this.currentYear;
  isSavingEdit = false;

  deletingId: string | null = null;

  private sub?: Subscription;

  constructor(private goalsService: GoalsService) {
    for (let y = this.currentYear + 1; y >= this.currentYear - 3; y--) {
      this.years.push(y);
    }
  }

  ngOnInit(): void {
    this.sub = this.goalsService.goals$.subscribe(goals => {
      this.goals = goals;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get goalsForSelectedYear(): Goal[] {
    return this.goals.filter(g => g.year === this.viewYear);
  }

  countForYear(year: number): number {
    return this.goals.filter(g => g.year === year).length;
  }

  viewYear = this.currentYear;

  async addGoal(): Promise<void> {
    if (!this.newTitle.trim() || this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      await this.goalsService.addGoal(this.newTitle, this.newDescription, this.newYear);
      this.viewYear = this.newYear;
      this.newTitle = '';
      this.newDescription = '';
      this.newYear = this.currentYear;
    } finally {
      this.isSubmitting = false;
    }
  }

  onNewKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      this.addGoal();
    }
  }

  startEdit(goal: Goal): void {
    this.editingId = goal.id;
    this.editTitle = goal.title;
    this.editDescription = goal.description;
    this.editYear = goal.year;
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  async saveEdit(): Promise<void> {
    if (!this.editingId || !this.editTitle.trim() || this.isSavingEdit) return;
    this.isSavingEdit = true;
    try {
      await this.goalsService.updateGoal(this.editingId, this.editTitle, this.editDescription, this.editYear);
      this.cancelEdit();
    } finally {
      this.isSavingEdit = false;
    }
  }

  async deleteGoal(id: string): Promise<void> {
    if (this.deletingId) return;
    this.deletingId = id;
    try {
      await this.goalsService.deleteGoal(id);
    } finally {
      this.deletingId = null;
    }
  }
}
