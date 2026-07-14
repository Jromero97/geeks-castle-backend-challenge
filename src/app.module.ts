import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FirebaseModule } from './infraestructure/firebase/firebase.module';
import { UserController } from './presentation/controllers/user.controller';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { FirebaseUserRepository } from './infraestructure/firebase/firebase-user.repository';
import { PASSWORD_GENERATOR } from './domain/services/password-generator';
import { CryptoPasswordGenerator } from './infraestructure/security/crypto-password.generator';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { AssignPasswordUseCase } from './application/use-cases/assign-password.use-case';
import { UserCreatedListener } from './application/listeners/user-created.listener';
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './presentation/filters/domain-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    FirebaseModule,
  ],
  controllers: [UserController],
  providers: [
    { provide: USER_REPOSITORY, useClass: FirebaseUserRepository },
    { provide: PASSWORD_GENERATOR, useClass: CryptoPasswordGenerator },
    CreateUserUseCase,
    AssignPasswordUseCase,
    UserCreatedListener,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
