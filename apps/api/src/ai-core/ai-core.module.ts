import { Module, Global } from '@nestjs/common';
import { AiCoreService } from './ai-core.service';

@Global()
@Module({
  providers: [AiCoreService],
  exports: [AiCoreService],
})
export class AiCoreModule {}
