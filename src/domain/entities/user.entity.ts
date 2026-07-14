export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly email: string,
    public password?: string,
  ) {}

  hasPassword() {
    return !!this.password && this.password.length > 0;
  }
}
