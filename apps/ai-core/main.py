import os
import io
import json
import asyncio
from typing import Optional, AsyncIterator

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
FLASH = "gemini-2.5-flash"
EMBED_MODEL = "gemini-embedding-001"

app = FastAPI(title="Job Hunt Copilot — AI Core")


# ── health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── schemas ───────────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: list[float]

class Experience(BaseModel):
    title: str
    company: str
    duration: Optional[str] = None
    highlights: list[str] = []

class Education(BaseModel):
    degree: str
    institution: str
    year: Optional[str] = None

class ParsedCV(BaseModel):
    name: str
    email: Optional[str] = None
    summary: str
    skills: list[str]
    experience: list[Experience]
    education: list[Education]

class ScoreRequest(BaseModel):
    cv_text: str
    job_description: str

class ScoreResponse(BaseModel):
    score: float
    reasons: list[str]

class CoverLetterRequest(BaseModel):
    cv_text: str
    job_title: str
    job_description: str
    company: str


# ── embed ─────────────────────────────────────────────────────────────────────

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    resp = client.models.embed_content(
        model=EMBED_MODEL,
        contents=req.text,
    )
    return {"embedding": resp.embeddings[0].values}


# ── parse-cv ──────────────────────────────────────────────────────────────────

def _extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


PARSE_PROMPT = """You are a CV parser. Extract structured data from the CV text below.
Return ONLY valid JSON matching this schema exactly — no markdown, no explanation.

Schema:
{
  "name": string,
  "email": string | null,
  "summary": string (2-4 sentences),
  "skills": [string],
  "experience": [{"title": string, "company": string, "duration": string | null, "highlights": [string]}],
  "education": [{"degree": string, "institution": string, "year": string | null}]
}

CV text:
"""


@app.post("/parse-cv", response_model=ParsedCV)
async def parse_cv(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    data = await file.read()
    text = _extract_pdf_text(data)
    if not text:
        raise HTTPException(status_code=422, detail="Could not extract text from PDF")

    resp = client.models.generate_content(
        model=FLASH,
        contents=PARSE_PROMPT + text[:12000],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )

    try:
        parsed = json.loads(resp.text)
        return ParsedCV(**parsed)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not parse Gemini response: {exc}") from exc


# ── score ─────────────────────────────────────────────────────────────────────

SCORE_PROMPT = """You are a recruiter scoring how well a candidate's CV matches a job description.

Return ONLY valid JSON with this exact schema — no markdown, no explanation:
{{"score": <float 0.0-1.0>, "reasons": [<string>, <string>, <string>]}}

Score 1.0 = perfect match. Score 0.0 = no match.
Give exactly 3 concise reasons (each under 20 words).

JOB DESCRIPTION:
{job}

CV:
{cv}
"""


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    prompt = SCORE_PROMPT.format(
        job=req.job_description[:4000],
        cv=req.cv_text[:6000],
    )
    resp = client.models.generate_content(
        model=FLASH,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )
    try:
        data = json.loads(resp.text)
        return ScoreResponse(
            score=max(0.0, min(1.0, float(data["score"]))),
            reasons=data["reasons"][:3],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not parse score response: {exc}") from exc


# ── draft-cover-letter (SSE stream) ───────────────────────────────────────────

COVER_LETTER_PROMPT = """Write a concise, compelling cover letter for this job application.
Use a professional but warm tone. 3-4 paragraphs. Do NOT use placeholder brackets.

Job title: {title}
Company: {company}

Job description:
{job}

Candidate CV:
{cv}
"""


async def _stream_cover_letter(req: CoverLetterRequest) -> AsyncIterator[str]:
    prompt = COVER_LETTER_PROMPT.format(
        title=req.job_title,
        company=req.company,
        job=req.job_description[:3000],
        cv=req.cv_text[:5000],
    )

    # Run blocking SDK call in thread to not block the event loop
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content_stream(
            model=FLASH,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.7),
        ),
    )

    for chunk in response:
        if chunk.text:
            # SSE format: data: <payload>\n\n
            payload = json.dumps({"text": chunk.text})
            yield f"data: {payload}\n\n"

    yield "data: [DONE]\n\n"


@app.post("/draft-cover-letter")
async def draft_cover_letter(req: CoverLetterRequest):
    return StreamingResponse(
        _stream_cover_letter(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
