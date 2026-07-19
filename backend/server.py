from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
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

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


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
    # sort by -points, then cumulative_time ASC (faster is better)
    entries.sort(key=lambda e: (-e["points"], e["cumulative_time"]))
    # add rank and tie flags
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


def current_question(room: dict) -> Optional[dict]:
    idx = room["current_index"]
    if idx < 0 or idx >= len(room["quiz"]["questions"]):
        return None
    return room["quiz"]["questions"][idx]


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


async def send_to_player(pin: str, player_id: str, event: dict) -> bool:
    ws = rooms.get(pin, {}).get("connections", {}).get(player_id)
    if not ws:
        return False
    try:
        await ws.send_json(event)
        return True
    except Exception:
        rooms[pin]["connections"].pop(player_id, None)
        return False


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

    # cancel any previous timer task
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

    # Score any player who didn't answer as incorrect (streak reset)
    for pid in list(r["players"].keys()):
        if pid not in answers_map:
            s = r["scores"].setdefault(pid, {"points": 0, "streak": 0, "cumulative_time": 0.0})
            s["streak"] = 0

    r["status"] = "question_review"
    # cancel timer if still scheduled
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
    await broadcast_room_state(pin)


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "TriviaStream API"}


@api_router.post("/quizzes")
async def create_quiz(payload: QuizCreate):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Quiz title is required")
    if not payload.questions or len(payload.questions) == 0:
        raise HTTPException(status_code=400, detail="Add at least 1 question before creating a game")

    normalized_questions: List[Question] = []
    for i, q in enumerate(payload.questions):
        if not q.text.strip():
            raise HTTPException(status_code=400, detail=f"Question {i+1}: text is required")
        if len(q.options) != 4:
            raise HTTPException(status_code=400, detail=f"Question {i+1}: exactly 4 options are required")
        for j, opt in enumerate(q.options):
            if not opt.strip():
                raise HTTPException(status_code=400, detail=f"Question {i+1}: option {j+1} is empty")
        if q.correct_index < 0 or q.correct_index > 3:
            raise HTTPException(status_code=400, detail=f"Question {i+1}: correct_index must be 0-3")
        if q.time_limit < 5 or q.time_limit > 120:
            raise HTTPException(status_code=400, detail=f"Question {i+1}: time_limit must be 5-120s")
        normalized_questions.append(Question(**q.model_dump()))

    quiz = Quiz(title=payload.title.strip(), questions=normalized_questions)
    doc = quiz.model_dump()
    await db.quizzes.insert_one(doc)
    return quiz.model_dump()


@api_router.get("/quizzes/{quiz_id}")
async def get_quiz(quiz_id: str):
    doc = await db.quizzes.find_one({"id": quiz_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return doc


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
        # Sprint 2 state
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
    # If last question was answered, end game
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
        {
            "type": "answer_received",
            "data": {
                "answers_received": len(answers_map),
                "total_players": len(room["players"]),
            },
        },
    )

    # If all players answered, end early
    if len(answers_map) >= len(room["players"]):
        await end_question(pin, room["question_id"])

    return {
        "correct": correct,
        "points_earned": points_earned,
        "streak": score["streak"],
        "total_points": score["points"],
    }


# ---------- WebSockets ----------
async def _host_promotion_task(pin: str):
    try:
        await asyncio.sleep(HOST_PROMOTION_GRACE_SECONDS)
        r = rooms.get(pin)
        if not r or r.get("host_ws") is not None:
            return
        # promote first connected player
        candidate_id = None
        for pid, p in r["players"].items():
            if p.get("connected"):
                candidate_id = pid
                break
        if candidate_id is None:
            # nobody to promote — end game
            await end_game(pin)
            return
        new_host_token = str(uuid.uuid4())
        new_host_id = str(uuid.uuid4())
        old_ws = r["connections"].pop(candidate_id, None)
        promoted_nick = r["players"][candidate_id]["nickname"]
        # remove candidate from players
        r["players"].pop(candidate_id, None)
        r["scores"].pop(candidate_id, None)
        r["host_token"] = new_host_token
        r["host_id"] = new_host_id
        # notify promoted player
        if old_ws is not None:
            try:
                await old_ws.send_json({
                    "type": "promoted_to_host",
                    "data": {
                        "pin": pin,
                        "host_token": new_host_token,
                        "host_id": new_host_id,
                    },
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
        # cancel any pending promotion
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

    # player role — token can be player_id or session_token
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
    player["connected"] = True
    room["connections"][player_id] = websocket
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


# ---------- Room cleanup ----------
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


@app.on_event("startup")
async def start_bg():
    asyncio.create_task(cleanup_rooms_task())


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
