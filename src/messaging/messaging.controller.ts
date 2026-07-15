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
import { CacheTTL } from '../cache/http-cache.interceptor';
import { CACHE_TTLS } from '../cache/cache.constants';
import { Throttle } from '@nestjs/throttler';
import { MESSAGE_ADMIN_ROLE, SOURCE_WRITER_ROLE } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateCicloDto,
  CreateContactDto,
  CreateTemplateDto,
  RemindDto,
  TestSendDto,
  UpdateCicloDto,
  UpdateContactDto,
  UpdateTemplateDto,
  UpsertWorkStatusDto,
} from './messaging.dto';
import { MessagingService } from './messaging.service';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(MESSAGE_ADMIN_ROLE, SOURCE_WRITER_ROLE)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('contacts')
  createContact(@Body() dto: CreateContactDto) {
    return this.messaging.createContact(dto);
  }

  @Get('contacts')
  @CacheTTL(CACHE_TTLS.MESSAGING_LIST_MS)
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
  @CacheTTL(CACHE_TTLS.MESSAGING_LIST_MS)
  listTemplates() {
    return this.messaging.listTemplates();
  }

  @Patch('templates/:key')
  updateTemplate(@Param('key') key: string, @Body() dto: UpdateTemplateDto) {
    return this.messaging.updateTemplate(key, dto);
  }

  @Post('ciclos')
  @Roles(MESSAGE_ADMIN_ROLE)
  createCiclo(@Body() dto: CreateCicloDto) {
    return this.messaging.createCiclo(dto);
  }

  @Get('ciclos')
  @CacheTTL(CACHE_TTLS.MESSAGING_LIST_MS)
  listCiclos() {
    return this.messaging.listCiclos();
  }

  @Patch('ciclos/:id')
  @Roles(MESSAGE_ADMIN_ROLE)
  updateCiclo(@Param('id') id: string, @Body() dto: UpdateCicloDto) {
    return this.messaging.updateCiclo(id, dto);
  }

  @Post('work-status')
  upsertWorkStatus(@Body() dto: UpsertWorkStatusDto) {
    return this.messaging.upsertWorkStatus(dto);
  }

  @Get('work-status')
  @CacheTTL(CACHE_TTLS.MESSAGING_DYNAMIC_MS)
  listWorkStatuses(@Query('cicloId') cicloId?: string) {
    return this.messaging.listWorkStatuses(cicloId);
  }

  @Get('dispatches')
  @CacheTTL(CACHE_TTLS.MESSAGING_DYNAMIC_MS)
  listDispatches(@Query('cicloId') cicloId?: string) {
    return this.messaging.listDispatches(cicloId);
  }

  @Get('roster')
  @CacheTTL(CACHE_TTLS.MESSAGING_DYNAMIC_MS)
  listStaffRoster() {
    return this.messaging.listStaffRoster();
  }

  @Post('test-send')
  testSend(@Body() dto: TestSendDto) {
    return this.messaging.sendTestMessage(dto);
  }

  @Post('remind')
  remind(@Body() dto: RemindDto) {
    return this.messaging.remindContact(dto.contactId);
  }

  @Post('dispatch/run')
  @Roles(MESSAGE_ADMIN_ROLE)
  runWeeklyDispatch() {
    return this.messaging.runWeeklyStatusDispatch();
  }
}
