# IPC channel → domain file map

**Source:** `electron/main/ipc-handlers.ts` (v2.10 baseline)
**Total unique channels:** 225
**Raw `ipcMain.handle` calls:** 226 (1 duplicate — see note below)
**Target domain files:** 15 (+ `index.ts` registrar)

This doc is the source of truth for the Phase C decomposition. Every channel
listed here MUST land in exactly one domain file. Orphans = ship blocker.

## Domain files (15)

| Domain | Channels | Prefix groups |
|---|---:|---|
| `coaching.ts` | 4 | coaching |
| `memory.ts` | 54 | memory (53), contacts (1) |
| `llm.ts` | 7 | llm (6), digest (1) |
| `models.ts` | 36 | models (23), ollama (5), openrouter (2), custom-provider (6) |
| `stt.ts` | 14 | recording (10), audio (3), meeting (1) |
| `data.ts` | 14 | db |
| `vault.ts` | 6 | vault (3), keychain (3) |
| `calendar.ts` | 8 | google (3), apple (2), calendar-local-blocks (3) |
| `integrations.ts` | 18 | jira (7), slack (2), teams (2), mail (4), gmail (2), notify (1) |
| `intelligence.ts` | 23 | intelligence (5), kb (6), context (2), prep (1), routines (9) |
| `window.ts` | 13 | window (4), tray (2), tray-agenda (7) |
| `export.ts` | 3 | export |
| `app.ts` | 20 | app (9), setup (2), fetch (1), permissions (4), api (4) |
| `sync.ts` | 5 | sync |
| **Total** | **225** | |

## Prefix counts (from baseline grep)

```
53 memory          5 intelligence    2 slack           1 digest
23 models          4 window          2 setup           1 contacts
14 db              4 permissions     2 openrouter
10 recording       4 mail            2 gmail
 9 routines        4 coaching        2 context
 9 app             4 api             2 apple
 7 tray-agenda     3 vault           1 prep
 7 jira            3 keychain        1 notify
 6 llm             3 google          1 meeting
 6 kb              3 export          1 fetch
 6 custom-provider 3 calendar-local-blocks
 5 sync            3 audio
 5 ollama          2 tray
 5 intelligence    2 teams
```

## Notes

- `ipcMain.handle` raw-call count is 226 (not 225) because one channel is
  registered twice in the current file (duplicate call path). The decomp must
  dedupe — each channel is registered exactly once in its new home.
- Domain files follow the registrar pattern: each file exports
  `registerXxxHandlers(): void` which runs all its `ipcMain.handle(...)` calls.
  `ipc/index.ts` is ≤200 lines and is the single thing `main/index.ts` imports.
- `withIPC()` wrapper (in `ipc/util.ts`) standardizes the error envelope and
  kills the current 63 scattered try/catch blocks. Zod validation does NOT
  land in v2.10 — that's a v2.11 deliverable on top of this stable structure.

## Verification (post-decomp)

```bash
# Every baseline channel still registered
diff <(grep -oE "ipcMain\.(handle|on)\(['\\\"]([^'\\\"]+)" electron/main/ipc-handlers.ts.baseline | sort -u) \
     <(grep -roE "ipcMain\.(handle|on)\(['\\\"]([^'\\\"]+)" electron/main/ipc/ | sort -u)
# Expected: empty diff (aside from prefix path).
```
