import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../database/database.module';
import type { Db } from '../database/database.module';
import { cvs } from '../database/schema';
import { AiCoreService } from '../ai-core/ai-core.service';

@Injectable()
export class CvsService {
  constructor(
    @Inject(DB) private db: Db,
    private aiCore: AiCoreService,
  ) {}

  findByUser(userId: string) {
    return this.db.query.cvs.findMany({
      where: eq(cvs.userId, userId),
      columns: { rawText: false },
    });
  }

  async findLatest(userId: string) {
    const cv = await this.db.query.cvs.findFirst({
      where: eq(cvs.userId, userId),
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });
    if (!cv) throw new NotFoundException('No CV found. Please upload one first.');
    return cv;
  }

  async upload(userId: string, pdfBuffer: Buffer, filename: string) {
    const parsed = await this.aiCore.parseCv(pdfBuffer, filename);

    const rawText = [
      parsed.name,
      parsed.summary,
      `Skills: ${parsed.skills.join(', ')}`,
      ...parsed.experience.map((e) => `${e.title} at ${e.company}. ${e.highlights.join(' ')}`),
      ...parsed.education.map((e) => `${e.degree} from ${e.institution}`),
    ].join('\n\n');

    const [cv] = await this.db
      .insert(cvs)
      .values({ userId, rawText, parsed })
      .returning();
    return cv;
  }

  async remove(id: string, userId: string) {
    const existing = await this.db.query.cvs.findFirst({ where: eq(cvs.id, id) });
    if (!existing || existing.userId !== userId) throw new NotFoundException('CV not found');
    await this.db.delete(cvs).where(eq(cvs.id, id));
  }
}
