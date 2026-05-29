import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_score_returns_valid_response():
    mock_resp = MagicMock()
    mock_resp.text = json.dumps({
        "score": 0.85,
        "reasons": ["Strong Python background", "Relevant experience", "Good team fit"],
    })

    with patch("main.client") as mock_genai:
        mock_genai.models.generate_content.return_value = mock_resp
        resp = client.post("/score", json={
            "cv_text": "Senior Python engineer with 5 years experience",
            "job_description": "We need a Python backend developer",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert 0.0 <= data["score"] <= 1.0
    assert len(data["reasons"]) == 3


def test_score_clamps_value_above_1():
    mock_resp = MagicMock()
    mock_resp.text = json.dumps({"score": 1.5, "reasons": ["r1", "r2", "r3"]})

    with patch("main.client") as mock_genai:
        mock_genai.models.generate_content.return_value = mock_resp
        resp = client.post("/score", json={"cv_text": "cv", "job_description": "job"})

    assert resp.status_code == 200
    assert resp.json()["score"] == 1.0


def test_score_clamps_value_below_0():
    mock_resp = MagicMock()
    mock_resp.text = json.dumps({"score": -0.3, "reasons": ["r1", "r2", "r3"]})

    with patch("main.client") as mock_genai:
        mock_genai.models.generate_content.return_value = mock_resp
        resp = client.post("/score", json={"cv_text": "cv", "job_description": "job"})

    assert resp.status_code == 200
    assert resp.json()["score"] == 0.0


def test_score_returns_502_on_invalid_gemini_response():
    mock_resp = MagicMock()
    mock_resp.text = "not json at all"

    with patch("main.client") as mock_genai:
        mock_genai.models.generate_content.return_value = mock_resp
        resp = client.post("/score", json={"cv_text": "cv", "job_description": "job"})

    assert resp.status_code == 502
