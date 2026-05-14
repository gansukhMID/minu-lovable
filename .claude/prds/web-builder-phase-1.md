---
name: web-builder-phase-1
description: Store + Warehouse modules with shared infrastructure, event-driven stock deduction, and module-selection onboarding
status: backlog
created: 2026-05-12T05:21:39Z
---

# PRD: web-builder-phase-1

## Executive Summary

Transform the current `minu-lovable` (open-lovable fork) into a focused Web Builder Platform by: removing the Firecrawl dependency, building two production-ready business modules (Store and Warehouse), wiring them together through an event-driven stock deduction chain, and replacing the general code-generation API with a module assembler. A new onboarding screen lets users pick which modules to activate before the builder session starts.

This is Phase 1 — only Store and Warehouse. CRM, ERP, and sandbox infrastructure are out of scope.

---

## Problem Statement

The current repo is a generic AI code editor derived from open-lovable. It has no domain awareness: it generates arbitrary React/Next.js code, relies on Firecrawl for web scraping (irrelevant to the platform's purpose), and has no concept of pre-built business modules. Users who want a "Store" or "Warehouse" system get raw code generation with no business logic, no pre-wired middleware, and no event bus.

The platform needs to shift from "generate anything" to "assemble pre-built modules correctly."

---

## User Stories

### U1 — Builder operator sets up a Store instance
> As a builder operator, I want to select the Store module from the HomePage so that the agent session starts with pre-configured orders, products, and QR payment context — without writing any code myself.
>
> **Acceptance criteria:**
> - HomePage shows Store and Warehouse as selectable modules with clear descriptions
> - Selecting Store sets `config.modules = ["store"]` before the agent session starts
> - Agent chat context includes Store module's capabilities on first message
> - QR payment middleware (Khan Bank / Golomt) is available as a configurable option

### U2 — Builder operator sets up a Warehouse instance
> As a builder operator, I want to select the Warehouse module so that stock tracking and movement history are pre-built and ready to configure.
>
> **Acceptance criteria:**
> - Selecting Warehouse sets `config.modules = ["warehouse"]`
> - Stock levels and movement records are accessible via pre-built API routes
> - Low-stock alerts trigger `stock.low` events

### U3 — Combined Store + Warehouse deployment with automatic stock deduction
> As a business owner, I want placing an order to automatically deduct inventory so that I never oversell.
>
> **Acceptance criteria:**
> - When an order is created, `order.created` event is published with `{ items: [{productId, qty}], ... }`
> - Warehouse module listens to `order.created` and calls `stock.deduct(productId, qty)` for each item
> - If stock is insufficient, the event handler emits `stock.insufficient` and the order transitions to `payment_hold`
> - The entire chain completes within a single database transaction boundary (no partial deductions)
> - End-to-end test: create order → verify stock row decremented → verify order status

### U4 — Developer removes Firecrawl from the codebase
> As a platform developer, I want all Firecrawl references removed so that the repo has no unnecessary external dependencies and the build surface is smaller.
>
> **Acceptance criteria:**
> - `components/FirecrawlLogo.tsx`, `components/FirecrawlIcon.tsx`, `components/shared/firecrawl-icon/` deleted
> - `app/api/scrape-website/`, `app/api/scrape-url-enhanced/`, `app/api/scrape-screenshot/` deleted
> - `firecrawl` removed from `package.json` / `pnpm-lock.yaml`
> - No TypeScript errors introduced by removal
> - No remaining imports or references to `firecrawl` in the codebase

### U5 — generate-ai-code-stream becomes a module assembler
> As a platform developer, I want `app/api/generate-ai-code-stream/` to assemble pre-built modules rather than generate arbitrary code so that the output is deterministic and architecture-compliant.
>
> **Acceptance criteria:**
> - The route accepts `{ modules: string[], config: InstanceConfig }` instead of a freeform prompt
> - It reads from `/platform/modules/<name>/` (read-only mount), assembles `customer-web` structure, and streams assembly progress
> - Arbitrary code generation is disabled; unsupported module names return a 400 error
> - Existing callers in `app/generation/page.tsx` are updated to the new interface

---

## Functional Requirements

### FR1 — Firecrawl removal
- Delete all Firecrawl-related files: `FirecrawlLogo.tsx`, `FirecrawlIcon.tsx`, `firecrawl-icon/`, `scrape-website/` route, `scrape-url-enhanced/` route, `scrape-screenshot/` route
- Remove `firecrawl` package from dependencies
- Fix any broken imports caused by removal

### FR2 — `modules/store/` module
- **Schema**: `orders` table (id, status, customer_id, total, created_at), `order_items` table (order_id, product_id, qty, unit_price), `products` table (id, name, price, sku, active)
- **API routes**: `GET /store/orders`, `POST /store/orders`, `GET /store/orders/:id`, `PATCH /store/orders/:id/status`, `GET /store/products`, `POST /store/products`
- **Events published**: `order.created` (with items array), `payment.received`
- **Middleware**: `qr-payment` adapter (KhanBankAdapter and GolomtAdapter implementing `QRPaymentAdapter` interface from `shared/middleware/qr-payment/`)
- **Frontend pages** (shadcn/ui only): `OrdersPage`, `NewOrderPage`, `PaymentPage`
- **Module interface**: implements `Module` from PLATFORM.md §7

### FR3 — `modules/warehouse/` module
- **Schema**: `stock` table (product_id, qty, reserved_qty, low_threshold), `stock_movements` table (id, product_id, delta, reason, order_id, created_at)
- **API routes**: `GET /warehouse/stock`, `GET /warehouse/stock/:productId`, `GET /warehouse/movements`
- **Events published**: `stock.low` (when qty <= low_threshold after deduction), `stock.insufficient`
- **Events subscribed**: `order.created` → calls `stock.deduct` for each item in a single transaction
- **Frontend pages** (shadcn/ui only): `StockPage`, `MovementsPage`
- **Module interface**: implements `Module` from PLATFORM.md §7

### FR4 — `shared/` infrastructure
- **`shared/event-bus/`**: Redis pub/sub wrapper with TypeScript types for all platform events (`order.created`, `stock.low`, `stock.insufficient`, `payment.received`); `publish(event, payload)` and `subscribe(event, handler)` functions
- **`shared/db/`**: PostgreSQL client (connection pool), migration runner, transaction helper (`withTransaction(fn)`)
- **`shared/auth/`**: JWT middleware for Hono, role check helper (`requireRole(role)`)
- **`shared/middleware/qr-payment/`**: `QRPaymentAdapter` interface + `KhanBankAdapter` + `GolomtAdapter` stubs with TODO comments for real API calls

### FR5 — Module assembler (replaces generate-ai-code-stream)
- `POST /api/generate-ai-code-stream` accepts `{ modules: string[], instanceConfig: InstanceConfig }`
- Validates module names against allowed list (`["store", "warehouse"]` for Phase 1)
- Streams assembly steps: copy module files → generate navigation → run migrations preview → output completion event
- Returns 400 with `{ error: "unknown_module", name }` for unrecognized modules
- Updates `app/generation/page.tsx` to use new interface

### FR6 — HomePage onboarding
- Replace current `app/page.tsx` / `app/landing.tsx` hero section with a module-selection screen
- User sees Store and Warehouse as cards with name, description, and icon
- User can select one or both; selection is required before proceeding
- "Start Building" button is disabled until at least one module is selected
- Selected modules are passed to the builder session as initial config

---

## Non-Functional Requirements

- **Agent-generated web UI must use shadcn/ui** (https://ui.shadcn.com/): when the module assembler generates the customer-web frontend, every UI element must come from shadcn/ui. The agent must not write custom CSS components or use any other component library.
- **No new UI components**: all frontend uses shadcn/ui components already in `components/ui/`; new ones are added via `npx shadcn@latest add <component>`
- **TypeScript strict**: no `any` types introduced; all new code passes existing `eslint.config.mjs` rules
- **No sandbox changes**: `create-ai-sandbox`, `kill-sandbox`, and related routes are untouched
- **Backward compatibility**: existing `app/api/apply-ai-code` and `app/api/apply-ai-code-stream` routes unchanged
- **Event bus is in-process for Phase 1**: Redis pub/sub can be stubbed with an in-process emitter; real Redis wiring is Phase 2
- **Module isolation**: Store and Warehouse modules must not import from each other — only from `shared/`

---

## Success Criteria

| Metric | Target |
|---|---|
| Zero Firecrawl references | `grep -r firecrawl .` returns nothing |
| Store module builds | `tsc --noEmit` passes with modules/store/ present |
| Warehouse module builds | `tsc --noEmit` passes with modules/warehouse/ present |
| Event chain test | Unit test: `order.created` → `stock.deduct` called with correct qty |
| Transaction safety | Test: insufficient stock → order stays pending, no stock row modified |
| HomePage onboarding | E2E: selecting Store → generation page receives `modules: ["store"]` |
| Module assembler | 400 returned for unknown module name; valid request streams assembly steps |
| No regressions | Existing generation flow (`apply-ai-code-stream`) still works end-to-end |

---

## Constraints & Assumptions

- **Tech stack is fixed**: Node.js + Hono backend, React + Vite frontend, PostgreSQL, Redis (can be in-process stub for Phase 1), shadcn/ui
- **This repo IS the platform builder** (`minu-lovable` = `apps/builder/` from PLATFORM.md) — modules live at `modules/` in the same repo root for now
- **QR payment adapters are stubs**: real bank API credentials are not available in Phase 1; interfaces are implemented with `throw new Error("not implemented")` and TODO comments
- **No tenant isolation needed**: per PLATFORM.md §1, each deployment is a separate instance
- **Agent container read-only mount is not enforced in Phase 1**: modules are co-located in the repo; the isolation is a runtime concern for Phase 2 deployment

---

## Out of Scope

- CRM module (`modules/crm/`)
- ERP module (`modules/erp/`)
- Sandbox infrastructure changes (`create-ai-sandbox`, `kill-sandbox`, container Dockerfile)
- Real Redis deployment (in-process event emitter is acceptable for Phase 1)
- Real QR payment bank API integration (stubs only)
- Deploy manager (`apps/builder/deploy-manager/`)
- Preview tool sandbox isolation
- `extract-brand-styles`, or any other existing API routes not listed above

---

## Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `shared/event-bus/` | Internal | Must exist before Store and Warehouse modules can publish/subscribe |
| `shared/db/` | Internal | Must exist before any module schema migration can run |
| `shared/auth/` | Internal | Required by both Store and Warehouse API routes |
| `shared/middleware/qr-payment/` | Internal | Required by Store module's PaymentPage and payment route |
| Firecrawl removal (FR1) | Prerequisite | Clean the codebase before adding new structure |
| shadcn/ui components | Existing | `data-table`, `form`, `input`, `select`, `badge`, `dialog`, `card`, `progress`, `alert` must be present in `components/ui/` |
