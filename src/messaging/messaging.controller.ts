import {
  Body,
  Controller,
  Delete,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessageAdminOnly, MessagingAccess } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AssignCatalogMessageDto,
  CreateCatalogMessageDto,
  CreateCicloDto,
  CreateContactDto,
  CreateTemplateDto,
  RemindDto,
  ReorderCatalogMessagesDto,
  ResetCatalogSequenceDto,
  SendCatalogMessageDto,
  TestSendDto,
  UpdateCatalogMessageDto,
  UpdateCicloDto,
  UpdateContactDto,
  UpdateTemplateDto,
  UpsertWorkStatusDto,
} from './messaging.dto';
import {
  MessagingService,
  type StaffCatalogRow,
  type WeeklyDispatchSummary,
} from './messaging.service';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@MessagingAccess
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
  listTemplates(@Query('language') language?: string) {
    return this.messaging.listTemplates(language);
  }

  @Patch('templates/:key')
  updateTemplate(@Param('key') key: string, @Body() dto: UpdateTemplateDto) {
    return this.messaging.updateTemplate(key, dto);
  }

  @Post('ciclos')
  @MessageAdminOnly
  createCiclo(@Body() dto: CreateCicloDto) {
    return this.messaging.createCiclo(dto);
  }

  @Get('ciclos')
  @CacheTTL(CACHE_TTLS.MESSAGING_LIST_MS)
  listCiclos() {
    return this.messaging.listCiclos();
  }

  @Patch('ciclos/:id')
  @MessageAdminOnly
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
  listStaffRoster() {
    return this.messaging.listStaffRoster();
  }

  @Post('catalog')
  createCatalogMessage(
    @Body() dto: CreateCatalogMessageDto,
  ): Promise<StaffCatalogRow> {
    return this.messaging.createCatalogMessage(dto);
  }

  @Get('catalog')
  listCatalogMessages(): Promise<StaffCatalogRow[]> {
    return this.messaging.listCatalogMessages();
  }

  @Post('catalog/reorder')
  reorderCatalogMessages(
    @Body() dto: ReorderCatalogMessagesDto,
  ): Promise<StaffCatalogRow[]> {
    return this.messaging.reorderCatalogMessages(dto);
  }

  @Post('catalog/reset-sequence')
  resetCatalogSequence(
    @Body() dto: ResetCatalogSequenceDto,
  ): Promise<{ ok: true; reset: number }> {
    return this.messaging.resetCatalogSequence(dto.contactId);
  }

  @Patch('catalog/:id')
  updateCatalogMessage(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogMessageDto,
  ): Promise<StaffCatalogRow> {
    return this.messaging.updateCatalogMessage(id, dto);
  }

  @Post('catalog/:id/assign')
  assignCatalogMessage(
    @Param('id') id: string,
    @Body() dto: AssignCatalogMessageDto,
  ): Promise<StaffCatalogRow> {
    return this.messaging.assignCatalogMessage(id, dto.contactId);
  }

  @Post('catalog/:id/send')
  sendCatalogMessage(
    @Param('id') id: string,
    @Body() dto: SendCatalogMessageDto,
  ): Promise<{
    ok: true;
    phone: string;
    catalogMessageId: string;
    threadId: string;
    providerMessageId?: string;
  }> {
    return this.messaging.sendCatalogMessage(id, dto);
  }

  @Delete('catalog/:id')
  deleteCatalogMessage(@Param('id') id: string): Promise<{ ok: true }> {
    return this.messaging.deleteCatalogMessage(id);
  }

  @Post('test-send')
  testSend(@Body() dto: TestSendDto): Promise<{
    ok: true;
    phone: string;
    templateKey: string;
    renderedText: string;
    providerMessageId?: string;
  }> {
    return this.messaging.sendTestMessage(dto);
  }

  @Post('remind')
  remind(@Body() dto: RemindDto): Promise<{
    ok: true;
    phone: string;
    templateKey: string | null;
    renderedText: string;
    providerMessageId?: string;
  }> {
    return this.messaging.remindContact(dto.contactId);
  }

  @Post('dispatch/run')
  @MessageAdminOnly
  runWeeklyDispatch(): Promise<WeeklyDispatchSummary[]> {
    return this.messaging.runWeeklyStatusDispatch();
  }
}
