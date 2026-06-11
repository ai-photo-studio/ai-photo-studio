# Environment Checklist

## Railway Production API
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `PAYMENT_GATEWAY_NAME`
- `PAYMENT_GATEWAY_BASE_URL`
- `PAYMENT_GATEWAY_SECRET`
- `ALLOWED_ORIGINS`
- `STORAGE_PROVIDER=r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`

## AI Provider
- `AI_PROVIDER`
- `PHOTOROOM_API_KEY` when `AI_PROVIDER=photoroom`
- `FAL_API_KEY` when `AI_PROVIDER=fal`

## WhatsApp Delivery
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `DELIVERY_MODE=LOG_ONLY|WHATSAPP`

## Cloudflare Pages Frontend
- `VITE_API_BASE_URL`
- Cloudflare Pages origin added to `ALLOWED_ORIGINS`
- `apps/web/public/_redirects` present for SPA routing
- `apps/web/wrangler.toml` present for Pages deployment metadata
