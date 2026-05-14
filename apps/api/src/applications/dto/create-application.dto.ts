import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, IsIn } from 'class-validator';

const STATUSES = ['saved', 'applied', 'interview', 'rejected', 'offer'] as const;

export class CreateApplicationDto {
  @ApiProperty()
  @IsUUID()
  jobId: string;

  @ApiProperty({ enum: STATUSES, default: 'saved' })
  @IsString()
  @IsIn(STATUSES)
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
