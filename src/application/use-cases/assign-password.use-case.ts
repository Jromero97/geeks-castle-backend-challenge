import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  PASSWORD_GENERATOR,
  type PasswordGenerator,
} from '../../domain/services/password-generator';

@Injectable()
export class AssignPasswordUseCase {
  private readonly logger = new Logger(AssignPasswordUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_GENERATOR)
    private readonly passwordGenerator: PasswordGenerator,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      this.logger.warn(
        `[AssignPasswordUseCase] User with id ${userId} not found`,
      );
      return;
    }

    if (user.hasPassword()) {
      this.logger.log(
        `[AssignPasswordUseCase] User with id ${userId} already have password (skipped)`,
      );
      return;
    }
    const plainPassword = this.passwordGenerator.generate(16);
    const hashed = await this.passwordGenerator.hash(plainPassword);

    await this.userRepository.updatePassword(userId, hashed);

    this.logger.log(`[LOG] Generated password for user ${userId}`);
  }
}
