---
issue: 7
stream: build-homepage-onboarding
started: 2026-05-12T06:25:00Z
status: completed
completed: 2026-05-12T07:12:00Z
commit: 05d191a
---
## Scope
Replace app/page.tsx with module-selection onboarding screen using shadcn/ui.

## Summary

### Files Changed
- `app/page.tsx` — replaced 891-line landing page with module-selection onboarding:
  - Two shadcn/ui Cards (Store, Warehouse) with toggle selection
  - Ring highlight on selected cards (`ring-2 ring-primary`)
  - "Start Building" Button (disabled when nothing selected)
  - Navigates to `/generation?modules=store,warehouse` on submit
  - Responsive: `grid-cols-1 sm:grid-cols-2`
  - Uses existing `components/ui/shadcn/card.tsx` and `components/ui/shadcn/button.tsx`

### Verification
- `pnpm exec tsc --noEmit` passes with zero errors
