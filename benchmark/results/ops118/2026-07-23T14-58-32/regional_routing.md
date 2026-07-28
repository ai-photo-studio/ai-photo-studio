# Regional Storefront Routing

**Date:** 2026-07-23T14:59:23.395Z

## Detection Priority

1. **Cloudflare Country Header** (`cf-ipcountry`) — PK → PKR, Others → USD
2. **Accept-Language** (browser locale) — ur/pk prefix → PKR
3. **Timezone** (`x-timezone`) — Asia/Karachi → PKR
4. **Manual Override** (`x-region`) — explicity PKR/USD
5. **Default** — USD (international)

Manual override (`x-region` header) takes priority over automatic detection.

## Test Results

| Test Case | Headers | Expected | Detected | Result |
|---|---|---|---|---|
| Cloudflare PK header | {"cf-ipcountry":"PK"} | PKR | PKR | PASS |
| Cloudflare US header | {"cf-ipcountry":"US"} | USD | USD | PASS |
| Locale PK (ur) | {"accept-language":"ur-PK,en;q=0.9"} | PKR | PKR | PASS |
| Timezone Karachi | {"x-timezone":"Asia/Karachi"} | PKR | PKR | PASS |
| Manual override PKR | {"x-region":"PKR"} | PKR | PKR | PASS |
| Manual override USD | {"x-region":"USD"} | USD | USD | PASS |
| No headers (default) | {} | USD | USD | PASS |

## Pricing Configuration

### Pakistan (PKR)

| Download Package | Price |
|---|---|
| Original Resolution | ₨250 |
| 2X | ₨350 |
| 4X | ₨500 |

### International (USD)

| Download Package | Price |
|---|---|
| Original Resolution | $1.5 |
| 2X | $2.5 |
| 4X | $3.5 |

## Print Pricing

| Size | PKR (from) | USD (from) |
|---|---|---|
| 4x6 | ₨800 | $5 |
| 5x7 | ₨1200 | $8 |
| 8x10 | ₨1800 | $12 |
| A4 | ₨2000 | $15 |
| A3 | ₨3500 | $25 |