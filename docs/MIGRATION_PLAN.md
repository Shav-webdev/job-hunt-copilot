# Job Hunt Copilot — Free-Tier Deployment Migration Plan

**Status:** Draft v1 · 2026-05-16
**Owner:** Shavarsh Abrahamyan
**Target completion:** ~2–3 evenings of focused work (≈ 20–25 hrs)

---

## 1. Executive summary

Migrate Job Hunt Copilot from a 4-service Kubernetes/Tilt local setup to a $0/month production deployment composed of:

- **Vercel** (hobby) — `apps/web`
- **Render** (free) — `apps/api` (NestJS)
- **Render** (free) — `apps/ai` (new, merged from `apps/agent` + `apps/ai-core`)
- **Neon** (free) — Postgres + pgvector
- **No Redis, no Kubernetes, no Helm, no Tilt** in the production path

Two code-level changes underpin the plan:

1. **Merge** `apps/agent` and `apps/ai-core` into a single FastAPI app at `apps/ai`. They already share `python:3.12`, FastAPI, Gemini, and a uv-based toolchain.
2. **Replace Redis pub/sub** in agent streaming with an in-process `dict[run_id, asyncio.Queue]`. Redis was buying horizontal scalability we will not have on a 1-instance free tier.

The Helm umbrella chart, k3d cluster, Tiltfile, and Bitnami Redis remain in the repo as the **local development experience** — the migration does not delete them, only sidelines them from the production path.

---

## 2. Goals & success criteria

### 2.1 Goals

- **G1.** A publicly reachable URL where a stranger can register, upload a CV, run the agent, and receive a streamed cover letter.
- **G2.** Monthly recurring cost = $0 (Gemini API usage excluded — see §10.3).
- **G3.** Single-click redeploy on push to `main` for all three services.
- **G4.** No regression in the core feature set listed in §3.
- **G5.** A documented runbook (this document + a rollback section) so future-you can debug a 3 a.m. failure without re-deriving the architecture.

### 2.2 Explicit non-goals

- ❌ Horizontal scaling. One instance per service is fine.
- ❌ Multi-region. One region (closest to the user) is fine.
- ❌ Production-grade observability (Datadog, Sentry). Basic structured logs only.
- ❌ Removing the local k8s setup. It stays; only deployment leaves it.
- ❌ Custom domain. Vercel + Render default subdomains are acceptable for v1.

### 2.3 Acceptance test (end-to-end smoke)

Run after Phase 7. All must pass:

1. Open Vercel URL, register a new user with a unique email.
2. Upload a real PDF CV. Confirm `/profile` shows parsed name + skills.
3. Open `/chat`, run goal: *"Find 3 remote python jobs and save the best match."*
4. Observe live SSE events in the UI (`start`, `tool_start`, `tool_end`, `llm_chunk`, `done`).
5. Confirm at least one row appears in `/applications` with status `saved`.
6. From `/jobs`, click a job and trigger a cover-letter draft. Confirm it streams.
7. Cold-start a sleeping service (wait 16 min, then load), confirm UI shows a "waking…" banner and recovers within 90s.

---

## 3. In-scope feature set

The migration **must preserve** every feature currently shipped in `main`:

| Feature | Surface | Critical? |
|---|---|---|
| Email/password register + login | `POST /auth/register`, `POST /auth/login` | ✅ |
| Upload PDF CV → parsed JSON | `POST /cvs/upload` | ✅ |
| Get latest CV | `GET /cvs/latest` | ✅ |
| List / create / delete jobs | `/jobs` CRUD | ✅ |
| List / update applications | `/applications` CRUD | ✅ |
| Score CV vs job | `POST /jobs/:id/score` | ✅ |
| Stream cover letter | `POST /jobs/:id/cover-letter` | ✅ |
| Start agent run | `POST /agent/run` | ✅ |
| Stream agent events | `GET /agent/:runId/stream` | ✅ |
| Dashboard widgets (counts, recent apps) | `/dashboard` | ✅ |
| Application kanban statuses | `saved/applied/interview/rejected/offer` | ✅ |

---

## 4. Architecture — before vs. after

### 4.1 Before (current `main`)

```
┌────────────┐    HTTP     ┌────────────┐
│  Browser   │ ──────────▶ │  Next web  │ (k3d ingress)
└────────────┘             └──────┬─────┘
                                  │  proxy /api/proxy/*
                                  ▼
                          ┌──────────────┐
                          │  Nest API    │  ── Postgres (in-cluster)
                          └──────┬───────┘
                                 │ HTTP
                                 ▼
                      ┌──────────────────────┐
                      │  agent (Py + Redis)  │ ◀── pub/sub ──▶ Redis (Bitnami)
                      └──────────┬───────────┘
                                 │ HTTP
                                 ▼
                          ┌──────────────┐
                          │  ai-core (Py)│
                          └──────────────┘

All five orchestrated by Helm umbrella + Tilt + k3d.
```

### 4.2 After (production target)

```
┌────────────┐  HTTPS   ┌─────────────────┐
│  Browser   │ ───────▶ │  Next web       │  Vercel hobby
└────────────┘          │  (Route Handlers│
                        │   proxy /api/*) │
                        └────────┬────────┘
                                 │  HTTPS (cross-origin, cookied)
                                 ▼
                        ┌─────────────────┐
                        │  Nest API       │  Render free web
                        │  CORS=vercel    │  Dockerfile=docker/api.Dockerfile
                        └────────┬────────┘
                                 │ HTTPS (server-to-server)
                                 ▼
                        ┌─────────────────┐
                        │  ai (Py merged) │  Render free web
                        │  /score /parse  │  Dockerfile=docker/ai.Dockerfile (new)
                        │  /agent/run     │
                        │  /agent/:id/    │
                        │     stream      │
                        └─────────────────┘

   Postgres + pgvector : Neon (serverless, free)
   In-process queues   : per-process dict[run_id, asyncio.Queue]
   No Redis. No k8s.   :
```

The agent SSE endpoint moves into the merged `apps/ai` service. The Nest API proxies the start-run call but no longer needs to know about Redis or the agent's transport — it just forwards.

---

## 5. Requirements

### 5.1 Functional requirements

- **FR-1.** Web app must authenticate against the Nest API via NextAuth Credentials provider.
- **FR-2.** Cross-origin cookies must work (Vercel ↔ Render).
- **FR-3.** Agent run events must reach the browser as Server-Sent Events with the same event shape: `{type, message, data}`.
- **FR-4.** PDF uploads up to 4 MB must succeed.
- **FR-5.** All routes that existed locally must exist in production with identical request/response shapes.

### 5.2 Non-functional requirements

- **NFR-1. Cost** ≤ $0/month for hosting (Gemini usage is a separate concern).
- **NFR-2. Cold start** of a single service ≤ 90s. End-to-end first request after total idle ≤ 180s.
- **NFR-3. Warm latency** of `/dashboard` API call < 500ms (subjective).
- **NFR-4. Secrets** never committed; loaded from each platform's secret store.
- **NFR-5. Logs** for every service must be inspectable via the platform UI (Render Logs tab, Vercel Logs).
- **NFR-6. Reproducible builds** — every deploy must come from a tagged git commit.

### 5.3 Operational requirements

- **OR-1.** Drizzle migrations must run automatically on Nest API boot, or be runnable via a one-command Render shell.
- **OR-2.** Gemini API key rotation must be possible without code changes.
- **OR-3.** Re-deploy of any single service must not require redeploy of the others.
- **OR-4.** A rollback path must exist for each phase (see §11).

### 5.4 Constraints

- **C-1.** Render free web service: 512 MB RAM, 0.1 CPU, sleeps after 15 min, ~60s cold start, 750 instance-hours/month/account.
- **C-2.** Vercel hobby: 10s function timeout, ~4.5 MB request body limit, 100 GB bandwidth/mo.
- **C-3.** Neon free: 0.5 GB storage, 191.9 compute hours/month (autosuspend after 5 min idle).
- **C-4.** Gemini free tier: ~20 requests/day on `gemini-2.5-flash`.

---

## 6. Phase plan

Ten phases. Each is independently mergeable. Don't start phase *N+1* until phase *N*'s acceptance criteria pass.

| # | Phase | Effort | Blocking? |
|---|---|---|---|
| 0 | Pre-flight & accounts | 0.5h | yes |
| 1 | Codebase refactor: merge Python services | 4–6h | yes |
| 2 | Drop Redis, switch to in-process queues | 2h | yes |
| 3 | Local validation of refactor | 2h | yes |
| 4 | Database: Neon + Drizzle migrations | 1h | yes |
| 5 | Deploy `api` to Render | 2–3h | yes |
| 6 | Deploy `ai` to Render | 1–2h | yes |
| 7 | Deploy `web` to Vercel + wire it all up | 1h | yes |
| 8 | End-to-end validation & bugfix | 2h | yes |
| 9 | Hardening (CORS, errors, cold-start UX) | 3–4h | no |
| 10 | Observability & cleanup | 2h | no |

---

### Phase 0 — Pre-flight & accounts

**Goal.** Make sure every external account exists and has the necessary capabilities *before* writing any code.

**Pre-conditions.** Nothing.

**Tasks.**
- [ ] Verify Vercel account is connected to GitHub (org-level access to `Shav-webdev`).
- [ ] Verify Neon project exists. Note the **connection string** with `?sslmode=require`.
- [ ] Enable `pgvector` on Neon: in SQL Editor run `CREATE EXTENSION IF NOT EXISTS vector;`.
- [ ] Create a Render account. Connect GitHub.
- [ ] Get a Gemini API key from Google AI Studio. **Store in a password manager.**
- [ ] Create a working git branch: `git checkout -b feat/free-tier-deploy`.

**Deliverables.** A `secrets/.env.prod.notes` (gitignored) with: Neon URL, Gemini key, planned subdomain names (e.g. `jobhunt-api`, `jobhunt-ai`).

**Acceptance criteria.**
- `psql "$NEON_URL" -c "SELECT extname FROM pg_extension WHERE extname='vector';"` returns a row.
- `curl -H "x-goog-api-key: $GEMINI_KEY" https://generativelanguage.googleapis.com/v1beta/models` returns 200.

**Risk.** Low.

---

### Phase 1 — Merge Python services into `apps/ai`

**Goal.** One Python FastAPI application that exposes both the AI Core endpoints (`/embed`, `/parse-cv`, `/score`, `/draft-cover-letter`) and the agent endpoints (`/agent/run`, `/agent/{id}/stream`).

**Pre-conditions.** Phase 0 complete.

**Tasks.**
- [ ] `mkdir apps/ai && cd apps/ai`
- [ ] Create new `apps/ai/pyproject.toml` that is the **union** of both existing files:
  - From ai-core: `fastapi`, `google-genai`, `pgvector`, `psycopg[binary]`, `pypdf`, `python-multipart`, `sse-starlette`, `uvicorn`.
  - From agent: `httpx`, `langchain-core`, `langchain-google-genai`, `langgraph`, `feedparser`.
  - **Drop**: `redis` (no longer needed).
- [ ] Move `apps/ai-core/main.py` to `apps/ai/main.py`. It becomes the *base* FastAPI app.
- [ ] Move `apps/agent/graph.py` → `apps/ai/graph.py`. Move `apps/agent/tools.py` → `apps/ai/tools.py`. Update imports.
- [ ] In `apps/ai/main.py`, add a new module `runs.py` (see Phase 2) and wire two new routes:
  ```python
  from runs import start_run, stream_run
  app.include_router(start_run.router, prefix="/agent")
  app.include_router(stream_run.router, prefix="/agent")
  ```
- [ ] Generate a single lockfile: `cd apps/ai && uv lock`.
- [ ] Write `docker/ai.Dockerfile` (copy `docker/ai-core.Dockerfile`, change all `ai-core` → `ai`, keep `EXPOSE 8000`).
- [ ] **Keep** the old `apps/agent`, `apps/ai-core`, and their Dockerfiles — they're still used by Tilt for local dev. Don't delete in this phase.

**File-level changes.**

```
apps/
├── agent/          (unchanged — local-dev only)
├── ai-core/        (unchanged — local-dev only)
├── ai/             NEW — used in production
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── main.py
│   ├── graph.py
│   ├── tools.py
│   └── runs.py     (Phase 2)
└── ...
docker/
├── ai.Dockerfile   NEW
└── ...
```

**Acceptance criteria.**
- `cd apps/ai && uv sync --frozen` succeeds.
- `uv run uvicorn main:app --port 8000` boots, `/health` returns `{"status":"ok"}`.
- `/embed`, `/parse-cv`, `/score`, `/draft-cover-letter` still resolve (200/422 with valid payload).

**Risk.** Medium — dependency conflicts between `google-genai` (used by ai-core) and `langchain-google-genai` (used by agent) are the most likely surprise. Mitigation: lock to the versions currently in each pyproject; bump only if uv refuses to resolve.

**Rollback.** Discard the new `apps/ai` directory and the Dockerfile. The original two services are untouched.

---

### Phase 2 — Replace Redis pub/sub with in-process queues

**Goal.** A run's events flow from the background `asyncio.create_task` directly to the SSE consumer, with no external broker.

**Pre-conditions.** Phase 1 complete.

**Tasks.**
- [ ] Create `apps/ai/runs.py`:

  ```python
  import asyncio, json, uuid
  from typing import AsyncIterator
  from fastapi import APIRouter, HTTPException
  from fastapi.responses import StreamingResponse
  from pydantic import BaseModel
  from graph import run_agent

  RUNS: dict[str, asyncio.Queue[str]] = {}

  async def publish(run_id: str, event_type: str, message: str, data: dict | None = None):
      q = RUNS.get(run_id)
      if not q: return
      await q.put(json.dumps({"type": event_type, "message": message, "data": data or {}}))

  class RunRequest(BaseModel):
      goal: str
      user_id: str
      api_token: str

  router = APIRouter()

  @router.post("/run")
  async def start_run(req: RunRequest):
      run_id = str(uuid.uuid4())
      RUNS[run_id] = asyncio.Queue()
      asyncio.create_task(run_agent(run_id, req.goal, req.user_id, req.api_token, publish))
      return {"run_id": run_id}

  @router.get("/{run_id}/stream")
  async def stream_run(run_id: str):
      q = RUNS.get(run_id)
      if not q: raise HTTPException(404, "Run not found or already consumed")
      async def gen() -> AsyncIterator[str]:
          try:
              while True:
                  data = await asyncio.wait_for(q.get(), timeout=180)
                  yield f"data: {data}\n\n"
                  event = json.loads(data)
                  if event.get("type") in ("done", "error"):
                      break
          except asyncio.TimeoutError:
              yield 'data: {"type":"error","message":"stream timeout"}\n\n'
          finally:
              RUNS.pop(run_id, None)
      return StreamingResponse(gen(), media_type="text/event-stream",
                               headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
  ```

- [ ] Edit `apps/ai/graph.py`: change `run_agent` signature from `(run_id, goal, user_id, api_token, redis)` to `(run_id, goal, user_id, api_token, publish_fn)`. Replace every `await redis.publish(...)` with `await publish_fn(run_id, event_type, message, data)`. Delete the `payload = json.dumps(...)` line.
- [ ] Edit `apps/ai/tools.py`: remove the `AI_CORE_URL` constant. All internal AI calls (`/score`, `/draft-cover-letter`) now live in *this same process* — call them via `httpx` against `http://localhost:8000` **or** refactor them to direct in-process function calls. **Recommendation: direct calls** — import the handler functions and `await` them. This eliminates one network hop and a class of failure modes.

  ```python
  # Before
  r = await client.post(f"{AI_CORE_URL}/score", json={...})
  return r.text
  # After
  from main import score   # imports the FastAPI handler function
  res = await score(ScoreRequest(cv_text=..., job_description=...))
  return res.model_dump_json()
  ```

- [ ] In `apps/ai/main.py`, remove `import redis.asyncio` and the `@app.on_event("startup")` / `shutdown` Redis lifecycle.

**Acceptance criteria.**
- A POST to `/agent/run` returns a `run_id`.
- An immediate GET to `/agent/{run_id}/stream` produces events ending in `{"type":"done"}` or `{"type":"error"}`.
- No `redis` import remains in `apps/ai/`.
- `grep -r "redis" apps/ai/` returns nothing.

**Risk.** Medium. The browser must open the stream *quickly* after the POST returns or the first events may arrive before any subscriber. Mitigation: the queue is created **before** `asyncio.create_task` runs, so events are buffered. Add a small `await asyncio.sleep(0)` in `start_run` to be safe.

**Rollback.** Revert this commit. Phase 1's Python merge is independently valuable.

---

### Phase 3 — Local validation of the refactor

**Goal.** Catch refactor bugs locally before touching any cloud platform.

**Pre-conditions.** Phases 1 and 2 complete.

**Tasks.**
- [ ] Boot Postgres locally (Docker is fine: `docker run -d --name jh-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 pgvector/pgvector:pg16`).
- [ ] `cd apps/api && pnpm install && DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres pnpm db:migrate && pnpm start:dev`.
- [ ] `cd apps/ai && uv sync && GEMINI_API_KEY=... uv run uvicorn main:app --port 8000`.
- [ ] `cd apps/web && API_URL=http://localhost:3000 AUTH_SECRET=$(openssl rand -base64 32) pnpm dev`.
- [ ] In the browser: register, upload CV, run agent, verify streaming.
- [ ] **Critical:** disconnect Redis entirely. There should be no Redis process running. If the app works, the refactor is sound.

**Acceptance criteria.** All 7 steps of §2.3 acceptance test pass on `localhost`.

**Risk.** Low. Anything broken here is found cheaply.

**Rollback.** Same as Phase 2.

---

### Phase 4 — Database: Neon + Drizzle migrations

**Goal.** Production schema lives on Neon, migrations are reproducible.

**Pre-conditions.** Phase 3 passed.

**Tasks.**
- [ ] Create a Neon project (or reuse). Name the database `jobhunt`.
- [ ] In Neon SQL Editor: `CREATE EXTENSION IF NOT EXISTS vector;`.
- [ ] Locally: `cd apps/api && DATABASE_URL="$NEON_URL" pnpm db:migrate`.
- [ ] Verify in Neon Tables UI: `users`, `cvs`, `jobs`, `applications` exist with the expected columns.
- [ ] (Optional) seed one test user via `psql` for smoke-testing later.
- [ ] Edit `apps/api/src/main.ts` to call `runMigrations()` on boot, **only when** `process.env.RUN_MIGRATIONS_ON_BOOT === 'true'`. (We'll set this to `false` for normal boots; set to `true` only when shipping a schema change.)

**Acceptance criteria.**
- Tables exist on Neon, all columns match the schema in `apps/api/src/database/schema.ts`.
- `SELECT extname FROM pg_extension WHERE extname='vector';` returns a row.

**Risk.** Low. Drizzle migrations are deterministic.

**Rollback.** Drop the Neon database and re-create. No production traffic yet.

---

### Phase 5 — Deploy `api` to Render

**Goal.** A public HTTPS URL serving the Nest API, backed by Neon.

**Pre-conditions.** Phase 4 complete.

**Tasks.**
- [ ] In Render dashboard: **New → Web Service → Connect repo `job-hunt-copilot`**.
- [ ] Settings:
  - Name: `jobhunt-api`
  - Region: closest to your users (e.g. Frankfurt).
  - Branch: `main`.
  - **Root Directory: `.`** (repo root — pnpm workspaces need it).
  - Runtime: **Docker**.
  - Dockerfile Path: `docker/api.Dockerfile`.
  - Docker Build Context: `.`.
  - Docker Command: leave blank (use Dockerfile `CMD`).
  - Instance Type: **Free**.
  - **Build filter**: only redeploy when `apps/api/**` or `packages/**` or `docker/api.Dockerfile` changes.
- [ ] Environment variables (Render → Environment):
  - `DATABASE_URL` → Neon URL with `?sslmode=require`
  - `JWT_SECRET` → `openssl rand -base64 32`
  - `AI_URL` → leave empty for now; set in Phase 6
  - `WEB_URL` → leave empty for now; set in Phase 7
  - `NODE_ENV=production`
  - `PORT=3000`
  - `RUN_MIGRATIONS_ON_BOOT=false`
- [ ] **CORS**: edit `apps/api/src/main.ts`:
  ```ts
  app.enableCors({
    origin: [process.env.WEB_URL, /\.vercel\.app$/].filter(Boolean),
    credentials: true,
  });
  ```
- [ ] **Health check path**: `/health` (Nest needs a `GET /health` returning 200 — add it to `AppController` if missing). Render uses this to detect a healthy boot.
- [ ] Commit, push, watch the build log.

**Acceptance criteria.**
- Render deploys without errors.
- `curl https://jobhunt-api.onrender.com/health` returns 200.
- `POST /auth/register` with a fresh email creates a row in Neon's `users` table.
- Cold-start budget after first 15-min idle: < 90 seconds.

**Risk.** Medium.
- **The api Dockerfile uses `node:24-alpine`** — confirm Render supports it. If not, downgrade to `node:22`.
- **pnpm workspace install** in Docker can be slow on Render's 0.1 CPU. Build minute budget is 500/mo — first build may take 5–10 min.

**Rollback.** Delete the Render service. No DNS, no callers — zero blast radius.

---

### Phase 6 — Deploy `ai` to Render

**Goal.** A public HTTPS URL serving the merged Python service.

**Pre-conditions.** Phase 5 deployed and healthy.

**Tasks.**
- [ ] Render → **New → Web Service**.
- [ ] Settings:
  - Name: `jobhunt-ai`
  - Region: **same as `jobhunt-api`** (critical — cross-region adds ~50ms per hop).
  - Branch: `main`.
  - Root Directory: `.`.
  - Dockerfile Path: `docker/ai.Dockerfile`.
  - Instance Type: **Free**.
  - Build filter: only redeploy on `apps/ai/**` or `docker/ai.Dockerfile`.
- [ ] Environment variables:
  - `GEMINI_API_KEY` → from Phase 0
  - `API_URL` → `https://jobhunt-api.onrender.com` (from Phase 5)
  - `PORT=8000`
- [ ] **Health check path**: `/health` (already exists).
- [ ] After successful deploy, go back to `jobhunt-api` and set `AI_URL=https://jobhunt-ai.onrender.com`. Trigger a manual redeploy of the API.

**Acceptance criteria.**
- `curl https://jobhunt-ai.onrender.com/health` returns 200.
- `curl -X POST https://jobhunt-ai.onrender.com/embed -H 'Content-Type: application/json' -d '{"text":"hello"}'` returns an embedding array.

**Risk.** Medium.
- **uv inside Docker** needs internet to fetch wheels on first build — fine on Render.
- **Gemini quota** — the first `/embed` test call counts toward your daily 20.

**Rollback.** Delete the Render service. The API will fail open on `AI_URL=undefined` calls until you reset.

---

### Phase 7 — Deploy `web` to Vercel

**Goal.** Public URL where end-users sign in.

**Pre-conditions.** Phases 5 and 6 deployed and healthy.

**Tasks.**
- [ ] Vercel dashboard → **Add New Project → Import Git Repo**.
- [ ] Framework: Next.js.
- [ ] **Root Directory: `apps/web`**.
- [ ] Build & Output:
  - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
  - Build Command: `cd ../.. && pnpm --filter web build`
  - Output Directory: `.next`
- [ ] Environment variables (set for **Production** only):
  - `AUTH_SECRET` → `openssl rand -base64 32`
  - `AUTH_TRUST_HOST=true`
  - `NEXTAUTH_URL=https://<your-project>.vercel.app`
  - `API_URL=https://jobhunt-api.onrender.com`
- [ ] Deploy.
- [ ] After successful deploy, go to `jobhunt-api` env vars and set `WEB_URL=https://<your-project>.vercel.app`. Redeploy the API so CORS picks it up.

**Critical NextAuth quirk.** Because the web app calls the Render API from the *server side* (the `(auth)/login/actions.ts` and proxy routes), cookies don't cross-domain — that's fine. But the call from the **browser** to the SSE proxy (`/api/proxy/agent/[runId]/stream`) goes through Vercel, then server-to-server to Render. Make sure both hops set `Cache-Control: no-cache` (already done in the existing proxy).

**Acceptance criteria.**
- Vercel URL loads.
- Login redirects.
- Register form creates a user in Neon.
- Dashboard renders without console errors.

**Risk.** Medium.
- **NextAuth + workspaces** on Vercel: monorepo build sometimes confuses the framework auto-detection. Manually setting `installCommand`/`buildCommand` (above) avoids it.
- **PNPM lockfile drift**: `--frozen-lockfile` will fail if `pnpm-lock.yaml` doesn't match. Run `pnpm install` locally and commit before deploying.

**Rollback.** Vercel keeps every previous deployment. One-click rollback in the UI.

---

### Phase 8 — End-to-end validation & bugfix

**Goal.** All 7 steps of the §2.3 acceptance test pass on the public URLs.

**Pre-conditions.** Phase 7 complete.

**Tasks.**
- [ ] Run §2.3 from a fresh browser profile (no cookies).
- [ ] Run from a phone on cellular (different IP, more realistic).
- [ ] Time the cold-start path: warm everything, wait 16 minutes, time the first agent run.
- [ ] Fix everything broken. Common ones:
  - `401 Unauthorized` on `/cvs/upload` → check `AUTH_TRUST_HOST` and session cookie scope.
  - SSE stream cuts at ~30s → Render free has no SSE-specific limit but timeouts can bite; check the agent's iteration cap.
  - `502 Bad Gateway` on first agent run after idle → confirmed cold-start, add the UI banner (see Phase 9).
  - `pgvector` errors on `/embed` → re-run `CREATE EXTENSION vector;` on Neon (it's per-database).

**Acceptance criteria.** §2.3 passes twice in a row from a cold cellular client.

**Risk.** Medium. This is the phase where surprises live.

**Rollback.** Per-service Render rollback + Vercel rollback.

---

### Phase 9 — Hardening (recommended, not blocking)

**Goal.** Make the deployment survive a recruiter reading your portfolio at 3 a.m.

**Tasks (pick what's worth your time).**
- [ ] **Cold-start banner.** In `apps/web/src/app/(dashboard)/chat/page.tsx`, before `handleRun`, ping `/api/proxy/agent/health` (a new lightweight endpoint that calls `https://jobhunt-ai.onrender.com/health`). If the first ping takes > 5s, show "Waking the agent — this can take up to a minute on first use." This sets expectations and pre-warms the service.
- [ ] **Gemini score cache.** Add a Drizzle table `scores(cv_id, job_id, score, reasons, created_at, primary key (cv_id, job_id))`. In `apps/api/src/jobs/jobs.service.ts`, check the cache before calling `/score`. Saves quota.
- [ ] **Per-IP rate limit on `/agent/run`.** Add `@nestjs/throttler` to limit to 5/hour/IP. Prevents a bored recruiter from burning the Gemini quota.
- [ ] **Demo mode.** Pre-seed `demo@jobhunt.app` with a sample CV and 3 saved jobs. Add a "Try as guest" button on `/login` that signs in as this user. Mark the user with `is_demo=true` and block destructive writes.
- [ ] **Better Gemini error UX.** The `_friendly_error` function already exists in `graph.py` — make sure it's also called for `/score` and `/parse-cv` endpoints.
- [ ] **CSP headers** on Vercel (Next config).
- [ ] **HTTPS-only cookies** in `apps/web/src/auth.ts` (`cookies.sessionToken.options.secure = true` in production).

**Acceptance criteria.** Per-item, subjective.

**Risk.** Low — additive.

---

### Phase 10 — Observability & cleanup

**Goal.** Future-you can debug without re-reading this doc.

**Tasks.**
- [ ] Add a `README.md` at the repo root: what the project does, screenshot, "Try it" link to Vercel, "Run locally" pointing at `tilt up`, link to this doc.
- [ ] Add a `docs/RUNBOOK.md`: common failures, where logs live, how to redeploy, how to rotate secrets.
- [ ] Set up free uptime checks: [UptimeRobot](https://uptimerobot.com/) on the three URLs. Even with sleep, the check itself wakes the service — accept this trade-off or disable it.
- [ ] Tag the commit: `git tag v1.0.0-prod && git push --tags`.
- [ ] Remove `infra/charts`, `infra/k3d`, `infra/tilt`, `Tiltfile`, `docker/agent.Dockerfile`, `docker/ai-core.Dockerfile`, `apps/agent`, `apps/ai-core` **only if you're sure** you don't need the local Tilt environment. Otherwise leave them.
- [ ] Update the portfolio case-study page's `url` from `/projects/job-hunt-copilot` to the Vercel URL when you're confident it's stable.

**Acceptance criteria.** A friend can clone the repo and either run locally or read enough to redeploy.

---

## 7. Environment variable reference

| Variable | Where set | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | Render `jobhunt-api` | `postgres://user:pass@ep-xxx.eu-central-1.aws.neon.tech/jobhunt?sslmode=require` | Neon connection string with `?sslmode=require` |
| `JWT_SECRET` | Render `jobhunt-api` | `openssl rand -base64 32` | Sign user JWTs |
| `AI_URL` | Render `jobhunt-api` | `https://jobhunt-ai.onrender.com` | Server-to-server |
| `WEB_URL` | Render `jobhunt-api` | `https://your-project.vercel.app` | For CORS |
| `RUN_MIGRATIONS_ON_BOOT` | Render `jobhunt-api` | `false` (`true` only when shipping a schema change) | |
| `PORT` | Render `jobhunt-api` | `3000` | |
| `NODE_ENV` | Render `jobhunt-api` | `production` | |
| `GEMINI_API_KEY` | Render `jobhunt-ai` | `AIza...` | From Google AI Studio |
| `API_URL` | Render `jobhunt-ai` | `https://jobhunt-api.onrender.com` | For agent's `make_tools` |
| `PORT` | Render `jobhunt-ai` | `8000` | |
| `AUTH_SECRET` | Vercel `web` | `openssl rand -base64 32` | NextAuth |
| `AUTH_TRUST_HOST` | Vercel `web` | `true` | NextAuth behind a proxy |
| `NEXTAUTH_URL` | Vercel `web` | `https://your-project.vercel.app` | Callback URL |
| `API_URL` | Vercel `web` | `https://jobhunt-api.onrender.com` | Server-side fetches |

---

## 8. File-level change manifest

New files:
- `apps/ai/pyproject.toml`
- `apps/ai/uv.lock`
- `apps/ai/main.py`
- `apps/ai/graph.py`
- `apps/ai/tools.py`
- `apps/ai/runs.py`
- `docker/ai.Dockerfile`
- `docs/MIGRATION_PLAN.md` (this file)
- `docs/RUNBOOK.md` (Phase 10)
- `README.md` (Phase 10)

Modified files:
- `apps/api/src/main.ts` — CORS, health check, optional `RUN_MIGRATIONS_ON_BOOT`
- `apps/api/src/app.controller.ts` — add `GET /health` if absent
- `apps/web/src/auth.ts` — `cookies.sessionToken.options.secure` in prod
- `apps/web/next.config.ts` — CSP headers (optional)

Unchanged (kept for local dev):
- `apps/agent/**`, `apps/ai-core/**`, their Dockerfiles
- `infra/**`, `Tiltfile`

---

## 9. Cross-cutting concerns

### 9.1 Secrets

- Never commit anything matching `.env*` (already in `.gitignore`).
- Vercel and Render both have first-class secret stores. Use them.
- Rotate `JWT_SECRET` only with a deliberate logout of every active user (changing it invalidates sessions).

### 9.2 CORS

The Vercel domain calls the Render API from a browser only for the *session-bearing* proxy routes; everything else is server-to-server. Still, set CORS as in Phase 5, **and** include a regex for preview deployments: `/\.vercel\.app$/`.

### 9.3 Cookies

NextAuth issues a `next-auth.session-token` cookie scoped to the Vercel domain. The Render API never sees it — instead, the Vercel server attaches a Bearer token (from `session.accessToken`) when proxying. This is already the pattern in `apps/web/src/proxy.ts`. **Do not change it.**

### 9.4 Vercel build size

`pnpm install` at repo root pulls all workspace deps including Python… actually no, pnpm only pulls Node deps. But `node_modules` is large (NestJS + Next + React). If Vercel build exceeds the limit, switch to `pnpm install --filter web... --frozen-lockfile`.

### 9.5 Cold-start choreography

Order of warm-up matters: when a user hits Vercel:
1. Vercel function spins up (instant).
2. The first `/api/proxy/*` call hits Render API. If sleeping → 60s.
3. The Render API calls `/agent/run` on Render AI. If sleeping → 60s.
4. Agent calls back into the API for `/cvs/latest`. API now warm → fast.

Worst case is **120s** before the user sees the first event. The Phase 9 cold-start banner mitigates perception.

---

## 10. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Gemini free quota (20 req/day) exhausted by demo traffic | High | Medium | Per-IP rate limit + score cache (Phase 9). Worst case: pay $5/mo. |
| R-2 | Render service exceeds 750 instance hours/month | Low | High | Sleep helps. Worst case: pay $7/mo per service. |
| R-3 | Neon autosuspend → cold query (~3s) | High | Low | Acceptable. The Render service is the bigger latency hit. |
| R-4 | NextAuth callback URL misconfigured → infinite redirect | Medium | High | Test in Phase 7. Vercel preview env vars must include `NEXTAUTH_URL`. |
| R-5 | `pgvector` extension not enabled → `/embed` 500s | Medium | Medium | Phase 0 acceptance check catches it. |
| R-6 | `--frozen-lockfile` fails on Vercel | Medium | Medium | Always `pnpm install && git commit` before push. |
| R-7 | Render Dockerfile build > 500 min/mo budget | Low | High | Only redeploy on relevant path changes (build filters in Phase 5/6). |
| R-8 | Browser SSE connection drops on cellular | Medium | Low | Existing `try/finally` in chat page reconnects cleanly. |
| R-9 | The merged `apps/ai` Python deps don't resolve | Medium | High | Lock per Phase 1. Roll back if uv can't solve. |
| R-10 | A bored visitor abuses the agent | High | Low | Rate limit (Phase 9). Cap iterations (already exists, =10). |

---

## 11. Rollback plan

**Per-phase rollback** is described in each phase. **Whole-migration rollback:**

1. In Vercel: Project → Deployments → previous good deploy → "Promote to Production." Vercel preserves history forever.
2. In Render: Service → Deploys → previous good deploy → "Redeploy." Or scale instance to 0.
3. In Neon: if you've corrupted data, restore from the branch you created in Phase 0 (Neon's branching is the rollback mechanism — `neonctl branch create --name backup-pre-migrate` before destructive changes).
4. Worst case: keep the `infra/charts` Helm stack functional so a Kubernetes redeploy remains an option.

**No DNS to flip.** All endpoints are platform subdomains, so rollback is per-platform, not coordinated.

---

## 12. Appendix A — useful one-liners

```bash
# Phase 0 — sanity-check Neon
psql "$NEON_URL" -c "SELECT version();"

# Phase 4 — apply migrations to Neon from your laptop
cd apps/api && DATABASE_URL="$NEON_URL" pnpm db:migrate

# Phase 5 — tail Render logs
# (Render UI only; no CLI on free tier. Bookmark the Logs tab.)

# Phase 6 — manually probe the AI service from Render shell
curl -s https://jobhunt-ai.onrender.com/health

# Phase 7 — local Vercel build test (catches issues before push)
cd apps/web && pnpm build
```

## 13. Appendix B — Render service settings cheat-sheet

| Field | `jobhunt-api` | `jobhunt-ai` |
|---|---|---|
| Region | same as Vercel edge | same as `jobhunt-api` |
| Branch | `main` | `main` |
| Root Directory | `.` | `.` |
| Runtime | Docker | Docker |
| Dockerfile Path | `docker/api.Dockerfile` | `docker/ai.Dockerfile` |
| Docker Build Context | `.` | `.` |
| Health Check Path | `/health` | `/health` |
| Auto-Deploy | Yes (filtered) | Yes (filtered) |
| Build filter (paths) | `apps/api/**`, `docker/api.Dockerfile`, `pnpm-lock.yaml`, `package.json` | `apps/ai/**`, `docker/ai.Dockerfile` |
| Instance Type | Free | Free |

---

## 14. Done definition

Migration is considered complete when:

- [ ] All 10 phases pass acceptance criteria.
- [ ] §2.3 end-to-end smoke test passes from a cellular cold client.
- [ ] `docs/RUNBOOK.md` and root `README.md` exist.
- [ ] The portfolio's `src/data/projects.ts` entry for `job-hunt-copilot` has `url` updated to the live Vercel URL.
- [ ] A `v1.0.0-prod` git tag exists.
- [ ] You can describe the production architecture in two sentences without looking it up.
