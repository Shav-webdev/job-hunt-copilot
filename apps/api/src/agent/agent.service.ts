import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import type { Response } from 'express';
import Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private readonly agentUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.agentUrl = this.config.get('AGENT_URL', 'http://jobhunt-agent:8000');
  }

  onModuleInit() {
    const redisUrl = this.config.get('REDIS_URL', 'redis://redis-master:6379');
    this.redis = new Redis(redisUrl);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async startRun(goal: string, userId: string, apiToken: string): Promise<string> {
    const { data } = await firstValueFrom(
      this.http.post<{ run_id: string }>(`${this.agentUrl}/run`, {
        goal,
        user_id: userId,
        api_token: apiToken,
      }),
    );
    return data.run_id;
  }

  async streamRun(runId: string, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const sub = this.redis.duplicate();
    await sub.subscribe(`agent:run:${runId}`);

    const cleanup = () => {
      sub.unsubscribe().catch(() => null);
      sub.disconnect();
    };

    sub.on('message', (_channel: string, message: string) => {
      res.write(`data: ${message}\n\n`);
      try {
        const event = JSON.parse(message) as { type: string };
        if (event.type === 'done' || event.type === 'error') {
          cleanup();
          res.end();
        }
      } catch { /* ignore parse errors */ }
    });

    res.on('close', cleanup);
  }
}
