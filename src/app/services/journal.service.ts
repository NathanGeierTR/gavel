import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Firestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, updateDoc, Timestamp
} from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';

export interface JournalEntry {
  id: string;
  text: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class JournalService {
  private entriesSubject = new BehaviorSubject<JournalEntry[]>([]);
  public entries$: Observable<JournalEntry[]> = this.entriesSubject.asObservable();

  private unsubscribeEntries: (() => void) | null = null;
  private currentUserId: string | null = null;

  constructor(private firestore: Firestore, private auth: Auth) {
    user(this.auth).subscribe(firebaseUser => {
      this.cleanup();
      if (firebaseUser) {
        this.currentUserId = firebaseUser.uid;
        this.subscribeEntries(firebaseUser.uid);
      } else {
        this.currentUserId = null;
        this.entriesSubject.next([]);
      }
    });
  }

  private journalCollectionRef(uid: string) {
    return collection(this.firestore, `users/${uid}/journal`);
  }

  private subscribeEntries(uid: string): void {
    const q = query(this.journalCollectionRef(uid), orderBy('timestamp', 'desc'));
    this.unsubscribeEntries = onSnapshot(q, snapshot => {
      const entries: JournalEntry[] = snapshot.docs.map(d => ({
        id: d.id,
        text: d.data()['text'] ?? '',
        timestamp: d.data()['timestamp']?.toDate() ?? new Date()
      }));
      this.entriesSubject.next(entries);
    }, e => console.error('Failed to listen to journal entries:', e));
  }

  private cleanup(): void {
    if (this.unsubscribeEntries) {
      this.unsubscribeEntries();
      this.unsubscribeEntries = null;
    }
  }

  async addEntry(text: string): Promise<void> {
    if (!this.currentUserId || !text.trim()) return;
    await addDoc(this.journalCollectionRef(this.currentUserId), {
      text: text.trim(),
      timestamp: serverTimestamp()
    });
  }

  async updateEntry(id: string, text: string, timestamp: Date): Promise<void> {
    if (!this.currentUserId || !text.trim()) return;
    const entryRef = doc(this.firestore, `users/${this.currentUserId}/journal/${id}`);
    await updateDoc(entryRef, {
      text: text.trim(),
      timestamp: Timestamp.fromDate(timestamp)
    });
  }

  async deleteEntry(id: string): Promise<void> {
    if (!this.currentUserId) return;
    const entryRef = doc(this.firestore, `users/${this.currentUserId}/journal/${id}`);
    await deleteDoc(entryRef);
  }
}
