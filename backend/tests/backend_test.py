"""
TriviaStream Sprint 1 backend tests.
Covers: quiz creation validation, room creation, join flow (uniqueness + blockers),
start-game, and WebSocket real-time updates for host + player.
"""
import os
import json
import asyncio
from urllib.parse import urlparse

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend env parsing since backend tests may run w/o env exported
    from pathlib import Path
    fe_env = Path("/app/frontend/.env").read_text().splitlines()
    for line in fe_env:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break

BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
_u = urlparse(BASE_URL)
WS_BASE = ("wss://" if _u.scheme == "https" else "ws://") + _u.netloc


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _valid_quiz_payload(title="TEST_Quiz"):
    return {
        "title": title,
        "questions": [
            {
                "text": "What is 2+2?",
                "options": ["1", "2", "3", "4"],
                "correct_index": 3,
                "time_limit": 20,
            }
        ],
    }


@pytest.fixture
def created_quiz(api_client):
    r = api_client.post(f"{API}/quizzes", json=_valid_quiz_payload())
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def created_room(api_client, created_quiz):
    r = api_client.post(f"{API}/rooms", json={"quiz_id": created_quiz["id"]})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- API root ----------
class TestRoot:
    def test_root(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("message") == "TriviaStream API"


# ---------- Quiz creation ----------
class TestQuizCreate:
    def test_create_valid_quiz(self, api_client):
        r = api_client.post(f"{API}/quizzes", json=_valid_quiz_payload("TEST_ValidQuiz"))
        assert r.status_code == 200
        data = r.json()
        assert "id" in data and isinstance(data["id"], str)
        assert data["title"] == "TEST_ValidQuiz"
        assert len(data["questions"]) == 1
        q = data["questions"][0]
        assert q["options"] == ["1", "2", "3", "4"]
        assert q["correct_index"] == 3
        assert "id" in q

    def test_reject_empty_title(self, api_client):
        p = _valid_quiz_payload()
        p["title"] = "   "
        r = api_client.post(f"{API}/quizzes", json=p)
        assert r.status_code == 400
        assert "title" in r.json()["detail"].lower()

    def test_reject_empty_questions(self, api_client):
        p = _valid_quiz_payload()
        p["questions"] = []
        r = api_client.post(f"{API}/quizzes", json=p)
        assert r.status_code == 400

    def test_reject_wrong_option_count(self, api_client):
        p = _valid_quiz_payload()
        p["questions"][0]["options"] = ["a", "b", "c"]
        r = api_client.post(f"{API}/quizzes", json=p)
        assert r.status_code == 400
        assert "4 options" in r.json()["detail"]

    def test_reject_invalid_correct_index(self, api_client):
        p = _valid_quiz_payload()
        p["questions"][0]["correct_index"] = 5
        r = api_client.post(f"{API}/quizzes", json=p)
        assert r.status_code == 400
        assert "correct_index" in r.json()["detail"]

    def test_reject_empty_option_text(self, api_client):
        p = _valid_quiz_payload()
        p["questions"][0]["options"] = ["a", "", "c", "d"]
        r = api_client.post(f"{API}/quizzes", json=p)
        assert r.status_code == 400


# ---------- Room creation & fetch ----------
class TestRoomCreate:
    def test_create_room_returns_pin_and_tokens(self, api_client, created_quiz):
        r = api_client.post(f"{API}/rooms", json={"quiz_id": created_quiz["id"]})
        assert r.status_code == 200
        data = r.json()
        assert "pin" in data and len(data["pin"]) == 6 and data["pin"].isdigit()
        assert isinstance(data["host_token"], str) and len(data["host_token"]) > 0
        assert isinstance(data["host_id"], str)
        assert data["room"]["status"] == "lobby"
        assert data["room"]["quiz_title"] == created_quiz["title"]

    def test_create_room_unknown_quiz(self, api_client):
        r = api_client.post(f"{API}/rooms", json={"quiz_id": "does-not-exist"})
        assert r.status_code == 404

    def test_get_room_ok(self, api_client, created_room):
        pin = created_room["pin"]
        r = api_client.get(f"{API}/rooms/{pin}")
        assert r.status_code == 200
        data = r.json()
        assert data["pin"] == pin
        assert data["status"] == "lobby"
        assert data["players"] == []

    def test_get_room_unknown(self, api_client):
        r = api_client.get(f"{API}/rooms/000000")
        assert r.status_code == 404


# ---------- Join flow ----------
class TestJoin:
    def test_join_ok(self, api_client, created_room):
        pin = created_room["pin"]
        r = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Alice"})
        assert r.status_code == 200
        d = r.json()
        assert d["nickname"] == "Alice"
        assert isinstance(d["player_id"], str)
        assert isinstance(d["session_token"], str)

        # verify persistence via GET
        r2 = api_client.get(f"{API}/rooms/{pin}")
        assert r2.status_code == 200
        players = r2.json()["players"]
        assert any(p["nickname"] == "Alice" for p in players)

    def test_join_duplicate_nickname_case_insensitive(self, api_client, created_room):
        pin = created_room["pin"]
        r1 = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Alice"})
        assert r1.status_code == 200
        r2 = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "alice"})
        assert r2.status_code == 409
        assert "already taken" in r2.json()["detail"].lower()

    def test_join_unknown_pin(self, api_client):
        r = api_client.post(f"{API}/rooms/999999/join", json={"nickname": "Bob"})
        assert r.status_code == 404

    def test_join_started_room(self, api_client, created_room):
        pin = created_room["pin"]
        host_token = created_room["host_token"]
        # Need at least one player to start
        api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Seed"})
        rs = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": host_token})
        assert rs.status_code == 200
        rj = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Late"})
        assert rj.status_code == 409
        assert "Game Already Started" == rj.json()["detail"]


# ---------- Start ----------
class TestStart:
    def test_start_wrong_token(self, api_client, created_room):
        pin = created_room["pin"]
        api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "X"})
        r = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": "wrong"})
        assert r.status_code == 403

    def test_start_no_players(self, api_client, created_room):
        pin = created_room["pin"]
        r = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": created_room["host_token"]})
        assert r.status_code == 400
        assert "1 player" in r.json()["detail"]

    def test_start_ok_then_status(self, api_client, created_room):
        pin = created_room["pin"]
        api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "P1"})
        r = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": created_room["host_token"]})
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"
        # verify via GET
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "in_progress"


# ---------- WebSocket ----------
class TestWebSocket:
    @pytest.mark.asyncio
    async def test_host_ws_gets_room_state_and_join_broadcast(self, api_client, created_room):
        pin = created_room["pin"]
        host_token = created_room["host_token"]

        async def host_flow():
            uri = f"{WS_BASE}/api/ws/rooms/{pin}?role=host&token={host_token}"
            async with websockets.connect(uri) as ws:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                assert msg["type"] == "room_state"
                assert msg["data"]["pin"] == pin
                assert msg["data"]["players"] == []

                # trigger a join from another task
                await asyncio.sleep(0.2)
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    lambda: api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "WsJoiner"}),
                )
                # wait for broadcast
                got_join = False
                for _ in range(5):
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                    if m["type"] == "room_state" and any(p["nickname"] == "WsJoiner" for p in m["data"]["players"]):
                        got_join = True
                        break
                assert got_join, "Host did not receive room_state broadcast after join"

        await host_flow()

    @pytest.mark.asyncio
    async def test_host_ws_invalid_token(self, created_room):
        pin = created_room["pin"]
        uri = f"{WS_BASE}/api/ws/rooms/{pin}?role=host&token=bad"
        async with websockets.connect(uri) as ws:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert msg["type"] == "error"

    @pytest.mark.asyncio
    async def test_player_ws_connects_and_marks_connected(self, api_client, created_room):
        pin = created_room["pin"]
        join = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "WsPlayer"}).json()
        session_token = join["session_token"]

        uri = f"{WS_BASE}/api/ws/rooms/{pin}?role=player&token={session_token}"
        async with websockets.connect(uri) as ws:
            # Expect at least one room_state where our player is connected
            connected_seen = False
            for _ in range(5):
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if m["type"] == "room_state":
                    me = [p for p in m["data"]["players"] if p["id"] == join["player_id"]]
                    if me and me[0]["connected"] is True:
                        connected_seen = True
                        break
            assert connected_seen

    @pytest.mark.asyncio
    async def test_player_ws_accepts_player_id_token(self, api_client, created_room):
        pin = created_room["pin"]
        join = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "WsPlayer2"}).json()
        uri = f"{WS_BASE}/api/ws/rooms/{pin}?role=player&token={join['player_id']}"
        async with websockets.connect(uri) as ws:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert m["type"] == "room_state"
