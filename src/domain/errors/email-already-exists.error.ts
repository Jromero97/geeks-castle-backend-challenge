export class EmailAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`E-mail ${email} already exists`);
    this.name = 'EmailAlreadyExistsError';
  }
}
