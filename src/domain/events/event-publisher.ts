export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IntegrationEvent {
  readonly name: string;
  readonly payload: Record<string, unknown>;
}

export interface EventPublisher {
  publish(event: IntegrationEvent): Promise<void>;
}
