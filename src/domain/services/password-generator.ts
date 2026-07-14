export const PASSWORD_GENERATOR = Symbol('PASSWORD_GENERATOR');

export interface PasswordGenerator {
  generate(length?: number): string;
  hash(plain: string): Promise<string>;
}
