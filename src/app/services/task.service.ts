import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Firestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, writeBatch, arrayUnion
} from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';

export interface TaskCompletion {
  completedAt: Date;
  completedByUid: string;
  completedByEmail?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
  priority?: 'low' | 'medium' | 'high';
  urgency?: 'time-sensitive' | 'medium' | 'low';
  importance?: 'low' | 'medium' | 'high';
  recurring?: boolean;
  recurringType?: 'weekday' | 'monthday' | 'interval';
  recurringValue?: number;
  completions?: TaskCompletion[];
  tags?: string[];
  timeTracked?: number; // Total seconds tracked
  isTimeRunning?: boolean;
  timeStartedAt?: number; // Timestamp when current session started
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private tasksSubject = new BehaviorSubject<Task[]>([]);
  public tasks$: Observable<Task[]> = this.tasksSubject.asObservable();

  private unsubscribeTasks: (() => void) | null = null;
  private currentUserId: string | null = null;
  private currentUserEmail: string | undefined = undefined;

  constructor(private firestore: Firestore, private auth: Auth) {
    user(this.auth).subscribe(firebaseUser => {
      this.cleanup();
      if (firebaseUser) {
        this.currentUserId = firebaseUser.uid;
        this.currentUserEmail = firebaseUser.email ?? undefined;
        this.subscribeTasks(firebaseUser.uid);
      } else {
        this.currentUserId = null;
        this.currentUserEmail = undefined;
        this.tasksSubject.next([]);
      }
    });
  }

  private tasksCollectionRef(uid: string) {
    return collection(this.firestore, `users/${uid}/tasks`);
  }

  private subscribeTasks(uid: string): void {
    const q = query(this.tasksCollectionRef(uid), orderBy('createdAt', 'desc'));
    this.unsubscribeTasks = onSnapshot(q, snapshot => {
      const tasks: Task[] = snapshot.docs.map(d => this.fromFirestore(d.id, d.data()));
      this.tasksSubject.next(tasks);
    }, e => console.error('Failed to listen to tasks:', e));
  }

  private cleanup(): void {
    if (this.unsubscribeTasks) {
      this.unsubscribeTasks();
      this.unsubscribeTasks = null;
    }
  }

  private fromFirestore(id: string, data: any): Task {
    return {
      id,
      title: data['title'],
      description: data['description'] ?? undefined,
      completed: data['completed'] ?? false,
      dueDate: data['dueDate']?.toDate?.() ?? (data['dueDate'] ? new Date(data['dueDate']) : undefined),
      createdAt: data['createdAt']?.toDate?.() ?? new Date(data['createdAt']),
      completedAt: data['completedAt']?.toDate?.() ?? (data['completedAt'] ? new Date(data['completedAt']) : undefined),
      priority: data['priority'] ?? 'medium',
      urgency: data['urgency'] ?? 'medium',
      importance: data['importance'] ?? 'medium',
      recurring: data['recurring'] ?? false,
      recurringType: data['recurringType'] ?? undefined,
      recurringValue: data['recurringValue'] ?? undefined,
      completions: (data['completions'] ?? []).map((c: any) => ({
        completedAt: typeof c.completedAt === 'string' ? new Date(c.completedAt) : (c.completedAt?.toDate?.() ?? new Date()),
        completedByUid: c.completedByUid ?? '',
        completedByEmail: c.completedByEmail ?? undefined
      })),
      tags: data['tags'] ?? [],
      timeTracked: data['timeTracked'] ?? 0,
      isTimeRunning: data['isTimeRunning'] ?? false,
      timeStartedAt: data['timeStartedAt'] ?? undefined
    };
  }

  private toFirestoreData(task: Partial<Task>): Record<string, any> {
    const data: Record<string, any> = { ...task };
    delete data['id'];
    Object.keys(data).forEach(k => { if (data[k] === undefined) data[k] = null; });
    return data;
  }

  private taskDocRef(taskId: string) {
    if (!this.currentUserId) throw new Error('User not authenticated');
    return doc(this.firestore, `users/${this.currentUserId}/tasks/${taskId}`);
  }

  getTasks(): Task[] {
    return this.tasksSubject.value;
  }

  getTaskById(id: string): Task | undefined {
    return this.tasksSubject.value.find(task => task.id === id);
  }

  addTask(taskData: Omit<Task, 'id' | 'createdAt' | 'completed'>): void {
    if (!this.currentUserId) return;
    const newTask = {
      title: taskData.title,
      description: taskData.description ?? null,
      completed: false,
      dueDate: taskData.dueDate ?? null,
      createdAt: new Date(),
      completedAt: null,
      priority: taskData.priority ?? 'medium',
      urgency: taskData.urgency ?? 'medium',
      importance: taskData.importance ?? 'medium',
      recurring: taskData.recurring ?? false,
      recurringType: taskData.recurringType ?? null,
      recurringValue: taskData.recurringValue ?? null,
      completions: [],
      tags: taskData.tags ?? [],
      timeTracked: 0,
      isTimeRunning: false,
      timeStartedAt: null
    };
    addDoc(this.tasksCollectionRef(this.currentUserId), newTask)
      .catch(e => console.error('Failed to add task:', e));
  }

  updateTask(id: string, updates: Partial<Task>): void {
    updateDoc(this.taskDocRef(id), this.toFirestoreData(updates))
      .catch(e => console.error('Failed to update task:', e));
  }

  toggleTaskCompletion(id: string): void {
    const task = this.getTaskById(id);
    if (!task) return;
    const completed = !task.completed;
    const updates: Record<string, any> = {
      completed,
      completedAt: completed ? new Date() : null
    };
    if (completed && task.recurring && this.currentUserId) {
      updates['completions'] = arrayUnion({
        completedAt: new Date().toISOString(),
        completedByUid: this.currentUserId,
        completedByEmail: this.currentUserEmail ?? null
      });
    }
    updateDoc(this.taskDocRef(id), updates)
      .catch(e => console.error('Failed to toggle task:', e));
  }

  deleteTask(id: string): void {
    deleteDoc(this.taskDocRef(id))
      .catch(e => console.error('Failed to delete task:', e));
  }

  deleteCompletedTasks(): void {
    if (!this.currentUserId) return;
    const completed = this.tasksSubject.value.filter(t => t.completed);
    const batch = writeBatch(this.firestore);
    completed.forEach(t => {
      batch.delete(doc(this.firestore, `users/${this.currentUserId!}/tasks/${t.id}`));
    });
    batch.commit().catch(e => console.error('Failed to delete completed tasks:', e));
  }

  getTasksByStatus(completed: boolean): Task[] {
    return this.tasksSubject.value.filter(task => task.completed === completed);
  }

  getOverdueTasks(): Task[] {
    const now = new Date();
    return this.tasksSubject.value.filter(task => {
      if (!task.dueDate || task.completed) return false;
      return new Date(task.dueDate) < now;
    });
  }

  getTasksDueToday(): Task[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.tasksSubject.value.filter(task => {
      if (!task.dueDate || task.completed) return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= today && dueDate < tomorrow;
    });
  }

  exportToJson(): string {
    return JSON.stringify(this.tasksSubject.value, null, 2);
  }

  importFromJson(jsonString: string): void {
    if (!this.currentUserId) return;
    try {
      const tasks: Task[] = JSON.parse(jsonString);
      const batch = writeBatch(this.firestore);
      tasks.forEach(task => {
        const ref = doc(this.tasksCollectionRef(this.currentUserId!));
        const { id, ...data } = task;
        batch.set(ref, this.toFirestoreData(data));
      });
      batch.commit().catch(e => console.error('Failed to import tasks:', e));
    } catch {
      throw new Error('Invalid JSON format');
    }
  }

  clearAllTasks(): void {
    if (!this.currentUserId) return;
    const batch = writeBatch(this.firestore);
    this.tasksSubject.value.forEach(t => {
      batch.delete(doc(this.firestore, `users/${this.currentUserId!}/tasks/${t.id}`));
    });
    batch.commit().catch(e => console.error('Failed to clear all tasks:', e));
  }

  getStatistics(): { total: number; completed: number; pending: number; overdue: number; dueToday: number; } {
    const tasks = this.tasksSubject.value;
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.completed).length,
      pending: tasks.filter(t => !t.completed).length,
      overdue: this.getOverdueTasks().length,
      dueToday: this.getTasksDueToday().length
    };
  }

  startTimeTracking(id: string): void {
    const runningTasks = this.tasksSubject.value.filter(t => t.isTimeRunning);
    runningTasks.forEach(task => this.stopTimeTracking(task.id));
    updateDoc(this.taskDocRef(id), {
      isTimeRunning: true,
      timeStartedAt: Date.now()
    }).catch(e => console.error('Failed to start time tracking:', e));
  }

  stopTimeTracking(id: string): void {
    const task = this.getTaskById(id);
    if (!task || !task.isTimeRunning || !task.timeStartedAt) return;
    const sessionTime = Math.floor((Date.now() - task.timeStartedAt) / 1000);
    const totalTime = (task.timeTracked || 0) + sessionTime;
    updateDoc(this.taskDocRef(id), {
      isTimeRunning: false,
      timeStartedAt: null,
      timeTracked: totalTime
    }).catch(e => console.error('Failed to stop time tracking:', e));
  }

  toggleTimeTracking(id: string): void {
    const task = this.getTaskById(id);
    if (!task) return;
    if (task.isTimeRunning) {
      this.stopTimeTracking(id);
    } else {
      this.startTimeTracking(id);
    }
  }

  getCurrentSessionTime(id: string): number {
    const task = this.getTaskById(id);
    if (!task || !task.isTimeRunning || !task.timeStartedAt) return 0;
    return Math.floor((Date.now() - task.timeStartedAt) / 1000);
  }

  getTotalTrackedTime(id: string): number {
    const task = this.getTaskById(id);
    if (!task) return 0;
    let totalTime = task.timeTracked || 0;
    if (task.isTimeRunning && task.timeStartedAt) {
      totalTime += Math.floor((Date.now() - task.timeStartedAt) / 1000);
    }
    return totalTime;
  }

  resetTimeTracking(id: string): void {
    const task = this.getTaskById(id);
    if (!task) return;
    if (task.isTimeRunning) {
      this.stopTimeTracking(id);
    }
    updateDoc(this.taskDocRef(id), {
      timeTracked: 0,
      isTimeRunning: false,
      timeStartedAt: null
    }).catch(e => console.error('Failed to reset time tracking:', e));
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
