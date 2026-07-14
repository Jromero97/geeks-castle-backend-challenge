import { UserCreatedListener } from './user-created.listener';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { AssignPasswordUseCase } from '../use-cases/assign-password.use-case';

describe('UserCreatedListener', () => {
  const assignPassword = {
    execute: jest.fn(),
  };
  const listener = new UserCreatedListener(
    assignPassword as unknown as AssignPasswordUseCase,
  );

  beforeEach(() => jest.clearAllMocks());

  it('should assign password when user does not provide one', async () => {
    await listener.handle(new UserCreatedEvent('u1', false));

    expect(assignPassword.execute).toHaveBeenCalledWith('u1');
  });

  it('should do nothing if user provide password', async () => {
    await listener.handle(new UserCreatedEvent('u1', true));

    expect(assignPassword.execute).not.toHaveBeenCalled();
  });

  it('should not spread exceptions', async () => {
    assignPassword.execute.mockRejectedValue(new Error('Wrong'));

    await expect(
      listener.handle(new UserCreatedEvent('u1', false)),
    ).resolves.toBeUndefined();
  });
});
