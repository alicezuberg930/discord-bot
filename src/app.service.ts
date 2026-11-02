import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus(): { status: 'ok'; service: string } {
    return {
      status: 'ok',
      service: 'discord-bot',
    };
  }
}
