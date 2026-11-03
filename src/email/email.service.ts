import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EnvironmentVariables } from '../config/environment.js';

@Injectable()
export class EmailService implements OnApplicationShutdown {
  private readonly transporter: Transporter | null;
  private readonly from: string | undefined;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    const host = this.configService.get('SMTP_HOST', { infer: true });
    const user = this.configService.get('SMTP_USER', { infer: true });
    const pass = this.configService.get('SMTP_PASS', { infer: true });
    this.from = this.configService.get('SMTP_FROM', { infer: true });

    this.transporter = host && user && pass && this.from
      ? nodemailer.createTransport({
        host,
        port: this.configService.get('SMTP_PORT', { infer: true }),
        secure: this.configService.get('SMTP_SECURE', { infer: true }),
        pool: true,
        auth: { user, pass },
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      : null;
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendVerificationCode(
    recipient: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Ask a server administrator to configure SMTP.',
      );
    }

    const minutes = Math.ceil(ttlSeconds / 60);

    await this.transporter.sendMail({
      from: this.from,
      to: recipient,
      subject: 'Your Discord server verification code',
      text: `Your verification code is ${code}. It expires in ${minutes} minutes. If you did not request this code, you can ignore this email.`,
      html: [
        '<h2>Discord server verification</h2>',
        '<p>Your verification code is:</p>',
        `<p style="font-size: 28px; font-weight: bold; letter-spacing: 6px">${code}</p>`,
        `<p>This code expires in ${minutes} minutes.</p>`,
        '<p>If you did not request this code, you can ignore this email.</p>',
      ].join(''),
    });
  }

  onApplicationShutdown(): void {
    this.transporter?.close();
  }
}
