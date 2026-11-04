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
      DISCORD_ENABLED: true,
      DISCORD_TOKEN: 'a-real-token',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_GUILD_ID: undefined,
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: 'gemini-flash-latest',
      VERIFICATION_CHANNEL_ID: undefined,
      VERIFIED_ROLE_ID: undefined,
      VERIFIED_ROLE_NAME: 'member',
      EXTRA_VERIFIED_ROLE_IDS: [],
    });
  });

  it('parses extra verified role IDs from a comma-separated list', () => {
    expect(
      validateEnvironment({
        DATABASE_ENABLED: 'false',
        DISCORD_ENABLED: 'false',
        EXTRA_VERIFIED_ROLE_IDS:
          ' 1566835254638153950, 1566835254638153951,,1566835254638153950 ',
      }).EXTRA_VERIFIED_ROLE_IDS,
    ).toEqual(['1566835254638153950', '1566835254638153951']);
  });

  it('rejects an extra verified role that is not a role ID', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_ENABLED: 'false',
        DISCORD_ENABLED: 'false',
        EXTRA_VERIFIED_ROLE_IDS: 'đạo hữu',
      }),
    ).toThrow('EXTRA_VERIFIED_ROLE_IDS must be a comma-separated list');
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

describe('export login settings', () => {
  const base = { DATABASE_ENABLED: 'false', DISCORD_ENABLED: 'false' };

  it('disables the export when no login is configured', () => {
    expect(validateEnvironment(base)).toMatchObject({
      EXPORT_USERNAME: undefined,
      EXPORT_PASSWORD: undefined,
    });
  });

  it('accepts a username with a password of at least 12 characters', () => {
    expect(
      validateEnvironment({
        ...base,
        EXPORT_USERNAME: 'admin',
        EXPORT_PASSWORD: 'a-long-password',
      }),
    ).toMatchObject({
      EXPORT_USERNAME: 'admin',
      EXPORT_PASSWORD: 'a-long-password',
    });
  });

  it.each([
    [{ EXPORT_USERNAME: 'admin' }, /must be set together/],
    [{ EXPORT_PASSWORD: 'a-long-password' }, /must be set together/],
    [{ EXPORT_USERNAME: 'admin', EXPORT_PASSWORD: 'short' }, /at least 12/],
    [
      { EXPORT_USERNAME: 'ad:min', EXPORT_PASSWORD: 'a-long-password' },
      /must not contain/,
    ],
  ])('rejects an invalid export login %o', (settings, message) => {
    expect(() => validateEnvironment({ ...base, ...settings })).toThrow(
      message,
    );
  });
});
