import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../database/database.module';
import type { Db } from '../database/database.module';
import { applications } from '../database/schema';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(@Inject(DB) private db: Db) {}

  listForUser(userId: string) {
    return this.db.query.applications.findMany({
      where: eq(applications.userId, userId),
      with: { job: true },
      orderBy: (a, { desc }) => [desc(a.updatedAt)],
    });
  }

  async findOne(id: string, userId: string) {
    const app = await this.db.query.applications.findFirst({
      where: and(eq(applications.id, id), eq(applications.userId, userId)),
      with: { job: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async create(userId: string, dto: CreateApplicationDto) {
    const [app] = await this.db
      .insert(applications)
      .values({ userId, jobId: dto.jobId, status: dto.status ?? 'saved', notes: dto.notes })
      .returning();
    return app;
  }

  async update(id: string, userId: string, dto: UpdateApplicationDto) {
    const existing = await this.db.query.applications.findFirst({
      where: eq(applications.id, id),
    });
    if (!existing) throw new NotFoundException('Application not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const [app] = await this.db
      .update(applications)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(applications.id, id))
      .returning();
    return app;
  }

  async remove(id: string, userId: string) {
    const existing = await this.db.query.applications.findFirst({
      where: eq(applications.id, id),
    });
    if (!existing) throw new NotFoundException('Application not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.db.delete(applications).where(eq(applications.id, id));
  }
}
