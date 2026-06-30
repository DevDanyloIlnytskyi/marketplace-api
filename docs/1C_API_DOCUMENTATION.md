# Marketplace API для 1С

Integration API v1 · `/api/integration/v1`

---

## Connection

**Base URL**

```
https://<api-domain>/api/integration/v1
```

**Headers**

| Header | Required | Value |
|--------|----------|-------|
| `X-API-Key` | yes (except `/health`) | `<API_KEY>` |
| `X-Marketplace-Tenant` | yes* | `avtoleg` |
| `Content-Type` | on write | `application/json` or `multipart/form-data` |

\*Alternatively `Host: <api-domain>`.

**Response envelope**

```json
{ "success": true, "requestId": "...", "data": { } }
```

```json
{ "success": false, "code": "...", "message": "...", "requestId": "..." }
```

---

## Connection check

### GET /health

Scope: none · `X-API-Key` not required

**Headers**

```
X-Marketplace-Tenant: avtoleg
```

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "status": "ok",
    "version": "v1",
    "tenantId": "avtoleg",
    "timestamp": "2026-06-15T12:00:00.000Z"
  }
}
```

---

### GET /whoami

Scope: any valid key

**Headers**

```
X-API-Key: <API_KEY>
X-Marketplace-Tenant: avtoleg
```

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "tenantId": "avtoleg",
    "keyId": "iak_...",
    "keyPrefix": "mpk_avtoleg_...",
    "label": "1C sync",
    "scopes": ["catalog.write", "prices.write", "stock.write", "media.write", "orders.read"],
    "expiresAt": null
  }
}
```

---

## Products

### GET /products

Scope: `catalog.read`

**Headers**

```
X-API-Key: <API_KEY>
X-Marketplace-Tenant: avtoleg
```

**Query:** `category_id_bas`, `cursor`, `limit`

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "items": [
      {
        "id_bas": "550e8400-e29b-41d4-a716-446655440010",
        "name": "Колодки гальмівні передні",
        "category_id_bas": "550e8400-e29b-41d4-a716-446655440001",
        "description": "...",
        "actual": true,
        "manufacturer": "Bosch",
        "main_photo_url": "/images/avtoleg/products/....jpg"
      }
    ],
    "pagination": { "next_cursor": null, "has_more": false, "limit": 50 }
  }
}
```

---

### GET /products/{idBas}

Scope: `catalog.read`

**Response 200** — один товар у `data` (поля як у `items[]`).

---

### PUT /products/{idBas}

Scope: `catalog.write`  
`idBas` — тільки з URL.

#### JSON

**Headers**

```
X-API-Key: <API_KEY>
X-Marketplace-Tenant: avtoleg
Content-Type: application/json
```

**Body**

```json
{
  "name": "Колодки гальмівні передні",
  "description": "Комплект передніх гальмівних колодок",
  "categoryIdBas": "550e8400-e29b-41d4-a716-446655440001",
  "manufacturer": "Bosch",
  "actual": true,
  "mainPhoto": "products/image.webp"
}
```

| Field | Required |
|-------|----------|
| `name` | yes |
| `categoryIdBas` | yes |
| `description`, `manufacturer`, `actual`, `mainPhoto` | no |

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": { "idBas": "550e8400-e29b-41d4-a716-446655440010", "created": true }
}
```

#### multipart/form-data

**Headers**

```
X-API-Key: <API_KEY>
X-Marketplace-Tenant: avtoleg
Content-Type: multipart/form-data
```

**Form fields**

| Field | Required |
|-------|----------|
| `name` | yes |
| `categoryIdBas` | yes |
| `description`, `manufacturer`, `actual` | no |
| `main_photo` | no (file) |

**Response 200** — той самий формат, що JSON.

---

## Product media

### PUT /products/{productIdBas}/media

Scope: `media.write`  
Повна заміна поточного набору фото. Перше фото — головне, решта — галерея.

#### JSON paths

**Headers**

```
X-API-Key: <API_KEY>
X-Marketplace-Tenant: avtoleg
Content-Type: application/json
```

**Body**

```json
{
  "photos": ["products/a.webp", "products/b.webp", "products/c.webp"]
}
```

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "productIdBas": "550e8400-e29b-41d4-a716-446655440010",
    "photos": ["products/a.webp", "products/b.webp", "products/c.webp"],
    "mainPhoto": "products/a.webp",
    "galleryCount": 2
  }
}
```

#### multipart files

**Form fields:** `photos[]` або `photos` — файли в потрібному порядку (max 50).

**Response 200** — той самий формат; paths генерує сервер.

---

## Prices

### GET /prices/{productIdBas}

Scope: `prices.read`

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "product_id_bas": "550e8400-e29b-41d4-a716-446655440010",
    "price": 1500,
    "action_price": 1200
  }
}
```

---

### PUT /prices/{productIdBas}

Scope: `prices.write`  
Ціна — ціле число UAH (`1500` = 1500 грн).

**Headers**

```
X-API-Key: <API_KEY>
X-Marketplace-Tenant: avtoleg
Content-Type: application/json
```

**Body**

```json
{ "price": 1500, "actionPrice": 1200 }
```

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "productIdBas": "550e8400-e29b-41d4-a716-446655440010",
    "price": 1500,
    "created": false
  }
}
```

---

## Stock

### GET /stock/{productIdBas}

Scope: `stock.read`

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "product_id_bas": "550e8400-e29b-41d4-a716-446655440010",
    "quantity": 25
  }
}
```

---

### PUT /stock/{productIdBas}

Scope: `stock.write`

**Body**

```json
{ "quantity": 15 }
```

`quantity = 0` — немає на складі, товар лишається на сайті.

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "productIdBas": "550e8400-e29b-41d4-a716-446655440010",
    "quantity": 15,
    "created": false
  }
}
```

---

## Categories and catalog

### GET /categories

Scope: `catalog.read` · Query: `parent_id_bas`, `cursor`, `limit`

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "items": [
      { "id_bas": "550e8400-e29b-41d4-a716-446655440001", "name": "Запчастини", "parent_id_bas": null }
    ],
    "pagination": { "next_cursor": null, "has_more": false, "limit": 100 }
  }
}
```

---

### GET /categories/{idBas}

Scope: `catalog.read` · **Response 200** — одна категорія в `data`.

---

### GET /catalog

Scope: `catalog.read` · товар + ціна + залишок

**Query:** `id_bas`, `category_id_bas`, `search`, `cursor`, `limit`

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "items": [
      {
        "id_bas": "550e8400-e29b-41d4-a716-446655440010",
        "name": "Колодки гальмівні передні",
        "price": 1500,
        "action_price": 1200,
        "quantity": 25,
        "category_id_bas": "550e8400-e29b-41d4-a716-446655440001",
        "main_photo_url": "/images/avtoleg/products/....jpg"
      }
    ],
    "pagination": { "next_cursor": null, "has_more": false, "limit": 50 }
  }
}
```

---

## Orders

Marketplace не відправляє замовлення в 1С. 1С періодично опитує `GET /orders`.

### GET /orders

Scope: `orders.read`

**Query:** `active`, `since` (ISO 8601), `cursor`, `limit`

**Response 200**

```json
{
  "success": true,
  "requestId": "...",
  "data": {
    "items": [
      {
        "id": 1,
        "client_first_name": "Іван",
        "client_second_name": "Петренко",
        "phone": "+380501234567",
        "email": "ivan@example.com",
        "total_price": "1500.00",
        "active": false,
        "date_created": "2026-06-09T10:30:00.000Z",
        "products": [
          { "id_bas": "550e8400-e29b-41d4-a716-446655440010", "name": "Колодки гальмівні передні", "quantity": 2 }
        ]
      }
    ],
    "pagination": { "next_cursor": "eyJpZCI6Mn0=", "has_more": true, "limit": 50 }
  }
}
```

---

### GET /orders/{id}

Scope: `orders.read` · `id` — integer

**Response 200** — одне замовлення в `data`.

---

## Errors

| HTTP | Code | When |
|------|------|------|
| 401 | `MISSING_API_KEY` | немає `X-API-Key` |
| 401 | `INVALID_API_KEY` | невалідний ключ |
| 403 | `TENANT_MISMATCH` | ключ не для цього tenant |
| 403 | `INSUFFICIENT_SCOPE` | немає scope |
| 400 | `VALIDATION_ERROR` | невалідне тіло |
| 400 | `INVALID_PRODUCT_NAME` | порожня/невалідна назва товару |
| 400 | `INVALID_PRICE` | невалідна ціна |
| 400 | `INVALID_QUANTITY` | невалідна кількість |
| 400 | `INVALID_PHOTO_PATH` | невалідний path фото |
| 400 | `DUPLICATE_PHOTO` | дублікат path у `photos` |
| 404 | `PRODUCT_NOT_FOUND` | товар не знайдено |
| 404 | `CATEGORY_NOT_FOUND` | категорія не знайдена |
| 404 | `NOT_FOUND` | price/stock/order row не знайдено |

---

## curl

```bash
# whoami
curl -s -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  "https://<api-domain>/api/integration/v1/whoami"

# product JSON
curl -s -X PUT -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Колодки гальмівні","categoryIdBas":"550e8400-e29b-41d4-a716-446655440001"}' \
  "https://<api-domain>/api/integration/v1/products/550e8400-e29b-41d4-a716-446655440010"

# product multipart
curl -s -X PUT -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  -F "name=Колодки гальмівні" \
  -F "categoryIdBas=550e8400-e29b-41d4-a716-446655440001" \
  -F "main_photo=@./photo.webp" \
  "https://<api-domain>/api/integration/v1/products/550e8400-e29b-41d4-a716-446655440010"

# media multipart
curl -s -X PUT -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  -F "photos[]=@./a.webp" -F "photos[]=@./b.webp" \
  "https://<api-domain>/api/integration/v1/products/550e8400-e29b-41d4-a716-446655440010/media"

# price
curl -s -X PUT -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" -d '{"price":1500}' \
  "https://<api-domain>/api/integration/v1/prices/550e8400-e29b-41d4-a716-446655440010"

# stock
curl -s -X PUT -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" -d '{"quantity":15}' \
  "https://<api-domain>/api/integration/v1/stock/550e8400-e29b-41d4-a716-446655440010"

# orders
curl -s -H "X-Marketplace-Tenant: avtoleg" -H "X-API-Key: <API_KEY>" \
  "https://<api-domain>/api/integration/v1/orders?since=2026-06-01T00:00:00.000Z&limit=50"
```
