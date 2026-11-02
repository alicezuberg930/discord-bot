# NestJS Discord bot

A small NestJS 12 application that connects to Discord through `discord.js` and
registers a `/ping` slash command. The HTTP server exposes a health endpoint at
`GET /` and the connected Discord client's status at `GET /ping`.

## Requirements

- Node.js 22.22.3 or newer
- A Discord application with a bot user

## Configure Discord

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and create an application.
2. On **Bot**, create the bot user and copy/reset its token.
3. On **General Information**, copy the Application ID.
4. Replace the placeholder values in `.env`:

   ```dotenv
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-id
   ```

5. Optionally set `DISCORD_GUILD_ID` to a test server ID. Guild commands appear
   immediately; if it is empty, `/ping` is registered globally and may take time
   to appear.
6. On **OAuth2 > URL Generator**, select the `bot` and `applications.commands`
   scopes, then use the generated URL to invite the bot to your server. `/ping`
   needs no additional bot permissions.

The bot uses only the `Guilds` gateway intent, so privileged intents do not need
to be enabled.

## Run

```bash
npm install
npm run start:dev
```

Once the log reports that the bot is connected, run `/ping` in Discord. The bot
will reply with its current gateway latency. You can also query the bot process:

```bash
curl http://localhost:3000/ping
```

The HTTP response includes the connection status, gateway latency, bot identity,
guild count, and process uptime. It does not expose the bot token.

Other useful commands:

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm run start:prod
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `DISCORD_ENABLED` | No | Set to `false` to run without connecting to Discord. |
| `DISCORD_TOKEN` | Yes when enabled | Secret bot token from the Bot page. |
| `DISCORD_CLIENT_ID` | Yes when enabled | Discord application ID. |
| `DISCORD_GUILD_ID` | No | Test server ID for immediate guild-scoped command registration. |

`.env` is ignored by Git. Keep the token private; if it is ever exposed, reset
it immediately in the Discord Developer Portal.
