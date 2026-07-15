import { Inject, Injectable } from '@nestjs/common';
import {
  DeadLetterEntry,
  DeadLetterStore,
} from '../../domain/events/dead-letter.store';
import { FIRESTORE } from '../firebase/firebase.module';
import { Firestore } from 'firebase-admin/firestore';

@Injectable()
export class FirestoreDeadLetterStore implements DeadLetterStore {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async save(entry: DeadLetterEntry): Promise<void> {
    await this.db.collection('dead_letter_events').add(entry);
  }
}
