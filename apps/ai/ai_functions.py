"""
Pure AI functions backed by Gemini. No FastAPI here so tools.py can import
without creating a circular dependency (main → runs → graph → tools → main).
"""
import asyncio
import io
import json
import os
from typing import AsyncIterator, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel
from pypdf import PdfReader

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
FLASH = "gemini-2.5-flash"
EMBED_MODEL = "gemini-embedding-001"


# ── models ────────────────────────────────────────────────────────────────────


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


def embed(text: str) -> list[float]:
    resp = client.models.embed_content(model=EMBED_MODEL, contents=text)
    return resp.embeddings[0].values


# ── parse-cv ──────────────────────────────────────────────────────────────────


def extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


_PARSE_PROMPT = """You are a CV parser. Extract structured data from the CV text below.
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


def parse_cv_text(text: str) -> ParsedCV:
    resp = client.models.generate_content(
        model=FLASH,
        contents=_PARSE_PROMPT + text[:12000],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    parsed = json.loads(resp.text)
    return ParsedCV(**parsed)


# ── score ─────────────────────────────────────────────────────────────────────


_SCORE_PROMPT = """You are a recruiter scoring how well a candidate's CV matches a job description.

Return ONLY valid JSON with this exact schema — no markdown, no explanation:
{{"score": <float 0.0-1.0>, "reasons": [<string>, <string>, <string>]}}

Score 1.0 = perfect match. Score 0.0 = no match.
Give exactly 3 concise reasons (each under 20 words).

JOB DESCRIPTION:
{job}

CV:
{cv}
"""


def score_cv(req: ScoreRequest) -> ScoreResponse:
    prompt = _SCORE_PROMPT.format(
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
    data = json.loads(resp.text)
    return ScoreResponse(
        score=max(0.0, min(1.0, float(data["score"]))),
        reasons=data["reasons"][:3],
    )


# ── cover letter ──────────────────────────────────────────────────────────────


_COVER_LETTER_PROMPT = """Write a concise, compelling cover letter for this job application.
Use a professional but warm tone. 3-4 paragraphs. Do NOT use placeholder brackets.

Job title: {title}
Company: {company}

Job description:
{job}

Candidate CV:
{cv}
"""


async def generate_cover_letter_chunks(req: CoverLetterRequest) -> AsyncIterator[str]:
    """Yields raw text chunks from Gemini (not SSE-wrapped)."""
    prompt = _COVER_LETTER_PROMPT.format(
        title=req.job_title,
        company=req.company,
        job=req.job_description[:3000],
        cv=req.cv_text[:5000],
    )
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
            yield chunk.text
