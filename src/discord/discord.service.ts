import {
  HttpException,
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
  MessageFlags,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import type { EnvironmentVariables } from '../config/environment.js';
import { GeminiService } from '../gemini/gemini.service.js';
import { LiveUpdatesService } from '../live/live-updates.service.js';
import { UserVerificationService } from '../verification/user-verification.service.js';
import { splitDiscordMarkdown } from './discord-markdown.js';

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
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly geminiService: GeminiService,
    private readonly userVerificationService: UserVerificationService,
    private readonly liveUpdatesService: LiveUpdatesService,
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

      for (const guild of readyClient.guilds.cache.values()) {
        void this.userVerificationService.handleExistingGuildMembers(guild);
      }
    });

    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord client error', error.stack);
    });

    this.client.on(Events.GuildMemberAdd, async (member) => {
      this.liveUpdatesService.notify('member-joined');
      await this.userVerificationService.handleMemberJoin(member);
    });

    // Keep the admin page live: joins, leaves and role/nickname changes.
    this.client.on(Events.GuildMemberRemove, () => {
      this.liveUpdatesService.notify('member-left');
    });

    this.client.on(Events.GuildMemberUpdate, () => {
      this.liveUpdatesService.notify('member-updated');
    });

    this.client.on(Events.GuildCreate, async (guild) => {
      await this.userVerificationService.handleExistingGuildMembers(guild);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton() || interaction.isModalSubmit()) {
        const handled =
          await this.userVerificationService.handleInteraction(interaction);

        if (handled) {
          if (interaction.isModalSubmit()) {
            this.liveUpdatesService.notify('verification-submitted');
          }
          return;
        }
      }

      if (!interaction.isChatInputCommand()) {
        return;
      }

      try {
        if (interaction.commandName === 'ping') {
          await interaction.reply(
            `Pong! Gateway latency: ${interaction.client.ws.ping}ms`,
          );
          return;
        }

        if (interaction.commandName === 'question') {
          await this.answerQuestion(interaction);
        }
      } catch (error) {
        await this.handleInteractionError(interaction, error);
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

  /** The connected guild with its member list, or null while offline. */
  async getGuild(guildId: string): Promise<Guild | null> {
    if (!this.client.isReady()) {
      return null;
    }

    const guild = await this.client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return null;
    }

    // The GuildMembers intent keeps the cache up to date after the startup
    // scan; only ask Discord again if the cache is clearly incomplete.
    if (guild.members.cache.size < guild.memberCount) {
      await guild.members.fetch().catch((error: unknown) => {
        this.logger.warn(
          `Could not refresh members of guild ${guildId}; using the cache: ${String(error)}`,
        );
      });
    }

    return guild;
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
      new SlashCommandBuilder()
        .setName('question')
        .setDescription('Ask Gemini a question')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('The question to send to Gemini')
            .setRequired(true)
            .setMaxLength(4_000),
        )
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
        ? `Registered /ping and /question in Discord guild ${guildId}`
        : 'Registered /ping and /question globally (Discord may take time to propagate them)',
    );
  }

  private async answerQuestion(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const question = interaction.options.getString('text', true);
    await interaction.deferReply();

    const result = await this.geminiService.ask(question);
    const chunks = splitDiscordMarkdown(result.answer);

    await interaction.editReply(chunks[0]);

    for (const chunk of chunks.slice(1)) {
      await interaction.followUp(chunk);
    }
  }

  private async handleInteractionError(
    interaction: ChatInputCommandInteraction,
    error: unknown,
  ): Promise<void> {
    const stack = error instanceof Error ? error.stack : String(error);
    const userMessage =
      error instanceof HttpException
        ? error.message
        : 'The command could not be completed. Please try again.';
    this.logger.error(`Failed to handle /${interaction.commandName}`, stack);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(userMessage);
      } else {
        await interaction.reply({
          content: userMessage,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      const replyStack =
        replyError instanceof Error ? replyError.stack : String(replyError);
      this.logger.error(
        'Failed to send the command error response',
        replyStack,
      );
    }
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
