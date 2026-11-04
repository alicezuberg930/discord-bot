import { Module } from '@nestjs/common';
import { LiveUpdatesService } from './live-updates.service.js';

@Module({
  providers: [LiveUpdatesService],
  exports: [LiveUpdatesService],
})
export class LiveUpdatesModule {}
