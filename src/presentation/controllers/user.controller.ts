import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { CreateUserDto } from '../dtos/create-user.dto';
import {
  ApiConflictResponse,
  ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUser: GetUserUseCase,
  ) {}

  @Post()
  @ApiCreatedResponse({
    description: 'User created. Password not included on response',
  })
  @ApiConflictResponse({ description: 'E-mail already exists' })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.createUser.execute(dto);

    return { id: user.id, username: user.username, email: user.email };
  }

  @Get(':id')
  @ApiOkResponse({ description: 'User found with ID' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async findOne(@Param('id') id: string) {
    const user = await this.getUser.execute(id);
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return { id: user.id, username: user.username, email: user.email };
  }
}
