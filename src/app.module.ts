import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/environment.js';
import { DiscordModule } from './discord/discord.module.js';
import { ExcelExportModule } from './export/excel-export.module.js';
import { GeminiModule } from './gemini/gemini.module.js';
import { QuestionModule } from './question/question.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    GeminiModule,
    DiscordModule,
    QuestionModule,
    ExcelExportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
