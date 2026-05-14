import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request,
  HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List all jobs' })
  list() {
    return this.jobs.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job by id' })
  findOne(@Param('id') id: string) {
    return this.jobs.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a job' })
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job' })
  update(@Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.jobs.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a job' })
  remove(@Param('id') id: string) {
    return this.jobs.remove(id);
  }

  @Post(':id/score')
  @ApiOperation({ summary: 'Score a job against the current user\'s latest CV' })
  score(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.jobs.score(id, req.user.id);
  }

  @Post(':id/cover-letter')
  @ApiOperation({ summary: 'Stream a cover letter draft (SSE)' })
  async coverLetter(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Res() res: Response,
  ) {
    const upstream = await this.jobs.streamCoverLetter(id, req.user.id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  }
}
