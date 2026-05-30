import json

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from ai_functions import (
    CoverLetterRequest,
    EmbedRequest,
    EmbedResponse,
    ParsedCV,
    ScoreRequest,
    ScoreResponse,
    _is_rate_limited,
    embed,
    extract_pdf_text,
    generate_cover_letter_chunks,
    parse_cv_text,
    score_cv,
)
from runs import router as agent_router

app = FastAPI(title="Job Hunt Copilot — AI")
app.include_router(agent_router, prefix="/agent")


# ── health ────────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok"}


# ── embed ─────────────────────────────────────────────────────────────────────


@app.post("/embed", response_model=EmbedResponse)
def embed_endpoint(req: EmbedRequest):
    return {"embedding": embed(req.text)}


# ── parse-cv ──────────────────────────────────────────────────────────────────


@app.post("/parse-cv", response_model=ParsedCV)
async def parse_cv(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    data = await file.read()
    text = extract_pdf_text(data)
    if not text:
        raise HTTPException(status_code=422, detail="Could not extract text from PDF")
    try:
        return parse_cv_text(text)
    except Exception as exc:
        if _is_rate_limited(exc):
            raise HTTPException(status_code=429, detail="Gemini rate limit reached — please retry in a few seconds") from exc
        raise HTTPException(status_code=502, detail=f"Could not parse Gemini response: {exc}") from exc


# ── score ─────────────────────────────────────────────────────────────────────


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    try:
        return score_cv(req)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not parse score response: {exc}") from exc


# ── draft-cover-letter (SSE stream) ───────────────────────────────────────────


@app.post("/draft-cover-letter")
async def draft_cover_letter(req: CoverLetterRequest):
    async def stream():
        async for chunk in generate_cover_letter_chunks(req):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
