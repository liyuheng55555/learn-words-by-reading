# Frontend Module Responsibilities

## Core Areas

- **Article Workspace**: handles article editing/viewing, vocabulary extraction, and context mapping updates.
- **Vocabulary Inputs**: renders fill-in list, tracks answers, handles filtering/jumps, and syncs local storage state.
- **AI Toolkit**: wraps article generation, grading workflow, progress UI, and related API calls.
- **Server Sync**: orchestrates POST/GET requests to the Node backend, caches server scores, and sync status messaging.
- **History & Progress Pages**: manage statistics rendering, table interactions, and chart drawing.
- **Shared Utilities**: DOM helpers, formatting, storage persistence, toast notifications, throttling, etc.
- **State Layer**: shared application state (article data, vocab list, AI results, server records) and pub/sub events.

## Module Boundaries

- `src/state/`: centralized stores for article/vocab/grades/server data.
- `src/services/`: API and storage interaction modules.
- `src/utils/`: generic helpers (formatting, DOM, async control, markdown conversion, etc.).
- `src/ui/`: UI controllers/components for each major area.
- Entry points per page under `src/pages/` wiring state + UI modules.

## Migration Strategy

1. Introduce ES module build step (Vite) keeping pages functional while logic still resides in legacy files.
2. Move cross-cutting utilities/services into dedicated modules; adjust existing code to import them.
3. Componentize page sections, progressively lifting logic out of the legacy monolith into dedicated UI modules.
4. Implement lightweight store/event bus for shared state; refactor modules to subscribe/dispatch instead of direct globals.
5. Update history/progress scripts to reuse utilities/services; align build pipeline.
6. Add lint/test scaffolding and document dev/build workflow.

Each step will be committed separately.
