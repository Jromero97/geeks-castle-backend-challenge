import { CreateUserUseCase } from './create-user.use-case';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyExistsError } from '../../domain/errors/email-already-exists.error';
import { IntegrationEvent } from '../../domain/events/event-publisher';

describe('CreateUserUseCase', () => {
  const repo = {
    create: jest.fn().mockImplementation((u: User) => Promise.resolve(u)),
    updatePassword: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(null),
  };

  const passwordGenerator = {
    generate: jest.fn().mockReturnValue('Plain-Pass-123!'),
    hash: jest.fn().mockResolvedValue('hashed-value'),
  };

  const publisher = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  let useCase: CreateUserUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new CreateUserUseCase(repo, passwordGenerator, publisher);
  });

  it('should create user without password and emit event with hadPassword = false', async () => {
    const user = await useCase.execute({
      username: 'user',
      email: 'user@test.com',
    });
    expect(repo.create).toHaveBeenCalled();
    expect(user.password).toBeUndefined();
    expect(publisher.publish).toHaveBeenCalledWith({
      name: UserCreatedEvent.eventName,
      payload: expect.objectContaining({
        userId: user.id,
        hadPassword: false,
      }) as IntegrationEvent,
    });
  });

  it('should hash password when user sends it and emit hadPassword = true', async () => {
    const user = await useCase.execute({
      username: 'user',
      email: 'user@test.com',
      password: 'MiPassword123!',
    });

    expect(passwordGenerator.hash).toHaveBeenCalledWith('MiPassword123!');
    expect(user.password).toBe('hashed-value');
    expect(publisher.publish).toHaveBeenCalledWith({
      name: UserCreatedEvent.eventName,
      payload: expect.objectContaining({
        hadPassword: true,
      }) as IntegrationEvent,
    });
  });

  it('should throw EmailAlreadyExistsError, if email already exists', async () => {
    repo.findByEmail.mockResolvedValue(new User('x', 'ana', 'ana@test.com'));

    await expect(
      useCase.execute({ username: 'ana', email: 'ana@test.com' }),
    ).rejects.toThrow(EmailAlreadyExistsError);

    expect(repo.create).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
