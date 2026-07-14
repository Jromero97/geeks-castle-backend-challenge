import { CryptoPasswordGenerator } from './crypto-password.generator';
import * as bcrypt from 'bcrypt';

describe('CryptoPasswordGenerator', () => {
  let generator: CryptoPasswordGenerator;

  beforeEach(() => {
    generator = new CryptoPasswordGenerator();
  });

  it('should generate a password with the requested length', () => {
    expect(generator.generate(16)).toHaveLength(16);
    expect(generator.generate(24)).toHaveLength(24);
    expect(generator.generate(32)).toHaveLength(32);
  });

  it('should include uppercase, lowercase, digit and symbol', () => {
    const pwd = generator.generate(16);

    expect(pwd).toMatch(/[A-Z]/);
    expect(pwd).toMatch(/[a-z]/);
    expect(pwd).toMatch(/[0-9]/);
    expect(pwd).toMatch(/[!@#$%^&*()\-_=+]/);
  });

  it('should reject length minor to 8', () => {
    expect(() => generator.generate(4)).toThrow();
  });

  it('should verify hash with bcrypt and not plain text', async () => {
    const plain = generator.generate(16);
    const hash = await generator.hash(plain);

    expect(hash).not.toBe(plain);
    expect(await bcrypt.compare(plain, hash)).toBe(true);
  });
});
