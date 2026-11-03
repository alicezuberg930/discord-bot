# NestJS Discord bot

A small NestJS 12 application that connects to Discord through `discord.js` and
provides `/ping` and Gemini-powered `/question` slash commands. The HTTP server
exposes health at `GET /`, Discord status at `GET /ping`, and Gemini questions at
`POST /question`. New members can submit their account name, Vietnamese phone
number, and CCCD through a private modal to receive the `member` role.
Registration data is persisted through Prisma in PostgreSQL.

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

The `users` table stores an auto-incrementing ID, account name, phone, CCCD,
guild ID, Discord user ID, optional previously known email, `created_at`, and
`update_at`. Registered users who rejoin are recognized from PostgreSQL and have
their role restored automatically.

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

## Configure user verification

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

When a human user joins with only the `@everyone` role, the bot mentions them in
the verification channel with the **Xác thực người dùng** button. The button
opens a private modal for **Tên tài khoản**, **Số điện thoại**, and **Căn cước
nhân dân**. A valid Vietnamese mobile-number format and a structurally valid
12-digit CCCD are required. After submission, the bot upserts the `users` record
and assigns the configured role. If an old email verification record exists for
that Discord account, its email is copied into `users.email`.

Each verification button and its modal are bound to the mentioned Discord user.
Other members who click the button receive a private authorization error and
cannot open or submit that user's verification form.

When the bot starts or is added to a guild, it also checks members who joined
before the bot. Members without the configured verified role receive the same
verification button; registered members have that role restored automatically.
Having an unrelated role does not skip verification. Verification events and
startup scans are restricted to `DISCORD_GUILD_ID` because the configured
channel and role IDs belong to that guild.

Phone numbers and CCCDs are sensitive personal data and are stored as plain
strings in PostgreSQL as requested. Restrict database access, backups, and Prisma
Studio to trusted administrators, and define an appropriate retention policy.

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
| `DISCORD_ENABLED` | No | Set to `false` to run without connecting to Discord. |
| `DISCORD_TOKEN` | Yes when enabled | Secret bot token from the Bot page. |
| `DISCORD_CLIENT_ID` | Yes when enabled | Discord application ID. |
| `DISCORD_GUILD_ID` | No | Test server ID for immediate guild-scoped command registration. |
| `GEMINI_API_KEY` | For `/question` | Server-side key from Google AI Studio. |
| `GEMINI_MODEL` | No | Gemini model; defaults to `gemini-flash-latest`. |
| `VERIFICATION_CHANNEL_ID` | For user verification | Channel where new members receive the verification button. |
| `VERIFIED_ROLE_ID` | Recommended | Exact role to assign after successful verification. |
| `VERIFIED_ROLE_NAME` | No | Role name fallback; defaults to `member`. |

`.env` is ignored by Git. Keep both API credentials private. If the Discord token
is exposed, reset it in the Discord Developer Portal; if the Gemini key is
exposed, revoke it in Google AI Studio.
