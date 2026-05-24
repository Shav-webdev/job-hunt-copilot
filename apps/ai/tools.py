import json
import os

import feedparser
import httpx
from langchain_core.tools import tool

from ai_functions import (
    CoverLetterRequest,
    ScoreRequest,
    generate_cover_letter_chunks,
    score_cv,
)

API_URL = os.environ.get("API_URL", "http://jobhunt-api:3000")

JOB_RSS_FEEDS = [
    "https://remoteok.com/remote-jobs.rss",
    "https://weworkremotely.com/remote-jobs.rss",
]


def make_tools(api_token: str):
    auth_headers = {"Authorization": f"Bearer {api_token}"}

    @tool
    async def get_my_cv() -> str:
        """Fetch the user's CV text. Always call this first before scoring or drafting."""
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{API_URL}/cvs/latest", headers=auth_headers)
        if not r.is_success:
            return "No CV found. The user needs to upload their CV first."
        cv = r.json()
        return cv.get("rawText") or "CV found but no text could be extracted."

    @tool
    async def search_jobs(query: str, limit: int = 10) -> str:
        """Search public job RSS feeds for remote jobs matching a query.
        Returns a JSON list of {title, company, url, description}."""
        jobs: list[dict] = []
        async with httpx.AsyncClient(timeout=20) as client:
            for feed_url in JOB_RSS_FEEDS:
                try:
                    resp = await client.get(feed_url, follow_redirects=True)
                    feed = feedparser.parse(resp.text)
                    for entry in feed.entries:
                        title = entry.get("title", "")
                        if (
                            query.lower() not in title.lower()
                            and query.lower() not in entry.get("summary", "").lower()
                        ):
                            continue
                        jobs.append({
                            "title": title,
                            "company": entry.get(
                                "author",
                                entry.get("tags", [{}])[0].get("term", "Unknown")
                                if entry.get("tags")
                                else "Unknown",
                            ),
                            "url": entry.get("link", ""),
                            "description": entry.get("summary", "")[:600],
                        })
                        if len(jobs) >= limit:
                            break
                except Exception:
                    continue
                if len(jobs) >= limit:
                    break

        if not jobs:
            return json.dumps({"error": f"No jobs found for '{query}'. Try a broader query."})
        return json.dumps(jobs)

    @tool
    async def score_job(cv_text: str, job_description: str) -> str:
        """Score how well the CV matches a job. Returns {score: 0-1, reasons: [...]}."""
        req = ScoreRequest(cv_text=cv_text[:5000], job_description=job_description[:3000])
        result = score_cv(req)
        return result.model_dump_json()

    @tool
    async def save_application(
        job_title: str, company: str, job_url: str, notes: str = ""
    ) -> str:
        """Save a job and create an application entry in the database."""
        async with httpx.AsyncClient(timeout=15) as client:
            job_r = await client.post(
                f"{API_URL}/jobs",
                headers=auth_headers,
                json={
                    "title": job_title,
                    "company": company,
                    "url": job_url or "https://example.com",
                    "description": notes,
                },
            )
            if not job_r.is_success:
                return f"Failed to save job: {job_r.text[:200]}"
            job_id = job_r.json()["id"]

            app_r = await client.post(
                f"{API_URL}/applications",
                headers=auth_headers,
                json={"jobId": job_id, "status": "saved", "notes": notes},
            )
        if not app_r.is_success:
            return f"Failed to save application: {app_r.text[:200]}"
        return f"Saved: {job_title} at {company} (id: {job_id})"

    @tool
    async def draft_cover_letter(
        cv_text: str, job_title: str, job_description: str, company: str
    ) -> str:
        """Draft a cover letter for a specific job using the candidate's CV.
        Returns the complete cover letter text."""
        req = CoverLetterRequest(
            cv_text=cv_text[:5000],
            job_title=job_title,
            job_description=job_description[:3000],
            company=company,
        )
        chunks: list[str] = []
        async for chunk in generate_cover_letter_chunks(req):
            chunks.append(chunk)
        return "".join(chunks) or "Cover letter generation failed."

    return [get_my_cv, search_jobs, score_job, save_application, draft_cover_letter]
