import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PubSubPushController } from '../../presentation/controllers/pubsub.controller';
import { AssignPasswordUseCase } from '../../application/use-cases/assign-password.use-case';
import { EVENT_PUBLISHER } from '../../domain/events/event-publisher';
import { LocalEventPublisher } from './local-event.publisher';
import { PubsubEventPublisher } from './pubsub-event.publisher';
import { UserCreatedListener } from '../../application/listeners/user-created.listener';
import { DEAD_LETTER_STORE } from '../../domain/events/dead-letter.store';
import { FirestoreDeadLetterStore } from './firestore-dead-letter.store';

@Module({})
export class EventsModule {
  static forRoot(): DynamicModule {
    const transport = process.env.EVENT_TRANSPORT ?? 'local';
    const isLocal = transport === 'local';

    return {
      module: EventsModule,
      imports: [
        ConfigModule,
        ...(isLocal ? [EventEmitterModule.forRoot()] : []),
      ],
      controllers: isLocal ? [] : [PubSubPushController],
      providers: [
        AssignPasswordUseCase,
        {
          provide: EVENT_PUBLISHER,
          useClass: isLocal ? LocalEventPublisher : PubsubEventPublisher,
        },
        ...(isLocal
          ? [
              UserCreatedListener,
              {
                provide: DEAD_LETTER_STORE,
                useClass: FirestoreDeadLetterStore,
              },
            ]
          : []),
      ],
      exports: [EVENT_PUBLISHER, AssignPasswordUseCase],
    };
  }
}
