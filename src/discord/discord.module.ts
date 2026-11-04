import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module.js';
import { LiveUpdatesModule } from '../live/live-updates.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { DiscordController } from './discord.controller.js';
import { DiscordService } from './discord.service.js';

@Module({
  imports: [GeminiModule, VerificationModule, LiveUpdatesModule],
  controllers: [DiscordController],
  providers: [DiscordService],
  exports: [DiscordService],
})
export class DiscordModule {}
