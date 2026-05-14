import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../database/database.module';
import type { Db } from '../database/database.module';
import { users } from '../database/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private db: Db) {}

  async findById(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { passwordHash: false },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateName(id: string, name: string) {
    const [user] = await this.db
      .update(users)
      .set({ name })
      .where(eq(users.id, id))
      .returning({ id: users.id, email: users.email, name: users.name });
    return user;
  }
}
