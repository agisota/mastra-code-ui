# Upstream Harness Gaps

This document catalogues functionality needed by the Electron app that is missing or
under-typed in the published `Harness` from `@mastra/core/harness`. Each item describes
the current workaround and the ideal upstream API.

**Last updated:** Upgraded to `@mastra/core@1.9.0` + `mastracode@0.5.1` — 15 of 17 gaps resolved.

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

## ~~17. `getTokenUsage()` Returns Zeros — AI SDK v6 Field Name Mismatch~~ — RESOLVED in 1.9.0

The harness's `step-finish` handler now reads both old and new field names:
`usage.promptTokens ?? usage.inputTokens ?? 0` and
`usage.completionTokens ?? usage.outputTokens ?? 0`. Token counts are now correct.

---

## ~~18. `createMastraCode` Does Not Export `resolveModel`~~ — RESOLVED in mastracode 0.5.0

`createMastraCode()` now includes `resolveModel` in its return value. The local workaround
(`createAnthropic({})`, `createOpenAI({})`, `ModelRouterLanguageModel`) has been removed from
`main.ts`. Thread title generation now uses the fully-authenticated model resolver.

---

## ~~19. `createMastraCode` Does Not Support `extraTools` at Runtime~~ — RESOLVED in mastracode 0.5.0

`extraTools` is now properly wired through the tool resolution pipeline. Accepts either a
static `Record<string, any>` or a dynamic function `({ requestContext }) => Record<string, any>`.
Custom tools are merged into the dynamic tool set alongside built-in and MCP tools.

---

## 20. `opencodeClaudeMaxProvider` OAuth Fetch Overwrites SDK Headers — OPEN (patched locally)

**File:** `mastracode/dist/chunk-JI4M5525.js` (ESM), `chunk-AJEYT7X3.cjs` (CJS)

The OAuth custom `fetch` in `opencodeClaudeMaxProvider` replaces `init.headers` entirely
with hardcoded headers:

```js
headers: {
  Authorization: `Bearer ${accessToken}`,
  "anthropic-beta": "oauth-2025-04-20,...",
  "anthropic-version": "2023-06-01"
}
```

This drops any `anthropic-beta` values that the AI SDK dynamically adds via `prepareTools()`
(e.g. `computer-use-2025-11-24` for computer use tools). The result: provider-defined tools
like `computer_20251124` are sent in the API request body but the required beta header is
missing, causing the API to reject the tool type.

**Workaround:** pnpm patch that merges the SDK's `anthropic-beta` header with the OAuth betas:

```js
const sdkBeta = init?.headers?.["anthropic-beta"] || ""
const oauthBeta = "oauth-2025-04-20,..."
const mergedBeta = sdkBeta ? `${oauthBeta},${sdkBeta}` : oauthBeta
```

**Ideal fix:** The OAuth fetch should merge `init.headers["anthropic-beta"]` with its own
beta list instead of replacing it. This affects any provider-defined tool that requires a
beta header (computer use, code execution, web fetch, etc.).

---

## Summary

| Status   | Items                                | Notes                                                                      |
| -------- | ------------------------------------ | -------------------------------------------------------------------------- |
| RESOLVED | 2, 3, 4, 5, 6, 7, 11, 12, 13, 15, 16 | Fixed by `@mastra/core@1.8.0` typed APIs; 11 resolved via `tools` function |
| RESOLVED | 17                                   | Token usage field mismatch fixed in `@mastra/core@1.9.0`                   |
| RESOLVED | 18, 19                               | `resolveModel` export + `extraTools` wiring fixed in `mastracode@0.5.0`    |
| PARTIAL  | 8                                    | Targeted cast replaces `as any`                                            |
| OPEN     | 1                                    | `deleteThread` still missing                                               |
| OPEN     | 9, 10                                | Config extensibility (hookManager, mcpManager)                             |
| OPEN     | 14                                   | Auth integration (intentionally external)                                  |
| OPEN     | 20                                   | OAuth fetch drops SDK beta headers (patched locally)                       |
