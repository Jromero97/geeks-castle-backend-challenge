import { Inject, Injectable } from '@nestjs/common';
import { UserRepository } from '../../domain/repositories/user.repository';
import { FIRESTORE } from './firebase.module';
import { Firestore } from 'firebase-admin/firestore';
import { User } from '../../domain/entities/user.entity';

interface UserDocument {
  username: string;
  email: string;
  password: string | null;
  createdAt: string;
}

@Injectable()
export class FirebaseUserRepository implements UserRepository {
  private readonly collection = 'users';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async create(user: User): Promise<User> {
    await this.db
      .collection(this.collection)
      .doc(user.id)
      .set({
        username: user.username,
        email: user.email,
        password: user.password ?? null,
        createdAt: new Date().toISOString(),
      });

    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.db.collection(this.collection).doc(userId).update({
      password: hashedPassword,
      passwordGeneratedAt: new Date().toISOString(),
    });
  }

  async findById(userId: string): Promise<User | null> {
    const doc = await this.db.collection(this.collection).doc(userId).get();

    if (!doc.exists) return null;

    const data = doc.data()! as UserDocument;

    return new User(
      doc.id,
      data.username,
      data.email,
      data.password ?? undefined,
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];

    const data = doc.data() as UserDocument;

    return new User(doc.id, data.username, data.email);
  }
}
