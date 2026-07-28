# International Strategy — OPS-151

## Markets

### MARKET A — Pakistan

| Aspect | Detail |
|--------|--------|
| Currency | PKR |
| Payment | Bank Alfalah (JazzCash via Bank Alfalah integration) |
| Delivery | Pakistan Post (standard, registered, express) |
| Printing | Local Pakistan partners |
| Pricing | PKR pricing (see commerce.md) |
| Tax | Applicable local taxes |

### MARKET B — International

| Aspect | Detail |
|--------|--------|
| Currency | USD |
| Payment | Bank Alfalah USD (where supported) or documented alternative as required by merchant capabilities |
| Delivery | DHL, FedEx, UPS, digital delivery |
| Printing | International partners or digital-only |
| Pricing | USD pricing (converted from PKR base) |
| Tax | Applicable regional taxes |

## Currency Strategy

- Base pricing maintained in PKR
- USD prices derived from PKR base at current exchange rate
- Resolution tiers (USD equivalents):
  - Original: USD 0.99
  - 2HD: USD 1.50
  - 4HD: USD 2.50
  - 6HD: USD 3.50
  - 8HD: USD 4.50
  - 10HD: USD 5.50
  - 12HD: USD 6.50

## Payment Provider

**Single provider:** Bank Alfalah
- Supports PKR transactions domestically
- Supports USD transactions internationally (where merchant account allows)
- JazzCash collection handled through Bank Alfalah gateway (no separate integration)

If Bank Alfalah does not support USD in the merchant's account, a documented alternative may be used (e.g., Stripe, PayPal), but this must be explicitly documented before implementation.

## Delivery

### Pakistan
- Pakistan Post (standard, registered, express)
- Tracking number provided

### International
- DHL, FedEx, UPS
- Digital delivery (download links) for non-print orders
- Tracking number provided for physical shipments

## Printing
- Photo sizes: 4x6, 5x7, 8x10, A4, A3, Album
- Paper types: matte, gloss, premium
- Frames: none, standard, premium, wood
- Albums: standard, premium
- Local printing for Pakistan orders
- International partners or digital-only for international orders
