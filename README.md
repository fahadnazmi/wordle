## Setup

You need Python 3.8+ installed. Then, from this folder:

```bash
# 1. (recommended) create a virtual environment
python3 -m venv venv
source venv/bin/activate        # on Windows: venv\Scripts\activate

# 2. install the one dependency
pip install -r requirements.txt

# 3. run it
python app.py
```

Open **http://127.0.0.1:5000** in your browser. That's it.

Stop the server anytime with `Ctrl+C`.

## How to play

Guess the hidden word one letter at a time:

- Type letters on your keyboard (or tap the on-screen keys), then press **Enter**.
- After each guess, each tile is colored:
  - **Green** — right letter, right spot
  - **Yellow** — right letter, wrong spot
  - **Gray** — letter isn't in the word
- Guess the word before you run out of tries.

Click the **⚙ settings** icon (top right) to change the word length
(4–8 letters) and the number of tries (4–10) — this starts a fresh word.
Click **"start a new word →"** at the bottom any time you want a new
puzzle without changing settings.

Your in-progress game survives a page refresh. Restarting the Python
server starts everyone fresh, since the game state lives in memory only.

## Project structure

```
wordle/
├── app.py                # Flask app: game logic + API routes
├── data/
│   └── words.json        # curated word lists (lengths 4–8), answers + valid guesses
├── templates/
│   └── index.html        # page markup
├── static/
│   ├── style.css          # visual design
│   └── script.js          # game/UI logic (grid, keyboard, API calls)
└── requirements.txt
```

## How the word list was built

`data/words.json` was generated offline from the system English dictionary,
filtered down to real, common words using word-frequency data (so you won't
get obscure dictionary entries as answers). Each word length has:

- `answers` — the pool the game picks the secret word from (common words)
- `valid` — a much larger set of accepted guesses (so uncommon-but-real
  words aren't rejected when you guess them)

## Notes on fair play

The secret word is kept server-side in memory and is only sent to the
browser once the game ends (win or lose). Guesses are validated and scored
on the server, so the answer never sits in the page source or network
responses while a game is in progress.
