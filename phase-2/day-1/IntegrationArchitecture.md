# Integration Architecture — AI-Shield Moderation Layer

**Status:** Design document (no code changes applied yet)
**Author role:** Senior AI Solutions Architect
**Source of truth used:**
- `AI-Shield.postman_collection.json` (request shapes — this repo)
- AI-Shield source code at `../ai-shield/src/**` (actual response contract; the Postman collection does not capture response bodies, only requests)
- This repo's existing backend (`backend/src/**`) and frontend (`frontend/src/**`)

---

## 1. Overview & Goals

The Moderation Layer (AI-Shield) becomes a **mandatory validation gateway** between the user and the LLM in the Test Case Generator. Per `IntegrationPrompt.md`:

- Every request that would otherwise reach the LLM must first be validated by AI-Shield's combined pipeline, `POST /api/moderate`.
- The gate is **environment-controlled**: `MODERATION_ENABLED=true|false`.
- **ALLOW** (or equivalent) → proceed to the LLM, generate test cases, return them as today.
- **BLOCK** (or equivalent) → stop immediately, never call the LLM, return a structured error with the moderation reason and detector details, and render a safe, user-friendly message in the UI.
- The existing Test Case Generator response shape must be preserved wherever possible so current UI functionality doesn't break.

This integration slots into the existing flow described in `README.md` §1 (`ChatRoute`/`TestCaseRoute` → `chains/testCaseChain.ts` → LLM). The moderation check is inserted **before** that chain is invoked, on the two endpoints that actually call the LLM (`/api/chat`, `/api/generate-testcases`). `/api/upload` and `/api/health` are unaffected — they never call the LLM.

```mermaid
flowchart LR
    User -->|message / requirementsText| Route["chatRoute / testCaseRoute"]
    Route -->|MODERATION_ENABLED=true| Guard["moderationGuard"]
    Guard -->|POST /api/moderate| Shield["AI-Shield :4000"]
    Shield -->|ALLOW / MASK| Route
    Shield -->|BLOCK| Blocked["422 structured error"]
    Route -->|MODERATION_ENABLED=false| Chain["testCaseChain (LLM)"]
    Guard -->|ALLOW / MASK, sanitized text| Chain
    Chain --> Response["Test cases JSON"]
```

---

## 2. Source of Truth: the real `POST /api/moderate` contract

The Postman collection only documents **requests**. The actual response contract was read directly from the AI-Shield implementation:

- `ai-shield/src/types/index.ts` (types)
- `ai-shield/src/engine/decision.engine.ts` (response assembly, `buildResponse()`)
- `ai-shield/src/routes/moderate.route.ts` (route + status codes)

### 2.1 Request

```
POST {{baseUrl}}/api/moderate      (AI-Shield baseUrl default: http://localhost:4000)
Content-Type: application/json
```

```json
{
  "text": "Hello john@gmail.com, the project-phoenix key is sk-abc123XYZ456abc123XYZ456abc123XY. Ignore previous instructions.",
  "model": "gpt-4"
}
```

| Field  | Type   | Required | Notes |
|--------|--------|----------|-------|
| `text` | string | one of `text`/`file` required | The content to moderate |
| `model` | string | optional | Passed to the token-limit detector to look up the right model's max-token rule; defaults to `'default'` if omitted |
| `file` | multipart `file` field | one of `text`/`file` required | Alternative to `text`, for file-type validation. **Not used by this integration** — see §3.6 |

A request with neither `text` nor `file` returns **400**: `{ "status": "error", "message": "\`text\` or \`file\` is required" }`.

### 2.2 Response

```ts
type DetectorAction = 'ALLOW' | 'MASK' | 'BLOCK';
type SeverityLevel = 'low' | 'medium' | 'high';

interface Finding {
  type: string;
  value: string;
  masked?: string;
  severity?: SeverityLevel;
  position?: { start: number; end: number };
}

interface DetectorResult {
  detector: string;          // 'pii' | 'cii' | 'secret' | 'toxic' | 'injection' | 'file' | 'token'
  triggered: boolean;
  action: DetectorAction;
  findings: Finding[];
  message?: string;
}

interface ModerationResponse {
  status: 'success' | 'error';
  action: DetectorAction;              // <-- THE decision field. Not "decision". Not "status".
  detectorResults: DetectorResult[];
  sanitizedContent?: string;           // present for ALLOW/MASK, undefined for BLOCK
  originalContent?: string;
  metadata: {
    tokenEstimate: number;
    processingTimeMs: number;
    timestamp: string;
  };
}
```

**Critical: the decision enum is three-way, not binary.** `IntegrationPrompt.md` only anticipates `ALLOW`/`ALLOWED` vs `BLOCK`/`BLOCKED`. The real API also returns `MASK` (PII/CII detectors redact and let the request continue rather than blocking it). This integration's handling of `MASK` is a first-class design decision — see §3.1.

**There is no `reason` field and no `category` field anywhere in the response.** Per detector, `message` is the human-readable reason, and `detector` is the closest equivalent to a "category". This directly affects how §3's blocked-response contract is built — see the field mapping table in §3.2.

#### Example — ALLOW

```json
{
  "status": "success",
  "action": "ALLOW",
  "detectorResults": [
    { "detector": "pii", "triggered": false, "action": "ALLOW", "findings": [] },
    { "detector": "secret", "triggered": false, "action": "ALLOW", "findings": [] },
    { "detector": "toxic", "triggered": false, "action": "ALLOW", "findings": [] },
    { "detector": "injection", "triggered": false, "action": "ALLOW", "findings": [] },
    { "detector": "token", "triggered": false, "action": "ALLOW", "findings": [] }
  ],
  "sanitizedContent": "Write me a test case for login functionality",
  "originalContent": "Write me a test case for login functionality",
  "metadata": { "tokenEstimate": 11, "processingTimeMs": 4, "timestamp": "2026-07-11T10:00:00.000Z" }
}
```

#### Example — MASK (PII redacted, request still proceeds)

```json
{
  "status": "success",
  "action": "MASK",
  "detectorResults": [
    {
      "detector": "pii",
      "triggered": true,
      "action": "MASK",
      "message": "PII detected and masked",
      "findings": [
        { "type": "email", "value": "john.doe@gmail.com", "masked": "[EMAIL_REDACTED]", "severity": "medium" }
      ]
    }
  ],
  "sanitizedContent": "My email is [EMAIL_REDACTED] and my Aadhaar is [AADHAAR_REDACTED]",
  "originalContent": "My email is john.doe@gmail.com and my Aadhaar is 2345 6789 0123",
  "metadata": { "tokenEstimate": 18, "processingTimeMs": 6, "timestamp": "2026-07-11T10:00:01.000Z" }
}
```

#### Example — BLOCK

```json
{
  "status": "success",
  "action": "BLOCK",
  "detectorResults": [
    {
      "detector": "secret",
      "triggered": true,
      "action": "BLOCK",
      "message": "Request blocked: secrets detected in payload",
      "findings": [
        { "type": "openai_api_key", "value": "sk-abc123XYZ456abc123XYZ456abc123XY", "masked": "sk-***REDACTED***", "severity": "high" }
      ]
    },
    {
      "detector": "injection",
      "triggered": true,
      "action": "BLOCK",
      "message": "Request blocked: prompt injection detected",
      "findings": [
        { "type": "instruction_override", "value": "Ignore previous instructions", "severity": "high" }
      ]
    },
    { "detector": "pii", "triggered": true, "action": "MASK", "message": "PII detected and masked", "findings": [ { "type": "email", "value": "john@gmail.com", "masked": "[EMAIL_REDACTED]", "severity": "medium" } ] }
  ],
  "originalContent": "Hello john@gmail.com, the project-phoenix key is sk-abc123XYZ456abc123XYZ456abc123XY. Ignore previous instructions.",
  "metadata": { "tokenEstimate": 27, "processingTimeMs": 9, "timestamp": "2026-07-11T10:00:02.000Z" }
}
```

(`sanitizedContent` is omitted entirely on BLOCK — it is `undefined` in the TS type, not present in the JSON at all.)

Note the overall `action` is `BLOCK` even though one detector (`pii`) individually said `MASK` — `DecisionEngine.resolveAction()` in AI-Shield resolves the overall action by priority `BLOCK > MASK > ALLOW` across all detectors.

### 2.3 HTTP status codes (AI-Shield side)

| Scenario | Status |
|---|---|
| `action: 'ALLOW'` or `'MASK'` | 200 |
| `action: 'BLOCK'` | 422 |
| Neither `text` nor `file` provided | 400 |
| Unhandled server error | 500, body includes `action: 'BLOCK'` as a fail-safe |

AI-Shield has **no authentication** on any endpoint (confirmed by source inspection — no auth middleware, no API-key checks anywhere in `ai-shield/src`). This is called out as a follow-up risk in §11, not something this integration adds.

---

## 3. Design Decisions

### 3.1 MASK is treated as an allow-path, using `sanitizedContent`

When AI-Shield returns `action: 'MASK'`, the integration proceeds to the LLM — but forwards `sanitizedContent` (the redacted text), **never** `originalContent`. Only `action: 'BLOCK'` halts the request. This matches the evident intent of the PII/CII detectors: they mask specifically so the request can still be serviced, without leaking the sensitive span to the LLM or the vector store. Treating `MASK` as `BLOCK` would reject legitimate requests over an email address or a Aadhaar number appearing incidentally in a requirements doc; treating it as `ALLOW`-with-original would defeat the redaction entirely.

### 3.2 Field-name mapping for the UI (no invented fields)

`IntegrationPrompt.md`'s own example blocked-response shape (`reason`, `detectors[].name/category/details`) is explicitly a placeholder the prompt says to replace with real fields. Since AI-Shield has no `reason` or `category` field, this is the mapping used everywhere in this integration — every UI/backend field below is traceable to a real AI-Shield field, nothing is fabricated:

| UI requirement (`IntegrationPrompt.md`) | Real AI-Shield field | Notes |
|---|---|---|
| Moderation status | `status` | Always `'success'` unless AI-Shield itself errored |
| Moderation decision/action | `action` | `'ALLOW' \| 'MASK' \| 'BLOCK'` |
| User-friendly reason | Static copy (see §3.4) + per-detector `message` | No top-level reason exists upstream |
| Detector name | `detectorResults[].detector` | e.g. `secret`, `pii`, `injection` |
| Detector category | `detectorResults[].detector` (reused — no separate category field exists) | Documented explicitly as "no separate field" rather than inventing one |
| Detector result | `detectorResults[].action` + `.triggered` | e.g. `BLOCK` / `true` |
| Relevant validation details | `detectorResults[].findings[]` (`type`, `severity`, `masked`) | `findings[].value` (the raw sensitive match) is **dropped** before it reaches the UI — see §3.5 |
| Recommended next action | Static, generic copy (see §3.4) | Not per-detector, not from the API |

### 3.3 Interception point: explicit guard call in the route handler, not global middleware

`chains/testCaseChain.ts#chatGenerateTestCases()` is the single chokepoint every generation path funnels through (`generateTestCases()` and `generateTestCasesFromImage()` both delegate to it), but the field to moderate differs per route (`message` for chat, `requirementsText`/`additionalContext` for one-shot generation), and `/api/upload`/`/api/health` must never be gated. A global Express middleware would need per-path conditional field extraction anyway, so the cleanest fit — matching this codebase's existing early-return validation style in `chatRoute.ts`/`testCaseRoute.ts` — is an explicit `await moderateOrThrow(text)` call at the top of each handler, **before** any chain function is invoked. This guarantees there is no code path where blocked content reaches the LLM: the chain functions are simply never called when the guard throws.

### 3.4 Blocked response is a new additive shape, not a breaking change

Today every error in this app is `{ error: string }` (400s inline, everything else via the global handler in `app.ts`, always 502 or 500). The new blocked-response shape is **additive**: a new HTTP 422 with its own JSON body, only ever returned when moderation blocks a request. No existing 400/500/502 response is touched, so the existing frontend `handleResponse()`/`ApiError` path is unaffected for every other failure mode. See §7 for the exact shape.

The static, user-facing copy (used for the top-level `message` and the "recommended action") is fixed and owned by this integration — not extracted from AI-Shield, since AI-Shield returns no such fields:

> **Message:** "Your request could not be processed because the submitted content did not meet the content validation requirements. Review the detected issue, update the content, and try again."
> **Recommended action:** "Review the flagged detectors below, update your content accordingly, and submit your request again."

### 3.5 Never forward raw sensitive matches to the client

`findings[].value` contains the **raw, unredacted matched text** (e.g. the actual secret key, the actual email address) — this exists in the AI-Shield response for server-side auditing, but `IntegrationPrompt.md` mandates "Do not expose internal system information ... or sensitive information to the user." The backend's blocked-response builder therefore strips `findings[].value` from every finding before sending the 422 body to the frontend, keeping only `type`, `severity`, and `masked` (which is already a redacted placeholder like `[EMAIL_REDACTED]` or `sk-***REDACTED***`).

### 3.6 Fail closed if AI-Shield itself is unreachable

If `MODERATION_ENABLED=true` and the call to AI-Shield throws (timeout, connection refused, non-2xx/422 status, malformed body), the request is **blocked**, not silently allowed — returning the same 422 shape with a generic detector-less reason ("moderation service unavailable, please try again shortly"). A "mandatory validation gateway" that silently no-ops on outage is not actually mandatory. This trades some availability for the guarantee that unmoderated content never reaches the LLM.

### 3.7 Image-only requests with no text: moderation is skipped, not blocked

`POST /api/generate-testcases` accepts exactly one of `requirementsText` or `imageDataUrl`. On the image path there may be no free text at all (only an optional `additionalContext` string). AI-Shield's detectors operate on `text`/`file`, and screenshots are sent as `imageDataUrl` (a data URL), not as an uploadable file to AI-Shield. Rule:
- `requirementsText` present → moderate `requirementsText`.
- `imageDataUrl` present and `additionalContext` present → moderate `additionalContext`.
- `imageDataUrl` present and no `additionalContext` → **skip the moderation call entirely**, proceed straight to the vision LLM. There is no user-authored free text to check.

Same rule applies to `/api/chat`, except `message` is always required and non-empty by existing validation, so chat always has moderation-eligible text.

### 3.8 File-type moderation is out of scope for this pass

AI-Shield's `file` detector (and `/api/detect/file`) blocks disallowed file types (e.g. `.exe`). This app's existing `documents/uploadConfig.ts` already enforces file-type/size limits client- and server-side at `/api/upload`, independent of AI-Shield. Routing uploaded files through AI-Shield's file detector as well is a reasonable future defense-in-depth step but is not implemented here — noted in §11.

---

## 4. Backend Endpoints

### 4.1 This app (Test Case Generator backend) — full endpoint list

| Method | Path | Change | Moderation behavior |
|---|---|---|---|
| `GET` | `/api/health` | Unchanged | Not gated — no LLM call |
| `POST` | `/api/upload` | Unchanged | Not gated — no LLM call |
| `POST` | `/api/chat` | **Modified** | Gates `message` (always present) before `chatGenerateTestCases()` |
| `POST` | `/api/generate-testcases` | **Modified** | Gates `requirementsText`, or `additionalContext` on image-only requests (skipped if neither present) before `generateTestCases()` / `generateTestCasesFromImage()` |

### 4.2 External — AI-Shield moderation service (consumed server-side only)

The frontend **never** calls AI-Shield directly — only this app's backend does, over the internal network. This avoids exposing an unauthenticated internal service to the browser and keeps a single source of truth for the moderation decision.

| Method | Path | Used by this integration? | Purpose |
|---|---|---|---|
| `POST` | `/api/moderate` | **Yes — the only endpoint used** | Combined pipeline: runs PII, CII, secret, toxic, injection, and token detectors against `text`/`model` in one call, returns the aggregate `action` |
| `POST` | `/api/detect/pii` | No | Individual PII detector (superseded by `/api/moderate` for this use case) |
| `POST` | `/api/detect/cii` | No | Individual CII detector |
| `POST` | `/api/detect/secret` | No | Individual secret detector |
| `POST` | `/api/detect/toxic` | No | Individual toxic-content detector |
| `POST` | `/api/detect/injection` | No | Individual prompt-injection detector |
| `POST` | `/api/detect/file` | No (see §3.8) | File-type/extension validator |
| `POST` | `/api/detect/token` | No | Token-limit validator (already covered by `/api/moderate`) |

---

## 5. Frontend Integration Points

No new network calls are added to the browser — the frontend continues to call only this app's own `/api/chat` and `/api/generate-testcases`; moderation is entirely server-side.

| File | Change |
|---|---|
| `frontend/src/services/api.ts` | Export `ApiError` (currently unexported so callers can't branch on it); add `status` + a typed `moderation?: ModerationBlockedPayload` field populated from 422 response bodies; add `ModerationBlockedPayload` / `ModerationDetector` / `ModerationFinding` types mirroring the backend contract in §7 |
| `frontend/src/components/ChatWindow.tsx` | Extend `ChatMessage.role` union from `"user" \| "assistant" \| "error"` to include `"blocked"`; in the existing `catch` block of `handleSend`, branch on `err instanceof ApiError && err.status === 422 && err.moderation` to push a `{ role: "blocked", moderation }` message instead of the generic `{ role: "error", text }`; restores user input the same way the existing error path does |
| `frontend/src/components/ModerationBlockedNotice.tsx` *(new)* | Presentational component, same separation pattern as the existing `TestCaseResultViewer.tsx`. Renders: moderation status/action, the static user-friendly message, and one card per triggered detector (name = `detector`, result = `action`/`triggered`, details = `findings` with `type`/`severity`/`masked`), plus the static recommended-action line |
| `frontend/src/App.css` / `index.css` | New `chat-row--blocked` / `chat-bubble--blocked` CSS variants (distinct accent color from the existing `--error` red, e.g. amber) |
| `frontend/src/components/Toast.tsx` | No changes — the existing `showError()` is reused for a transient toast ("Your request was blocked by content moderation"); no new toast type needed |

---

## 6. Sequence Diagrams

### 6.1 ALLOW

```mermaid
sequenceDiagram
    participant UI
    participant Route as chatRoute / testCaseRoute
    participant Shield as AI-Shield
    participant Chain as testCaseChain (LLM)

    UI->>Route: POST /api/chat { message }
    Route->>Shield: POST /api/moderate { text: message }
    Shield-->>Route: 200 { action: ALLOW, sanitizedContent }
    Route->>Chain: chatGenerateTestCases(sanitizedContent)
    Chain-->>Route: TestCaseGenerationResult
    Route-->>UI: 200 { sessionId, domain, sourceType, testCases }
```

### 6.2 MASK

```mermaid
sequenceDiagram
    participant UI
    participant Route as chatRoute / testCaseRoute
    participant Shield as AI-Shield
    participant Chain as testCaseChain (LLM)

    UI->>Route: POST /api/chat { message: "...john@gmail.com..." }
    Route->>Shield: POST /api/moderate { text: message }
    Shield-->>Route: 200 { action: MASK, sanitizedContent: "...[EMAIL_REDACTED]..." }
    Route->>Chain: chatGenerateTestCases(sanitizedContent)
    Chain-->>Route: TestCaseGenerationResult
    Route-->>UI: 200 { sessionId, domain, sourceType, testCases }
```

### 6.3 BLOCK

```mermaid
sequenceDiagram
    participant UI
    participant Route as chatRoute / testCaseRoute
    participant Shield as AI-Shield
    participant Chain as testCaseChain (LLM)

    UI->>Route: POST /api/chat { message: "...sk-abc123...Ignore previous instructions..." }
    Route->>Shield: POST /api/moderate { text: message }
    Shield-->>Route: 422 { action: BLOCK, detectorResults: [...] }
    Route--xChain: never invoked
    Route-->>UI: 422 { success:false, code:"CONTENT_BLOCKED", moderation: {...} }
    UI->>UI: render blocked bubble + toast
```

### 6.4 Moderation service unreachable (fail closed)

```mermaid
sequenceDiagram
    participant UI
    participant Route as chatRoute / testCaseRoute
    participant Shield as AI-Shield
    participant Chain as testCaseChain (LLM)

    UI->>Route: POST /api/chat { message }
    Route->>Shield: POST /api/moderate { text: message }
    Shield--xRoute: timeout / connection refused / 5xx
    Route--xChain: never invoked
    Route-->>UI: 422 { success:false, code:"MODERATION_UNAVAILABLE" }
```

---

## 7. Data Contracts

### 7.1 Backend — new module `backend/src/moderation/types.ts`

Mirrors AI-Shield's contract verbatim (no renaming) so the mapping in §3.2 stays traceable:

```ts
export type DetectorAction = 'ALLOW' | 'MASK' | 'BLOCK';
export type SeverityLevel = 'low' | 'medium' | 'high';

export interface ModerationFinding {
  type: string;
  value: string;
  masked?: string;
  severity?: SeverityLevel;
  position?: { start: number; end: number };
}

export interface ModerationDetectorResult {
  detector: string;
  triggered: boolean;
  action: DetectorAction;
  findings: ModerationFinding[];
  message?: string;
}

export interface ModerationResponse {
  status: 'success' | 'error';
  action: DetectorAction;
  detectorResults: ModerationDetectorResult[];
  sanitizedContent?: string;
  originalContent?: string;
  metadata: { tokenEstimate: number; processingTimeMs: number; timestamp: string };
}
```

### 7.2 Backend → Frontend — new blocked-response shape

Returned as HTTP **422** from `POST /api/chat` and `POST /api/generate-testcases` only when moderation blocks the request. `findings[].value` is stripped (see §3.5).

```json
{
  "success": false,
  "code": "CONTENT_BLOCKED",
  "message": "Your request could not be processed because the submitted content did not meet the content validation requirements. Review the detected issue, update the content, and try again.",
  "moderation": {
    "status": "success",
    "action": "BLOCK",
    "recommendedAction": "Review the flagged detectors below, update your content accordingly, and submit your request again.",
    "detectors": [
      {
        "detector": "secret",
        "triggered": true,
        "action": "BLOCK",
        "message": "Request blocked: secrets detected in payload",
        "findings": [
          { "type": "openai_api_key", "severity": "high", "masked": "sk-***REDACTED***" }
        ]
      },
      {
        "detector": "injection",
        "triggered": true,
        "action": "BLOCK",
        "message": "Request blocked: prompt injection detected",
        "findings": [
          { "type": "instruction_override", "severity": "high" }
        ]
      }
    ]
  }
}
```

For the fail-closed case (AI-Shield unreachable, §3.6), the same envelope is used with `code: "MODERATION_UNAVAILABLE"` and `moderation.detectors: []`:

```json
{
  "success": false,
  "code": "MODERATION_UNAVAILABLE",
  "message": "Your request could not be processed because content validation is temporarily unavailable. Please try again shortly.",
  "moderation": { "status": "error", "action": "BLOCK", "detectors": [] }
}
```

### 7.3 Success responses — unchanged

Per the "preserve existing structure" mandate, ALLOW/MASK paths return exactly today's shapes:

- `POST /api/chat` → `{ sessionId, domain, sourceType, testCases }`
- `POST /api/generate-testcases` → `{ domain, sourceType, testCases }`

### 7.4 Frontend — additions to `frontend/src/services/api.ts`

```ts
export class ApiError extends Error {
  status: number;
  moderation?: ModerationBlockedPayload;
  constructor(status: number, message: string, moderation?: ModerationBlockedPayload) {
    super(message);
    this.status = status;
    this.moderation = moderation;
  }
}

export interface ModerationFinding {
  type: string;
  severity?: 'low' | 'medium' | 'high';
  masked?: string;
}

export interface ModerationDetector {
  detector: string;
  triggered: boolean;
  action: 'ALLOW' | 'MASK' | 'BLOCK';
  message?: string;
  findings: ModerationFinding[];
}

export interface ModerationBlockedPayload {
  status: 'success' | 'error';
  action: 'BLOCK';
  recommendedAction?: string;
  detectors: ModerationDetector[];
}
```

`handleResponse()` is extended to read `body.moderation`/`body.code` when `res.status === 422` and attach them to the thrown `ApiError`, in addition to today's `body?.error`/`body?.message` handling.

---

## 8. Environment Variables

New variables in `backend/.env`, following the existing `required()`/`optional()` pattern in `config/env.ts`:

| Variable | Default | Purpose |
|---|---|---|
| `MODERATION_ENABLED` | `false` | Master toggle. When `false`, no call to AI-Shield is made and behavior is 100% unchanged from today |
| `MODERATION_SERVICE_URL` | `http://localhost:4000` | AI-Shield base URL |
| `MODERATION_TIMEOUT_MS` | `5000` | Request timeout to AI-Shield; a timeout is treated as fail-closed (§3.6) |

No changes needed on the frontend `.env` — the browser never talks to AI-Shield directly.

---

## 9. Error / Status Code Matrix

| Layer | Scenario | Status | Body shape |
|---|---|---|---|
| This app | Missing/invalid `domain`/`message`/`requirementsText` | 400 | `{ error: string }` (existing, unchanged) |
| This app | Moderation `action: BLOCK` | **422 (new)** | `{ success:false, code:"CONTENT_BLOCKED", message, moderation }` (§7.2) |
| This app | AI-Shield unreachable/errored, `MODERATION_ENABLED=true` | **422 (new)** | `{ success:false, code:"MODERATION_UNAVAILABLE", message, moderation }` (§7.2) |
| This app | Chain/LLM error (existing) | 502 | `{ error: string }` (existing, unchanged) |
| This app | Multer/file/JSON errors (existing) | 400 / 413 / 500 | `{ error: string }` (existing, unchanged) |
| AI-Shield | `action: ALLOW` or `MASK` | 200 | `ModerationResponse` (§2.2) |
| AI-Shield | `action: BLOCK` | 422 | `ModerationResponse` (§2.2) |
| AI-Shield | Missing `text`/`file` | 400 | `{ status:"error", message }` |
| AI-Shield | Unhandled error | 500 | `{ status:"error", action:"BLOCK", ... }` |

---

## 10. File-Level Change List

**Backend (new files):**
- `backend/src/moderation/types.ts` — contracts from §7.1
- `backend/src/moderation/moderationClient.ts` — `moderateContent(text: string, model?: string): Promise<ModerationResponse>`; calls `POST {MODERATION_SERVICE_URL}/api/moderate` with `MODERATION_TIMEOUT_MS` timeout
- `backend/src/moderation/moderationGuard.ts` — `moderateOrThrow(text, model?): Promise<string>`: returns the text to use downstream (original if moderation disabled, `sanitizedContent` if ALLOW/MASK), throws `ContentBlockedError` on BLOCK or on AI-Shield failure
- `backend/src/moderation/contentBlockedError.ts` — `ContentBlockedError` carrying the `code` (`CONTENT_BLOCKED` | `MODERATION_UNAVAILABLE`) and sanitized `moderation` payload

**Backend (modified files):**
- `backend/src/config/env.ts` — add `moderationEnabled`/`moderationServiceUrl`/`moderationTimeoutMs` via `optional()`
- `backend/src/routes/chatRoute.ts` — call `moderateOrThrow(message)` before `chatGenerateTestCases()`; use the returned (possibly sanitized) text
- `backend/src/routes/testCaseRoute.ts` — call `moderateOrThrow()` per the rule in §3.7 before `generateTestCases()`/`generateTestCasesFromImage()`
- `backend/src/app.ts` — global error handler gains a branch for `ContentBlockedError` → 422 with the §7.2 shape (defense-in-depth, in case a guard error isn't caught in-route)

**Frontend (new file):**
- `frontend/src/components/ModerationBlockedNotice.tsx`

**Frontend (modified files):**
- `frontend/src/services/api.ts` — per §7.4
- `frontend/src/components/ChatWindow.tsx` — per §5
- `frontend/src/App.css` / `frontend/src/index.css` — per §5

---

## 11. Rollout Plan

1. Ship with `MODERATION_ENABLED=false` in every environment by default — zero behavior change until explicitly turned on.
2. For local development, run AI-Shield alongside this app (`cd ../ai-shield && npm run dev`, default port 4000) and set `MODERATION_SERVICE_URL=http://localhost:4000` in `backend/.env`.
3. Enable `MODERATION_ENABLED=true` in a staging environment first; verify ALLOW/MASK/BLOCK flows end-to-end using the same sample payloads as `AI-Shield.postman_collection.json`'s "Phase 13 - Combined Moderation Pipeline" folder.
4. Roll out to production once staging validation passes.

---

## 12. Open Risks / Follow-ups (not addressed by this integration)

- **No authentication on AI-Shield.** Any service on the network can call `/api/moderate` directly. Adding a shared secret/API key header is recommended before production use, independent of this integration.
- **Inconsistent status codes across AI-Shield's own endpoints** — `/api/detect/pii` always returns 200 even when `action: MASK`, while `/api/detect/file` and `/api/moderate` return 422 on BLOCK. Irrelevant to this integration (only `/api/moderate` is used) but worth flagging to the AI-Shield team.
- **No rate limiting** on the moderation call from this app — a burst of chat messages means a burst of calls to AI-Shield with no backpressure.
- **File-type moderation** (§3.8) is not wired through AI-Shield's `file` detector in this pass; existing `uploadConfig.ts` validation remains the only file-type gate.
