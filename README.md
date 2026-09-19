# AI App Manager — Cloudflare Workers + D1

This version is structured for Cloudflare Workers with static assets in `public/` and the Worker API in `src/index.js`.

## GitHub / Cloudflare deploy

1. Upload the **contents of this folder** to the root of your GitHub repository.
2. Cloudflare Workers & Pages → Create application → Import repository.
3. Use the repository's `wrangler.toml` and deploy command `npx wrangler deploy`.
4. Once the Worker deploys, create a D1 database named `ai-app-manager-db`.
5. Bind that database to the Worker using the binding name `DB`.
6. Run `migrations/0001_init.sql` against the D1 database.
7. Open the deployed Worker URL and register.

## Important

A normal web page cannot silently read private notifications from WhatsApp, Instagram, Telegram, etc. Those integrations require platform-supported APIs or a separate mobile/desktop bridge with the appropriate permissions.
