# Pricing Packages (MVP)

## Package Catalog
1. Starter
   - white background workflow
   - 10 credits included
   - monthly credit limit: 10
2. Pro
   - shadow enhancement workflow
   - 25 credits included
   - monthly credit limit: 25
3. Business
   - product studio workflow
   - 60 credits included
   - monthly credit limit: 60
4. Dealer
   - vehicle workflow
   - 100 credits included
   - monthly credit limit: 100

## Pricing Strategy (Draft)
- Prices stored in DB `Package` table in PKR.
- WhatsApp messaging shows customer-facing rounded PKR figures.
- Credit grants are stored as package metadata and later applied to wallets on payment approval.

## Delivery Entitlements
- Starter/Pro/Business: product workflows
- Dealer: vehicle workflows
- Final outputs are delivered through secure links and/or WhatsApp notifications once processing completes
