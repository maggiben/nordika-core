import {
  BadRequestException,
  Controller,
  Get,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SOURCE_WRITER_ROLE } from '../auth/auth.constants';
import { CreatedSource, ListedSource, SourcesService } from './sources.service';

const MAX_JSON_FILE_SIZE_BYTES = 5 * 1024 * 1024;

interface UploadedJsonFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SOURCE_WRITER_ROLE)
  list(): Promise<ListedSource[]> {
    return this.sourcesService.listLatestPerProject();
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SOURCE_WRITER_ROLE)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_JSON_FILE_SIZE_BYTES,
          }),
        ],
      }),
    )
    file: UploadedJsonFile,
  ): Promise<CreatedSource> {
    this.validateJsonFileType(file);
    const content = this.parseJson(file);

    return this.sourcesService.create(file.originalname, content);
  }

  private parseJson(file: UploadedJsonFile): unknown {
    try {
      return JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new BadRequestException(
        'The uploaded file must contain valid JSON.',
      );
    }
  }

  private validateJsonFileType(file: UploadedJsonFile): void {
    if (
      file.mimetype !== 'application/json' &&
      !file.mimetype.endsWith('+json')
    ) {
      throw new BadRequestException('The uploaded file must be a JSON file.');
    }
  }
}
