import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  PASSWORD_GENERATOR,
  type PasswordGenerator,
} from '../../domain/services/password-generator';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../../domain/entities/user.entity';
import * as uuid from 'uuid';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { EmailAlreadyExistsError } from '../../domain/errors/email-already-exists.error';

export interface CreateUserInput {
  username: string;
  email: string;
  password?: string;
}

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: UserRepository,
    @Inject(PASSWORD_GENERATOR)
    private readonly passwordGenerator: PasswordGenerator,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    const hadPassword = !!input.password;
    const uuid4 = uuid.v4;

    const password = hadPassword
      ? await this.passwordGenerator.hash(input.password!)
      : undefined;

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new EmailAlreadyExistsError(input.email);
    }

    const user = new User(uuid4(), input.username, input.email, password);

    const created = await this.repo.create(user);

    this.eventEmitter.emit(
      UserCreatedEvent.eventName,
      new UserCreatedEvent(created.id, hadPassword),
    );

    return created;
  }
}
