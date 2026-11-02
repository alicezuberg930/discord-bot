import { Module } from '@nestjs/common';
import { DiscordController } from './discord.controller.js';
import { DiscordService } from './discord.service.js';

@Module({
  controllers: [DiscordController],
  providers: [DiscordService],
})
export class DiscordModule {}
