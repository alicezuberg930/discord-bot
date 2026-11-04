export interface EnvironmentVariables {
  PORT: number;
  DATABASE_ENABLED: boolean;
  DATABASE_URL?: string;
  DISCORD_ENABLED: boolean;
  DISCORD_TOKEN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_GUILD_ID?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  VERIFICATION_CHANNEL_ID?: string;
  VERIFIED_ROLE_ID?: string;
  VERIFIED_ROLE_NAME: string;
  EXCLUDE_ROLES_VERIFICATION: string[];
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

function optionalConfiguredString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optionalString(config, key);

  return value?.startsWith(PLACEHOLDER_PREFIX) ? undefined : value;
}

function commaSeparatedStrings(
  config: Record<string, unknown>,
  key: string,
): string[] {
  const value = optionalString(config, key);

  if (!value) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function integerValue(
  config: Record<string, unknown>,
  key: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = optionalString(config, key) ?? String(defaultValue);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
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
  return integerValue(config, 'PORT', 3_000, 1, 65_535);
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const discordEnabled = booleanValue(config, 'DISCORD_ENABLED', true);
  const databaseEnabled = booleanValue(config, 'DATABASE_ENABLED', true);
  const discordToken = discordEnabled
    ? requiredString(config, 'DISCORD_TOKEN')
    : optionalString(config, 'DISCORD_TOKEN');
  const discordClientId = discordEnabled
    ? requiredString(config, 'DISCORD_CLIENT_ID')
    : optionalString(config, 'DISCORD_CLIENT_ID');

  return {
    PORT: portValue(config),
    DATABASE_ENABLED: databaseEnabled,
    DATABASE_URL: databaseEnabled
      ? requiredString(config, 'DATABASE_URL')
      : optionalConfiguredString(config, 'DATABASE_URL'),
    DISCORD_ENABLED: discordEnabled,
    DISCORD_TOKEN: discordToken,
    DISCORD_CLIENT_ID: discordClientId,
    DISCORD_GUILD_ID: optionalString(config, 'DISCORD_GUILD_ID'),
    GEMINI_API_KEY: optionalConfiguredString(config, 'GEMINI_API_KEY'),
    GEMINI_MODEL:
      optionalString(config, 'GEMINI_MODEL') ?? 'gemini-flash-latest',
    VERIFICATION_CHANNEL_ID: optionalString(config, 'VERIFICATION_CHANNEL_ID'),
    VERIFIED_ROLE_ID: optionalString(config, 'VERIFIED_ROLE_ID'),
    VERIFIED_ROLE_NAME:
      optionalString(config, 'VERIFIED_ROLE_NAME') ?? 'member',
    EXCLUDE_ROLES_VERIFICATION: commaSeparatedStrings(
      config,
      'EXCLUDE_ROLES_VERIFICATION',
    ),
  };
}
