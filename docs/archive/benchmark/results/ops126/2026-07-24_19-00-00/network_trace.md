# OPS-126 — Network Trace

**Date:** 2026-07-24

## SPA Page Load

| Step | URL | Status | Size |
|------|-----|--------|------|
| HTML | https://www.thannow.com/ | 200 OK | 0.43 kB |
| JS | /assets/index-BR7fkVl4.js | 200 OK | 244.6 kB |
| CSS | /assets/index-Xv1uWqrF.css | 200 OK | 25.0 kB |
| SPA route | /restore/new | 200 OK (SPA) | — |
| SPA route | /restore | 200 OK (SPA) | — |

## API Calls

| Call | Method | URL | Status | Response |
|------|--------|-----|--------|----------|
| Packages | GET | /api/packages | 200 | `{"success":true,"data":[]}` |
| Auth me | GET | /api/auth/me | 401 without token | Expected |
| Health | GET | /api/health | 200 | API running |

## Failed Requests

| URL | Status | Issue |
|-----|--------|-------|
| None observed | — | All requests successful |

## JS Exceptions

| Exception | Location | Impact |
|-----------|----------|--------|
| None observed | — | — |

## Performance

| Metric | Value |
|--------|-------|
| Total page size | ~245 kB (gzip: ~73 kB) |
| JS parse time | ~200-400ms |
| Time to interactive | <2s |

## Critical Finding

The `GET /api/packages` returns empty `data` array. This causes the "Choose Your Package" step in the commerce UI to render without any package cards.
