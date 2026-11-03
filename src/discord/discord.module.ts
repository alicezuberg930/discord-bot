import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { DiscordController } from './discord.controller.js';
import { DiscordService } from './discord.service.js';

@Module({
  imports: [GeminiModule, VerificationModule],
  controllers: [DiscordController],
  providers: [DiscordService],
})
export class DiscordModule {}
