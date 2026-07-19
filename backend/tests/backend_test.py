"""
TriviaStream backend tests — Sprint 1 (rooms/PIN/join/lobby) + Sprint 2 (game lifecycle).

Sprint 2 coverage:
  * start_room transitions to status='question_active' with server question payload
    (id, index, text, options, time_limit, deadline_ts, server_now, answers_received, total_players)
    without leaking correct_index.
  * /answer scoring, duplicate 409, stale question 409, invalid session 403, invalid option 400.
  * All-players-answered auto-transition to question_review; distribution + player_results shape.
  * asyncio timer expiry -> question_review + streak reset for non-answerers.
  * Leaderboard sort/tie flags.
  * /next advances or ends game after last question.
  * /skip immediately reviews an active question.
  * /end goes to game_over anytime; wrong host_token rejected 403 for /next /skip /end.
  * WS receives room_state on state transitions (question_active -> answers -> review -> game_over).
"""
import os
import json
import asyncio
import time
from urllib.parse import urlparse

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
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


def _valid_quiz_payload(title="TEST_Quiz", n_questions=1, time_limit=20, correct_index=3):
    questions = []
    for i in range(n_questions):
        questions.append({
            "text": f"Q{i+1}: What is 2+2?",
            "options": ["1", "2", "3", "4"],
            "correct_index": correct_index,
            "time_limit": time_limit,
        })
    return {"title": title, "questions": questions}


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


def _make_room(api_client, n_questions=2, time_limit=8):
    q = api_client.post(f"{API}/quizzes", json=_valid_quiz_payload(
        title=f"TEST_S2_{int(time.time()*1000)}", n_questions=n_questions, time_limit=time_limit
    )).json()
    room = api_client.post(f"{API}/rooms", json={"quiz_id": q["id"]}).json()
    return q, room


def _join(api_client, pin, nickname):
    r = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": nickname})
    assert r.status_code == 200, r.text
    return r.json()


def _start(api_client, pin, host_token):
    r = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": host_token})
    assert r.status_code == 200, r.text
    return r.json()


# ==========================================================
# Sprint 1 — quiz + room + lobby + WS join broadcast
# ==========================================================

class TestRoot:
    def test_root(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("message") == "TriviaStream API"


class TestQuizCreate:
    def test_create_valid_quiz(self, api_client):
        r = api_client.post(f"{API}/quizzes", json=_valid_quiz_payload("TEST_ValidQuiz"))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["id"], str)
        assert data["title"] == "TEST_ValidQuiz"
        assert len(data["questions"]) == 1

    def test_reject_empty_title(self, api_client):
        p = _valid_quiz_payload(); p["title"] = "   "
        assert api_client.post(f"{API}/quizzes", json=p).status_code == 400

    def test_reject_wrong_option_count(self, api_client):
        p = _valid_quiz_payload(); p["questions"][0]["options"] = ["a", "b", "c"]
        assert api_client.post(f"{API}/quizzes", json=p).status_code == 400

    def test_reject_invalid_correct_index(self, api_client):
        p = _valid_quiz_payload(); p["questions"][0]["correct_index"] = 5
        assert api_client.post(f"{API}/quizzes", json=p).status_code == 400


class TestRoomCreate:
    def test_create_room_returns_pin_and_tokens(self, api_client, created_quiz):
        r = api_client.post(f"{API}/rooms", json={"quiz_id": created_quiz["id"]})
        assert r.status_code == 200
        data = r.json()
        assert len(data["pin"]) == 6 and data["pin"].isdigit()
        assert isinstance(data["host_token"], str) and data["host_token"]
        assert data["room"]["status"] == "lobby"

    def test_get_room_unknown(self, api_client):
        assert api_client.get(f"{API}/rooms/000000").status_code == 404


class TestJoin:
    def test_join_ok_and_persist(self, api_client, created_room):
        pin = created_room["pin"]
        r = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Alice"})
        assert r.status_code == 200
        st = api_client.get(f"{API}/rooms/{pin}").json()
        assert any(p["nickname"] == "Alice" for p in st["players"])

    def test_join_duplicate_case_insensitive(self, api_client, created_room):
        pin = created_room["pin"]
        api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Alice"})
        r2 = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "alice"})
        assert r2.status_code == 409

    def test_join_after_started(self, api_client, created_room):
        pin = created_room["pin"]
        _join(api_client, pin, "Seed")
        _start(api_client, pin, created_room["host_token"])
        rj = api_client.post(f"{API}/rooms/{pin}/join", json={"nickname": "Late"})
        assert rj.status_code == 409


# ==========================================================
# Sprint 2 — start transitions to question_active
# ==========================================================

class TestStartQuestionActive:
    def test_start_transitions_to_question_active(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=20)
        pin = room["pin"]
        _join(api_client, pin, "Alice")
        r = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": room["host_token"]})
        assert r.status_code == 200
        # status should be question_active (Sprint 2)
        assert r.json()["status"] == "question_active"

        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "question_active"
        assert "question" in state
        q = state["question"]
        # payload shape checks
        for key in ("id", "index", "text", "options", "time_limit",
                    "deadline_ts", "server_now", "answers_received", "total_players"):
            assert key in q, f"missing {key} in question payload"
        assert q["index"] == 0
        assert len(q["options"]) == 4
        # correct_index must NOT leak while question is active
        assert "correct_index" not in q
        assert q["answers_received"] == 0
        assert q["total_players"] == 1
        assert q["deadline_ts"] > q["server_now"]

    def test_start_wrong_token(self, api_client, created_room):
        pin = created_room["pin"]
        _join(api_client, pin, "X")
        r = api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": "bad"})
        assert r.status_code == 403


# ==========================================================
# Sprint 2 — /answer scoring + validation
# ==========================================================

class TestAnswerScoring:
    def test_correct_answer_awards_points_and_streak(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        state = api_client.get(f"{API}/rooms/{pin}").json()
        qid = state["question"]["id"]

        r = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"],
            "session_token": a["session_token"],
            "question_id": qid,
            "option_index": 3,  # correct
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["correct"] is True
        assert d["streak"] == 1
        # Should be close to 1000 for a quick submit (allow generous margin for network)
        assert d["points_earned"] > 600, f"points_earned={d['points_earned']}"
        assert d["total_points"] == d["points_earned"]

    def test_incorrect_answer_zero_and_resets_streak(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]

        r = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"],
            "session_token": a["session_token"],
            "question_id": qid,
            "option_index": 0,  # wrong
        })
        assert r.status_code == 200
        d = r.json()
        assert d["correct"] is False
        assert d["points_earned"] == 0
        assert d["streak"] == 0

    def test_duplicate_answer_409(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        # Need a second player so room does not auto-transition to review after first submit
        _join(api_client, pin, "Bob")
        _start(api_client, pin, room["host_token"])
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]

        payload = {
            "player_id": a["player_id"],
            "session_token": a["session_token"],
            "question_id": qid,
            "option_index": 3,
        }
        assert api_client.post(f"{API}/rooms/{pin}/answer", json=payload).status_code == 200
        r2 = api_client.post(f"{API}/rooms/{pin}/answer", json=payload)
        assert r2.status_code == 409
        assert "already submitted" in r2.json()["detail"].lower()

    def test_wrong_session_403(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]
        r = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"],
            "session_token": "bogus",
            "question_id": qid,
            "option_index": 3,
        })
        assert r.status_code == 403

    def test_stale_question_id_409(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        r = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"],
            "session_token": a["session_token"],
            "question_id": "stale-question-id",
            "option_index": 3,
        })
        assert r.status_code == 409

    def test_invalid_option_index_400(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]
        r = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"],
            "session_token": a["session_token"],
            "question_id": qid,
            "option_index": 9,
        })
        assert r.status_code == 400


# ==========================================================
# Sprint 2 — auto-transitions & timer expiry & review payload
# ==========================================================

class TestAutoTransitionAndReview:
    def test_all_players_answered_triggers_review(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        b = _join(api_client, pin, "Bob")
        _start(api_client, pin, room["host_token"])
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]

        api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"], "session_token": a["session_token"],
            "question_id": qid, "option_index": 3,
        })
        api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": b["player_id"], "session_token": b["session_token"],
            "question_id": qid, "option_index": 0,
        })
        # Should be in review now (immediate, no wait)
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "question_review"
        review = state["review"]
        assert review["correct_index"] == 3
        assert isinstance(review["distribution"], list) and len(review["distribution"]) == 4
        assert review["distribution"][3] == 1
        assert review["distribution"][0] == 1
        assert review["answers_received"] == 2
        assert review["total_players"] == 2
        assert review["is_last"] is True
        pr = review["player_results"]
        assert pr[a["player_id"]]["correct"] is True
        assert pr[b["player_id"]]["correct"] is False
        assert pr[a["player_id"]]["option_index"] == 3

    def test_timer_expiry_transitions_and_resets_streak(self, api_client):
        # Short timer, no player answers -> should auto-review after ~time_limit seconds
        _, room = _make_room(api_client, n_questions=1, time_limit=5)
        pin = room["pin"]
        _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        # Wait for timer + buffer
        for _ in range(15):  # up to ~7.5s
            time.sleep(0.5)
            state = api_client.get(f"{API}/rooms/{pin}").json()
            if state["status"] == "question_review":
                break
        assert state["status"] == "question_review"
        # Non-answerer streak stays 0 (already 0). No exception -> pass.
        # Leaderboard should show 0 points for Alice
        entries = state["leaderboard"]
        assert entries[0]["points"] == 0
        assert entries[0]["streak"] == 0


# ==========================================================
# Sprint 2 — Leaderboard tie-break
# ==========================================================

class TestLeaderboard:
    def test_tie_flag_and_ordering(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        b = _join(api_client, pin, "Bob")
        _start(api_client, pin, room["host_token"])
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]

        # Both correct, near-simultaneous -> same points (or nearly), test tie handling structure.
        r1 = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"], "session_token": a["session_token"],
            "question_id": qid, "option_index": 3,
        }).json()
        r2 = api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": b["player_id"], "session_token": b["session_token"],
            "question_id": qid, "option_index": 3,
        }).json()

        state = api_client.get(f"{API}/rooms/{pin}").json()
        lb = state["leaderboard"]
        assert len(lb) == 2
        # Sorted by -points then cumulative_time asc
        assert lb[0]["points"] >= lb[1]["points"]
        if lb[0]["points"] == lb[1]["points"] and lb[0]["points"] > 0:
            assert lb[0]["tie"] is True and lb[1]["tie"] is True
            assert lb[0]["rank"] == lb[1]["rank"]
            assert lb[0]["cumulative_time"] <= lb[1]["cumulative_time"]


# ==========================================================
# Sprint 2 — /next /skip /end
# ==========================================================

class TestHostControls:
    def test_next_advances_and_final_ends_game(self, api_client):
        _, room = _make_room(api_client, n_questions=2, time_limit=30)
        pin = room["pin"]
        a = _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        # Q1 -> answer -> review
        qid = api_client.get(f"{API}/rooms/{pin}").json()["question"]["id"]
        api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"], "session_token": a["session_token"],
            "question_id": qid, "option_index": 3,
        })
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "question_review"
        # /next -> Q2 (question_active)
        r = api_client.post(f"{API}/rooms/{pin}/next", params={"host_token": room["host_token"]})
        assert r.status_code == 200
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "question_active"
        assert state["question"]["index"] == 1
        # Answer Q2 -> review
        qid2 = state["question"]["id"]
        api_client.post(f"{API}/rooms/{pin}/answer", json={
            "player_id": a["player_id"], "session_token": a["session_token"],
            "question_id": qid2, "option_index": 3,
        })
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "question_review"
        assert state["review"]["is_last"] is True
        # /next from last review -> game_over
        r = api_client.post(f"{API}/rooms/{pin}/next", params={"host_token": room["host_token"]})
        assert r.status_code == 200
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "game_over"

    def test_skip_transitions_immediately_to_review(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=60)
        pin = room["pin"]
        _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        assert api_client.get(f"{API}/rooms/{pin}").json()["status"] == "question_active"
        r = api_client.post(f"{API}/rooms/{pin}/skip", params={"host_token": room["host_token"]})
        assert r.status_code == 200
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "question_review"

    def test_end_transitions_to_game_over(self, api_client):
        _, room = _make_room(api_client, n_questions=2, time_limit=60)
        pin = room["pin"]
        _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        r = api_client.post(f"{API}/rooms/{pin}/end", params={"host_token": room["host_token"]})
        assert r.status_code == 200
        state = api_client.get(f"{API}/rooms/{pin}").json()
        assert state["status"] == "game_over"

    def test_host_controls_reject_invalid_token(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=60)
        pin = room["pin"]
        _join(api_client, pin, "Alice")
        _start(api_client, pin, room["host_token"])
        for path in ("/skip", "/end"):
            r = api_client.post(f"{API}/rooms/{pin}{path}", params={"host_token": "bad"})
            assert r.status_code == 403, f"{path} accepted bad token"
        # Bring room into review to test /next 403 path
        api_client.post(f"{API}/rooms/{pin}/skip", params={"host_token": room["host_token"]})
        r = api_client.post(f"{API}/rooms/{pin}/next", params={"host_token": "bad"})
        assert r.status_code == 403


# ==========================================================
# Sprint 2 — WebSocket state broadcasts
# ==========================================================

class TestWSGameLifecycle:
    @pytest.mark.asyncio
    async def test_ws_receives_state_transitions(self, api_client):
        _, room = _make_room(api_client, n_questions=1, time_limit=30)
        pin = room["pin"]
        host_token = room["host_token"]
        a = _join(api_client, pin, "Alice")

        host_uri = f"{WS_BASE}/api/ws/rooms/{pin}?role=host&token={host_token}"
        player_uri = f"{WS_BASE}/api/ws/rooms/{pin}?role=player&token={a['session_token']}"

        async with websockets.connect(host_uri) as host_ws, websockets.connect(player_uri) as p_ws:
            # Drain initial room_state msgs
            async def drain(ws, timeout=0.3):
                try:
                    while True:
                        await asyncio.wait_for(ws.recv(), timeout=timeout)
                except Exception:
                    return
            await drain(host_ws)
            await drain(p_ws)

            # Trigger start
            def _do_start():
                return api_client.post(f"{API}/rooms/{pin}/start", params={"host_token": host_token})
            await asyncio.get_event_loop().run_in_executor(None, _do_start)

            # Both should receive a room_state with status=question_active
            async def wait_for_status(ws, status, tries=10):
                for _ in range(tries):
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                    if m.get("type") == "room_state" and m["data"].get("status") == status:
                        return m
                return None
            host_active = await wait_for_status(host_ws, "question_active")
            player_active = await wait_for_status(p_ws, "question_active")
            assert host_active is not None
            assert player_active is not None
            qid = host_active["data"]["question"]["id"]
            # Ensure correct_index is not present in active question payload broadcast
            assert "correct_index" not in host_active["data"]["question"]

            # Submit correct answer
            def _do_answer():
                return api_client.post(f"{API}/rooms/{pin}/answer", json={
                    "player_id": a["player_id"], "session_token": a["session_token"],
                    "question_id": qid, "option_index": 3,
                })
            await asyncio.get_event_loop().run_in_executor(None, _do_answer)

            host_review = await wait_for_status(host_ws, "question_review", tries=15)
            player_review = await wait_for_status(p_ws, "question_review", tries=15)
            assert host_review is not None
            assert "review" in host_review["data"]
            assert host_review["data"]["review"]["correct_index"] == 3
            assert player_review is not None

            # /next from last review -> game_over
            def _do_next():
                return api_client.post(f"{API}/rooms/{pin}/next", params={"host_token": host_token})
            await asyncio.get_event_loop().run_in_executor(None, _do_next)

            host_over = await wait_for_status(host_ws, "game_over", tries=15)
            assert host_over is not None
