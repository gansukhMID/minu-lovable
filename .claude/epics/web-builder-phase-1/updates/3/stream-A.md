---
issue: 3
stream: build-shared-infrastructure
started: 2026-05-12T06:25:00Z
status: completed
completed: 2026-05-12T07:12:00Z
commit: 05d191a
---
## Scope
Build shared/ infrastructure: event-bus, db, auth, qr-payment adapter.

## Summary

### Files Created
- `shared/event-bus/types.ts` — PlatformEvent union type + 4 payload interfaces (OrderCreated, StockLow, StockInsufficient, PaymentReceived)
- `shared/event-bus/index.ts` — publish/subscribe over Node.js EventEmitter, typed generics
- `shared/event-bus/index.test.ts` — 4 unit tests (vitest): publish→handler, multi-subscriber, unsubscribe, unknown event no-op
- `shared/db/index.ts` — pg Pool, query<T>(), withTransaction() with BEGIN/COMMIT/ROLLBACK
- `shared/auth/index.ts` — Hono JWT middleware (HS256) + requireRole() helper
- `shared/middleware/qr-payment/index.ts` — QRPaymentAdapter interface, PaymentIntent/PaymentStatus types
- `shared/middleware/qr-payment/khan-bank.ts` — KhanBankAdapter stub
- `shared/middleware/qr-payment/golomt.ts` — GolomtAdapter stub

### Dependencies Added
- `pg`, `hono` (runtime)
- `@types/pg`, `vitest` (dev)

### Verification
- `pnpm exec tsc --noEmit` passes with zero errors
- `pnpm exec vitest run shared/event-bus/index.test.ts` — 4/4 tests pass
