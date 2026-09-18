# Exact next steps

### GitHub
Upload the *contents* of this folder into your `AI-App-Manager` repository (not the ZIP file itself).

### Cloudflare
1. Workers & Pages → Create application → Import a repository.
2. Choose GitHub → `AI-App-Manager`.
3. Keep the Wrangler configuration from the repo; deploy.
4. Open the new Worker → Settings/Bindings → add D1 database binding named `DB`.
5. Create/select database `ai-app-manager-db`.
6. Open D1's console and run all SQL from `migrations/0001_init.sql`.
7. Visit the `workers.dev` URL and register a test account.

Cloudflare's current Git integration automatically builds/deploys on Git pushes, and a Worker can serve static assets and API logic together. D1 is attached through a binding exposed as `env.DB`.
