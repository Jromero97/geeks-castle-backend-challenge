import { Injectable } from '@nestjs/common';
import {
  EventPublisher,
  IntegrationEvent,
} from '../../domain/events/event-publisher';
import { PubSub } from '@google-cloud/pubsub';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PubsubEventPublisher implements EventPublisher {
  private readonly pubsub: PubSub;
  private readonly topic: string;

  constructor(config: ConfigService) {
    this.pubsub = new PubSub({
      projectId: config.get('GOOGLE_CLOUD_PROJECT'),
    });

    this.topic = config.get('PUBSUB_TOPIC_USER_CREATED')!;
  }

  async publish(event: IntegrationEvent): Promise<void> {
    const data = Buffer.from(JSON.stringify(event.payload));
    await this.pubsub
      .topic(this.topic)
      .publishMessage({ data, attributes: { name: event.name } });
  }
}
