import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentService } from './agent.service';

@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('run')
  async startRun(
    @Body() body: { goal: string },
    @Req() req: Request & { user: { userId: string } },
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    const runId = await this.agentService.startRun(body.goal, req.user.userId, token);
    return { run_id: runId };
  }

  @Get(':runId/stream')
  async streamRun(
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    await this.agentService.streamRun(runId, res);
  }
}
