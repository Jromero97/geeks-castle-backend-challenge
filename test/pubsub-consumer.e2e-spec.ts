import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EVENT_PUBLISHER } from '../src/domain/events/event-publisher';
import request from 'supertest';
import type { App } from 'supertest/types';
import { getFirestore } from 'firebase-admin/firestore';

const TOKEN = 'local-secret';

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

describe('PUB/SUB Consumer (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EVENT_TRANSPORT = 'pubsub';
    process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
    process.env.GOOGLE_CLOUD_PROJECT ??= 'challenge-backend';
    process.env.PUBSUB_TOPIC_USER_CREATED ??= 'user-created';
    process.env.PUBSUB_PUSH_TOKEN = TOKEN;

    const { AppModule } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EVENT_PUBLISHER)
      .useValue({ publish: async () => Promise.resolve() })
      .compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    delete process.env.EVENT_TRANSPORT;
  });

  const pushBody = (userId: string) => ({
    message: {
      data: Buffer.from(
        JSON.stringify({ userId, hadPassword: false }),
      ).toString('base64'),
      attributes: { name: 'user.created' },
    },
  });

  it('valid push -> assign password (204) and persist hash', async () => {
    const email = `pubsub-${Date.now()}@test.com`;
    const created = await request(app.getHttpServer() as App)
      .post('/users')
      .send({ username: 'ps', email })
      .expect(201);

    const userId = (created.body as { id: string }).id;

    await request(app.getHttpServer() as App)
      .post(`/pubsub/user-created?token=${TOKEN}`)
      .send(pushBody(userId))
      .expect(204);

    const doc = await waitFor(async () => {
      const snap = await getFirestore().collection('users').doc(userId).get();

      const data = snap.data();

      return data?.password ? data : null;
    });

    expect(doc.password).toMatch(/^\$2[aby]\$/);
  });

  it('invalid token -> 403', async () => {
    await request(app.getHttpServer() as App)
      .post('/pubsub/user-created?token=wrong')
      .send(pushBody('whatever'))
      .expect(403);
  });

  it('idem: second push dont change the hash (204)', async () => {
    const email = `idem-${Date.now()}@test.com`;
    const created = await request(app.getHttpServer() as App)
      .post('/users')
      .send({ username: 'idem', email })
      .expect(201);

    const userId = (created.body as { id: string }).id;

    await request(app.getHttpServer() as App)
      .post(`/pubsub/user-created?token=${TOKEN}`)
      .send(pushBody(userId))
      .expect(204);

    const first = await waitFor(async () => {
      const doc = (
        await getFirestore().collection('users').doc(userId).get()
      ).data();

      return doc?.password ? doc : null;
    });

    await request(app.getHttpServer() as App)
      .post(`/pubsub/user-created?token=${TOKEN}`)
      .send(pushBody(userId))
      .expect(204);

    const second = await waitFor(async () => {
      const doc = (
        await getFirestore().collection('users').doc(userId).get()
      ).data();

      return doc?.password ? doc : null;
    });

    expect(second.password).toBe(first.password);
  });
});
