# PROJECT_CONTEXT.md

## Exam Blueprint & Question Paper Generator — B2B Micro-SaaS

**Purpose of this document:** a single reference for anyone (human or AI) picking up this codebase, so every future change stays consistent with what's already been built and why. Read this before adding new modules, changing schema, or making architectural decisions.

---

## 1. Product Summary

A B2B micro-SaaS for private coaching institutes and tuition teachers in India. Teachers upload their own teaching material (typed text, photos of handwritten notes, PDFs, DOCX) organized by Subject + Grade. They define an exam "blueprint" (marks, question counts, difficulty/type distribution, chapter weightage), and the platform uses Claude to generate a print-ready question paper strictly from that teacher's own material — never from generic question banks, never inventing content the material doesn't support.

**Core differentiator:** accuracy to what was actually taught, enforced by a "never hallucinate" policy baked into every AI prompt and validation layer.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite + Tailwind) — not yet built |
| Backend | Node.js 22, Express.js |
| Database | MySQL 8+, `mysql2/promise`, raw parameterized SQL, **no ORM** |
| AI | Anthropic Claude API, `@anthropic-ai/sdk`, model `claude-3-5-sonnet-20241022` |
| Image preprocessing | Python 3 + Pillow, invoked via `child_process.execFile` (no shell) |
| PDF export | `pdfkit`, in-memory generation, bundled DejaVu Sans fonts for Unicode |
| Background jobs | Custom poll-based worker (no Redis/queue system), MySQL advisory lock for single-instance |
| Auth | JWT (access + refresh), bcrypt, refresh tokens hashed (SHA-256) at rest |
| Validation | Joi |
| File uploads | Multer (memory storage) + custom MIME/extension/size/filename validation |

---

## 3. Architecture Pattern

**Controller → Service → Repository**, strictly layered, per module:

```
src/modules/<module>/
├── <module>.routes.js       # Express router: auth + validation middleware + controller wiring
├── <module>.controller.js   # req/res only, no SQL, no business logic
├── <module>.service.js      # business logic, no SQL, no req/res
├── <module>.repository.js   # raw parameterized SQL only, no business logic
├── <module>.validation.js   # Joi schemas
└── <module>.mapper.js       # raw DB row -> public API-safe shape
```

Rules that must never be violated:
- Controllers never contain SQL or business rules.
- Services never touch `req`/`res` or write raw SQL.
- Repositories never contain business logic — only parameterized queries, always scoped by `teacher_id` for tenant-owned tables.
- Every public-facing entity is identified by a UUID (`public_id`), never an internal auto-increment `id`. Internal ids never leave the repository/service layer.
- Cross-tenant access returns **404, not 403** — a resource belonging to another tenant is indistinguishable from one that doesn't exist, to avoid confirming its existence.

---

## 4. Folder Structure (current)

```
backend/
├── .env.example
├── package.json
├── database/migrations/          # 001–006, additive only, see §7
├── python/preprocess.py           # image preprocessing microservice
├── src/
│   ├── app.js                     # Express bootstrap (helmet, cors, rate limit, routes)
│   ├── server.js                  # HTTP API process entrypoint
│   ├── config/                    # env.js, database.js, multer.config.js, claude.config.js
│   ├── constants/                 # httpStatus, appConstants, fileConstants, roleConstants, rateLimitConstants
│   ├── middlewares/                # auth, authorize, validate, rateLimiter, upload, error handling,
│   │                                resolveTeacherContext, requestId, notFound
│   ├── utils/                      # logger, apiResponse, asyncHandler, jwt/password/tokenHash utils,
│   │                                sanitize, fileSecurity, uuidGenerator, dateHelper, paginationHelper,
│   │                                validationHelper, errors/ (AppError + 6 subclasses)
│   ├── validators/                 # commonSchemas.js (shared Joi fragments), validationErrorFormatter.js
│   ├── services/                   # upload.service.js (cross-module file storage)
│   ├── routes/index.routes.js      # central router, mounts every module
│   ├── modules/
│   │   ├── auth/                   # register/login/refresh/logout
│   │   ├── subject/                 # subject CRUD
│   │   ├── sourceMaterial/          # source material CRUD + file upload
│   │   ├── processing/              # pending->processing->processed/failed state machine
│   │   ├── ai/                      # Claude Vision OCR + legibility gatekeeper
│   │   ├── examBlueprint/           # blueprint CRUD + structure validation
│   │   ├── examGenerator/           # generation request queue + generation.service.js (Claude call)
│   │   └── pdf/                     # PDF export (fonts/ bundled here)
│   └── workers/                     # worker.js, processing.worker.js, generation.worker.js, worker.scheduler.js
```

---

## 5. Database Schema Summary

Core tables (see `database/migrations/` for the exact DDL history):

| Table | Purpose | Key notes |
|---|---|---|
| `teachers` | Tenant root | `public_id` UUIDv7, `status` enum, soft delete |
| `refresh_tokens` | Session management | `token_hash` (SHA-256), rotation = revoke-old + insert-new in one transaction |
| `login_audit_logs` | Security audit trail | every login attempt, success or failure, nullable `teacher_id` |
| `subjects` | Subject + Grade organization | `teacher_id` scoped |
| `source_materials` | Uploaded/pasted content | `teacher_id` denormalized (avoids join for tenant checks); `source_type` enum `text/file/image`; processing columns added in migration 003 |
| `transcriptions` | OCR results | 1:1 with source_materials; `language`/`processing_duration_ms` added in migration 004 |
| `exam_blueprints` | Exam plan | `structure_json` (JSON column): numberOfQuestions, difficultyDistribution, questionTypeDistribution, chapterWeightage, instructions — all percentage distributions validated to sum to 100 |
| `generated_exams` | Generated papers | `teacher_id` denormalized; `status` enum extended to include `queued` (migration 005); generation metadata added in migration 006 |

**All migrations are additive** — no column has ever been removed or renamed; every new column is nullable or has a safe default. Migrations 001 (initial schema) and 001-security aren't in this repo's file list because the original DDL was established in early architecture conversations, not as a versioned file — **if setting up a fresh database, the base schema from the original design doc must be applied before migrations 002–006.**

⚠️ **Outstanding**: migrations 002–006 have never been run against a real MySQL instance (no MySQL was available in the sandbox this was built in — every test used an in-memory mock DB matching the exact SQL strings). Run them, in order, before deploying.

---

## 6. Authentication & Security Model

- **JWT access token** (short-lived) carries only `{ sub: publicId, email, role }` — no internal id, no sensitive data.
- **Refresh token**: JWT with `{ sub: publicId, jti }`; the raw token is never stored — only its SHA-256 hash, in `refresh_tokens.token_hash`. Rotation revokes the old token and inserts the new one in a single transaction.
- **`resolveTeacherContext` middleware**: bridges the JWT's public UUID to the internal numeric `teacher_id` every repository needs, and re-checks the account is still `active` on every request (a token issued before suspension stops working immediately, not just at natural expiry).
- **Login failures are indistinguishable**: wrong password, unknown email, and suspended account all return the same generic message and status code. The real reason is recorded only in `login_audit_logs`.
- **Rate limiting**: global limiter (env-configurable) + stricter dedicated limiters for `/auth/login` and AI-cost endpoints (`aiLimiter`).
- **File uploads**: MIME allow-list + extension allow-list + size cap, re-validated server-side after Multer buffers the file (never trust the client's claimed MIME alone); filenames are sanitized and UUID-prefixed before ever touching the filesystem; all storage paths are re-validated to stay within the upload root (path traversal defense in depth).

---

## 7. AI Pipeline — How It Actually Works

### 7a. OCR (image source materials)
```
Python preprocess.py (orientation, RGB, resize, denoise, contrast)
  -> Claude Vision transcription (structured JSON, self-reported confidence)
  -> if confidence < threshold (CLAUDE_LEGIBILITY_THRESHOLD): exactly ONE self-correction pass
  -> still below threshold: status = 'failed_legibility', transcription stored anyway (honest [unclear] attempt, not discarded)
  -> success: status = 'processed', transcription stored
```
Infra failures (Claude rate limit/timeout, Python crash) are tracked as `status = 'error'` — **never** `failed_legibility`, since that status specifically means "Claude tried honestly and the image just isn't readable," not "something broke."

### 7b. Exam Generation
```
queued -> generating -> [Claude call, exactly 1 retry on transient failure] -> validate -> completed | failed
```
Validation rejects: missing sections, wrong question count, wrong total marks (checked two ways: declared total AND actual per-question sum), invalid JSON, and "blueprint mismatch" (a question's `type`/`difficulty` not present in the blueprint's declared distributions). **Validation failures are never retried** — only transient API-level failures get the single retry. On failure, `content_json` is left untouched (still the original queued placeholder) — a failed generation never risks showing a corrupted/partial exam.

### 7c. Background Worker
Two poll loops (`processing.worker.js`, `generation.worker.js`) reuse the *exact same services* the HTTP controllers use — zero duplicated business logic. A MySQL `GET_LOCK` advisory lock enforces a single running worker instance; the lock is tied to the connection's lifetime so a crashed process can't leave a stale lock. Claiming is two-step (peek via `findNextPendingForUpdate`/`findNextQueuedForUpdate`, then claim via the real service call) — safe only because of the single-instance guarantee.

---

## 8. Key Architectural Decisions (won't be repeated in future tasks unless changed here)

- **Never hallucinate** is enforced at the prompt level (explicit instructions in every Claude prompt) AND at the validation level (structural checks before persistence) — not just requested politely.
- **Soft delete only** — every tenant-owned table has `deleted_at`; nothing is ever hard-deleted.
- **UUID strategy**: internal PK = `INT`/`BIGINT AUTO_INCREMENT` (fast joins, no index fragmentation); public-facing id = UUIDv7 in a separate `public_id` column. Never expose the internal id.
- **Transactions never held open across a network call** (Claude API, Python subprocess, file I/O) — established in the original architecture doc and followed throughout.
- **API-level type granularity vs DB ENUM**: e.g. source material `sourceType` accepts `pdf`/`docx`/`image` at the API layer but maps onto the DB's fixed `file`/`image` ENUM — avoids ENUM migrations while keeping richer API semantics.
- **Content-quality failures vs infrastructure failures are always tracked with different status values** (`failed_legibility` vs `error`; validation failure vs Claude rate-limit) — this distinction has been load-bearing for debugging in every AI-related task.
- **Every module composes shared building blocks** rather than reimplementing them: `commonSchemas.js` for Joi fragments, `apiResponse.js` for response shape, `asyncHandler.js` for error propagation, the `errors/` hierarchy for semantic HTTP codes.

---

## 9. What's NOT Built Yet

- Frontend (React) — nothing exists yet.
- PDF/DOCX text extraction for `file`-type source materials (only images go through real OCR; pdf/docx uploads are accepted and stored but rejected by the AI pipeline with `UNSUPPORTED_SOURCE_TYPE` until this is implemented).
- Regeneration flow for `failed` generated exams (currently a dead end — a failed generation has no path back to `queued`).
- Non-Latin font support in PDF export (DejaVu Sans covers Latin Extended/Greek/Cyrillic; Devanagari/CJK would need an additional bundled font).
- Actual deployment/process-manager config for running `worker.js` continuously (PM2/systemd/separate container).
- Billing/subscription, email verification flow (teachers are created with `status: 'active'` directly, no verification step exists).

---

## 10. Testing Notes for Future Work

No real MySQL or real Anthropic API access was available in the sandbox this was built in. Every task was verified with:
- Hand-written in-memory mock DB modules matching exact SQL query strings (pattern-matched by SQL substring)
- A mock Anthropic client delegating to a test-controlled handler function
- Real HTTP requests against the actual Express app (not just unit-level function calls)

This caught real bugs during development (e.g., a Task 8→9 bug where infrastructure failures left records stuck in `processing` forever — found and fixed via this testing approach). **Before trusting this in production**: run the full migration chain against real MySQL and re-run equivalent integration tests against it; the mock-DB approach validates application logic thoroughly but cannot catch real SQL syntax errors, migration failures, or MySQL-specific behavior differences.

---

## 11. Task History (chronological)

1. Planning & business context
2. System architecture blueprint
3. Database schema (DDL)
4. Backend infrastructure (Express bootstrap, config, logging, error handling)
5. Security & validation foundation (JWT, bcrypt, rate limiting, Joi)
6. Auth module (register/login/refresh/logout)
7. Academic domain module (Subject, Source Material metadata)
8. Secure upload pipeline (Multer, file storage service)
9. Processing module (status state machine + row locking)
10. AI engine (Python preprocessing + Claude Vision OCR + legibility gatekeeper)
11. Exam blueprint & generation foundation (queue-only, no Claude call yet)
12. AI question generation engine (actual Claude call + validation + retry)
13. PDF export engine
14. Background worker (this document was written immediately after)

---

