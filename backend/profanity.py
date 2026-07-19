"""Simple local wordlist profanity filter for TriviaStream Sprint 3."""
import re

# Small demo wordlist — kept SFW to avoid embedding slurs in source.
# Extend as needed; matching is case-insensitive and word-boundary aware.
BAD_WORDS = {
    "idiot",
    "stupid",
    "damn",
    "hell",
    "crap",
    "sucks",
    "moron",
    "loser",
    "shutup",
    "shut-up",
}


def _normalize(text: str) -> str:
    return text.lower()


def contains_profanity(text: str) -> bool:
    if not text:
        return False
    lowered = _normalize(text)
    for word in BAD_WORDS:
        pattern = r"\b" + re.escape(word) + r"\b"
        if re.search(pattern, lowered):
            return True
    return False


def clean(text: str) -> str:
    """Return the offending word if present, else empty string."""
    if not text:
        return ""
    lowered = _normalize(text)
    for word in BAD_WORDS:
        if re.search(r"\b" + re.escape(word) + r"\b", lowered):
            return word
    return ""
