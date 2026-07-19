(function () {
  const cfg = window.GAME_CONFIG;

  let wordLength = cfg.defaultWordLength;
  let maxGuesses = cfg.defaultMaxGuesses;
  let currentRow = 0;
  let currentGuess = "";
  let gameOver = false;
  let submitting = false;
  let hintsRemaining = 3;
  let currentHintQuestion = null;
  const keyStatus = {}; // letter -> 'correct' | 'present' | 'absent'

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const messageEl = document.getElementById("message");
  const bgLayer = document.getElementById("background-layer");
  const defLength = document.getElementById("def-length");
  const defGuesses = document.getElementById("def-guesses");
  const hintBtn = document.getElementById("hint-btn");
  const hintStatusEl = document.getElementById("hint-status");
  const hintModal = document.getElementById("hint-modal");
  const hintQuestionText = document.getElementById("hint-question-text");
  const hintAnswerEl = document.getElementById("hint-answer");

  const KB_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "back"],
  ];

  const STATUS_RANK = { absent: 1, present: 2, correct: 3 };

  // ---------------- board / keyboard rendering ----------------

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateRows = `repeat(${maxGuesses}, 1fr)`;
    for (let r = 0; r < maxGuesses; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
      for (let c = 0; c < wordLength; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.id = `tile-${r}-${c}`;
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    KB_ROWS.forEach((rowKeys) => {
      const row = document.createElement("div");
      row.className = "kb-row";
      rowKeys.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "key";
        btn.dataset.key = k;
        if (k === "enter" || k === "back") btn.classList.add("wide");
        btn.textContent = k === "enter" ? "enter" : k === "back" ? "⌫" : k;
        btn.addEventListener("click", () => handleKey(k));
        row.appendChild(btn);
      });
      keyboardEl.appendChild(row);
    });
  }

  function refreshKeyboardColors() {
    document.querySelectorAll(".key").forEach((btn) => {
      const k = btn.dataset.key;
      btn.classList.remove("correct", "present", "absent");
      if (keyStatus[k]) btn.classList.add(keyStatus[k]);
    });
  }

  function updateDefinition() {
    defLength.textContent = wordLength;
    defGuesses.textContent = maxGuesses;
  }

  function updateHintUI() {
    hintStatusEl.textContent = `${hintsRemaining} hint${hintsRemaining === 1 ? "" : "s"} left`;
    hintBtn.disabled = hintsRemaining <= 0 || gameOver;
  }

  function openHintModal() {
    hintAnswerEl.value = "";
    hintQuestionText.textContent = currentHintQuestion ? currentHintQuestion.prompt : "Ask for a hint to begin.";
    hintModal.classList.remove("hidden");
    hintAnswerEl.focus();
  }

  function closeHintModal() {
    hintModal.classList.add("hidden");
  }

  async function fetchHintQuestion() {
    const res = await fetch("/api/hint/question");
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.error || "Hint unavailable.", "error");
      return;
    }
    currentHintQuestion = data.question;
    hintsRemaining = data.remaining_hints;
    updateHintUI();
    openHintModal();
  }

  async function submitHintAnswer() {
    if (!currentHintQuestion) {
      showMessage("Ask for a hint question first.", "error");
      return;
    }
    const res = await fetch("/api/hint/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: hintAnswerEl.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.error || "Unable to submit the answer.", "error");
      return;
    }
    hintsRemaining = data.remaining_hints;
    updateHintUI();
    if (data.correct) {
      showMessage(data.message, "success");
    } else {
      showMessage(data.message, "error");
    }
    closeHintModal();
  }

  // ---------------- messages ----------------

  let msgTimer = null;
  function showMessage(text, kind, options = {}) {
    clearTimeout(msgTimer);
    messageEl.textContent = text;
    messageEl.className = kind ? `show ${kind}` : "show";
    if (options.persist) {
      return;
    }
    if (kind !== "success") {
      msgTimer = setTimeout(() => {
        messageEl.className = "";
      }, 1800);
    }
  }

  // ---------------- input handling ----------------

  function handleKey(k) {
    if (gameOver || submitting) return;
    if (k === "enter") {
      submitGuess();
    } else if (k === "back") {
      currentGuess = currentGuess.slice(0, -1);
      renderCurrentRow();
    } else if (/^[a-z]$/.test(k)) {
      if (currentGuess.length < wordLength) {
        currentGuess += k;
        renderCurrentRow(true);
      }
    }
  }

  function renderCurrentRow(justPopped) {
    for (let c = 0; c < wordLength; c++) {
      const tile = document.getElementById(`tile-${currentRow}-${c}`);
      const letter = currentGuess[c];
      tile.textContent = letter ? letter : "";
      tile.classList.toggle("filled", Boolean(letter));
    }
    if (justPopped) {
      const c = currentGuess.length - 1;
      const tile = document.getElementById(`tile-${currentRow}-${c}`);
      tile.classList.remove("pop");
      void tile.offsetWidth;
      tile.classList.add("pop");
    }
  }

  function shakeCurrentRow() {
    for (let c = 0; c < wordLength; c++) {
      document.getElementById(`tile-${currentRow}-${c}`).classList.add("shake");
    }
    setTimeout(() => {
      for (let c = 0; c < wordLength; c++) {
        document.getElementById(`tile-${currentRow}-${c}`).classList.remove("shake");
      }
    }, 320);
  }

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("settings-modal").classList.contains("hidden")) return;
    const key = e.key.toLowerCase();
    if (key === "enter") handleKey("enter");
    else if (key === "backspace") handleKey("back");
    else if (/^[a-z]$/.test(key)) handleKey(key);
  });

  // ---------------- API calls ----------------

  async function submitGuess() {
    if (currentGuess.length !== wordLength) {
      showMessage(`Word must be ${wordLength} letters.`, "error");
      shakeCurrentRow();
      return;
    }
    submitting = true;
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: currentGuess }),
      });
      const data = await res.json();

      if (!res.ok) {
        showMessage(data.error || "Something went wrong.", "error");
        shakeCurrentRow();
        submitting = false;
        return;
      }

      await revealRow(currentRow, data.guesses[data.guesses.length - 1]);
      currentRow += 1;
      currentGuess = "";

      if (data.over) {
        gameOver = true;
        if (data.won) {
          showMessage("Magnificent! You found it.", "success", { persist: true });
          bounceRow(currentRow - 1);
        } else {
          showMessage(`So close — the word was ${data.answer.toUpperCase()}.`, "error", { persist: true });
        }
      }
    } catch (err) {
      showMessage("Couldn't reach the server. Is it still running?", "error");
    } finally {
      submitting = false;
    }
  }

  function revealRow(row, guessData) {
    return new Promise((resolve) => {
      const { guess, result } = guessData;
      result.forEach((status, c) => {
        const tile = document.getElementById(`tile-${row}-${c}`);
        setTimeout(() => {
          tile.textContent = guess[c];
          tile.classList.add("flip", status);
          const letter = guess[c];
          const rank = STATUS_RANK[status];
          if (!keyStatus[letter] || STATUS_RANK[keyStatus[letter]] < rank) {
            keyStatus[letter] = status;
          }
          refreshKeyboardColors();
          if (c === result.length - 1) {
            setTimeout(resolve, 250);
          }
        }, c * 200);
      });
    });
  }

  function bounceRow(row) {
    for (let c = 0; c < wordLength; c++) {
      const tile = document.getElementById(`tile-${row}-${c}`);
      setTimeout(() => tile.classList.add("winner"), c * 80);
    }
  }

  async function startNewGame(newWordLength, newMaxGuesses) {
    const res = await fetch("/api/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_length: newWordLength, max_guesses: newMaxGuesses }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.error || "Couldn't start a new game.", "error");
      return;
    }
    applyGameState(data, true);
  }

  function applyGameState(data, isFresh) {
    wordLength = data.word_length;
    maxGuesses = data.max_guesses;
    gameOver = data.over;
    currentRow = 0;
    currentGuess = "";
    for (const k in keyStatus) delete keyStatus[k];

    buildBoard();
    buildKeyboard();
    updateDefinition();
    hintsRemaining = data.remaining_hints;
    currentHintQuestion = null;
    updateHintUI();
    clearTimeout(msgTimer);
    msgTimer = null;
    messageEl.className = "";

    if (!isFresh && data.guesses && data.guesses.length) {
      data.guesses.forEach((g, r) => {
        g.result.forEach((status, c) => {
          const tile = document.getElementById(`tile-${r}-${c}`);
          tile.textContent = g.guess[c];
          tile.classList.add(status);
          const letter = g.guess[c];
          const rank = STATUS_RANK[status];
          if (!keyStatus[letter] || STATUS_RANK[keyStatus[letter]] < rank) {
            keyStatus[letter] = status;
          }
        });
      });
      currentRow = data.guesses.length;
      refreshKeyboardColors();
      if (data.over && !data.won) {
        showMessage(`So close — the word was ${data.answer.toUpperCase()}.`, "error", { persist: true });
      } else if (data.over && data.won) {
        showMessage("Magnificent! You found it.", "success", { persist: true });
      }
    }
  }

  // ---------------- settings modal ----------------

  const modal = document.getElementById("settings-modal");
  const lengthChips = document.getElementById("length-chips");
  const guessChips = document.getElementById("guess-chips");
  let pendingLength = wordLength;
  let pendingGuesses = maxGuesses;

  function buildChips(container, options, current, onPick) {
    container.innerHTML = "";
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "chip" + (opt === current ? " active" : "");
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        [...container.children].forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        onPick(opt);
      });
      container.appendChild(btn);
    });
  }

  document.getElementById("settings-btn").addEventListener("click", () => {
    pendingLength = wordLength;
    pendingGuesses = maxGuesses;
    buildChips(lengthChips, cfg.wordLengths, pendingLength, (v) => (pendingLength = v));
    buildChips(guessChips, cfg.guessOptions, pendingGuesses, (v) => (pendingGuesses = v));
    modal.classList.remove("hidden");
  });

  document.getElementById("modal-cancel").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  document.getElementById("modal-apply").addEventListener("click", () => {
    modal.classList.add("hidden");
    startNewGame(pendingLength, pendingGuesses);
  });

  document.getElementById("new-game-btn").addEventListener("click", () => {
    startNewGame(wordLength, maxGuesses);
  });

  hintBtn.addEventListener("click", () => {
    if (hintsRemaining <= 0 || gameOver) {
      showMessage("No hints remaining for this round.", "error");
      return;
    }
    fetchHintQuestion();
  });

  document.getElementById("hint-close").addEventListener("click", closeHintModal);
  document.getElementById("hint-submit").addEventListener("click", submitHintAnswer);

  function createFallingNumbers() {
    if (!bgLayer || typeof gsap === "undefined") return;
    const count = window.innerWidth < 700 ? 30 : 44;
    const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "number";
      el.textContent = pool[Math.floor(Math.random() * pool.length)];
      el.style.left = `${Math.random() * 100}%`;
      el.style.fontSize = `${1 + Math.random() * 1.35}rem`;
      el.style.opacity = `${0.24 + Math.random() * 0.28}`;
      bgLayer.appendChild(el);

      const duration = 7 + Math.random() * 6;
      const drift = (Math.random() - 0.5) * 180;
      const startY = -10 - Math.random() * 24;
      const delay = Math.random() * 2.4;

      gsap.set(el, { y: startY, x: 0, rotation: 0 });
      gsap.to(el, {
        y: "120vh",
        x: drift,
        rotation: 360,
        duration,
        ease: "none",
        delay,
        repeat: -1,
        onRepeat: () => {
          gsap.set(el, {
            y: startY,
            x: 0,
            rotation: 0,
            opacity: 0.24 + Math.random() * 0.28,
          });
        },
      });
    }
  }

  // ---------------- boot ----------------

  async function boot() {
    createFallingNumbers();
    const res = await fetch("/api/state");
    const data = await res.json();
    if (data.active) {
      applyGameState(data, false);
    } else {
      await startNewGame(cfg.defaultWordLength, cfg.defaultMaxGuesses);
    }
  }

  boot();
})();
