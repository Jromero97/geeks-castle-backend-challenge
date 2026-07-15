import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from './infraestructure/firebase/firebase.module';
import { UserController } from './presentation/controllers/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './presentation/filters/domain-exception.filter';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { EventsModule } from './infraestructure/messaging/events.module';
import { SharedModule } from './infraestructure/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirebaseModule,
    SharedModule,
    EventsModule.forRoot(),
  ],
  controllers: [UserController],
  providers: [
    // Use Cases
    CreateUserUseCase,
    GetUserUseCase,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
