---
issue: 4
stream: build-store-module
started: 2026-05-12T07:20:00Z
status: completed
completed: 2026-05-12T07:45:00Z
commit: 8f275de
---
## Scope
Build modules/store/: orders, products, QR payment, shadcn/ui pages.

## Summary

### Files Created
- `modules/store/schema.sql` — orders, order_items, products tables
- `modules/store/routes/orders.ts` — GET/POST /orders, GET /:id, PATCH /:id/status
- `modules/store/routes/products.ts` — GET/POST /products
- `modules/store/routes/payments.ts` — POST /:id/payment (KhanBankAdapter stub)
- `modules/store/events/publisher.ts` — publishOrderCreated helper
- `modules/store/events/publisher.test.ts` — 2 unit tests
- `modules/store/hooks/useOrders.ts`, `useProducts.ts` — React fetch hooks
- `modules/store/components/pages/OrdersPage.tsx` — shadcn/ui Table with status badges
- `modules/store/components/pages/NewOrderPage.tsx` — Select product, qty input, submit
- `modules/store/components/pages/PaymentPage.tsx` — QR dialog with payment polling
- `modules/store/components/index.ts` — re-exports
- `modules/store/index.ts` — StoreModule implementing Module interface

### Verification
- `pnpm exec tsc --noEmit` passes
- 2/2 publisher tests pass
