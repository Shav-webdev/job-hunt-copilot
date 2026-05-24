import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AgentService {
  private readonly aiUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.aiUrl = this.config.get('AI_URL', 'http://jobhunt-ai:8000');
  }

  async startRun(goal: string, userId: string, apiToken: string): Promise<string> {
    const { data } = await firstValueFrom(
      this.http.post<{ run_id: string }>(`${this.aiUrl}/agent/run`, {
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

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${this.aiUrl}/agent/${runId}/stream`);
    } catch {
      res.write('data: {"type":"error","message":"Agent service unreachable"}\n\n');
      res.end();
      return;
    }

    if (!upstream.ok || !upstream.body) {
      res.write('data: {"type":"error","message":"Agent stream unavailable"}\n\n');
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    const cleanup = () => reader.cancel().catch(() => null);
    res.on('close', cleanup);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      cleanup();
      if (!res.writableEnded) res.end();
    }
  }
}
