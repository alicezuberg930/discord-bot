import { PrismaPg } from '@prisma/adapter-pg';
import {
  EmailVerificationStatus,
  PrismaClient,
} from '../dist/generated/prisma/client.js';

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
  await database.emailVerification.upsert({
    where: { guildId_discordUserId: key },
    create: {
      ...key,
      status: EmailVerificationStatus.UNVERIFIED,
    },
    update: {
      status: EmailVerificationStatus.UNVERIFIED,
    },
  });
  const record = await database.emailVerification.findUnique({
    where: { guildId_discordUserId: key },
  });

  console.log({
    write: true,
    read: record?.status === EmailVerificationStatus.UNVERIFIED,
  });
} finally {
  await database.emailVerification.deleteMany({ where: key });
  await database.$disconnect();
}

