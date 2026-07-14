import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { getFirestore } from 'firebase-admin/firestore';

async function waitFor<T>(
  fn: () => Promise<T | null>,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error('Timeout waiting for condition');
}

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('[POST] /users without password -> event auto generate hashed password', async () => {
    const email = `e2e-${Date.now()}@test.com`;

    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'e2e-user', email })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.password).toBeUndefined();

    const doc = await waitFor(async () => {
      const snap = await getFirestore()
        .collection('users')
        .doc(res.body.id)
        .get();

      const data = snap.data();

      return data?.password ? data : null;
    });

    expect(doc.password).toMatch(/^\$2[aby]\$/);
  });

  it('[POST] /users with duplicated email -> 409', async () => {
    const email = `dup-${Date.now()}@test.com`;
    const payload = { username: 'dup', email, password: 'Password123!' };

    await request(app.getHttpServer()).post('/users').send(payload).expect(201);
    await request(app.getHttpServer()).post('/users').send(payload).expect(409);
  });

  it('POST /users with invalid email → 400', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'x', email: 'not-an-email' })
      .expect(400);
  });
});
