import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { AssignPasswordUseCase } from '../../application/use-cases/assign-password.use-case';
import { ConfigService } from '@nestjs/config';

interface PubSubPushBody {
  message: {
    data: string;
    attributes?: Record<string, string>;
    messageId?: string;
    publishTime?: string;
  };

  subscription?: string;
}

@Controller('pubsub')
export class PubSubPushController {
  constructor(
    private readonly assignPassword: AssignPasswordUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post('user-created')
  @HttpCode(204)
  async handle(
    @Query('token') token: string,
    @Body()
    body: PubSubPushBody,
  ) {
    if (token !== this.config.get('PUBSUB_PUSH_TOKEN'))
      throw new ForbiddenException();

    const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');

    const payload = JSON.parse(decoded) as { userId: string };

    await this.assignPassword.execute(payload.userId);
  }
}
