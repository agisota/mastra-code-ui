# Upstream Harness Gaps

This document catalogues functionality needed by the Electron app that is missing or
under-typed in the published `Harness` from `@mastra/core/harness`. Each item describes
the current workaround and the ideal upstream API.

**Last updated:** Upgraded to `@mastra/core@1.8.0` — 12 of 16 gaps resolved.

---

## 1. `Harness.deleteThread(threadId)` — OPEN

**Files:** `src/electron/main.ts`

The Electron app lets users delete threads. The published Harness has no `deleteThread`
method. The current mock switches away from the thread but does **not** remove it from
storage, so deleted threads accumulate forever.

**Workaround:** Mock helper that calls `createThread()` if the deleted thread is current.

**Ideal API:**

```ts
harness.deleteThread(threadId: string): Promise<void>
```

Deletes the thread from storage and auto-switches if it was the current thread.

---

## ~~2. Extensible / Custom Event Types via `emitEvent`~~ — RESOLVED in 1.8.0

`HarnessEvent` is now a fully-typed discriminated union including `ask_question`,
`plan_approval_required`, `task_updated`, `subagent_start`, `shell_output`, and more.
No `as any` casts needed.

---

## ~~3. Typed Event Payloads~~ — RESOLVED in 1.8.0

`HarnessEvent` is a discriminated union with typed payloads:

- `{ type: "thread_changed"; threadId: string }`
- `{ type: "thread_created"; thread: HarnessThread }`
- `{ type: "error"; error: Error }`
- etc.

---

## ~~4. `HarnessRequestContext.registerQuestion` / `registerPlanApproval`~~ — RESOLVED in 1.8.0

Both methods are now on the published `HarnessRequestContext` type (optional).

---

## ~~5. `HarnessRequestContext.getSubagentModelId`~~ — RESOLVED in 1.8.0

Now available as `getSubagentModelId?: (params?: { agentType?: string }) => string | null`.

---

## ~~6. `HarnessRequestContext.getState()` / `setState()`~~ — RESOLVED in 1.8.0

Both are now required methods on `HarnessRequestContext`:

- `getState: () => z.infer<TState>`
- `setState: (updates: Partial<z.infer<TState>>) => Promise<void>`

---

## ~~7. `HarnessRequestContext.abortSignal`~~ — RESOLVED in 1.8.0

Now available as `abortSignal?: AbortSignal` on `HarnessRequestContext`.

---

## ~~8. `HarnessConfig.resolveModel` Type Mismatch~~ — PARTIALLY RESOLVED in 1.8.0

The config now accepts `resolveModel?: (modelId: string) => MastraLanguageModel`.
A targeted cast is still needed since our function returns broader types
(`MastraModelConfig | ModelRouterLanguageModel`), but `as any` is no longer required.

**Current:** `resolveModel: resolveModel as (modelId: string) => MastraLanguageModel`

---

## 9. `HarnessConfig.hookManager` — OPEN

**File:** `src/electron/main.ts`

A `HookManager` runs lifecycle hooks (pre-send, post-send, tool-use, session start/stop).
It cannot be passed through the Harness constructor, so it is manually subscribed to
harness events externally.

**Workaround:** External event subscription wiring.

**Ideal API:**

```ts
interface HarnessConfig {
	hookManager?: HookManager
}
```

---

## 10. `HarnessConfig.mcpManager` — OPEN

**File:** `src/electron/main.ts`

MCP tool servers are managed via an external `MCPManager`. The harness cannot init,
disconnect, or inject MCP tools at config time.

**Workaround:** MCP tools injected ad-hoc via the agent's `tools` callback.

**Ideal API:**

```ts
interface HarnessConfig {
	mcpManager?: MCPManager
}
```

---

## ~~11. `HarnessConfig.getToolsets`~~ — RESOLVED (no upstream change needed)

**File:** `src/electron/main.ts`

Provider-native web search tools (Anthropic `webSearch_20250305()`, OpenAI `webSearch()`,
Google `googleSearch()`) are now passed directly via the dynamic `tools` function. Mastra's
`CoreToolBuilder.buildProviderTool()` detects `type: "provider-defined"` and handles them
correctly. No `getToolsets` config is needed — the `tools` function cascade (~line 481)
checks for Tavily first, then falls back to the current model's provider-native search.

---

## ~~12. Dedicated `setYoloMode` / `setThinkingLevel` Methods~~ — RESOLVED in 1.8.0

The Harness now has built-in permission management:

- `setPermissionForCategory({ category, policy })` — replaces `setYoloMode`
- `grantSessionCategory(category)` — session-level "always allow"
- `getPermissionRules()` / `getSessionGrants()` — introspection

Yolo mode is implemented by setting all categories to "allow".

---

## ~~13. Tool Context Type Missing `requestContext` and `agent`~~ — RESOLVED in 1.8.0

The Mastra tool execution context now includes `requestContext` and `agent.toolCallId`.
No `as any` casts needed.

---

## 14. Auth Integration — OPEN (intentionally external)

**File:** `src/electron/main.ts`, `src/auth/storage.ts`

The entire login/logout/OAuth PKCE flow is reimplemented externally in `AuthStorage`.
The only Harness connection is `modelAuthChecker` in config.

This is noted as intentionally external — auth is not the harness's concern — but if
other Harness consumers need auth, a pluggable auth provider interface would reduce
duplication.

---

## ~~15. Tool Approval API~~ — RESOLVED in 1.8.0

The Harness now has `respondToToolApproval({ decision })` with support for
`"approve"`, `"decline"`, and `"always_allow_category"` decisions. Built-in permission
management handles category grants and session grants internally.

---

## ~~16. Tool Execute Return Type Inconsistency~~ — RESOLVED in 1.8.0

Tool return types are now consistent.

---

## 17. `getTokenUsage()` Returns Zeros — AI SDK v6 Field Name Mismatch — FIXED (unreleased)

**File:** `node_modules/@mastra/core/dist/harness/index.js` (line 1614–1626)

The harness's `step-finish` handler reads `usage.promptTokens` and `usage.completionTokens`,
but AI SDK v6 (`ai@6.x`) provides `usage.inputTokens` and `usage.outputTokens`. The old
field names are `undefined`, so `?? 0` kicks in and tokens are always 0. The `usage_update`
event fires (the `usage` object is truthy) but with `{ promptTokens: 0, completionTokens: 0, totalTokens: 0 }`.

The TUI never hits this because it doesn't display per-message token counts — it only shows
OM progress from `om_status` events.

**Status:** A PR has been merged upstream to fix this, but the fix has not been included in a
published release yet. Still broken in `@mastra/core@1.8.0`. Update to the next release when
available.

**Workaround:** None in stable. The `0.0.0-harness-token-count-*` prerelease contained the
fix but is not suitable for long-term use.

**Ideal fix:**

```ts
// In step-finish handler, read both old and new field names:
const promptTokens = usage.promptTokens ?? usage.inputTokens ?? 0
const completionTokens = usage.completionTokens ?? usage.outputTokens ?? 0
```

Or use the AI SDK's `totalTokens` field which IS present and correct:

```ts
const totalTokens = usage.totalTokens ?? promptTokens + completionTokens
```

---

## 18. `createMastraCode` Does Not Export `resolveModel` — FIXED (unreleased)

**Files:** `src/electron/main.ts`, `src/electron/helpers.ts`

`createMastraCode()` internalizes its `resolveModel` function (which handles Claude Max auth
via `opencodeClaudeMaxProvider`, Codex auth via `openaiCodexProvider`, Moonshot, and generic
routing) but does not include it in the return value. The Electron app needs `resolveModel`
for `generateThreadTitle` — a lightweight `generateText()` call to produce thread titles.

The local workaround creates bare AI SDK instances (`createAnthropic({})`, `createOpenAI({})`)
without auth credentials, so the `generateText()` call fails silently and threads stay
titled "New Thread".

**Status:** A PR has been merged upstream to export `resolveModel` from `createMastraCode`,
but the fix has not been included in a published release yet. Still broken in `mastracode@0.4.0`.

**Workaround:** Local `resolveModel` in `main.ts` (lines 78–85) that creates unauthenticated
SDK instances. Title generation fails when using Claude Max or Codex auth flows.

**Ideal fix:**

```ts
// createMastraCode return value should include resolveModel:
return {
	harness,
	mcpManager,
	hookManager,
	authStorage,
	resolveModel,
	storageWarning,
}
```

Once released, the local `resolveModel` copy and its imports (`createAnthropic`, `createOpenAI`,
`ModelRouterLanguageModel`) can be removed from `main.ts`.

---

## 19. `createMastraCode` Does Not Support `extraTools` at Runtime — FIXED (unreleased)

**Files:** `src/electron/main.ts`

`MastraCodeConfig` declares an `extraTools` field for injecting additional tools (e.g.
browser tools, custom Electron tools) into the agent's tool set. The config type accepts it,
but the internal wiring does not merge `extraTools` into the dynamic tool function at runtime.
Custom tools passed via `extraTools` are silently ignored.

**Status:** A PR has been merged upstream to wire `extraTools` through the tool resolution
pipeline, but the fix has not been included in a published release yet. Still broken in
`mastracode@0.4.0`.

**Workaround:** Tools are injected by patching the harness's tool set after creation, or by
using `HarnessConfig.tools` directly when not using `createMastraCode`.

**Ideal fix:** `extraTools` from config should be merged into the dynamic tool function
alongside built-in and MCP tools.

---

## Summary

| Status   | Items                                | Notes                                                                      |
| -------- | ------------------------------------ | -------------------------------------------------------------------------- |
| RESOLVED | 2, 3, 4, 5, 6, 7, 11, 12, 13, 15, 16 | Fixed by `@mastra/core@1.8.0` typed APIs; 11 resolved via `tools` function |
| PARTIAL  | 8                                    | Targeted cast replaces `as any`                                            |
| OPEN     | 1                                    | `deleteThread` still missing                                               |
| OPEN     | 9, 10                                | Config extensibility (hookManager, mcpManager)                             |
| OPEN     | 14                                   | Auth integration (intentionally external)                                  |
| FIXED\*  | 17                                   | Token usage field mismatch; PR merged, not released                        |
| FIXED\*  | 18                                   | `resolveModel` not exported; PR merged, not released                       |
| FIXED\*  | 19                                   | `extraTools` not wired; PR merged, not released                            |
