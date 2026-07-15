import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangePasswordDto, UpdateEmailScheduleDto } from './account.dto';
import { AccountService } from './account.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('account')
export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly auth: AuthService,
  ) {}

  @Get('settings')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.accounts.getSettings(request.user.subject);
  }

  @Patch('settings')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateEmailScheduleDto,
  ) {
    return this.accounts.updateSchedule(request.user.subject, dto);
  }

  @Post('change-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(
      request.user.subject,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true };
  }
}
