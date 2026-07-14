export class UserCreatedEvent {
  static readonly eventName: string = 'user.created';

  constructor(
    public readonly userId: string,
    public readonly hadPassword: boolean,
  ) {}
}
