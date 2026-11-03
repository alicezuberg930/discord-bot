# NestJS Discord bot

A small NestJS 12 application that connects to Discord through `discord.js` and
provides `/ping` and Gemini-powered `/question` slash commands. The HTTP server
exposes health at `GET /`, Discord status at `GET /ping`, and Gemini questions at
`POST /question`. New members can also complete private email OTP verification
to receive the `member` role. Verification identity, OTP expiry, attempts, and
status are persisted through Prisma in PostgreSQL.

## Requirements

- Node.js 22.22.3 or newer
- Docker with Docker Compose
- A Discord application with a bot user

## PostgreSQL and Prisma

Start the PostgreSQL 17 container and apply committed migrations before starting
the bot:

```bash
npm run db:up
npm run db:deploy
```

The database uses the `postgres_data` Docker volume, so ordinary container
restarts and `docker compose down` preserve records. Do not add `-v` when stopping
the stack unless you intentionally want to erase the database.

Useful database commands:

```bash
npm run db:generate  # regenerate the typed Prisma client
npm run db:migrate   # create/apply a development migration
npm run db:studio    # inspect records in Prisma Studio
npm run db:smoke     # disposable write/read/delete connectivity check
npm run db:down      # stop PostgreSQL while preserving its volume
```

Each guild/user record stores the normalized and masked email, verification
status, hashed OTP, OTP expiry, resend time, attempts remaining, verified role,
join/leave timestamps, and verification timestamp. Verified users who rejoin are
recognized from PostgreSQL and have their role restored automatically.

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

## Configure email verification

1. In **Discord Developer Portal → Bot → Privileged Gateway Intents**, enable
   **Server Members Intent**.
2. Give the bot **Manage Roles** in the server and move its bot role above the
   `member` role.
3. Configure the verification channel and role in `.env`:

   ```dotenv
   VERIFICATION_CHANNEL_ID=1566719152507330602
   VERIFIED_ROLE_ID=
   VERIFIED_ROLE_NAME=member
   ```

   `VERIFIED_ROLE_ID` is recommended if multiple roles could have the same name.
4. Add SMTP credentials. For a provider using STARTTLS on port 587:

   ```dotenv
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-smtp-username
   SMTP_PASS=your-smtp-password-or-app-password
   SMTP_FROM=verification@example.com
   ```

For providers using implicit TLS on port 465, set `SMTP_PORT=465` and
`SMTP_SECURE=true`.

When a human user joins with only the `@everyone` role, the bot mentions them in
the verification channel with a button. The button opens a private email modal.
After an OTP is delivered and entered correctly, the bot assigns the configured
role. OTPs expire after 10 minutes, have five attempts, and have a 60-second
resend cooldown by default. The normalized email is retained to map the Discord
user to their verified identity; the plaintext OTP is never stored.

## Configure Gemini

1. Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Put the key in `.env`:

   ```dotenv
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-flash-latest
   ```

The key stays on the server and is never sent to Discord clients or returned by
the HTTP API.

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

Ask Gemini from Discord with `/question text:your question`. Gemini's
Discord-compatible Markdown is preserved, and long answers are split safely
across multiple messages.

The same feature is available over HTTP:

```bash
curl -X POST http://localhost:3000/question \
  -H "Content-Type: application/json" \
  -d '{"question":"Explain dependency injection in NestJS"}'
```

The JSON response contains `answer`, `model`, and token `usage` fields. The
`answer` value contains the same Markdown sent to Discord.

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
| `DATABASE_ENABLED` | No | Enables PostgreSQL persistence; defaults to `true`. |
| `DATABASE_URL` | Yes | Prisma PostgreSQL connection string. |
| `OTP_HASH_SECRET` | Yes | Persistent secret used to HMAC OTPs before storage. |
| `DISCORD_ENABLED` | No | Set to `false` to run without connecting to Discord. |
| `DISCORD_TOKEN` | Yes when enabled | Secret bot token from the Bot page. |
| `DISCORD_CLIENT_ID` | Yes when enabled | Discord application ID. |
| `DISCORD_GUILD_ID` | No | Test server ID for immediate guild-scoped command registration. |
| `GEMINI_API_KEY` | For `/question` | Server-side key from Google AI Studio. |
| `GEMINI_MODEL` | No | Gemini model; defaults to `gemini-flash-latest`. |
| `VERIFICATION_CHANNEL_ID` | For email verification | Channel where new members receive the verification button. |
| `VERIFIED_ROLE_ID` | Recommended | Exact role to assign after successful verification. |
| `VERIFIED_ROLE_NAME` | No | Role name fallback; defaults to `member`. |
| `EMAIL_OTP_TTL_SECONDS` | No | OTP lifetime; defaults to `600`. |
| `EMAIL_OTP_MAX_ATTEMPTS` | No | Incorrect attempts allowed; defaults to `5`. |
| `EMAIL_OTP_RESEND_SECONDS` | No | Resend cooldown; defaults to `60`. |
| `SMTP_HOST` | For email verification | SMTP server hostname. |
| `SMTP_PORT` | No | SMTP port; defaults to `587`. |
| `SMTP_SECURE` | No | Use implicit TLS, normally `true` only for port 465. |
| `SMTP_USER` | For email verification | SMTP username. |
| `SMTP_PASS` | For email verification | SMTP password or provider app password. |
| `SMTP_FROM` | For email verification | Sender address displayed on OTP emails. |

`.env` is ignored by Git. Keep both API credentials private. If the Discord token
is exposed, reset it in the Discord Developer Portal; if the Gemini key is
exposed, revoke it in Google AI Studio.
