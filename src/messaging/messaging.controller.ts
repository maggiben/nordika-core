import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MESSAGE_ADMIN_ROLE } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateCicloDto,
  CreateContactDto,
  CreateTemplateDto,
  UpdateCicloDto,
  UpdateContactDto,
  UpdateTemplateDto,
  UpsertWorkStatusDto,
} from './messaging.dto';
import { MessagingService } from './messaging.service';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(MESSAGE_ADMIN_ROLE)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('contacts')
  createContact(@Body() dto: CreateContactDto) {
    return this.messaging.createContact(dto);
  }

  @Get('contacts')
  listContacts() {
    return this.messaging.listContacts();
  }

  @Patch('contacts/:id')
  updateContact(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.messaging.updateContact(id, dto);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.messaging.createTemplate(dto);
  }

  @Get('templates')
  listTemplates() {
    return this.messaging.listTemplates();
  }

  @Patch('templates/:key')
  updateTemplate(@Param('key') key: string, @Body() dto: UpdateTemplateDto) {
    return this.messaging.updateTemplate(key, dto);
  }

  @Post('ciclos')
  createCiclo(@Body() dto: CreateCicloDto) {
    return this.messaging.createCiclo(dto);
  }

  @Get('ciclos')
  listCiclos() {
    return this.messaging.listCiclos();
  }

  @Patch('ciclos/:id')
  updateCiclo(@Param('id') id: string, @Body() dto: UpdateCicloDto) {
    return this.messaging.updateCiclo(id, dto);
  }

  @Post('work-status')
  upsertWorkStatus(@Body() dto: UpsertWorkStatusDto) {
    return this.messaging.upsertWorkStatus(dto);
  }

  @Get('work-status')
  listWorkStatuses(@Query('cicloId') cicloId?: string) {
    return this.messaging.listWorkStatuses(cicloId);
  }

  @Get('dispatches')
  listDispatches(@Query('cicloId') cicloId?: string) {
    return this.messaging.listDispatches(cicloId);
  }

  @Post('dispatch/run')
  runWeeklyDispatch() {
    return this.messaging.runWeeklyStatusDispatch();
  }
}
