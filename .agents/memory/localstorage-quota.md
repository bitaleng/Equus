---
name: localStorage quota fix for SQLite DB
description: SQLite binary exported as base64 can exceed localStorage 5MB quota; must compress with lz-string
---

**Rule:** Always compress the SQLite base64 string with `LZString.compressToUTF16` before `localStorage.setItem`, and decompress with `LZString.decompressFromUTF16` on load.

**Why:** The SQLite DB grows as hotel data accumulates (months of locker_logs, expenses). Uncompressed base64 exceeds the ~5MB localStorage quota, causing `QuotaExceededError` on save — silently failing imports.

**How to apply:**
- `saveDatabase()` in `client/src/lib/localDb.ts`: compress before setItem, catch remaining QuotaExceededError gracefully
- `initDatabase()`: try decompressFromUTF16 first; if result is null, fall back to treating stored value as legacy uncompressed base64
- lz-string package must be installed (`npm install lz-string @types/lz-string`)
- Compression typically reduces size by 60-70%, multiplying effective quota headroom
