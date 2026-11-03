import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvironmentVariables } from '../config/environment.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly databaseEnabled: boolean;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const databaseEnabled = configService.get('DATABASE_ENABLED', {
      infer: true,
    });
    const connectionString =
      configService.get('DATABASE_URL', { infer: true }) ??
      'postgresql://disabled:disabled@localhost:5432/disabled';

    super({
      adapter: new PrismaPg({ connectionString }),
    });
    this.databaseEnabled = databaseEnabled;
  }

  async onModuleInit(): Promise<void> {
    if (this.databaseEnabled) {
      await this.$connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.databaseEnabled) {
      await this.$disconnect();
    }
  }
}
