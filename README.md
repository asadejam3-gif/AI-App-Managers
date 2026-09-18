# AI App Manager — Cloudflare Ready

This is a Cloudflare Workers + Static Assets + D1 version of the supplied AI App Manager prototype.

## Deploy from GitHub (recommended)

1. Push the contents of this folder to your GitHub repository `AI-App-Manager`.
2. In Cloudflare Workers & Pages choose **Create application → Import a repository** and select the repo.
3. The repo already contains `wrangler.toml`, so Workers Builds can deploy it as a Worker with static assets.
4. After the Worker is created, create a D1 database named `ai-app-manager-db`.
5. In the Worker dashboard, open **Bindings → Add → D1 database**, set the variable name to **DB**, and select `ai-app-manager-db`.
6. Run `migrations/0001_init.sql` against that D1 database. You can do this from the D1 console, or with Wrangler:
   `npx wrangler d1 execute ai-app-manager-db --remote --file=migrations/0001_init.sql`
7. Redeploy the Worker if Cloudflare asks you to.

## What is included

- Static frontend served by the Worker
- Server-side API under `/api/*`
- Persistent D1 database schema
- Register/login sessions
- Messages, search, connected apps, OTP vault, rules, activity endpoints
- Local/rule-based message analysis endpoint (no AI key required)
- Manual message save screen

## Important limitation

A normal website cannot silently read private WhatsApp/Instagram/Telegram notifications from the device. Those require a supported import/integration or a separate notification bridge. This project provides the searchable vault/backend foundation for those integrations.

## Security note

Passwords are hashed before storage. For a production public launch, add stronger account recovery, rate limiting, CSRF protections where applicable, and a proper notification ingestion/authentication flow.
