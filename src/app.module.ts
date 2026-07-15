import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongoModule } from './mongo/mongo.module';

@Module({
  imports: [MongoModule.register()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
