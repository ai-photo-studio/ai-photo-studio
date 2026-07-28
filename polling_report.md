# Polling Report — OPS-154

## Frontend Polling Inventory

### RestoreOrderPage.tsx

| Location | Mechanism | Interval | Cleanup | Issues |
|----------|-----------|----------|---------|--------|
| Line 80 | `useEffect` → `loadOrder()` | On mount | ✅ `abortRef.current.abort()` | |
| Lines 81-87 | `useEffect` → `setInterval(loadOrder, 7000)` | 7 seconds | ❌ **BEFORE FIX**: cleanup was missing `mountedRef` guard | |
| Line 64-69 | Stop condition | `items.every(i => COMPLETED || FAILED)` | ✅ | ✅ **FIXED**: was `.some(i => COMPLETED)` — now uses `.every()` |

### Issues Found and Fixed

1. **Stale closure on `selectedItem`**: The `loadOrder` callback references `selectedItem` but it was not in the dependency array. Fixed by adding `selectedItem` to `useCallback` deps.

2. **Race condition on unmount**: If the component unmounts during a fetch, `setState` would be called on an unmounted component. Fixed by adding `mountedRef` and checking it before state updates.

3. **AbortController leak**: Each `loadOrder` call created a new AbortController but the previous one was aborted. However, the cleanup in the second `useEffect` also aborted the controller, which could abort a concurrent in-flight fetch from the first effect. Fixed by using `mountedRef` and separating cleanup concerns.

4. **Stop condition**: Changed from `.some(i => COMPLETED)` to `.every(i => COMPLETED || FAILED)` — now correctly stops when ALL items have reached a terminal state.

## No Other Polling Found

Searched whole frontend codebase:
- No SWR
- No React Query / TanStack Query
- No `poll()` functions
- No `refresh()` intervals other than the one in RestoreOrderPage
- No service worker intercepting requests
- No websocket reconnection logic

## No Server-Side Polling Found

No server-side polling loops. All intervals are watchdogs and health checks at 30-60 second intervals.
