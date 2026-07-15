import { Controller, Get } from '@nestjs/common';
import { CacheTTL } from './cache/http-cache.interceptor';
import { CACHE_TTLS } from './cache/cache.constants';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @CacheTTL(CACHE_TTLS.ROOT_MS)
  getHello(): string {
    return this.appService.getHello();
  }
}
