import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import type { EnvironmentVariables } from '../config/environment.js';

export interface DiscordPingResponse {
  status: 'online' | 'offline' | 'disabled';
  gatewayPingMs: number | null;
  bot: {
    id: string;
    username: string;
    tag: string;
  } | null;
  guildCount: number;
  uptimeMs: number | null;
}

@Injectable()
export class DiscordService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DiscordService.name);
  private readonly client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get('DISCORD_ENABLED', { infer: true })) {
      this.logger.warn('Discord bot is disabled');
      return;
    }

    const token = this.configService.getOrThrow('DISCORD_TOKEN', {
      infer: true,
    });
    const clientId = this.configService.getOrThrow('DISCORD_CLIENT_ID', {
      infer: true,
    });
    const guildId = this.configService.get('DISCORD_GUILD_ID', { infer: true });

    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.log(`Logged in to Discord as ${readyClient.user.tag}`);
    });

    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord client error', error.stack);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (
        !interaction.isChatInputCommand() ||
        interaction.commandName !== 'ping'
      ) {
        return;
      }

      try {
        await interaction.reply(
          `Pong! Gateway latency: ${interaction.client.ws.ping}ms`,
        );
      } catch (error) {
        const stack = error instanceof Error ? error.stack : String(error);
        this.logger.error('Failed to handle /ping', stack);
      }
    });

    await this.registerCommands(token, clientId, guildId);
    await this.client.login(token);
  }

  getPingStatus(): DiscordPingResponse {
    if (!this.configService.get('DISCORD_ENABLED', { infer: true })) {
      return this.disconnectedPingResponse('disabled');
    }

    if (!this.client.isReady()) {
      return this.disconnectedPingResponse('offline');
    }

    return {
      status: 'online',
      gatewayPingMs: this.client.ws.ping,
      bot: {
        id: this.client.user.id,
        username: this.client.user.username,
        tag: this.client.user.tag,
      },
      guildCount: this.client.guilds.cache.size,
      uptimeMs: this.client.uptime,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isReady()) {
      await this.client.destroy();
      this.logger.log('Disconnected from Discord');
    }
  }

  private async registerCommands(
    token: string,
    clientId: string,
    guildId?: string,
  ): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check whether the bot is online')
        .toJSON(),
    ];
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);

    await new REST({ version: '10' }).setToken(token).put(route, {
      body: commands,
    });

    this.logger.log(
      guildId
        ? `Registered /ping in Discord guild ${guildId}`
        : 'Registered /ping globally (Discord may take time to propagate it)',
    );
  }

  private disconnectedPingResponse(
    status: 'offline' | 'disabled',
  ): DiscordPingResponse {
    return {
      status,
      gatewayPingMs: null,
      bot: null,
      guildCount: 0,
      uptimeMs: null,
    };
  }
}
