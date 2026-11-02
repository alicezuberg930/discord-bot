import { Test, type TestingModule } from '@nestjs/testing';
import { DiscordController } from './discord.controller.js';
import { DiscordService, type DiscordPingResponse } from './discord.service.js';

describe('DiscordController', () => {
  let controller: DiscordController;

  const response: DiscordPingResponse = {
    status: 'online',
    gatewayPingMs: 42,
    bot: {
      id: '123456789012345678',
      username: 'test-bot',
      tag: 'test-bot#0000',
    },
    guildCount: 2,
    uptimeMs: 10_000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordController],
      providers: [
        {
          provide: DiscordService,
          useValue: {
            getPingStatus: () => response,
          },
        },
      ],
    }).compile();

    controller = module.get(DiscordController);
  });

  it('returns the Discord client status', () => {
    expect(controller.ping()).toEqual(response);
  });
});
