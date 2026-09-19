# AI App Manager

Cloudflare Workers + D1 based AI App Manager.

## Project Structure

AI-App-Managers/
├── migrations/
│   └── 0001_init.sql
├── public/
│   └── index.html
├── src/
│   └── index.js
├── DEPLOYMENT_STEPS.md
├── README.md
├── package.json
└── wrangler.toml

## Cloudflare Deployment

This project runs on Cloudflare Workers.

- Worker entry point: src/index.js
- Static files: public/
- Database: Cloudflare D1
- Production branch: main
- Root directory: /

## Deploy Command

npx wrangler deploy

## D1 Database

After the Worker deploys successfully:

1. Create a Cloudflare D1 database named ai-app-manager-db.
2. Bind the database to the Worker using the binding name DB.
3. Apply the migration:

migrations/0001_init.sql

## Important

The web application cannot directly read private notifications from apps such as WhatsApp, Instagram, or Telegram without the required platform APIs or a suitable mobile/desktop bridge.

## Status

AI App Manager is configured for deployment using Cloudflare Workers, static assets, and D1.
