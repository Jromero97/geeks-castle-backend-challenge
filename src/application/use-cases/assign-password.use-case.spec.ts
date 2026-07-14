import { AssignPasswordUseCase } from './assign-password.use-case';
import { User } from '../../domain/entities/user.entity';

describe('AssignPasswordUseCase', () => {
  const repo = {
    create: jest.fn(),
    updatePassword: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
  };

  const passwordGenerator = {
    generate: jest.fn().mockReturnValue('Generated-Pass-1!'),
    hash: jest.fn().mockResolvedValue('hashed-generated'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('should generate, hash and update the record with hash', async () => {
    repo.findById.mockResolvedValue(
      new User('user-123', 'ana', 'ana@test.com'),
    );
    const useCase = new AssignPasswordUseCase(repo, passwordGenerator);
    await useCase.execute('user-123');

    expect(passwordGenerator.generate).toHaveBeenCalledWith(16);
    expect(passwordGenerator.hash).toHaveBeenCalledWith('Generated-Pass-1!');
    expect(repo.updatePassword).toHaveBeenCalledWith(
      'user-123',
      'hashed-generated',
    );
  });

  it('should not overwrite password if user already have it set', async () => {
    repo.findById.mockResolvedValue(
      new User('u1', 'ana', 'a@t.com', 'existing-hash'),
    );
    const useCase = new AssignPasswordUseCase(repo, passwordGenerator);

    await useCase.execute('u1');

    expect(passwordGenerator.generate).not.toHaveBeenCalled();
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  it("should do nothing if user doesn't exist", async () => {
    const useCase = new AssignPasswordUseCase(repo, passwordGenerator);
    repo.findById.mockResolvedValue(null);
    await useCase.execute('u1');
    expect(repo.updatePassword).not.toHaveBeenCalledWith();
  });
});
