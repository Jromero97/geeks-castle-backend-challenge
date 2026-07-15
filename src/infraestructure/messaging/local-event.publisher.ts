import { Injectable } from '@nestjs/common';
import {
  EventPublisher,
  IntegrationEvent,
} from '../../domain/events/event-publisher';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class LocalEventPublisher implements EventPublisher {
  constructor(private readonly emmiter: EventEmitter2) {}

  publish(event: IntegrationEvent): Promise<void> {
    this.emmiter.emit(event.name, event.payload);
    return Promise.resolve();
  }
}
