import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@Request() req: { user: { id: string } }) {
    return this.users.findById(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user name' })
  update(@Request() req: { user: { id: string } }, @Body('name') name: string) {
    return this.users.updateName(req.user.id, name);
  }
}
