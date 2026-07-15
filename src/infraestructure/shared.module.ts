import { Global, Module } from '@nestjs/common';
import { USER_REPOSITORY } from '../domain/repositories/user.repository';
import { FirebaseUserRepository } from './firebase/firebase-user.repository';
import { PASSWORD_GENERATOR } from '../domain/services/password-generator';
import { CryptoPasswordGenerator } from './security/crypto-password.generator';

@Global()
@Module({
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: FirebaseUserRepository,
    },
    {
      provide: PASSWORD_GENERATOR,
      useClass: CryptoPasswordGenerator,
    },
  ],
  exports: [USER_REPOSITORY, PASSWORD_GENERATOR],
})
export class SharedModule {}
