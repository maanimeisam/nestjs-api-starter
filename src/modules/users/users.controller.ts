import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/auth.decorators.js';
import type { AuthenticatedUser } from '../../common/authenticated-user.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { Role } from './user.entity.js';
import { UserResponseDto, UsersPageDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@ApiUnauthorizedResponse()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  @ApiOkResponse({ type: UsersPageDto })
  @ApiForbiddenResponse()
  list(@Query() query: PaginationQueryDto): Promise<UsersPageDto> {
    return this.usersService.list(query.page, query.limit);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  findOne(
    @CurrentUser() requester: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findVisibleById(requester, id);
  }
}
