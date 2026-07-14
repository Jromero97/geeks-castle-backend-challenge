import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
} from '@nestjs/common';
import { EmailAlreadyExistsError } from '../../domain/errors/email-already-exists.error';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch(EmailAlreadyExistsError)
export class DomainExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(exception: EmailAlreadyExistsError, host: ArgumentsHost) {
    super.catch(new ConflictException(exception.message), host);
  }
}
