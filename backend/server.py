from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import string
import asyncio
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
ROOM_TTL_SECONDS = 3 * 60 * 60  # 3 hours

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Models ----------
class QuestionIn(BaseModel):
    text: str
    options: List[str]  # exactly 4
    correct_index: int  # 0..3
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


class Player(BaseModel):
    id: str
    nickname: str
    connected: bool = False
    joined_at: str


# ---------- In-memory state ----------
# rooms[pin] = {quiz, host_token, players: {player_id: Player}, status, created_at, connections: {player_id: WebSocket}, host_ws: WebSocket, host_id}
rooms: Dict[str, Dict] = {}


def generate_pin() -> str:
    while True:
        pin = "".join(random.choices(string.digits, k=6))
        if pin not in rooms:
            return pin


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_room_state(pin: str) -> dict:
    r = rooms[pin]
    return {
        "pin": pin,
        "status": r["status"],
        "quiz_title": r["quiz"]["title"],
        "question_count": len(r["quiz"]["questions"]),
        "players": [
            {"id": p["id"], "nickname": p["nickname"], "connected": p["connected"]}
            for p in r["players"].values()
        ],
        "max_players": MAX_PLAYERS_PER_ROOM,
    }


async def broadcast_room_state(pin: str):
    if pin not in rooms:
        return
    payload = {"type": "room_state", "data": public_room_state(pin)}
    # Send to host
    host_ws = rooms[pin].get("host_ws")
    if host_ws is not None:
        try:
            await host_ws.send_json(payload)
        except Exception:
            rooms[pin]["host_ws"] = None
    # Send to all player connections
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
        "status": "lobby",  # lobby | in_progress | game_over
        "created_at": datetime.now(timezone.utc),
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

    # case-insensitive uniqueness
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

    # broadcast update
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

    room["status"] = "in_progress"
    await broadcast_room_state(pin)
    await broadcast_event(pin, {"type": "game_started", "data": {"pin": pin}})
    return {"status": "in_progress"}


# ---------- WebSockets ----------
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
        room["host_ws"] = websocket
        try:
            await websocket.send_json({"type": "room_state", "data": public_room_state(pin)})
            while True:
                # keep-alive; host currently doesn't send messages
                await websocket.receive_text()
        except WebSocketDisconnect:
            if rooms.get(pin) and rooms[pin].get("host_ws") is websocket:
                rooms[pin]["host_ws"] = None
        except Exception as e:
            logger.exception("host ws error: %s", e)
        return

    # player role
    player = room["players"].get(token) or next(
        (p for p in room["players"].values() if p.get("session_token") == token), None
    )
    if not player:
        # allow token to be player_id OR session_token
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
        await asyncio.sleep(60 * 10)  # every 10 minutes
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=ROOM_TTL_SECONDS)
        stale = [pin for pin, r in rooms.items() if r["created_at"] < cutoff]
        for pin in stale:
            rooms.pop(pin, None)
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
