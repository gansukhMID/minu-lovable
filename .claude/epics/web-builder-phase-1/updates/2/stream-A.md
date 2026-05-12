---
issue: 2
stream: delete-firecrawl
started: 2026-05-12T06:07:07Z
status: completed
completed: 2026-05-12T06:20:00Z
commit: 88f89f0
---
## Scope
Delete all Firecrawl files, fix broken imports, remove firecrawl package.

## Summary

### Files Deleted
- `components/FirecrawlIcon.tsx`
- `components/FirecrawlLogo.tsx`
- `components/shared/firecrawl-icon/firecrawl-icon.tsx`
- `components/shared/firecrawl-icon/firecrawl-icon-static.tsx`
- `app/api/scrape-website/route.ts`
- `app/api/scrape-url-enhanced/route.ts`
- `app/api/scrape-screenshot/route.ts`

### Imports Fixed
- `app/landing.tsx` — removed FirecrawlIcon/FirecrawlLogo imports and replaced JSX usage with a plain text link
- `components/shared/header/BrandKit/BrandKit.tsx` — removed FirecrawlIcon import and usage
- `components/shared/preview/live-preview-frame.tsx` — replaced hardcoded `api.firecrawl.dev` WebSocket URL with env-var-driven `NEXT_PUBLIC_LIVECAST_HOST`

### Package Removal
- Removed `@mendable/firecrawl-js` from `package.json`
- Ran `pnpm install` to update `pnpm-lock.yaml`

### Verification
- `grep` for all firecrawl references in `*.ts`, `*.tsx`, `*.js`, `*.json` returns zero results
- `pnpm exec tsc --noEmit` passes with no errors
