---
issue: 5
stream: build-warehouse-module
started: 2026-05-12T07:20:00Z
status: completed
completed: 2026-05-12T07:45:00Z
commit: 8f275de
---
## Scope
Build modules/warehouse/: stock, movements, order.created → stock deduction.

## Summary

### Files Created
- `modules/warehouse/schema.sql` — stock, stock_movements tables
- `modules/warehouse/routes/stock.ts` — GET /stock, GET /stock/:productId
- `modules/warehouse/routes/movements.ts` — GET /movements
- `modules/warehouse/events/handlers.ts` — registerWarehouseHandlers(); atomic deduction in withTransaction; emits stock.insufficient + rollback on shortage; emits stock.low after deduction
- `modules/warehouse/events/handlers.test.ts` — 2 unit tests (sufficient stock, insufficient stock)
- `modules/warehouse/hooks/useStock.ts`, `useMovements.ts` — React fetch hooks
- `modules/warehouse/components/pages/StockPage.tsx` — shadcn/ui Table + Progress bar
- `modules/warehouse/components/pages/MovementsPage.tsx` — shadcn/ui Table with delta coloring
- `modules/warehouse/components/index.ts` — re-exports
- `modules/warehouse/index.ts` — WarehouseModule implementing Module interface

### Verification
- `pnpm exec tsc --noEmit` passes
- 2/2 handler tests pass (sufficient stock + insufficient stock scenarios)
