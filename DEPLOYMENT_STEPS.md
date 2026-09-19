# Deployment Steps

## 1. GitHub
Upload these folders/files at the repository root:

- `public/index.html`
- `src/index.js`
- `migrations/0001_init.sql`
- `package.json`
- `wrangler.toml`
- `README.md`
- `DEPLOYMENT_STEPS.md`

Do not flatten the folders: `public` and `src` must remain folders.

## 2. Cloudflare
Import the GitHub repository under Workers & Pages. Keep deploy command:

`npx wrangler deploy`

There is no build command required.

## 3. D1
Create a D1 database named `ai-app-manager-db` and bind it to the Worker as `DB`.

Then execute `migrations/0001_init.sql` once.

## 4. Test
Open the Worker URL. Register a test account. Then use the + button to save a test message.
