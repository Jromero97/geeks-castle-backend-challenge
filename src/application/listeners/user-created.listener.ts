import { Injectable, Logger } from '@nestjs/common';
import { AssignPasswordUseCase } from '../use-cases/assign-password.use-case';
import { OnEvent } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../../domain/events/user-created.event';

@Injectable()
export class UserCreatedListener {
  private readonly logger = new Logger(UserCreatedListener.name);
  constructor(private readonly assignPassword: AssignPasswordUseCase) {}

  @OnEvent(UserCreatedEvent.eventName, { async: true })
  async handle(event: UserCreatedEvent): Promise<void> {
    try {
      if (event.hadPassword) return;
      await this.assignPassword.execute(event.userId);
    } catch (error) {
      this.logger.error(
        `Failed to process user.created for ${event.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
