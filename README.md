# Marketplace API

Express multi-tenant API for the Marketplace platform.

## First-time setup (after clone)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment template:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your local database credentials and `jwtkey` (minimum 16 characters). **Never commit `.env`.**

3. Copy tenant and API key config from examples:

   ```bash
   cp config/clients.example.json config/clients.json
   cp config/api-keys.example.json config/api-keys.json
   ```

   Edit both files for your tenants. **Never commit live `clients.json` or `api-keys.json`.**

4. Create storage directory (or set `MARKETPLACE_STORAGE_ROOT` in `.env`):

   ```bash
   mkdir -p storage
   ```

   **Production:** `MARKETPLACE_STORAGE_ROOT` is **required** (e.g. `/opt/marketplace/storage`). The API will not start without it when `NODE_ENV=production`.

5. Start the server:

   ```bash
   npm run server
   ```

   Default port: `5000` (override with `port` in `.env`).

## PostgreSQL POC (optional)

```bash
cp .env.postgres.staging.example .env.postgres.staging
npm run pg-poc:server
```

## New tenant

```bash
npm run create-client -- --name "Client Name" --domain shop.example.com --database client_db
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run server` | Dev server (nodemon) |
| `npm run create-client` | Add tenant to registry + storage dirs |
| `npm run pg-poc:*` | PostgreSQL POC utilities |
