import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

const STATUSES = ['saved', 'applied', 'interview', 'rejected', 'offer'] as const;

export class UpdateApplicationDto {
  @ApiProperty({ enum: STATUSES, required: false })
  @IsString()
  @IsIn(STATUSES)
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
