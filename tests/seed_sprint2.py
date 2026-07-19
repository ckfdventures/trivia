"""Seed helper: creates quiz + room + 2 players, prints JSON with tokens."""
import requests, json, os, sys

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://real-time-trivia-1.preview.emergentagent.com").rstrip("/") + "/api"

quiz_payload = {
    "title": "TEST_Sprint2_UI",
    "questions": [
        {
            "text": "TEST Q1: 2 + 2 = ?",
            "options": ["3", "4", "5", "22"],
            "correct_index": 1,
            "time_limit": 15,
        },
        {
            "text": "TEST Q2: Capital of France?",
            "options": ["Berlin", "Madrid", "Paris", "Rome"],
            "correct_index": 2,
            "time_limit": 15,
        },
    ],
}

r = requests.post(f"{BASE}/quizzes", json=quiz_payload); r.raise_for_status()
quiz = r.json()

r = requests.post(f"{BASE}/rooms", json={"quiz_id": quiz["id"]}); r.raise_for_status()
room = r.json()
pin = room["pin"]

players = []
for nick in ["TESTAlice", "TESTBob"]:
    r = requests.post(f"{BASE}/rooms/{pin}/join", json={"nickname": nick}); r.raise_for_status()
    players.append(r.json())

out = {
    "pin": pin,
    "host_token": room["host_token"],
    "host_id": room["host_id"],
    "quiz_title": quiz["title"],
    "players": players,
}
print(json.dumps(out))
