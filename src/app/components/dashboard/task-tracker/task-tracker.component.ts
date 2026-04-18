import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService, Task } from '../../../services/task.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-task-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-tracker.component.html',
  styleUrl: './task-tracker.component.scss'
})
export class TaskTrackerComponent implements OnInit, OnDestroy {
  tasks: Task[] = [];
  private destroy$ = new Subject<void>();

  selectedFilter: 'all' | 'completed' | 'pending' = 'all';
  selectedPriority: 'all' | 'low' | 'medium' | 'high' = 'all';

  // New Task Form
  showNewTaskForm = false;
  newTask = {
    title: '',
    description: '',
    urgency: 'medium' as 'time-sensitive' | 'medium' | 'low',
    importance: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    tags: '',
    recurring: false,
    recurringType: 'weekday' as 'weekday' | 'monthday' | 'interval',
    recurringValue: 1
  };

  // Edit Task
  editingTaskId: string | null = null;
  editForm = {
    title: '',
    description: '',
    urgency: 'medium' as 'time-sensitive' | 'medium' | 'low',
    importance: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    tags: '',
    recurring: false,
    recurringType: 'weekday' as 'weekday' | 'monthday' | 'interval',
    recurringValue: 1
  };

  constructor(private taskService: TaskService) {}

  ngOnInit() {
    this.taskService.tasks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        this.tasks = tasks;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredTasks(): Task[] {
    return this.tasks
      .filter(task => {
        const statusMatch = this.selectedFilter === 'all' ||
                           (this.selectedFilter === 'completed' && task.completed) ||
                           (this.selectedFilter === 'pending' && !task.completed);
        const priorityMatch = this.selectedPriority === 'all' || task.priority === this.selectedPriority;
        return statusMatch && priorityMatch;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return this.taskSortScore(a) - this.taskSortScore(b);
      });
  }

  private taskSortScore(task: Task): number {
    const uRank: Record<string, number> = { 'time-sensitive': 0, 'medium': 1, 'low': 2 };
    const iRank: Record<string, number> = { 'high': 0, 'medium': 1, 'low': 2 };
    return (uRank[task.urgency ?? 'medium'] ?? 1) * 3 + (iRank[task.importance ?? 'medium'] ?? 1);
  }

  get tasksByStatus() {
    return {
      total: this.tasks.length,
      completed: this.tasks.filter(t => t.completed).length,
      pending: this.tasks.filter(t => !t.completed).length,
      overdue: this.tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length
    };
  }

  toggleNewTaskForm() {
    this.showNewTaskForm = !this.showNewTaskForm;
    if (!this.showNewTaskForm) {
      this.resetNewTaskForm();
    }
  }

  resetNewTaskForm() {
    this.newTask = {
      title: '',
      description: '',
      urgency: 'medium',
      importance: 'medium',
      dueDate: '',
      tags: '',
      recurring: false,
      recurringType: 'weekday',
      recurringValue: 1
    };
  }

  addTask() {
    if (!this.newTask.title.trim()) {
      return;
    }

    const tagsArray = this.newTask.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    this.taskService.addTask({
      title: this.newTask.title.trim(),
      description: this.newTask.description?.trim(),
      urgency: this.newTask.urgency,
      importance: this.newTask.importance,
      dueDate: this.newTask.dueDate ? new Date(this.newTask.dueDate) : undefined,
      tags: tagsArray,
      recurring: this.newTask.recurring,
      recurringType: this.newTask.recurring ? this.newTask.recurringType : undefined,
      recurringValue: this.newTask.recurring ? this.newTask.recurringValue : undefined
    });

    this.toggleNewTaskForm();
  }

  toggleTaskCompletion(task: Task) {
    this.taskService.toggleTaskCompletion(task.id);
  }

  deleteTask(taskId: string) {
    if (confirm('Are you sure you want to delete this task?')) {
      this.taskService.deleteTask(taskId);
    }
  }

  startEditTask(task: Task) {
    this.editingTaskId = task.id;
    this.editForm = {
      title: task.title,
      description: task.description || '',
      urgency: task.urgency || 'medium',
      importance: task.importance || 'medium',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
      tags: task.tags?.join(', ') || '',
      recurring: task.recurring || false,
      recurringType: task.recurringType || 'weekday',
      recurringValue: task.recurringValue ?? 1
    };
  }

  saveTaskEdit() {
    if (!this.editingTaskId || !this.editForm.title.trim()) {
      return;
    }

    const tagsArray = this.editForm.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    this.taskService.updateTask(this.editingTaskId, {
      title: this.editForm.title.trim(),
      description: this.editForm.description?.trim(),
      urgency: this.editForm.urgency,
      importance: this.editForm.importance,
      dueDate: this.editForm.dueDate ? new Date(this.editForm.dueDate) : undefined,
      tags: tagsArray,
      recurring: this.editForm.recurring,
      recurringType: this.editForm.recurring ? this.editForm.recurringType : undefined,
      recurringValue: this.editForm.recurring ? this.editForm.recurringValue : undefined
    });

    this.cancelEdit();
  }

  cancelEdit() {
    this.editingTaskId = null;
    this.editForm = {
      title: '',
      description: '',
      urgency: 'medium',
      importance: 'medium',
      dueDate: '',
      tags: '',
      recurring: false,
      recurringType: 'weekday',
      recurringValue: 1
    };
  }

  isEditing(taskId: string): boolean {
    return this.editingTaskId === taskId;
  }

  clearCompletedTasks() {
    if (confirm('Are you sure you want to delete all completed tasks?')) {
      this.taskService.deleteCompletedTasks();
    }
  }

  getPriorityClass(priority: string): string {
    const priorityClasses: { [key: string]: string } = {
      'low': 'priority-low',
      'medium': 'priority-medium',
      'high': 'priority-high'
    };
    return priorityClasses[priority] || '';
  }

  getUrgencyClass(urgency: string): string {
    return { 'time-sensitive': 'urgency-critical', 'medium': 'urgency-medium', 'low': 'urgency-low' }[urgency] || 'urgency-medium';
  }

  getImportanceClass(importance: string): string {
    return { 'high': 'importance-high', 'medium': 'importance-medium', 'low': 'importance-low' }[importance] || 'importance-medium';
  }

  getRecurringLabel(task: Task): string {
    if (!task.recurring || !task.recurringType) return '';
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    switch (task.recurringType) {
      case 'weekday': return `Repeats every ${days[task.recurringValue ?? 0]}`;
      case 'monthday': return `Repeats on the ${task.recurringValue}${this.ordinal(task.recurringValue ?? 1)} of each month`;
      case 'interval': return `Repeats every ${task.recurringValue} day${task.recurringValue !== 1 ? 's' : ''}`;
      default: return '';
    }
  }

  private ordinal(n: number): string {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  getLastCompletion(task: Task): { date: string; by: string } | null {
    if (!task.completions || task.completions.length === 0) return null;
    const last = task.completions[task.completions.length - 1];
    return { date: this.formatDate(last.completedAt), by: last.completedByEmail || last.completedByUid };
  }

  isOverdue(task: Task): boolean {
    return !task.completed && task.dueDate ? new Date() > new Date(task.dueDate) : false;
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'No due date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(date));
  }

  getDaysUntilDue(task: Task): number {
    if (!task.dueDate) return 0;
    const now = new Date();
    const due = new Date(task.dueDate);
    const diff = due.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  trackByTaskId(index: number, task: Task): string {
    return task.id;
  }

  // Convert URLs in text to clickable links with succinct text
  convertUrlsToLinks(text: string | undefined): string {
    if (!text) return '';
    
    // Regular expression to match URLs
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    
    return text.replace(urlPattern, (url) => {
      // Extract domain and path for succinct link text
      let linkText = 'link';
      
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        // Use domain name or last meaningful path segment
        if (pathParts.length > 0) {
          const lastPart = pathParts[pathParts.length - 1];
          // If it's a work item or issue, use that
          if (/\d+/.test(lastPart) || lastPart.includes('issue') || lastPart.includes('item')) {
            linkText = lastPart.length > 20 ? lastPart.substring(0, 20) + '...' : lastPart;
          } else {
            linkText = hostname.split('.')[0]; // First part of domain
          }
        } else {
          linkText = hostname.split('.')[0];
        }
      } catch (e) {
        linkText = 'link';
      }
      
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${url}">${linkText}</a>`;
    });
  }
}