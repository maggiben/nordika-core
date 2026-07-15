import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { IsEmail, IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { AuthService } from './auth.service';

class CredentialsDto {
  @IsEmail() email!: string;
  @IsString() @Length(12, 128) password!: string;
}
class TokenDto {
  @IsString()
  @Length(32, 512)
  token!: string;
}
class ResetDto extends TokenDto {
  @IsString() @Length(12, 128) password!: string;
}
class EmailDto {
  @IsEmail() email!: string;
}
class RefreshTokenDto {
  @IsString()
  @Length(32, 512)
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post(['register', 'signup'])
  async register(
    @Body() dto: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setSession(
      response,
      await this.auth.register(dto.email, dto.password),
    );
  }

  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setSession(
      response,
      await this.auth.login(dto.email, dto.password),
    );
  }

  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setSession(response, await this.auth.refresh(dto.refreshToken));
  }

  @HttpCode(204)
  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken);
    response.clearCookie('access_token', { path: '/' });
    response.clearCookie('refresh_token', { path: '/' });
  }
  @HttpCode(202)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: EmailDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @HttpCode(204)
  @Post('verify-email')
  async verifyEmail(@Body() dto: TokenDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  private setSession(
    response: Response,
    result: Awaited<ReturnType<AuthService['login']>>,
  ) {
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';

    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
      path: '/',
      sameSite,
      secure,
    });
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
      sameSite,
      secure,
    });

    return result;
  }
}
