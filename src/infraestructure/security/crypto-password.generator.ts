import { Injectable } from '@nestjs/common';
import { PasswordGenerator } from '../../domain/services/password-generator';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

@Injectable()
export class CryptoPasswordGenerator implements PasswordGenerator {
  private readonly saltRounds = 12;

  generate(length = 16): string {
    if (length < 8)
      throw new Error('Length must be at least 8 characters long');

    const required = [
      UPPER[randomInt(UPPER.length)],
      LOWER[randomInt(LOWER.length)],
      DIGITS[randomInt(DIGITS.length)],
      SYMBOLS[randomInt(SYMBOLS.length)],
    ];

    const rest = Array.from(
      { length: length - required.length },
      () => ALL[randomInt(ALL.length)],
    );

    const chars = [...required, ...rest];

    for (let i = chars.length - 1; i >= 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }
}
