---
name: web-builder-phase-1
status: backlog
created: 2026-05-12T05:39:46Z
updated: 2026-05-12T05:47:59Z
progress: 0%
prd: .claude/prds/web-builder-phase-1.md
github: https://github.com/gansukhMID/minu-lovable/issues/1
---

# Epic: web-builder-phase-1

## Overview

Transform `minu-lovable` from a generic AI code editor into a focused Web Builder Platform with Store and Warehouse modules. This epic covers: removing Firecrawl, building shared infrastructure, building two business modules with event-driven stock deduction, converting the code-generation API into a module assembler, and adding module-selection onboarding to the HomePage.

## Architecture Decisions

- **Modules are co-located in repo root** (`modules/store/`, `modules/warehouse/`) for Phase 1 — container read-only mount isolation is a Phase 2 runtime concern
- **Event bus is in-process** (Node.js EventEmitter) for Phase 1; Redis pub/sub is wired in Phase 2
- **All frontend is shadcn/ui** (https://ui.shadcn.com/) — no custom components, no other libraries
- **QR payment adapters are stubs** — interfaces implemented with `throw new Error("not implemented")` + TODO comments for real bank API calls
- **Modules must only import from `shared/`** — never cross-import between modules

## Technical Approach

### Frontend Components
- `app/page.tsx` + `app/landing.tsx` → module-selection onboarding screen using shadcn/ui `Card`, `Button`, `Badge`
- `modules/store/components/pages/` — `OrdersPage`, `NewOrderPage`, `PaymentPage` (shadcn/ui only)
- `modules/warehouse/components/pages/` — `StockPage`, `MovementsPage` (shadcn/ui only)

### Backend Services
- `shared/event-bus/index.ts` — in-process EventEmitter with typed platform events
- `shared/db/index.ts` — PostgreSQL pool + `withTransaction(fn)` helper
- `shared/auth/index.ts` — JWT middleware for Hono + `requireRole(role)`
- `shared/middleware/qr-payment/index.ts` — `QRPaymentAdapter` interface + `KhanBankAdapter` + `GolomtAdapter`
- `modules/store/` — orders/products/payments API + `order.created` publisher
- `modules/warehouse/` — stock/movements API + `order.created` subscriber → `stock.deduct`
- `app/api/generate-ai-code-stream/` → rewritten as module assembler

### Infrastructure
- Remove: `firecrawl` package, `scrape-*` API routes, `FirecrawlLogo/Icon` components
- Add: `modules/`, `shared/` directories at repo root

## Implementation Strategy

**Phase 1 (parallel):** Firecrawl removal (001) + Shared infrastructure (002) + HomePage onboarding (006) can all start simultaneously — they touch non-overlapping files.

**Phase 2 (parallel, after 002):** Store module (003) + Warehouse module (004) — both depend on shared/ being in place, can be built in parallel.

**Phase 3 (sequential, after 003+004):** Module assembler (005) — needs both modules to exist to validate and assemble.

## Task Breakdown Preview

- [ ] 001.md - Remove Firecrawl (parallel: true)
- [ ] 002.md - Shared infrastructure: event-bus, db, auth, qr-payment adapter (parallel: true)
- [ ] 003.md - modules/store/: schema, API, events, shadcn/ui pages (parallel: true, depends: 002)
- [ ] 004.md - modules/warehouse/: schema, API, events, stock deduction handler (parallel: true, depends: 002)
- [ ] 005.md - Module assembler: rewrite generate-ai-code-stream (parallel: false, depends: 003, 004)
- [ ] 006.md - HomePage onboarding: module-selection screen (parallel: true)

## Dependencies

- shadcn/ui components (`data-table`, `form`, `input`, `select`, `badge`, `dialog`, `card`, `progress`, `alert`, `button`) must be present in `components/ui/`
- Task 002 (shared/) must complete before tasks 003 and 004 can start
- Tasks 003 and 004 must both complete before task 005 can start

## Success Criteria (Technical)

- `grep -r firecrawl .` returns zero results
- `tsc --noEmit` passes across all modules
- Unit test: `order.created` → `stock.deduct` called with correct qty per item
- Unit test: insufficient stock → no partial deduction, order stays pending
- E2E: HomePage module selection → `modules: ["store"]` passed to generation page
- `POST /api/generate-ai-code-stream` returns 400 for unknown module names

## Estimated Effort

| Task | Size | Hours |
|---|---|---|
| 001 Firecrawl removal | S | 2 |
| 002 Shared infrastructure | M | 6 |
| 003 Store module | L | 10 |
| 004 Warehouse module | M | 8 |
| 005 Module assembler | M | 5 |
| 006 HomePage onboarding | S | 3 |
| **Total** | | **34 hours** |

## Tasks Created
- [ ] 001.md - Remove Firecrawl (parallel: true)
- [ ] 002.md - Shared infrastructure (parallel: true)
- [ ] 003.md - modules/store/ (parallel: true)
- [ ] 004.md - modules/warehouse/ (parallel: true)
- [ ] 005.md - Module assembler (parallel: false)
- [ ] 006.md - HomePage onboarding (parallel: true)

Total tasks: 6
Parallel tasks: 5
Sequential tasks: 1
Estimated total effort: 34 hours
