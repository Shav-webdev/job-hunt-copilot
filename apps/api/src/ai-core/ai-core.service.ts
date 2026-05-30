import { Injectable, BadGatewayException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// FormData and Blob are global in Node 24 — no import needed

export interface ParsedCV {
  name: string;
  email: string | null;
  summary: string;
  skills: string[];
  experience: { title: string; company: string; duration: string | null; highlights: string[] }[];
  education: { degree: string; institution: string; year: string | null }[];
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

@Injectable()
export class AiCoreService {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl =
      config.get<string>('AI_URL') ?? 'http://jobhunt-ai:8000';
  }

  async parseCv(pdfBuffer: Buffer, filename: string): Promise<ParsedCV> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }),
      filename,
    );

    const res = await fetch(`${this.baseUrl}/parse-cv`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      if (res.status === 429) throw new HttpException(err, 429);
      throw new BadGatewayException(`ai-core /parse-cv failed: ${err}`);
    }
    return (await res.json()) as Promise<ParsedCV>;
  }

  async score(cvText: string, jobDescription: string): Promise<ScoreResult> {
    const res = await fetch(`${this.baseUrl}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cv_text: cvText,
        job_description: jobDescription,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      if (res.status === 429) throw new HttpException(err, 429);
      throw new BadGatewayException(`ai-core /score failed: ${err}`);
    }
    return (await res.json()) as Promise<ScoreResult>;
  }

  getCoverLetterStreamUrl(
    cvText: string,
    jobTitle: string,
    jobDescription: string,
    company: string,
  ): string {
    return `${this.baseUrl}/draft-cover-letter`;
  }

  buildCoverLetterBody(
    cvText: string,
    jobTitle: string,
    jobDescription: string,
    company: string,
  ) {
    return {
      cv_text: cvText,
      job_title: jobTitle,
      job_description: jobDescription,
      company,
    };
  }
}
