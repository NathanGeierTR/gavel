import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Firestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, updateDoc, Timestamp
} from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';

export interface Goal {
  id: string;
  title: string;
  description: string;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({ providedIn: 'root' })
export class GoalsService {
  private goalsSubject = new BehaviorSubject<Goal[]>([]);
  public goals$: Observable<Goal[]> = this.goalsSubject.asObservable();

  private unsubscribe: (() => void) | null = null;
  private currentUserId: string | null = null;

  constructor(private firestore: Firestore, private auth: Auth) {
    user(this.auth).subscribe(firebaseUser => {
      this.cleanup();
      if (firebaseUser) {
        this.currentUserId = firebaseUser.uid;
        this.subscribeGoals(firebaseUser.uid);
      } else {
        this.currentUserId = null;
        this.goalsSubject.next([]);
      }
    });
  }

  private collectionRef(uid: string) {
    return collection(this.firestore, `users/${uid}/goals`);
  }

  private subscribeGoals(uid: string): void {
    const q = query(this.collectionRef(uid), orderBy('createdAt', 'asc'));
    this.unsubscribe = onSnapshot(q, snapshot => {
      const goals: Goal[] = snapshot.docs.map(d => ({
        id: d.id,
        title: d.data()['title'] ?? '',
        description: d.data()['description'] ?? '',
        year: d.data()['year'] ?? new Date().getFullYear(),
        createdAt: (d.data()['createdAt'] as Timestamp)?.toDate() ?? new Date(),
        updatedAt: (d.data()['updatedAt'] as Timestamp)?.toDate() ?? new Date()
      }));
      this.goalsSubject.next(goals);
    }, e => console.error('Failed to listen to goals:', e));
  }

  private cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async addGoal(title: string, description: string, year: number): Promise<void> {
    if (!this.currentUserId || !title.trim()) return;
    const now = serverTimestamp();
    await addDoc(this.collectionRef(this.currentUserId), {
      title: title.trim(),
      description: description.trim(),
      year,
      createdAt: now,
      updatedAt: now
    });
  }

  async updateGoal(id: string, title: string, description: string, year: number): Promise<void> {
    if (!this.currentUserId || !title.trim()) return;
    const ref = doc(this.firestore, `users/${this.currentUserId}/goals/${id}`);
    await updateDoc(ref, {
      title: title.trim(),
      description: description.trim(),
      year,
      updatedAt: Timestamp.now()
    });
  }

  async deleteGoal(id: string): Promise<void> {
    if (!this.currentUserId) return;
    const ref = doc(this.firestore, `users/${this.currentUserId}/goals/${id}`);
    await deleteDoc(ref);
  }
}
