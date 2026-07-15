import { Inject, Injectable, Logger } from '@nestjs/common';
import { AssignPasswordUseCase } from '../use-cases/assign-password.use-case';
import { OnEvent } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import {
  DEAD_LETTER_STORE,
  type DeadLetterStore,
} from '../../domain/events/dead-letter.store';
import { ConfigService } from '@nestjs/config';
import { retry } from '../common/retry';

interface UserCreatedPayload {
  userId: string;
  hadPassword: boolean;
}

@Injectable()
export class UserCreatedListener {
  private readonly logger = new Logger(UserCreatedListener.name);
  private readonly maxRetries: number;
  private readonly baseMs: number;

  constructor(
    private readonly assignPassword: AssignPasswordUseCase,
    @Inject(DEAD_LETTER_STORE) private readonly deadLetter: DeadLetterStore,
    config: ConfigService,
  ) {
    this.maxRetries = config.get<number>('LISTENER_MAX_RETRIES', 3);
    this.baseMs = config.get<number>('LISTENER_RETRY_BASE_MS', 200);
  }

  @OnEvent(UserCreatedEvent.eventName, { async: true })
  async handle(payload: UserCreatedPayload): Promise<void> {
    try {
      if (payload.hadPassword) return;

      await retry(() => this.assignPassword.execute(payload.userId), {
        maxRetries: this.maxRetries,
        baseMs: this.baseMs,
      });
    } catch (error) {
      await this.deadLetter.save({
        eventName: UserCreatedEvent.eventName,
        payload: { ...payload },
        error: error instanceof Error ? error.message : String(error),
        attempts: this.maxRetries + 1,
        failedAt: new Date().toISOString(),
      });

      this.logger.error(
        `Sent user.created to dead-letter for ${payload.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
