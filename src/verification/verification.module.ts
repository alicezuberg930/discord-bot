import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { EmailModule } from '../email/email.module.js';
import { EmailVerificationService } from './email-verification.service.js';

@Module({
  imports: [EmailModule, PrismaModule],
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class VerificationModule {}
