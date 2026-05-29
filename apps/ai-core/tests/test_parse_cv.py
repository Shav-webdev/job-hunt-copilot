import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

PARSED_CV = {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "summary": "Experienced software engineer.",
    "skills": ["Python", "FastAPI", "Docker"],
    "experience": [
        {"title": "SWE", "company": "Acme", "duration": "2y", "highlights": ["Built things"]}
    ],
    "education": [
        {"degree": "BSc CS", "institution": "MIT", "year": "2018"}
    ],
}


def test_parse_cv_rejects_non_pdf():
    resp = client.post(
        "/parse-cv",
        files={"file": ("resume.txt", b"plain text content", "text/plain")},
    )
    assert resp.status_code == 400
    assert "PDF" in resp.json()["detail"]


def test_parse_cv_returns_parsed_structure():
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(PARSED_CV)

    with (
        patch("main.client") as mock_genai,
        patch("main._extract_pdf_text", return_value="Jane Doe\njane@example.com\nPython engineer"),
    ):
        mock_genai.models.generate_content.return_value = mock_resp
        resp = client.post(
            "/parse-cv",
            files={"file": ("resume.pdf", b"%PDF-1.4 fake content", "application/pdf")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Jane Doe"
    assert data["email"] == "jane@example.com"
    assert "Python" in data["skills"]
    assert len(data["experience"]) == 1
    assert len(data["education"]) == 1


def test_parse_cv_returns_422_when_pdf_has_no_text():
    with patch("main._extract_pdf_text", return_value=""):
        resp = client.post(
            "/parse-cv",
            files={"file": ("empty.pdf", b"%PDF-1.4", "application/pdf")},
        )

    assert resp.status_code == 422
