import {
  Controller, Get, Post, Delete, Param,
  UseGuards, Request, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CvsService } from './cvs.service';

@ApiTags('cvs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cvs')
export class CvsController {
  constructor(private cvs: CvsService) {}

  @Get()
  @ApiOperation({ summary: 'List my CVs (metadata only)' })
  list(@Request() req: { user: { id: string } }) {
    return this.cvs.findByUser(req.user.id);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get my latest CV with parsed fields' })
  latest(@Request() req: { user: { id: string } }) {
    return this.cvs.findLatest(req.user.id);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a CV PDF — parses it with Gemini and saves to DB' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Only PDF files are accepted');
    return this.cvs.upload(req.user.id, file.buffer, file.originalname);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a CV' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.cvs.remove(id, req.user.id);
  }
}
