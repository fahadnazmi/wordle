"""
Wordle clone — Flask backend.

The secret word never leaves the server while a game is in progress:
the browser only ever receives per-letter correct/present/absent
results, so opening dev tools can't spoil the answer.
"""
import json
import os
import random
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
app.secret_key = os.urandom(24)

# ---- Load the word bank once at startup -----------------------------------
with open(BASE_DIR / "data" / "words.json", encoding="utf-8") as f:
    _raw = json.load(f)

with open(BASE_DIR / "data" / "hint_questions.json", encoding="utf-8") as f:
    HINT_QUESTION_BANK = json.load(f)

WORDS = {
    int(length): {"answers": data["answers"], "valid": set(data["valid"])}
    for length, data in _raw.items()
}

WORD_LENGTHS = sorted(WORDS.keys())
GUESS_OPTIONS = [4, 5, 6, 7, 8, 9, 10]

DEFAULT_WORD_LENGTH = 5
DEFAULT_MAX_GUESSES = 6
MAX_HINTS = 3

# In-memory game state, keyed by a random id stored in the session cookie.
# (A dict is plenty for a single local player; nothing is persisted to disk.)
GAMES = {}


def _normalize_answer(value):
    return str(value).strip().lower()


def _next_revealable_letter(game):
    used = {letter.lower() for letter in game.get("known_letters", [])}
    for letter in sorted(set(game["answer"].lower())):
        if letter not in used:
            return letter
    return None


def _sync_known_letters(game, guess, result):
    discovered = []
    for status, letter in zip(result, guess.lower()):
        if status in {"correct", "present"} and letter not in discovered:
            discovered.append(letter)
    if not discovered:
        return

    current = list(game.get("known_letters", []))
    for letter in discovered:
        if letter not in current:
            current.append(letter)
    game["known_letters"] = list(dict.fromkeys(current))


def _hint_question_for_game(game):
    if game["hints_used"] >= MAX_HINTS:
        return None, "You have used all 3 hints for this round."
    if _next_revealable_letter(game) is None:
        return None, "All letters in the word are already known."

    difficulty_order = ["easy", "medium", "hard"]
    difficulty = difficulty_order[min(game["hints_used"], len(difficulty_order) - 1)]
    pool = HINT_QUESTION_BANK.get(difficulty, [])
    if not pool:
        return None, "No questions are available for this difficulty."
    return random.choice(pool), difficulty


def score_guess(guess, answer):
    """Standard Wordle scoring: exact matches first, then leftover letters."""
    n = len(answer)
    result = [None] * n
    remaining = {}

    for i in range(n):
        if guess[i] == answer[i]:
            result[i] = "correct"
        else:
            remaining[answer[i]] = remaining.get(answer[i], 0) + 1

    for i in range(n):
        if result[i] is not None:
            continue
        c = guess[i]
        if remaining.get(c, 0) > 0:
            result[i] = "present"
            remaining[c] -= 1
        else:
            result[i] = "absent"

    return result


def new_game(word_length, max_guesses):
    answer = random.choice(WORDS[word_length]["answers"])
    gid = uuid.uuid4().hex
    GAMES[gid] = {
        "answer": answer,
        "word_length": word_length,
        "max_guesses": max_guesses,
        "guesses": [],  # list of {"guess": str, "result": [...]}
        "over": False,
        "won": False,
        "hints_used": 0,
        "known_letters": [],
        "pending_hint": None,
    }
    session["gid"] = gid
    return gid, GAMES[gid]


def current_game():
    gid = session.get("gid")
    if not gid or gid not in GAMES:
        return None
    return GAMES[gid]


def public_state(game):
    state = {
        "active": True,
        "word_length": game["word_length"],
        "max_guesses": game["max_guesses"],
        "guesses": game["guesses"],
        "over": game["over"],
        "won": game["won"],
        "hints_used": game["hints_used"],
        "max_hints": MAX_HINTS,
        "remaining_hints": max(0, MAX_HINTS - game["hints_used"]),
        "known_letters": game.get("known_letters", []),
        "unique_letter_count": len(set(game["answer"].lower())),
        "hint_available": game["hints_used"] < MAX_HINTS and _next_revealable_letter(game) is not None,
    }
    if game["over"]:
        state["answer"] = game["answer"]
    return state


@app.route("/")
def index():
    return render_template(
        "index.html",
        word_lengths=WORD_LENGTHS,
        guess_options=GUESS_OPTIONS,
        default_word_length=DEFAULT_WORD_LENGTH,
        default_max_guesses=DEFAULT_MAX_GUESSES,
    )


@app.route("/api/state")
def api_state():
    game = current_game()
    if not game:
        return jsonify({"active": False})
    return jsonify(public_state(game))


@app.route("/api/new", methods=["POST"])
def api_new():
    body = request.get_json(silent=True) or {}
    word_length = int(body.get("word_length", DEFAULT_WORD_LENGTH))
    max_guesses = int(body.get("max_guesses", DEFAULT_MAX_GUESSES))

    if word_length not in WORDS:
        return jsonify({"error": f"Word length must be one of {WORD_LENGTHS}"}), 400
    if max_guesses not in GUESS_OPTIONS:
        return jsonify({"error": f"Guess count must be one of {GUESS_OPTIONS}"}), 400

    _, game = new_game(word_length, max_guesses)
    return jsonify(public_state(game))


@app.route("/api/hint/question")
def api_hint_question():
    game = current_game()
    if not game:
        return jsonify({"error": "No active game. Start a new one."}), 400
    if game["over"]:
        return jsonify({"error": "The game is already over."}), 400

    question, difficulty = _hint_question_for_game(game)
    if question is None:
        return jsonify({"error": difficulty}), 400

    game["pending_hint"] = {
        "prompt": question["prompt"],
        "answer": question["answer"],
        "difficulty": difficulty,
    }
    return jsonify(
        {
            "question": game["pending_hint"],
            "difficulty": difficulty,
            "remaining_hints": max(0, MAX_HINTS - game["hints_used"]),
        }
    )


@app.route("/api/hint/answer", methods=["POST"])
def api_hint_answer():
    game = current_game()
    if not game:
        return jsonify({"error": "No active game. Start a new one."}), 400
    if game["over"]:
        return jsonify({"error": "The game is already over."}), 400
    if not game.get("pending_hint"):
        return jsonify({"error": "Ask for a hint question first."}), 400

    body = request.get_json(silent=True) or {}
    submitted_answer = _normalize_answer(body.get("answer", ""))
    expected_answer = _normalize_answer(game["pending_hint"]["answer"])
    game["hints_used"] += 1
    game["pending_hint"] = None

    if submitted_answer != expected_answer:
        return jsonify(
            {
                "correct": False,
                "message": "That answer is incorrect. The hint has been wasted.",
                "remaining_hints": max(0, MAX_HINTS - game["hints_used"]),
                "revealed_letter": None,
                "known_letters": game.get("known_letters", []),
            }
        )

    letter = _next_revealable_letter(game)
    if letter is not None:
        game["known_letters"] = [*game.get("known_letters", []), letter] if letter not in game.get("known_letters", []) else game.get("known_letters", [])
        game["known_letters"] = list(dict.fromkeys(game["known_letters"]))
    return jsonify(
        {
            "correct": True,
            "message": f"Correct! The word contains the letter '{letter.upper() if letter else ''}'.",
            "remaining_hints": max(0, MAX_HINTS - game["hints_used"]),
            "revealed_letter": letter.upper() if letter else None,
            "known_letters": game.get("known_letters", []),
        }
    )


@app.route("/api/guess", methods=["POST"])
def api_guess():
    game = current_game()
    if not game:
        return jsonify({"error": "No active game. Start a new one."}), 400
    if game["over"]:
        return jsonify({"error": "Game is already over."}), 400

    body = request.get_json(silent=True) or {}
    guess = str(body.get("guess", "")).strip().lower()
    n = game["word_length"]

    if len(guess) != n:
        return jsonify({"error": f"Word must be {n} letters."}), 400
    if not guess.isalpha():
        return jsonify({"error": "Letters only, please."}), 400
    if guess not in WORDS[n]["valid"]:
        return jsonify({"error": "Not in word list."}), 400

    result = score_guess(guess, game["answer"])
    _sync_known_letters(game, guess, result)
    game["guesses"].append({"guess": guess, "result": result})

    won = all(r == "correct" for r in result)
    game["won"] = won
    game["over"] = won or len(game["guesses"]) >= game["max_guesses"]

    return jsonify(public_state(game))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
