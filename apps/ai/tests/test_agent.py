from unittest.mock import patch

from fastapi.testclient import TestClient
from main import app


async def noop_agent(*args, **kwargs):
    pass


def test_agent_run_returns_run_id():
    with patch("runs.run_agent", new=noop_agent):
        with TestClient(app) as client:
            resp = client.post("/agent/run", json={
                "goal": "find Python jobs",
                "user_id": "user-1",
                "api_token": "test-token",
            })

    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
    assert len(data["run_id"]) == 36


def test_agent_stream_returns_404_for_unknown_run():
    with TestClient(app) as client:
        resp = client.get("/agent/nonexistent-run-id/stream")
    assert resp.status_code == 404


def test_agent_run_requires_all_fields():
    with TestClient(app) as client:
        resp = client.post("/agent/run", json={"goal": "find jobs"})
    assert resp.status_code == 422
