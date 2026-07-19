from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Request, Response
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import json as json_lib
import logging
import random
import string
import asyncio
import time
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import uuid


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from auth import make_router as make_auth_router, seed_admin
from profanity import contains_profanity, clean as profanity_word

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Constants ----------
MAX_PLAYERS_PER_ROOM = 50
DEFAULT_TIME_LIMIT = 20
ROOM_TTL_SECONDS = 3 * 60 * 60
BASE_POINTS = 1000
STREAK_BONUS_STEP = 100
HOST_PROMOTION_GRACE_SECONDS = 20
DEFAULT_RETENTION_DAYS = 30

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Auth wiring ----------
def _get_db():
    return db

auth_router, get_current_user = make_auth_router(_get_db)


async def optional_current_user(request: Request):
    """Return the current user or None (no 401 if unauthenticated)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


# ---------- Models ----------
class QuestionIn(BaseModel):
    text: str
    options: List[str]
    correct_index: int
    time_limit: int = DEFAULT_TIME_LIMIT


class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    options: List[str]
    correct_index: int
    time_limit: int = DEFAULT_TIME_LIMIT


class QuizCreate(BaseModel):
    title: str
    questions: List[QuestionIn]


class Quiz(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    questions: List[Question]
    owner_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CreateRoomRequest(BaseModel):
    quiz_id: str


class JoinRoomRequest(BaseModel):
    nickname: str


class AnswerRequest(BaseModel):
    player_id: str
    session_token: str
    question_id: str
    option_index: int


class ImportBankRequest(BaseModel):
    title: str
    questions: List[QuestionIn]


class SettingsIn(BaseModel):
    retention_days: int = Field(ge=1, le=365)


# ---------- In-memory state ----------
rooms: Dict[str, Dict] = {}


def now_ms() -> int:
    return int(time.time() * 1000)


def generate_pin() -> str:
    while True:
        pin = "".join(random.choices(string.digits, k=6))
        if pin not in rooms:
            return pin


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_question_payload(q: QuestionIn, idx: int, check_profanity: bool = True):
    if not q.text.strip():
        raise HTTPException(status_code=400, detail=f"Question {idx+1}: text is required")
    if len(q.options) != 4:
        raise HTTPException(status_code=400, detail=f"Question {idx+1}: exactly 4 options are required")
    for j, opt in enumerate(q.options):
        if not opt.strip():
            raise HTTPException(status_code=400, detail=f"Question {idx+1}: option {j+1} is empty")
    if q.correct_index < 0 or q.correct_index > 3:
        raise HTTPException(status_code=400, detail=f"Question {idx+1}: correct_index must be 0-3")
    if q.time_limit < 5 or q.time_limit > 120:
        raise HTTPException(status_code=400, detail=f"Question {idx+1}: time_limit must be 5-120s")
    if check_profanity:
        word = profanity_word(q.text)
        if word:
            raise HTTPException(status_code=400, detail=f"Question {idx+1}: contains inappropriate language ('{word}')")
        for j, opt in enumerate(q.options):
            w = profanity_word(opt)
            if w:
                raise HTTPException(status_code=400, detail=f"Question {idx+1}, option {j+1}: contains inappropriate language ('{w}')")


def leaderboard_of(room: dict) -> list:
    scores = room["scores"]
    entries = []
    for p in room["players"].values():
        s = scores.get(p["id"], {"points": 0, "streak": 0, "cumulative_time": 0.0})
        entries.append({
            "player_id": p["id"],
            "nickname": p["nickname"],
            "points": s["points"],
            "streak": s["streak"],
            "cumulative_time": s["cumulative_time"],
        })
    entries.sort(key=lambda e: (-e["points"], e["cumulative_time"]))
    prev_points = None
    rank = 0
    for i, e in enumerate(entries):
        if e["points"] != prev_points:
            rank = i + 1
            prev_points = e["points"]
        e["rank"] = rank
    points_counts = {}
    for e in entries:
        points_counts[e["points"]] = points_counts.get(e["points"], 0) + 1
    for e in entries:
        e["tie"] = points_counts[e["points"]] > 1 and e["points"] > 0
    return entries


def current_question(room: dict) -> Optional[dict]:
    idx = room["current_index"]
    if idx < 0 or idx >= len(room["quiz"]["questions"]):
        return None
    return room["quiz"]["questions"][idx]


def public_room_state(pin: str) -> dict:
    r = rooms[pin]
    q = current_question(r)
    payload = {
        "pin": pin,
        "status": r["status"],
        "quiz_title": r["quiz"]["title"],
        "question_count": len(r["quiz"]["questions"]),
        "current_index": r["current_index"],
        "players": [
            {"id": p["id"], "nickname": p["nickname"], "connected": p["connected"]}
            for p in r["players"].values()
        ],
        "max_players": MAX_PLAYERS_PER_ROOM,
        "leaderboard": leaderboard_of(r),
    }
    if r["status"] == "question_active" and q is not None:
        payload["question"] = {
            "id": r["question_id"],
            "index": r["current_index"],
            "text": q["text"],
            "options": q["options"],
            "time_limit": q["time_limit"],
            "deadline_ts": r["deadline_ts"],
            "server_now": now_ms(),
            "answers_received": len(r["answers"].get(r["current_index"], {})),
            "total_players": len(r["players"]),
        }
    if r["status"] == "question_review" and q is not None:
        answers_map = r["answers"].get(r["current_index"], {})
        distribution = [0, 0, 0, 0]
        for a in answers_map.values():
            if 0 <= a["option_index"] <= 3:
                distribution[a["option_index"]] += 1
        payload["review"] = {
            "id": r["question_id"],
            "index": r["current_index"],
            "text": q["text"],
            "options": q["options"],
            "correct_index": q["correct_index"],
            "distribution": distribution,
            "answers_received": len(answers_map),
            "total_players": len(r["players"]),
            "is_last": r["current_index"] >= len(r["quiz"]["questions"]) - 1,
            "player_results": {
                pid: {
                    "correct": a["correct"],
                    "points_earned": a["points_earned"],
                    "option_index": a["option_index"],
                }
                for pid, a in answers_map.items()
            },
        }
    return payload


async def broadcast_room_state(pin: str):
    if pin not in rooms:
        return
    payload = {"type": "room_state", "data": public_room_state(pin)}
    host_ws = rooms[pin].get("host_ws")
    if host_ws is not None:
        try:
            await host_ws.send_json(payload)
        except Exception:
            rooms[pin]["host_ws"] = None
    for pid, ws in list(rooms[pin].get("connections", {}).items()):
        try:
            await ws.send_json(payload)
        except Exception:
            rooms[pin]["connections"].pop(pid, None)


async def broadcast_event(pin: str, event: dict):
    if pin not in rooms:
        return
    host_ws = rooms[pin].get("host_ws")
    if host_ws is not None:
        try:
            await host_ws.send_json(event)
        except Exception:
            rooms[pin]["host_ws"] = None
    for pid, ws in list(rooms[pin].get("connections", {}).items()):
        try:
            await ws.send_json(event)
        except Exception:
            rooms[pin]["connections"].pop(pid, None)


# ---------- Question lifecycle ----------
async def start_question(pin: str):
    if pin not in rooms:
        return
    r = rooms[pin]
    r["current_index"] += 1
    if r["current_index"] >= len(r["quiz"]["questions"]):
        await end_game(pin)
        return
    q = current_question(r)
    r["question_id"] = str(uuid.uuid4())
    r["question_started_at"] = now_ms()
    r["deadline_ts"] = r["question_started_at"] + q["time_limit"] * 1000
    r["status"] = "question_active"
    r["answers"].setdefault(r["current_index"], {})

    prev_task = r.get("question_task")
    if prev_task and not prev_task.done():
        prev_task.cancel()

    qid = r["question_id"]
    r["question_task"] = asyncio.create_task(_question_timer(pin, qid, q["time_limit"]))
    await broadcast_room_state(pin)


async def _question_timer(pin: str, qid: str, seconds: int):
    try:
        await asyncio.sleep(seconds)
        r = rooms.get(pin)
        if not r:
            return
        if r["status"] == "question_active" and r["question_id"] == qid:
            await end_question(pin, qid)
    except asyncio.CancelledError:
        return


async def end_question(pin: str, qid: str):
    r = rooms.get(pin)
    if not r:
        return
    if r["question_id"] != qid or r["status"] != "question_active":
        return

    q = current_question(r)
    if q is None:
        return
    answers_map = r["answers"].setdefault(r["current_index"], {})
    for pid in list(r["players"].keys()):
        if pid not in answers_map:
            s = r["scores"].setdefault(pid, {"points": 0, "streak": 0, "cumulative_time": 0.0})
            s["streak"] = 0

    r["status"] = "question_review"
    task = r.get("question_task")
    if task and not task.done():
        task.cancel()
    await broadcast_room_state(pin)


async def end_game(pin: str):
    r = rooms.get(pin)
    if not r:
        return
    r["status"] = "game_over"
    task = r.get("question_task")
    if task and not task.done():
        task.cancel()
    # Persist session summary
    try:
        await _persist_session(pin)
    except Exception as e:
        logger.exception("failed to persist session for %s: %s", pin, e)
    await broadcast_room_state(pin)


async def _persist_session(pin: str):
    r = rooms.get(pin)
    if not r:
        return
    quiz = r["quiz"]
    total_players = len(r["players"])
    if total_players == 0 and not r.get("scores"):
        return

    # Per-question stats
    q_stats = []
    total_correct_all = 0
    total_answers_all = 0
    total_time_all = 0.0
    total_time_count = 0
    hardest = None
    for idx, q in enumerate(quiz["questions"]):
        answers = r["answers"].get(idx, {})
        n_answers = len(answers)
        n_correct = sum(1 for a in answers.values() if a["correct"])
        avg_time = 0.0
        if n_answers > 0:
            avg_time = sum(a["time_taken"] for a in answers.values()) / n_answers
        correct_rate = (n_correct / n_answers) if n_answers > 0 else 0.0
        stat = {
            "index": idx,
            "text": q["text"],
            "answers": n_answers,
            "correct": n_correct,
            "correct_rate": round(correct_rate, 4),
            "avg_time": round(avg_time, 3),
        }
        q_stats.append(stat)
        total_correct_all += n_correct
        total_answers_all += n_answers
        total_time_all += sum(a["time_taken"] for a in answers.values())
        total_time_count += n_answers
        if hardest is None or correct_rate < hardest["correct_rate"]:
            hardest = stat

    avg_response = (total_time_all / total_time_count) if total_time_count > 0 else 0.0
    session_doc = {
        "id": str(uuid.uuid4()),
        "pin": pin,
        "quiz_id": quiz["id"],
        "quiz_title": quiz["title"],
        "owner_id": quiz.get("owner_id"),
        "started_at": r.get("started_at_iso") or now_iso(),
        "ended_at": now_iso(),
        "total_players": total_players,
        "question_count": len(quiz["questions"]),
        "avg_response_time": round(avg_response, 3),
        "reconnects": r.get("reconnects", 0),
        "hardest_question": hardest,
        "question_stats": q_stats,
        "leaderboard": leaderboard_of(r),
    }
    await db.sessions.insert_one({**session_doc})


# ---------- Public API ----------
@api_router.get("/")
async def root():
    return {"message": "TriviaStream API"}


@api_router.post("/quizzes")
async def create_quiz(payload: QuizCreate, current_user=Depends(optional_current_user)):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Quiz title is required")
    if not payload.questions or len(payload.questions) == 0:
        raise HTTPException(status_code=400, detail="Add at least 1 question before creating a game")

    # Also profanity-check title
    w = profanity_word(payload.title)
    if w:
        raise HTTPException(status_code=400, detail=f"Quiz title contains inappropriate language ('{w}')")

    normalized_questions: List[Question] = []
    for i, q in enumerate(payload.questions):
        _validate_question_payload(q, i)
        normalized_questions.append(Question(**q.model_dump()))

    quiz = Quiz(
        title=payload.title.strip(),
        questions=normalized_questions,
        owner_id=(current_user["id"] if current_user else None),
    )
    doc = quiz.model_dump()
    await db.quizzes.insert_one(doc)
    return quiz.model_dump()


@api_router.get("/quizzes/mine")
async def my_quizzes(current_user=Depends(get_current_user)):
    docs = await db.quizzes.find(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return docs


@api_router.get("/quizzes/{quiz_id}")
async def get_quiz(quiz_id: str):
    doc = await db.quizzes.find_one({"id": quiz_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return doc


@api_router.delete("/quizzes/{quiz_id}")
async def delete_quiz(quiz_id: str, current_user=Depends(get_current_user)):
    doc = await db.quizzes.find_one({"id": quiz_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if doc.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not the owner")
    await db.quizzes.delete_one({"id": quiz_id})
    return {"ok": True}


@api_router.post("/rooms")
async def create_room(payload: CreateRoomRequest):
    quiz = await db.quizzes.find_one({"id": payload.quiz_id}, {"_id": 0})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not quiz.get("questions"):
        raise HTTPException(status_code=400, detail="Add at least 1 question before creating a game")

    pin = generate_pin()
    host_token = str(uuid.uuid4())
    host_id = str(uuid.uuid4())
    rooms[pin] = {
        "pin": pin,
        "quiz": quiz,
        "host_token": host_token,
        "host_id": host_id,
        "host_ws": None,
        "players": {},
        "connections": {},
        "status": "lobby",
        "created_at": datetime.now(timezone.utc),
        "started_at_iso": None,
        "reconnects": 0,
        "current_index": -1,
        "question_id": None,
        "question_started_at": None,
        "deadline_ts": None,
        "answers": {},
        "scores": {},
        "question_task": None,
        "host_promote_task": None,
    }
    return {
        "pin": pin,
        "host_token": host_token,
        "host_id": host_id,
        "room": public_room_state(pin),
    }


@api_router.get("/rooms/{pin}")
async def get_room(pin: str):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    return public_room_state(pin)


@api_router.post("/rooms/{pin}/join")
async def join_room(pin: str, payload: JoinRoomRequest):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found. Check the PIN.")
    room = rooms[pin]

    if room["status"] != "lobby":
        raise HTTPException(status_code=409, detail="Game Already Started")
    if len(room["players"]) >= MAX_PLAYERS_PER_ROOM:
        raise HTTPException(status_code=409, detail="Room Full")

    nickname = payload.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="Nickname is required")
    if len(nickname) > 20:
        raise HTTPException(status_code=400, detail="Nickname must be 20 characters or fewer")
    if contains_profanity(nickname):
        raise HTTPException(status_code=400, detail="Nickname contains inappropriate language")

    lower = nickname.lower()
    for p in room["players"].values():
        if p["nickname"].lower() == lower:
            raise HTTPException(status_code=409, detail="That nickname is already taken")

    player_id = str(uuid.uuid4())
    session_token = str(uuid.uuid4())
    room["players"][player_id] = {
        "id": player_id,
        "nickname": nickname,
        "connected": False,
        "session_token": session_token,
        "joined_at": now_iso(),
    }
    room["scores"][player_id] = {"points": 0, "streak": 0, "cumulative_time": 0.0}

    asyncio.create_task(broadcast_room_state(pin))

    return {
        "player_id": player_id,
        "session_token": session_token,
        "pin": pin,
        "nickname": nickname,
    }


@api_router.post("/rooms/{pin}/start")
async def start_room(pin: str, host_token: str):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms[pin]
    if room["host_token"] != host_token:
        raise HTTPException(status_code=403, detail="Invalid host token")
    if room["status"] != "lobby":
        raise HTTPException(status_code=409, detail="Game already started")
    if len(room["players"]) == 0:
        raise HTTPException(status_code=400, detail="At least 1 player is required to start")

    room["started_at_iso"] = now_iso()
    await broadcast_event(pin, {"type": "game_started", "data": {"pin": pin}})
    await start_question(pin)
    return {"status": rooms[pin]["status"]}


@api_router.post("/rooms/{pin}/next")
async def next_question(pin: str, host_token: str):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms[pin]
    if room["host_token"] != host_token:
        raise HTTPException(status_code=403, detail="Invalid host token")
    if room["status"] not in ("question_review", "lobby"):
        raise HTTPException(status_code=409, detail=f"Cannot advance from status {room['status']}")
    if room["current_index"] >= len(room["quiz"]["questions"]) - 1 and room["status"] == "question_review":
        await end_game(pin)
        return {"status": rooms[pin]["status"]}
    await start_question(pin)
    return {"status": rooms[pin]["status"]}


@api_router.post("/rooms/{pin}/skip")
async def skip_question(pin: str, host_token: str):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms[pin]
    if room["host_token"] != host_token:
        raise HTTPException(status_code=403, detail="Invalid host token")
    if room["status"] != "question_active":
        raise HTTPException(status_code=409, detail="No active question to skip")
    await end_question(pin, room["question_id"])
    return {"status": rooms[pin]["status"]}


@api_router.post("/rooms/{pin}/end")
async def end_game_early(pin: str, host_token: str):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms[pin]
    if room["host_token"] != host_token:
        raise HTTPException(status_code=403, detail="Invalid host token")
    await end_game(pin)
    return {"status": rooms[pin]["status"]}


@api_router.post("/rooms/{pin}/answer")
async def submit_answer(pin: str, payload: AnswerRequest):
    if pin not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms[pin]
    player = room["players"].get(payload.player_id)
    if not player or player["session_token"] != payload.session_token:
        raise HTTPException(status_code=403, detail="Invalid player session")
    if room["status"] != "question_active":
        raise HTTPException(status_code=409, detail="No active question")
    if room["question_id"] != payload.question_id:
        raise HTTPException(status_code=409, detail="Stale question")
    if payload.option_index < 0 or payload.option_index > 3:
        raise HTTPException(status_code=400, detail="Invalid option")

    q_idx = room["current_index"]
    answers_map = room["answers"].setdefault(q_idx, {})
    if payload.player_id in answers_map:
        raise HTTPException(status_code=409, detail="Answer already submitted")

    q = current_question(room)
    time_taken_ms = now_ms() - room["question_started_at"]
    time_taken_s = max(0.0, time_taken_ms / 1000.0)
    time_limit_s = float(q["time_limit"])
    correct = (payload.option_index == q["correct_index"])

    score = room["scores"].setdefault(
        payload.player_id, {"points": 0, "streak": 0, "cumulative_time": 0.0}
    )
    points_earned = 0
    if correct:
        base = int(round(BASE_POINTS * max(0.0, 1.0 - min(time_taken_s / time_limit_s, 1.0))))
        streak_bonus = STREAK_BONUS_STEP * score["streak"]
        points_earned = base + streak_bonus
        score["streak"] += 1
    else:
        score["streak"] = 0
    score["points"] += points_earned
    score["cumulative_time"] += time_taken_s

    answers_map[payload.player_id] = {
        "option_index": payload.option_index,
        "time_taken": time_taken_s,
        "correct": correct,
        "points_earned": points_earned,
        "streak_after": score["streak"],
    }

    await broadcast_event(
        pin,
        {"type": "answer_received", "data": {"answers_received": len(answers_map), "total_players": len(room["players"])}},
    )
    if len(answers_map) >= len(room["players"]):
        await end_question(pin, room["question_id"])

    return {
        "correct": correct,
        "points_earned": points_earned,
        "streak": score["streak"],
        "total_points": score["points"],
    }


# ---------- Sessions & analytics ----------
@api_router.get("/sessions/mine")
async def my_sessions(current_user=Depends(get_current_user)):
    docs = await db.sessions.find(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ).sort("ended_at", -1).to_list(200)
    return docs


@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user=Depends(get_current_user)):
    doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    if doc.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not the owner")
    return doc


@api_router.get("/sessions/{session_id}/report", response_class=PlainTextResponse)
async def session_report(session_id: str, current_user=Depends(get_current_user)):
    doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    if doc.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not the owner")
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Session", doc["id"], "Quiz", doc["quiz_title"], "PIN", doc["pin"]])
    writer.writerow(["Ended", doc["ended_at"], "Players", doc["total_players"], "Questions", doc["question_count"]])
    writer.writerow([])
    writer.writerow(["Rank", "Nickname", "Points", "Streak"])
    for row in doc.get("leaderboard", []):
        writer.writerow([row["rank"], row["nickname"], row["points"], row["streak"]])
    writer.writerow([])
    writer.writerow(["Q#", "Text", "Answers", "Correct", "Correct%", "Avg time (s)"])
    for s in doc.get("question_stats", []):
        writer.writerow([s["index"] + 1, s["text"], s["answers"], s["correct"], round(s["correct_rate"] * 100, 1), s["avg_time"]])
    return PlainTextResponse(
        buf.getvalue(),
        headers={"Content-Disposition": f"attachment; filename=session-{doc['pin']}.csv"},
        media_type="text/csv",
    )


@api_router.get("/analytics/question-difficulty")
async def question_difficulty(quiz_id: str, current_user=Depends(get_current_user)):
    docs = await db.sessions.find(
        {"quiz_id": quiz_id, "owner_id": current_user["id"]}, {"_id": 0, "question_stats": 1}
    ).to_list(500)
    agg: Dict[int, Dict] = {}
    for d in docs:
        for s in d.get("question_stats", []):
            a = agg.setdefault(s["index"], {"index": s["index"], "text": s["text"], "answers": 0, "correct": 0, "avg_time_sum": 0.0, "avg_time_n": 0})
            a["answers"] += s["answers"]
            a["correct"] += s["correct"]
            if s["answers"] > 0:
                a["avg_time_sum"] += s["avg_time"]
                a["avg_time_n"] += 1
    out = []
    for k in sorted(agg.keys()):
        a = agg[k]
        rate = (a["correct"] / a["answers"]) if a["answers"] > 0 else 0.0
        avg_time = (a["avg_time_sum"] / a["avg_time_n"]) if a["avg_time_n"] > 0 else 0.0
        out.append({"index": k, "text": a["text"], "answers": a["answers"], "correct": a["correct"], "correct_rate": round(rate, 4), "avg_time": round(avg_time, 3)})
    return out


# ---------- Question Bank Upload ----------
def _parse_bank_rows(raw_bytes: bytes, filename: str):
    """Return (rows, parse_error).  rows is a list of dicts."""
    name = (filename or "").lower()
    text = raw_bytes.decode("utf-8", errors="replace")
    if name.endswith(".json"):
        try:
            parsed = json_lib.loads(text)
            if isinstance(parsed, dict):
                parsed = parsed.get("questions", [])
            if not isinstance(parsed, list):
                return None, "JSON must be a list of questions"
            return parsed, None
        except Exception as e:
            return None, f"Invalid JSON: {e}"
    # default: CSV
    rows = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        rows.append({k.strip(): v for k, v in row.items() if k is not None})
    return rows, None


def _validate_bank_row(row: dict, row_number: int):
    """Return (valid_question_dict, error_message)."""
    def _get(*keys):
        for k in keys:
            if k in row and row[k] not in (None, ""):
                return row[k]
        return None

    text = _get("text", "question", "question_text")
    if not text:
        return None, f"Row {row_number}: missing question text"
    options = []
    for i in range(1, 5):
        opt = _get(f"option{i}", f"option_{i}", f"opt{i}", f"o{i}")
        if opt is None:
            return None, f"Row {row_number}: missing option{i}"
        options.append(str(opt).strip())
    if not all(o for o in options):
        return None, f"Row {row_number}: empty option value"

    correct = _get("correct_option", "correct", "correct_index", "answer")
    if correct is None:
        return None, f"Row {row_number}: missing correct_option field"
    correct_str = str(correct).strip().lower()
    correct_index = None
    if correct_str.isdigit():
        n = int(correct_str)
        if 0 <= n <= 3:
            correct_index = n
        elif 1 <= n <= 4:
            correct_index = n - 1
    if correct_index is None:
        # try matching by exact text
        for i, o in enumerate(options):
            if o.strip().lower() == correct_str:
                correct_index = i
                break
    if correct_index is None:
        return None, f"Row {row_number}: correct_option must be 1-4, 0-3, or match option text"

    time_limit_raw = _get("time_limit", "time", "seconds")
    time_limit = DEFAULT_TIME_LIMIT
    if time_limit_raw is not None:
        try:
            time_limit = int(str(time_limit_raw))
        except ValueError:
            return None, f"Row {row_number}: time_limit must be an integer"
        if time_limit < 5 or time_limit > 120:
            return None, f"Row {row_number}: time_limit must be 5-120 seconds"

    # profanity check
    for chunk in [text] + options:
        w = profanity_word(str(chunk))
        if w:
            return None, f"Row {row_number}: contains inappropriate language ('{w}')"

    return {
        "text": str(text).strip(),
        "options": options,
        "correct_index": correct_index,
        "time_limit": time_limit,
    }, None


@api_router.post("/question-bank/upload")
async def upload_bank(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    rows, err = _parse_bank_rows(raw, file.filename or "")
    if err:
        raise HTTPException(status_code=400, detail=err)
    valid = []
    errors = []
    for i, row in enumerate(rows):
        q, e = _validate_bank_row(row or {}, i + 1)
        if q:
            valid.append(q)
        else:
            errors.append(e)
    return {
        "total_rows": len(rows),
        "valid_count": len(valid),
        "error_count": len(errors),
        "valid_rows": valid,
        "errors": errors,
    }


@api_router.post("/question-bank/import")
async def import_bank(payload: ImportBankRequest, current_user=Depends(get_current_user)):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Quiz title is required")
    if not payload.questions:
        raise HTTPException(status_code=400, detail="Nothing to import")
    normalized: List[Question] = []
    for i, q in enumerate(payload.questions):
        _validate_question_payload(q, i)
        normalized.append(Question(**q.model_dump()))
    quiz = Quiz(title=payload.title.strip(), questions=normalized, owner_id=current_user["id"])
    await db.quizzes.insert_one(quiz.model_dump())
    return quiz.model_dump()


# ---------- Settings ----------
@api_router.get("/settings")
async def get_settings(current_user=Depends(get_current_user)):
    doc = await db.settings.find_one({"owner_id": current_user["id"]}, {"_id": 0})
    if not doc:
        return {"owner_id": current_user["id"], "retention_days": DEFAULT_RETENTION_DAYS}
    return doc


@api_router.put("/settings")
async def update_settings(payload: SettingsIn, current_user=Depends(get_current_user)):
    doc = {"owner_id": current_user["id"], "retention_days": payload.retention_days, "updated_at": now_iso()}
    await db.settings.update_one({"owner_id": current_user["id"]}, {"$set": doc}, upsert=True)
    return doc


# ---------- WebSockets ----------
async def _host_promotion_task(pin: str):
    try:
        await asyncio.sleep(HOST_PROMOTION_GRACE_SECONDS)
        r = rooms.get(pin)
        if not r or r.get("host_ws") is not None:
            return
        candidate_id = None
        for pid, p in r["players"].items():
            if p.get("connected"):
                candidate_id = pid
                break
        if candidate_id is None:
            await end_game(pin)
            return
        new_host_token = str(uuid.uuid4())
        new_host_id = str(uuid.uuid4())
        old_ws = r["connections"].pop(candidate_id, None)
        promoted_nick = r["players"][candidate_id]["nickname"]
        r["players"].pop(candidate_id, None)
        r["scores"].pop(candidate_id, None)
        r["host_token"] = new_host_token
        r["host_id"] = new_host_id
        if old_ws is not None:
            try:
                await old_ws.send_json({
                    "type": "promoted_to_host",
                    "data": {"pin": pin, "host_token": new_host_token, "host_id": new_host_id},
                })
            except Exception:
                pass
        await broadcast_event(pin, {"type": "host_changed", "data": {"nickname": promoted_nick}})
        await broadcast_room_state(pin)
    except asyncio.CancelledError:
        return


@app.websocket("/api/ws/rooms/{pin}")
async def ws_room(websocket: WebSocket, pin: str, role: str = "player", token: str = ""):
    await websocket.accept()

    if pin not in rooms:
        await websocket.send_json({"type": "error", "data": {"message": "Room not found"}})
        await websocket.close()
        return

    room = rooms[pin]

    if role == "host":
        if token != room["host_token"]:
            await websocket.send_json({"type": "error", "data": {"message": "Invalid host token"}})
            await websocket.close()
            return
        prev_task = room.get("host_promote_task")
        if prev_task and not prev_task.done():
            prev_task.cancel()
            room["host_promote_task"] = None
        room["host_ws"] = websocket
        try:
            await websocket.send_json({"type": "room_state", "data": public_room_state(pin)})
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.exception("host ws error: %s", e)
        finally:
            r = rooms.get(pin)
            if r and r.get("host_ws") is websocket:
                r["host_ws"] = None
                if r["status"] not in ("game_over",):
                    r["host_promote_task"] = asyncio.create_task(_host_promotion_task(pin))
        return

    # player role
    player = None
    if token in room["players"]:
        player = room["players"][token]
    else:
        for p in room["players"].values():
            if p.get("session_token") == token:
                player = p
                break
    if not player:
        await websocket.send_json({"type": "error", "data": {"message": "Player not found in room"}})
        await websocket.close()
        return

    player_id = player["id"]
    was_previously_connected = player.get("connected")
    player["connected"] = True
    room["connections"][player_id] = websocket
    if was_previously_connected:
        room["reconnects"] = room.get("reconnects", 0) + 1
    await broadcast_room_state(pin)

    try:
        await websocket.send_json({"type": "room_state", "data": public_room_state(pin)})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("player ws error: %s", e)
    finally:
        if rooms.get(pin):
            if rooms[pin]["connections"].get(player_id) is websocket:
                rooms[pin]["connections"].pop(player_id, None)
                if player_id in rooms[pin]["players"]:
                    rooms[pin]["players"][player_id]["connected"] = False
                await broadcast_room_state(pin)


# ---------- Room + retention cleanup ----------
async def cleanup_rooms_task():
    while True:
        await asyncio.sleep(60 * 10)
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=ROOM_TTL_SECONDS)
        stale = [pin for pin, r in rooms.items() if r["created_at"] < cutoff]
        for pin in stale:
            r = rooms.pop(pin, None)
            if r:
                t = r.get("question_task")
                if t and not t.done():
                    t.cancel()
            logger.info("cleaned stale room %s", pin)


async def retention_purge_task():
    """Purge sessions per host-configured retention_days."""
    while True:
        await asyncio.sleep(60 * 60)  # hourly
        try:
            settings = await db.settings.find({}, {"_id": 0}).to_list(1000)
            for s in settings:
                days = int(s.get("retention_days", DEFAULT_RETENTION_DAYS))
                cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
                await db.sessions.delete_many({"owner_id": s["owner_id"], "ended_at": {"$lt": cutoff}})
        except Exception as e:
            logger.exception("retention_purge_task failed: %s", e)


@app.on_event("startup")
async def start_bg():
    await seed_admin(db)
    asyncio.create_task(cleanup_rooms_task())
    asyncio.create_task(retention_purge_task())


app.include_router(auth_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
