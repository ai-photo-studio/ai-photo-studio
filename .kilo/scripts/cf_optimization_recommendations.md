=== TASK 8: Cloudflare Optimization Recommendations ===

## Safe Improvements (no breaking changes)

### 1. Enable Brotli Compression (Cloudflare Dashboard)
- **Current:** No Brotli, likely gzip
- **Impact:** JS bundle 238KB → ~70KB with Brotli
- **Action:** Dashboard → Speed → Optimization → Brotli → ON
- **Risk:** None. Brotli accepted by all modern browsers.

### 2. Enable HTTP/3 (Cloudflare Dashboard)
- **Current:** HTTP/1.1
- **Impact:** Faster TLS handshake, 0-RTT for repeat visitors
- **Action:** Dashboard → Network → HTTP/3 → ON
- **Risk:** None. Falls back to HTTP/1.1 automatically.

### 3. Add Cache-Control headers for static assets in wrangler.toml
- **Current:** `Cache-Control: public, max-age=0, must-revalidate` on everything
- **Suggestion:** Set far-future `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` files
- **Action:** Update Cloudflare Pages config to add cache headers for hashed assets
- **Risk:** Low. Files have content hashes in filenames (index-D9yjvcvL.js)

### 4. Enable Early Hints
- **Current:** Disabled
- **Impact:** Browser can start loading JS/CSS before HTML finishes
- **Action:** Dashboard → Speed → Optimization → Early Hints → ON
- **Risk:** None

### 5. Add HSTS Header (Strict-Transport-Security)
- **Current:** Missing (noted in TASK 2)
- **Action:** Dashboard → Edge Certificates → HTTP Strict Transport Security (HSTS) → ON (max-age=6 months)
- **Risk:** Low. Only affects HTTPS, which is already enforced.

## DO NOT Change (API)

### API Caching
- **Current:** api.thannow.com is DNS-only (grey cloud)
- **Action:** Keep as-is. API should NOT be proxied by Cloudflare.
- **Risk:** Proxying API through Cloudflare would break CORS, auth, and WebSocket connections.

## Summary
| Optimization | Effort | Impact | Risk |
|---|---|---|---|
| Brotli | 1 click | 📦 JS: ~70% smaller | None |
| HTTP/3 | 1 click | 🌐 Faster TLS | None |
| Asset caching | Config update | 📄 Cache hit rate | Low |
| Early Hints | 1 click | 🚀 Faster LCP | None |
| HSTS | 1 click | 🔒 Security | Low |
