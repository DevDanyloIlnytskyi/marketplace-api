# Tenant registry — do not use `api/config/clients.json` as a live registry

**Canonical tenant registry (monorepo):** `{repository_root}/config/clients.json`

**Production:** `/opt/marketplace/config/clients.json` via `TENANT_REGISTRY_PATH` (absolute path, required when `NODE_ENV=production`).

Both API and BFF must load the **same** registry file. Set `TENANT_REGISTRY_PATH` explicitly in production and recommended in local development:

```env
# From api/.env or frontend/.env.local
TENANT_REGISTRY_PATH=../config/clients.json
TENANT_DEV_DOMAIN=avtoleg.local
```

## Deprecated

The file `api/config/clients.json` is **not** used as a default by Platform-3.6 registry loading. Do not maintain a separate live copy here.

Optional migration symlink (local only):

```bash
ln -sf ../../config/clients.json api/config/clients.json
```

## Examples

Copy `clients.example.json` to repo-root `config/clients.json` — not to this directory.
