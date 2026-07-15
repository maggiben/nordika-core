import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ACCOUNT_MODEL, accountSchema } from '../auth/auth.schema';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ACCOUNT_MODEL, schema: accountSchema },
    ]),
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
