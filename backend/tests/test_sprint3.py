"""
Sprint 3 backend tests — JWT auth, quiz ownership, profanity,
question-bank upload/import, session persistence, analytics, settings.
"""
import os
import io
import time
import uuid
import json
import asyncio
from pathlib import Path
from urllib.parse import urlparse

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
_u = urlparse(BASE_URL)
WS_BASE = ("wss://" if _u.scheme == "https" else "ws://") + _u.netloc

ADMIN_EMAIL = "admin@triviastream.com"
ADMIN_PASSWORD = "admin123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def secondary_user(api_client):
    """Register a fresh secondary user for ownership tests."""
    email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    r = api_client.post(f"{API}/auth/register", json={"email": email, "password": "pass123", "name": "TestUser"})
    assert r.status_code == 200, r.text
    return r.json()  # {token, user}


# ---------- Auth ----------
class TestAuth:
    def test_admin_login_returns_token_and_user(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 20
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "admin"

    def test_me_returns_user(self, api_client, admin_headers):
        r = api_client.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_register_creates_user(self, api_client):
        email = f"testreg_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(f"{API}/auth/register", json={"email": email, "password": "hunter22", "name": "Alice"})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == email
        assert d["user"]["name"] == "Alice"
        assert isinstance(d["token"], str)

    def test_register_duplicate_email_409(self, api_client):
        email = f"testdup_{uuid.uuid4().hex[:8]}@example.com"
        r1 = api_client.post(f"{API}/auth/register", json={"email": email, "password": "hunter22"})
        assert r1.status_code == 200
        r2 = api_client.post(f"{API}/auth/register", json={"email": email, "password": "hunter22"})
        assert r2.status_code == 409

    def test_wrong_password_401(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "not-correct"})
        assert r.status_code == 401

    def test_missing_token_401(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_invalid_token_401(self, api_client):
        r = api_client.get(f"{API}/auth/me", headers={"Authorization": "Bearer bogus.token.here"})
        assert r.status_code == 401


# ---------- Admin seed & bcrypt & unique index ----------
class TestAdminSeed:
    def test_admin_hash_is_bcrypt(self):
        # Talk to Mongo directly.
        import pymongo
        client = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "test_database")]
        u = db.users.find_one({"email": ADMIN_EMAIL})
        assert u is not None
        assert u["password_hash"].startswith("$2b$") or u["password_hash"].startswith("$2a$"), (
            f"unexpected hash: {u['password_hash'][:5]}"
        )

    def test_users_email_unique_index(self):
        import pymongo
        client = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "test_database")]
        idx = db.users.index_information()
        found = False
        for name, spec in idx.items():
            keys = spec.get("key", [])
            if [("email", 1)] == list(keys) and spec.get("unique"):
                found = True
                break
        assert found, f"no unique index on users.email; got {idx}"


# ---------- Quiz ownership ----------
def _quiz_payload(title="TEST_S3_Quiz", n=1):
    return {
        "title": title,
        "questions": [
            {
                "text": f"Q{i+1}: What is 2+2?",
                "options": ["1", "2", "3", "4"],
                "correct_index": 3,
                "time_limit": 20,
            } for i in range(n)
        ],
    }


class TestQuizOwnership:
    def test_create_quiz_sets_owner_id(self, api_client, admin_headers, admin_token):
        r = api_client.post(f"{API}/quizzes", json=_quiz_payload(title=f"TEST_own_{uuid.uuid4().hex[:6]}"),
                            headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["owner_id"] is not None

    def test_mine_returns_only_owner_quizzes(self, api_client, admin_headers, secondary_user):
        # Owner A creates
        r_a = api_client.post(f"{API}/quizzes", json=_quiz_payload(title=f"TEST_A_{uuid.uuid4().hex[:6]}"),
                              headers=admin_headers)
        assert r_a.status_code == 200
        a_quiz_id = r_a.json()["id"]

        # Owner B creates
        b_headers = {"Authorization": f"Bearer {secondary_user['token']}", "Content-Type": "application/json"}
        r_b = api_client.post(f"{API}/quizzes", json=_quiz_payload(title=f"TEST_B_{uuid.uuid4().hex[:6]}"),
                              headers=b_headers)
        assert r_b.status_code == 200
        b_quiz_id = r_b.json()["id"]

        mine_a = api_client.get(f"{API}/quizzes/mine", headers=admin_headers).json()
        mine_b = api_client.get(f"{API}/quizzes/mine", headers=b_headers).json()
        a_ids = {q["id"] for q in mine_a}
        b_ids = {q["id"] for q in mine_b}
        assert a_quiz_id in a_ids and a_quiz_id not in b_ids
        assert b_quiz_id in b_ids and b_quiz_id not in a_ids

    def test_delete_quiz_owner_vs_non_owner(self, api_client, admin_headers, secondary_user):
        r = api_client.post(f"{API}/quizzes", json=_quiz_payload(title=f"TEST_del_{uuid.uuid4().hex[:6]}"),
                            headers=admin_headers)
        quiz_id = r.json()["id"]
        # non-owner
        b_headers = {"Authorization": f"Bearer {secondary_user['token']}"}
        r_forbid = api_client.delete(f"{API}/quizzes/{quiz_id}", headers=b_headers)
        assert r_forbid.status_code == 403
        # owner
        r_ok = api_client.delete(f"{API}/quizzes/{quiz_id}", headers=admin_headers)
        assert r_ok.status_code == 200


# ---------- Profanity ----------
class TestProfanity:
    def test_quiz_title_profanity_400(self, api_client, admin_headers):
        payload = _quiz_payload(title="This is stupid quiz")
        r = api_client.post(f"{API}/quizzes", json=payload, headers=admin_headers)
        assert r.status_code == 400
        assert "inappropriate" in r.json()["detail"].lower()

    def test_question_text_profanity_400(self, api_client, admin_headers):
        p = _quiz_payload(title=f"TEST_ok_{uuid.uuid4().hex[:6]}")
        p["questions"][0]["text"] = "You are an idiot?"
        r = api_client.post(f"{API}/quizzes", json=p, headers=admin_headers)
        assert r.status_code == 400
        assert "inappropriate" in r.json()["detail"].lower()

    def test_option_profanity_400(self, api_client, admin_headers):
        p = _quiz_payload(title=f"TEST_ok_{uuid.uuid4().hex[:6]}")
        p["questions"][0]["options"] = ["ok", "moron", "c", "d"]
        r = api_client.post(f"{API}/quizzes", json=p, headers=admin_headers)
        assert r.status_code == 400

    def test_join_profanity_nickname_400(self, api_client, admin_headers):
        # create quiz + room
        r_q = api_client.post(f"{API}/quizzes", json=_quiz_payload(title=f"TEST_pj_{uuid.uuid4().hex[:6]}"),
                              headers=admin_headers)
        qid = r_q.json()["id"]
        r_room = api_client.post(f"{API}/rooms", json={"quiz_id": qid})
        pin = r_room.json()["pin"]
        r_join = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "idiot"})
        assert r_join.status_code == 400
        assert "inappropriate" in r_join.json()["detail"].lower()


# ---------- Question Bank ----------
class TestQuestionBank:
    def _csv(self):
        return (
            "text,option1,option2,option3,option4,correct_option\n"
            "Q1 valid,a,b,c,d,1\n"
            "Q2 missing opt4,a,b,c,,2\n"
            "Q3 bad correct,a,b,c,d,9\n"
            "Q4 valid,w,x,y,z,4\n"
        )

    def test_upload_csv_valid_and_invalid(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        files = {"file": ("bank.csv", self._csv(), "text/csv")}
        r = requests.post(f"{API}/question-bank/upload", files=files, headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_rows"] == 4
        assert d["valid_count"] == 2
        assert d["error_count"] == 2
        assert isinstance(d["valid_rows"], list) and len(d["valid_rows"]) == 2
        errs = " | ".join(d["errors"])
        assert "Row 2" in errs and "option4" in errs
        assert "Row 3" in errs

    def test_upload_json_list(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = json.dumps([
            {"text": "JQ1", "option1": "a", "option2": "b", "option3": "c", "option4": "d", "correct_option": 1},
            {"text": "JQ2 bad", "option1": "a", "option2": "b", "option3": "c"},  # missing option4
        ])
        files = {"file": ("bank.json", payload, "application/json")}
        r = requests.post(f"{API}/question-bank/upload", files=files, headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert d["total_rows"] == 2
        assert d["valid_count"] == 1
        assert d["error_count"] == 1

    def test_upload_requires_auth(self, api_client):
        files = {"file": ("bank.csv", self._csv(), "text/csv")}
        r = requests.post(f"{API}/question-bank/upload", files=files)
        assert r.status_code == 401

    def test_import_creates_quiz_owned(self, api_client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Upload -> get valid_rows -> import
        files = {"file": ("bank.csv", self._csv(), "text/csv")}
        up = requests.post(f"{API}/question-bank/upload", files=files, headers=headers).json()
        title = f"TEST_import_{uuid.uuid4().hex[:6]}"
        r = api_client.post(f"{API}/question-bank/import",
                            json={"title": title, "questions": up["valid_rows"]},
                            headers={**headers, "Content-Type": "application/json"})
        assert r.status_code == 200, r.text
        quiz = r.json()
        assert quiz["title"] == title
        assert quiz["owner_id"] is not None
        # Appears in /mine
        mine = api_client.get(f"{API}/quizzes/mine",
                              headers={**headers, "Content-Type": "application/json"}).json()
        assert any(q["id"] == quiz["id"] for q in mine)


# ---------- Settings ----------
class TestSettings:
    def test_default_settings(self, api_client, secondary_user):
        h = {"Authorization": f"Bearer {secondary_user['token']}"}
        r = api_client.get(f"{API}/settings", headers=h)
        assert r.status_code == 200
        assert r.json()["retention_days"] == 30

    def test_update_and_persist(self, api_client, secondary_user):
        h = {"Authorization": f"Bearer {secondary_user['token']}", "Content-Type": "application/json"}
        r = api_client.put(f"{API}/settings", json={"retention_days": 45}, headers=h)
        assert r.status_code == 200
        r2 = api_client.get(f"{API}/settings", headers=h)
        assert r2.json()["retention_days"] == 45

    def test_invalid_retention_422(self, api_client, secondary_user):
        h = {"Authorization": f"Bearer {secondary_user['token']}", "Content-Type": "application/json"}
        r = api_client.put(f"{API}/settings", json={"retention_days": 0}, headers=h)
        assert r.status_code == 422
        r2 = api_client.put(f"{API}/settings", json={"retention_days": 400}, headers=h)
        assert r2.status_code == 422


# ---------- Session persistence + analytics ----------
class TestSessionPersistence:
    """Runs a real end-to-end game via HTTP to produce a session document."""

    def _run_end_to_end_game(self, api_client, admin_headers, admin_token, n_questions=2):
        # Create quiz owned by admin
        r_q = api_client.post(f"{API}/quizzes",
                              json=_quiz_payload(title=f"TEST_sess_{uuid.uuid4().hex[:6]}", n=n_questions),
                              headers=admin_headers)
        assert r_q.status_code == 200
        quiz = r_q.json()

        # Create room (anonymous — server binds quiz.owner_id which is admin)
        r_r = api_client.post(f"{API}/rooms", json={"quiz_id": quiz["id"]})
        pin = r_r.json()["pin"]
        host_token = r_r.json()["host_token"]

        # 2 players join
        p1 = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Alice"}).json()
        p2 = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Bob"}).json()

        # Start
        api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": host_token})

        for i in range(n_questions):
            state = api_client.get(f"{API}/rooms/{pin}").json()
            qid = state["question"]["id"]
            # p1 correct, p2 wrong
            api_client.post(f"{API}/rooms/{pin}/answer", json={
                "player_id": p1["player_id"], "session_token": p1["session_token"],
                "question_id": qid, "option_index": 3,
            })
            api_client.post(f"{API}/rooms/{pin}/answer", json={
                "player_id": p2["player_id"], "session_token": p2["session_token"],
                "question_id": qid, "option_index": 0,
            })
            # Advance
            if i < n_questions - 1:
                api_client.post(f"{API}/rooms/{pin}/next", params={"host_token": host_token})
            else:
                # final review -> next -> game_over (persists)
                api_client.post(f"{API}/rooms/{pin}/next", params={"host_token": host_token})

        # allow persistence
        time.sleep(0.5)
        return quiz, pin

    def test_full_game_persists_session(self, api_client, admin_headers, admin_token):
        quiz, pin = self._run_end_to_end_game(api_client, admin_headers, admin_token, n_questions=2)
        # /sessions/mine
        r = api_client.get(f"{API}/sessions/mine", headers=admin_headers)
        assert r.status_code == 200
        sessions = r.json()
        matching = [s for s in sessions if s["pin"] == pin]
        assert len(matching) == 1, f"expected one session for pin {pin}, got {len(matching)}"
        s = matching[0]
        assert s["quiz_id"] == quiz["id"]
        assert s["quiz_title"] == quiz["title"]
        assert s["total_players"] == 2
        assert s["question_count"] == 2
        assert isinstance(s.get("avg_response_time"), (int, float))
        assert isinstance(s.get("question_stats"), list) and len(s["question_stats"]) == 2
        assert s.get("hardest_question") is not None
        assert isinstance(s.get("leaderboard"), list) and len(s["leaderboard"]) == 2
        # detail
        sid = s["id"]
        r_det = api_client.get(f"{API}/sessions/{sid}", headers=admin_headers)
        assert r_det.status_code == 200
        # CSV report
        r_csv = api_client.get(f"{API}/sessions/{sid}/report", headers=admin_headers)
        assert r_csv.status_code == 200
        text = r_csv.text
        assert "Session" in text and "Rank" in text and "Nickname" in text

        # Analytics per-question difficulty
        r_a = api_client.get(f"{API}/analytics/question-difficulty",
                             params={"quiz_id": quiz["id"]}, headers=admin_headers)
        assert r_a.status_code == 200
        rows = r_a.json()
        assert len(rows) == 2
        for row in rows:
            assert set(["index", "text", "answers", "correct", "correct_rate", "avg_time"]).issubset(row.keys())
            assert row["answers"] == 2
            assert row["correct"] == 1  # p1 right, p2 wrong
            assert 0.49 <= row["correct_rate"] <= 0.51

    def test_session_detail_forbidden_for_other_user(self, api_client, admin_headers, admin_token, secondary_user):
        # Get an admin session id
        sessions = api_client.get(f"{API}/sessions/mine", headers=admin_headers).json()
        if not sessions:
            pytest.skip("no admin sessions available")
        sid = sessions[0]["id"]
        r = api_client.get(f"{API}/sessions/{sid}",
                           headers={"Authorization": f"Bearer {secondary_user['token']}"})
        assert r.status_code == 403
