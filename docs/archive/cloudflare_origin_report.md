# Cloudflare Origin Report — OPS-153

## Domain Configuration

| Domain | Proxy | DNS | SSL |
|--------|-------|-----|-----|
| `www.thannow.com` | Orange (proxied) | Cloudflare IPs | Full (strict) |
| `thannow.com` | Orange (proxied) | Cloudflare IPs | Full (strict) |
| `api.thannow.com` | Grey (DNS-only) | CNAME → `ghs.googlehosted.com` | N/A (bypasses CF) |

## API Domain (api.thannow.com)

**Important:** `api.thannow.com` is **DNS-only (grey cloud)** — it does NOT go through Cloudflare. It CNAMEs directly to the Cloud Run URL. This means:

- Cloudflare does NOT proxy API requests
- No Cloudflare timeout, keep-alive, or upstream disconnect applies to API traffic
- ERR_CONNECTION_CLOSED on API requests originates from the **Cloud Run origin**, not Cloudflare

## Observations

Since API traffic bypasses Cloudflare (grey cloud), ERR_CONNECTION_CLOSED on API requests cannot be caused by:
- Cloudflare proxy timeout
- Cloudflare upstream disconnect
- Cloudflare WAF/rate limiting
- Cloudflare SSL/TLS interception

The connection failure originates from the **Cloud Run container** terminating the connection mid-request.

## Frontend (www.thannow.com)

Frontend is served by Cloudflare Pages. The HTML references `index-DA-00HPy.js` — the correct latest bundle.

## Conclusion

Cloudflare is NOT the cause of ERR_CONNECTION_CLOSED. The root cause is within the Cloud Run application itself (worker watchdog restarts).
