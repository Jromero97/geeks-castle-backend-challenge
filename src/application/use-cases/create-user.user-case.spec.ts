import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateUserUseCase } from './create-user.use-case';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyExistsError } from '../../domain/errors/email-already-exists.error';

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

  const emitMock = jest.fn();
  const emitter = { emit: emitMock } as unknown as EventEmitter2;

  let useCase: CreateUserUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new CreateUserUseCase(repo, passwordGenerator, emitter);
  });

  it('should create user without password and emit event with hadPassword = false', async () => {
    const user = await useCase.execute({
      username: 'user',
      email: 'user@test.com',
    });
    expect(repo.create).toHaveBeenCalled();
    expect(user.password).toBeUndefined();
    expect(emitMock).toHaveBeenCalledWith(
      UserCreatedEvent.eventName,
      expect.objectContaining({ userId: user.id, hadPassword: false }),
    );
  });

  it('should hash password when user sends it and emit hadPassword = true', async () => {
    const user = await useCase.execute({
      username: 'user',
      email: 'user@test.com',
      password: 'MiPassword123!',
    });

    expect(passwordGenerator.hash).toHaveBeenCalledWith('MiPassword123!');
    expect(user.password).toBe('hashed-value');
    expect(emitMock).toHaveBeenCalledWith(
      UserCreatedEvent.eventName,
      expect.objectContaining({ hadPassword: true }),
    );
  });

  it('should throw EmailAlreadyExistsError, if email already exists', async () => {
    repo.findByEmail.mockResolvedValue(new User('x', 'ana', 'ana@test.com'));

    await expect(
      useCase.execute({ username: 'ana', email: 'ana@test.com' }),
    ).rejects.toThrow(EmailAlreadyExistsError);

    expect(repo.create).not.toHaveBeenCalled();
  });
});
