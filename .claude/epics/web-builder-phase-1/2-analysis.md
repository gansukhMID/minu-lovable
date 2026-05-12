---
issue: 2
title: Remove Firecrawl from codebase
analyzed: 2026-05-12T06:07:07Z
estimated_hours: 2
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #2

## Overview

Single-stream deletion task. All work is file removal + import cleanup — no parallelism benefit. One agent completes the full task sequentially.

## Parallel Streams

### Stream A: Delete files, fix imports, remove package
**Scope**: Delete all Firecrawl files, fix broken imports in callers, remove firecrawl from package.json, verify with tsc
**Files**:
- `components/FirecrawlLogo.tsx` (delete)
- `components/FirecrawlIcon.tsx` (delete)
- `components/shared/firecrawl-icon/` (delete dir)
- `app/api/scrape-website/route.ts` (delete)
- `app/api/scrape-url-enhanced/route.ts` (delete if exists)
- `app/api/scrape-screenshot/route.ts` (delete if exists)
- `app/landing.tsx` (fix imports)
- `components/app/(home)/sections/hero/Hero.tsx` (fix imports)
- `app/page.tsx` (fix imports if any)
- `app/generation/page.tsx` (fix imports if any)
- `package.json` + lockfile (remove firecrawl dep)
**Can Start**: immediately
**Estimated Hours**: 2
**Dependencies**: none

## Coordination Points
### Shared Files
None — no shared files with other streams.
### Sequential Requirements
None within the task.

## Conflict Risk Assessment
Low — pure deletion. No file is also touched by tasks 003–007.

## Parallelization Strategy
Single stream. No parallelization needed or beneficial.

## Expected Timeline
- With parallel execution: 2h wall time
- Without: 2h
- Efficiency gain: 0% (single stream)
