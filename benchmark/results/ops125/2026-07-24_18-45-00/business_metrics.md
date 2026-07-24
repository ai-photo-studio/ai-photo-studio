# OPS-125 — Business Metrics

**Date:** 2026-07-24

## Daily Business Metrics

The `BusinessAnalyticsService` computes the following KPIs from the database:

### Computation Details

| Metric | SQL Backend | Formula |
|--------|-----------|---------|
| Daily Uploads | `OrderImage.count(kind=ORIGINAL, today)` | Count of originals uploaded today |
| Daily Paid Orders | `Payment.count(status=PAID, today)` | Payments settled today |
| Conversion Rate | `daily.uploads > 0` | `(daily.paidOrders / daily.restoreItems) * 100` |
| Avg Order Value | `daily.paidOrders > 0` | `daily.revenuePKR / daily.paidOrders` |
| Revenue PKR | `sum(payment.amount, currency=PKR, today)` | Total PKR revenue today |
| Revenue USD | `sum(payment.amount, currency!=PKR, today)` | Total USD revenue today |
| Replicate Cost | `sum(ProviderCostLog, provider~replicate, today)` | Provider cost today |
| Gross Margin | `daily.revenuePKR > 0` | `((revenue - cost) / revenue) * 100` |
| Print Orders | `OrderItem.count(itemType=print, today)` | Print orders placed today |
| Repeat Customers | `CustomerId.count(paidOrders > 1)` | Customers with multiple paid orders |

### Lifetime Totals

| Metric | Computation |
|--------|------------|
| Total Orders | All orders |
| Total Paid Orders | Orders with paymentStatus=PAID |
| Total Revenue PKR | Sum of all payment.amount where currency=PKR |
| Total Revenue USD | Sum of all payment.amount where currency!=PKR |
| Total Replicate Cost | Sum of all ProviderCostLog where provider=flux-restore |
| Total Customers | Count of all users |

## Access

Business metrics are available at:
- `GET /api/admin/business-metrics?hours=24` (requires Admin auth, SUPER_ADMIN role)
- Visible in the admin dashboard at `/admin/dashboard`