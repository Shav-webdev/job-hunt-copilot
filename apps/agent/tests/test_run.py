from unittest.mock import patch

from fastapi.testclient import TestClient
from main import app


async def noop_agent(*args, **kwargs):
    pass


def test_start_run_returns_run_id():
    with patch("main.run_agent", new=noop_agent):
        with TestClient(app) as client:
            resp = client.post("/run", json={
                "goal": "find Python jobs",
                "user_id": "user-1",
                "api_token": "test-token",
            })

    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
    assert len(data["run_id"]) == 36  # UUID v4


def test_start_run_requires_all_fields():
    with TestClient(app) as client:
        resp = client.post("/run", json={"goal": "find jobs"})

    assert resp.status_code == 422
