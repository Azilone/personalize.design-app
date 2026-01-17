---
name: printify-api
description: Expert-level knowledge of Printify API v1 for product creation, order fulfillment, webhook management, and print-on-demand integration
---

## What I do

I provide senior developer expertise for the Printify API, including:

- **Authentication**: Personal Access Token and OAuth 2.0 implementation with proper token lifecycle management
- **Product Management**: Create, update, publish, and delete products using blueprints from the catalog
- **Order Fulfillment**: Submit standard and Printify Express orders, calculate shipping, track order status
- **File Management**: Upload and manage artwork images via URL or base64 encoding
- **Webhook Integration**: Configure, manage, and handle webhook events for real-time updates
- **Catalog Exploration**: Browse blueprints, select print providers, query variants and shipping info
- **Rate Limit Handling**: Respect global (600/min), catalog-specific (100/min), and product publishing limits (200/30min)
- **Best Practices**: Proper pagination, error handling, CORS workarounds, and security considerations

## When to use me

Use this skill when you need to:

- Integrate Printify's print-on-demand platform into an e-commerce application
- Implement automated product creation and publishing workflows
- Build order fulfillment systems that connect to Printify
- Set up webhook handlers for order status and shipment tracking
- Upload artwork files and map them to product print areas
- Manage multi-merchant integrations using OAuth 2.0
- Handle rate limiting and pagination for large-scale operations
- Debug Printify API integration issues
- Understand the difference between blueprints (templates) and products (with artwork)

## Key Concepts

### Authentication

**Personal Access Token** (single account):

- Generate in Printify dashboard (My Profile > Connections)
- Valid for 1 year, token only visible once - store securely
- Header: `Authorization: Bearer {token}`
- Must include `User-Agent` header
- Set access scopes when creating

**OAuth 2.0** (platform/multi-merchant):

- Requires app registration (approval takes up to 1 week)
- Access tokens expire after 6 hours - use refresh tokens for offline access
- Allow up to 3,000 characters for token size
- Accept/decline URLs must be HTTPS in production (localhost HTTP okay for dev)
- IP addresses not supported - must use domain names

### API Base

- **Base URL**: `https://api.printify.com/v1/`
- **Content-Type**: `application/json;charset=utf-8`
- **Encoding**: UTF-8
- **HTTPS only** (insecure HTTP not supported)
- **CORS not supported** - must proxy server-side

### Rate Limits

- **Global**: 600 requests/minute per account (NOT per token)
- **Catalog endpoints**: 100 requests/minute (additional to global limit)
- **Product publishing**: 200 requests per 30 minutes
- **Error rate**: Must not exceed 5% of total requests
- All limits return **429 Too Many Requests** when exceeded

### Shop ID Workflow

1. List shops: `GET /v1/shops.json`
2. Select shop and note `{shop_id}`
3. Use shop ID in all product/order operations: `GET /v1/shops/{shop_id}/products.json`

### Product Creation Workflow

1. Browse catalog: `GET /v1/catalog/blueprints.json`
2. Choose print provider: `GET /v1/catalog/blueprints/{blueprint_id}/print_providers.json`
3. Get variants: `GET /v1/catalog/blueprints/{blueprint_id}/print_providers/{print_provider_id}/variants.json`
4. Upload images: `POST /v1/uploads/images.json` (URL or base64)
5. Create product: `POST /v1/shops/{shop_id}/products.json` (map images to placeholders)
6. Publish product: `POST /v1/shops/{shop_id}/products/{product_id}/publish.json`

### Order Submission Workflow

1. Calculate shipping (optional): `POST /v1/shops/{shop_id}/orders/shipping.json`
2. Submit order: `POST /v1/shops/{shop_id}/orders.json` (standard) or `/orders/express.json` (rush)
3. Monitor webhooks for status updates

### Webhook Events

- `shop:disconnected`
- `product:deleted`, `product:publish:started`
- `order:created`, `order:updated`
- `order:shipment:created`, `order:shipment:delivered`
- `order:sent-to-production`

### Critical Gotchas

- **Token visibility**: Personal access tokens only visible once - if lost, must regenerate
- **OAuth approval**: Can take up to 1 week
- **CORS**: Must proxy requests server-side - no frontend direct access
- **Catalog variants**: Default excludes out-of-stock - use `show-out-of-stock=1` to see all
- **Blueprint vs Product**: Blueprints are templates, products have artwork
- **IP addresses**: Not supported for OAuth URLs - must use domain names
- **Error rate**: Keep under 5% of total requests or risk throttling

### Best Practices

- Store refresh tokens securely for OAuth offline access
- Implement proper pagination using `next_page_url`, `prev_page_url`
- Handle 429 responses with exponential backoff
- Cache shop IDs (required for all operations)
- Always calculate shipping before order submission
- Implement idempotent webhook handlers (Printify may retry)
- Always include `User-Agent` header
- All date/time values are UTC

## Access Scopes

- `shops.read`, `catalog.read`, `products.read`, `products.write`
- `orders.read`, `orders.write`, `webhooks.read`, `webhooks.write`
- `uploads.read`, `uploads.write`, `print_providers.read`
