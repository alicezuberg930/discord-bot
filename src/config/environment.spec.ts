import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('parses a valid Discord configuration', () => {
    expect(
      validateEnvironment({
        PORT: '4000',
        DISCORD_ENABLED: 'true',
        DISCORD_TOKEN: 'a-real-token',
        DISCORD_CLIENT_ID: '123456789012345678',
      }),
    ).toEqual({
      PORT: 4000,
      DISCORD_ENABLED: true,
      DISCORD_TOKEN: 'a-real-token',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_GUILD_ID: undefined,
    });
  });

  it('does not require Discord credentials when the bot is disabled', () => {
    expect(validateEnvironment({ DISCORD_ENABLED: 'false' })).toMatchObject({
      PORT: 3000,
      DISCORD_ENABLED: false,
    });
  });

  it('rejects placeholder credentials when the bot is enabled', () => {
    expect(() =>
      validateEnvironment({
        DISCORD_TOKEN: 'replace-with-your-discord-bot-token',
        DISCORD_CLIENT_ID: 'replace-with-your-discord-application-id',
      }),
    ).toThrow('DISCORD_TOKEN must be set to a real value in .env');
  });
});
