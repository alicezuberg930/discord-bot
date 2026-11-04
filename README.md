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

   If members are later promoted to another role that replaces the verified
   role, list those role IDs in `EXTRA_VERIFIED_ROLE_IDS` (comma-separated).
   Members holding any of them count as verified: they are not prompted, the
   button only tells them they are verified, and the bot does not give the
   original verified role back to them.
4. Let members **without** the verified role see the verification channel, and
   give the bot **View Channel**, **Send Messages**, and **Read Message
   History** there.

The bot **never sends direct messages**. Bulk DMs get bots flagged and
quarantined by Discord's anti-spam system, so every prompt lives in the
verification channel:

- **Verification panel.** When the bot starts or is added to the guild, it makes
  sure one panel message with the **Xác thực người dùng** button exists in the
  verification channel (it looks at the last 100 messages and posts a new panel
  only if none is found). Anyone can click it; the form opens for the member who
  clicked. Members who already have the verified role are told so privately.
- **New members.** When a human user joins, the bot mentions them once in the
  verification channel with the same shared button. The prompt is recorded in
  `verification_prompts`.
- **Every button in the server opens the form for whoever clicks it** — the
  panel, new-member prompts, and older prompts that were bound to another
  member. The form always saves the clicker's own record, so nobody can verify
  on behalf of someone else, and members no longer get an authorization error
  for clicking the "wrong" button.
- **Startup.** Existing members are not messaged individually; registered
  members who lost the verified role have it restored automatically.

The button opens a private modal for **Tên tài khoản**, **Số điện thoại**, and
**Căn cước nhân dân**. A valid Vietnamese mobile-number format and a
structurally valid 12-digit CCCD are required. After submission, the bot upserts
the `users` record and assigns the configured role. If an old email verification
record exists for that Discord account, its email is copied into `users.email`.
Buttons from earlier direct messages keep working for their recipient.

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
| `VERIFICATION_CHANNEL_ID` | For user verification | Channel that holds the verification panel and new-member prompts. |
| `VERIFIED_ROLE_ID` | Recommended | Exact role to assign after successful verification. |
| `VERIFIED_ROLE_NAME` | No | Role name fallback; defaults to `member`. |
| `EXTRA_VERIFIED_ROLE_IDS` | No | Comma-separated role IDs (e.g. promoted ranks) that also count as verified. |
| `EXPORT_USERNAME` | For `/export-excel` | Login name for the member page and Excel export. Leave empty (with `EXPORT_PASSWORD`) to disable the endpoint. |
| `EXPORT_PASSWORD` | For `/export-excel` | Login password, at least 12 characters. |

## Member page and Excel export

`/export-excel` is the admin page (Vietnamese UI). It is a small React app in
[`web/`](web/) built with [shadcn/ui](https://ui.shadcn.com) components and
Tailwind CSS; `npm run build` compiles it into `dist/web`, which Nest serves.
Text uses SF Pro where the system provides it (macOS/iOS or a local install)
and the bundled Inter font elsewhere, because SF Pro may not be redistributed.

After logging in it shows every Discord member (bots excluded), newest first:

- status: **Đã xác thực** (verified role or an `EXTRA_VERIFIED_ROLE_IDS`
  rank), **Thiếu vai trò** (submitted the form but has no role; pressing the
  button gives it back), or **Chưa xác thực**;
- **Mới / Cũ** (joined within the last 24 hours, re-evaluated every second), roles, join time and the
  account name from the form;
- summary cards that double as filters, tabs, search (diacritics-insensitive),
  pagination, and a paginated activity log of joins and form submissions with
  each member's current status.

The page is **live**: it keeps a Server-Sent Events connection to
`GET /export-excel/api/events`. When someone joins, leaves, gets or loses a
role, or submits the verification form, the bot sends a `change` event and the
page reloads its data at once, highlights the affected rows and shows a toast.
The header shows **Trực tiếp** while connected. If a proxy buffers the stream
(no `ready` event within 8 seconds) the page falls back to reloading every 10
seconds and shows that instead.

Behind IIS + ARR, response buffering must be off for the stream to arrive in
real time (server-wide ARR setting):

```powershell
Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter 'system.webServer/proxy' -name 'responseBufferLimit' -value 0
```

The **Tải Excel** button downloads `GET /export-excel/download`
(`users-export.xlsx`): sheet `users` holds every verification record
(account name, phone, CCCD, Discord IDs, email) and sheet `thanh_vien` lists
the members as shown on the page. The page itself never shows phone numbers or
CCCDs.

### Login

- Set `EXPORT_USERNAME` and `EXPORT_PASSWORD` in `.env` and restart the app.
  When they are not set, every `/export-excel` route returns `404`.
- The login form posts to `POST /export-excel/api/login`; a correct login sets
  an `HttpOnly`, `Secure`, `SameSite=Strict` session cookie scoped to
  `/export-excel`, valid for 12 hours. Sessions are signed with a key that only
  lives in the running process, so a restart or deploy logs everyone out.
- The member data (`GET /export-excel/api/overview`) and the download require
  that session. Successful logins, failed attempts and downloads are logged
  with the client IP.
- After 10 failed logins within 15 minutes, that client IP is blocked (`429`)
  until the window expires.
- Only use it over HTTPS.

### Developing the page

Run the API (`npm run start:dev`) and, in a second terminal, `npm run dev:web`.
Vite serves the page at `http://localhost:5173/export-excel/` and proxies the
API to port 3000. UI components live in `web/src/components/ui` (shadcn/ui).

`.env` is ignored by Git. Keep both API credentials private. If the Discord token
is exposed, reset it in the Discord Developer Portal; if the Gemini key is
exposed, revoke it in Google AI Studio.
