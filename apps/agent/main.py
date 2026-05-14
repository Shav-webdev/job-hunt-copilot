import asyncio
import json
import os
import uuid

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graph import run_agent

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis-master:6379")

app = FastAPI(title="Job Hunt Copilot — Agent")
redis_client: aioredis.Redis | None = None


@app.on_event("startup")
async def startup() -> None:
    global redis_client
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)


@app.on_event("shutdown")
async def shutdown() -> None:
    if redis_client:
        await redis_client.aclose()


@app.get("/health")
def health():
    return {"status": "ok"}


class RunRequest(BaseModel):
    goal: str
    user_id: str
    api_token: str


@app.post("/run")
async def start_run(req: RunRequest):
    run_id = str(uuid.uuid4())
    asyncio.create_task(run_agent(run_id, req.goal, req.user_id, req.api_token, redis_client))
    return {"run_id": run_id}


@app.get("/run/{run_id}/stream")
async def stream_run(run_id: str):
    async def event_generator():
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"agent:run:{run_id}")
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = message["data"]
                yield f"data: {data}\n\n"
                event = json.loads(data)
                if event.get("type") in ("done", "error"):
                    break
        finally:
            await pubsub.unsubscribe(f"agent:run:{run_id}")
            await pubsub.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
