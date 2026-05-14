import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { CvsModule } from '../cvs/cvs.module';

@Module({
  imports: [CvsModule],
  providers: [JobsService],
  controllers: [JobsController],
})
export class JobsModule {}
