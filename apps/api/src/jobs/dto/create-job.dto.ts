import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, IsOptional, MinLength } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: 'Senior Frontend Engineer' })
  @IsString()
  @MinLength(2)
  title: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  company: string;

  @ApiProperty({ example: 'We are looking for...' })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty({ example: 'https://acme.com/jobs/123' })
  @IsUrl()
  url: string;

  @ApiProperty({ example: 'Remote, EU', required: false })
  @IsString()
  @IsOptional()
  location?: string;
}
