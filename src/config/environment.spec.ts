import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('parses a valid Discord configuration', () => {
    expect(
      validateEnvironment({
        PORT: '4000',
        DATABASE_ENABLED: 'false',
        DISCORD_ENABLED: 'true',
        DISCORD_TOKEN: 'a-real-token',
        DISCORD_CLIENT_ID: '123456789012345678',
      }),
    ).toEqual({
      PORT: 4000,
      DATABASE_ENABLED: false,
      DATABASE_URL: undefined,
      OTP_HASH_SECRET: undefined,
      DISCORD_ENABLED: true,
      DISCORD_TOKEN: 'a-real-token',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_GUILD_ID: undefined,
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: 'gemini-flash-latest',
      VERIFICATION_CHANNEL_ID: undefined,
      VERIFIED_ROLE_ID: undefined,
      VERIFIED_ROLE_NAME: 'member',
      EMAIL_OTP_TTL_SECONDS: 600,
      EMAIL_OTP_MAX_ATTEMPTS: 5,
      EMAIL_OTP_RESEND_SECONDS: 60,
      SMTP_HOST: undefined,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      SMTP_FROM: undefined,
    });
  });

  it('does not require Discord credentials when the bot is disabled', () => {
    expect(
      validateEnvironment({
        DATABASE_ENABLED: 'false',
        DISCORD_ENABLED: 'false',
      }),
    ).toMatchObject({
      PORT: 3000,
      DISCORD_ENABLED: false,
    });
  });

  it('rejects placeholder credentials when the bot is enabled', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_ENABLED: 'false',
        DISCORD_TOKEN: 'replace-with-your-discord-bot-token',
        DISCORD_CLIENT_ID: 'replace-with-your-discord-application-id',
      }),
    ).toThrow('DISCORD_TOKEN must be set to a real value in .env');
  });

  it('treats a placeholder Gemini key as not configured', () => {
    expect(
      validateEnvironment({
        DATABASE_ENABLED: 'false',
        DISCORD_ENABLED: 'false',
        GEMINI_API_KEY: 'replace-with-your-gemini-api-key',
      }).GEMINI_API_KEY,
    ).toBeUndefined();
  });
});
