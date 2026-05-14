import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private apps: ApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my applications' })
  list(@Request() req: { user: { id: string } }) {
    return this.apps.listForUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one application' })
  findOne(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.apps.findOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Track a job application' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateApplicationDto) {
    return this.apps.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update application status or notes' })
  update(@Param('id') id: string, @Request() req: { user: { id: string } }, @Body() dto: UpdateApplicationDto) {
    return this.apps.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an application' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.apps.remove(id, req.user.id);
  }
}
