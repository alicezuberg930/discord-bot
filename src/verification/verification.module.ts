import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { UserVerificationService } from './user-verification.service.js';

@Module({
  imports: [PrismaModule],
  providers: [UserVerificationService],
  exports: [UserVerificationService],
})
export class VerificationModule {}
