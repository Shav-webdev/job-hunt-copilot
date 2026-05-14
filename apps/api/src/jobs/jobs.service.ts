import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../database/database.module';
import type { Db } from '../database/database.module';
import { jobs } from '../database/schema';
import { AiCoreService } from '../ai-core/ai-core.service';
import { CvsService } from '../cvs/cvs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsService {
  constructor(
    @Inject(DB) private db: Db,
    private aiCore: AiCoreService,
    private cvsService: CvsService,
  ) {}

  list() {
    return this.db.query.jobs.findMany({ orderBy: (j, { desc }) => [desc(j.createdAt)] });
  }

  async findOne(id: string) {
    const job = await this.db.query.jobs.findFirst({ where: eq(jobs.id, id) });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async create(dto: CreateJobDto) {
    const [job] = await this.db.insert(jobs).values(dto).returning();
    return job;
  }

  async update(id: string, dto: UpdateJobDto) {
    const [job] = await this.db.update(jobs).set(dto).where(eq(jobs.id, id)).returning();
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async remove(id: string) {
    await this.db.delete(jobs).where(eq(jobs.id, id));
  }

  async score(jobId: string, userId: string) {
    const [job, cv] = await Promise.all([
      this.findOne(jobId),
      this.cvsService.findLatest(userId),
    ]);
    return this.aiCore.score(cv.rawText, job.description);
  }

  async streamCoverLetter(jobId: string, userId: string) {
    const [job, cv] = await Promise.all([
      this.findOne(jobId),
      this.cvsService.findLatest(userId),
    ]);
    const body = this.aiCore.buildCoverLetterBody(cv.rawText, job.title, job.description, job.company);
    const url = this.aiCore.getCoverLetterStreamUrl(cv.rawText, job.title, job.description, job.company);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new NotFoundException('Cover letter generation failed');
    return res;
  }
}
