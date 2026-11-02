import { Controller, Get } from '@nestjs/common';
import { DiscordService, type DiscordPingResponse } from './discord.service.js';

@Controller()
export class DiscordController {
  constructor(private readonly discordService: DiscordService) {}

  @Get('ping')
  ping(): DiscordPingResponse {
    return this.discordService.getPingStatus();
  }
}
