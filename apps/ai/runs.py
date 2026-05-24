"""
In-process asyncio.Queue streaming — replaces Redis pub/sub.
Queue is created before the background task starts so early events are buffered.
"""
import asyncio
import json
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graph import run_agent

RUNS: dict[str, asyncio.Queue[str]] = {}


async def publish(run_id: str, event_type: str, message: str, data: dict | None = None) -> None:
    q = RUNS.get(run_id)
    if not q:
        return
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
    # Queue created before task starts — first events are buffered, not dropped.
    asyncio.create_task(run_agent(run_id, req.goal, req.user_id, req.api_token, publish))
    return {"run_id": run_id}


@router.get("/{run_id}/stream")
async def stream_run(run_id: str):
    q = RUNS.get(run_id)
    if not q:
        raise HTTPException(404, "Run not found or already consumed")

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

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
