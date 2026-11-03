import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const key = {
  guildId: 'smoke-test-guild',
  discordUserId: 'smoke-test-user',
};

try {
  await database.user.upsert({
    where: { guildId_discordUserId: key },
    create: {
      ...key,
      phone: '0912345678',
      cccd: '012345678901',
    },
    update: {
      phone: '0912345678',
      cccd: '012345678901',
    },
  });
  const record = await database.user.findUnique({
    where: { guildId_discordUserId: key },
  });

  console.log({
    write: true,
    read: record?.phone === '0912345678',
  });
} finally {
  await database.user.deleteMany({ where: key });
  await database.$disconnect();
}

