import { Module } from '@nestjs/common';
import { CvsService } from './cvs.service';
import { CvsController } from './cvs.controller';

@Module({
  providers: [CvsService],
  controllers: [CvsController],
  exports: [CvsService],
})
export class CvsModule {}
