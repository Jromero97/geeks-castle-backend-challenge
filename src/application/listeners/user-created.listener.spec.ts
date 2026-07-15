import { UserCreatedListener } from './user-created.listener';
import { AssignPasswordUseCase } from '../use-cases/assign-password.use-case';
import { ConfigService } from '@nestjs/config';

describe('UserCreatedListener', () => {
  const assignPassword = {
    execute: jest.fn(),
  };
  const deadLetter = { save: jest.fn() };

  const config = {
    get: jest.fn((key: string, def?: number) => {
      if (key === 'LISTENER_MAX_RETRIES') return 2;
      if (key === 'LISTENER_RETRY_BASE_MS') return 1;

      return def;
    }),
  };

  let listener: UserCreatedListener;

  beforeEach(() => {
    jest.clearAllMocks();

    assignPassword.execute.mockReset();
    deadLetter.save.mockReset();
    listener = new UserCreatedListener(
      assignPassword as unknown as AssignPasswordUseCase,
      deadLetter,
      config as unknown as ConfigService,
    );
  });

  it('should assign password when user does not provide one', async () => {
    assignPassword.execute.mockResolvedValue(undefined);

    await listener.handle({ userId: 'u1', hadPassword: false });

    expect(assignPassword.execute).toHaveBeenCalledWith('u1');
    expect(deadLetter.save).not.toHaveBeenCalled();
  });

  it('should do nothing if user provide password', async () => {
    await listener.handle({ userId: 'u1', hadPassword: true });

    expect(assignPassword.execute).not.toHaveBeenCalled();
    expect(deadLetter.save).not.toHaveBeenCalled();
  });

  it('should retry when transitory fail and then success (without dead-letter)', async () => {
    let calls = 0;
    assignPassword.execute.mockImplementation(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('transient'))
        : Promise.resolve(undefined);
    });

    await listener.handle({ userId: 'u1', hadPassword: false });

    expect(assignPassword.execute).toHaveBeenCalledTimes(2);
    expect(deadLetter.save).not.toHaveBeenCalled();
  });

  it('should not spread exceptions', async () => {
    assignPassword.execute.mockRejectedValue(new Error('always fails'));

    await expect(
      listener.handle({ userId: 'u1', hadPassword: false }),
    ).resolves.toBeUndefined();

    expect(assignPassword.execute).toHaveBeenCalledTimes(3);
    expect(deadLetter.save).toHaveBeenCalledWith({
      eventName: 'user.created',
      payload: { userId: 'u1', hadPassword: false },
      attempts: 3,
      error: 'always fails',
      failedAt: expect.any(String) as string,
    });
  });
});
