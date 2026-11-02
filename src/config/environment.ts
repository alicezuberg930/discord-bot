export interface EnvironmentVariables {
  PORT: number;
  DISCORD_ENABLED: boolean;
  DISCORD_TOKEN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_GUILD_ID?: string;
}

const PLACEHOLDER_PREFIX = 'replace-with-';

function optionalString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function requiredString(config: Record<string, unknown>, key: string): string {
  const value = optionalString(config, key);

  if (!value || value.startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error(`${key} must be set to a real value in .env`);
  }

  return value;
}

function booleanValue(
  config: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = optionalString(config, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${key} must be true or false`);
}

function portValue(config: Record<string, unknown>): number {
  const rawPort = optionalString(config, 'PORT') ?? '3000';
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const discordEnabled = booleanValue(config, 'DISCORD_ENABLED', true);
  const discordToken = discordEnabled
    ? requiredString(config, 'DISCORD_TOKEN')
    : optionalString(config, 'DISCORD_TOKEN');
  const discordClientId = discordEnabled
    ? requiredString(config, 'DISCORD_CLIENT_ID')
    : optionalString(config, 'DISCORD_CLIENT_ID');

  return {
    PORT: portValue(config),
    DISCORD_ENABLED: discordEnabled,
    DISCORD_TOKEN: discordToken,
    DISCORD_CLIENT_ID: discordClientId,
    DISCORD_GUILD_ID: optionalString(config, 'DISCORD_GUILD_ID'),
  };
}
