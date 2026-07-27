const api = window.xiaoluPet;
const sprite = document.getElementById("sprite");
const card = document.getElementById("pet-card");
const message = document.getElementById("message");
const messageCopy = document.getElementById("message-copy");
const messageActions = document.getElementById("message-actions");
const effect = document.getElementById("effect");

const animations = {
  idle: { row: 0, frames: 6, duration: 5500, oneShotIterations: 1 },
  "running-right": { row: 1, frames: 8, duration: 720, oneShotIterations: 1 },
  "running-left": { row: 2, frames: 8, duration: 720, oneShotIterations: 1 },
  waving: { row: 3, frames: 4, duration: 700, oneShotIterations: 2 },
  jumping: { row: 4, frames: 5, duration: 840, oneShotIterations: 2 },
  failed: { row: 5, frames: 8, duration: 1250, oneShotIterations: 1 },
  waiting: { row: 6, frames: 6, duration: 1100, oneShotIterations: 1 },
  running: { row: 7, frames: 6, duration: 1000, oneShotIterations: 1 },
  review: { row: 8, frames: 6, duration: 1100, oneShotIterations: 1 },
};

let actionLocked = false;
let actionTimer = null;
let messageTimer = null;
let typingTimer = null;
let typingGeneration = 0;
let activeMessageKey = "";
let transientSequence = 0;
let transientActive = false;
const completedMessageKeys = new Set();
let dragging = false;
let pointerHeld = false;
let dragStart = null;
let dragDirection = "right";
let autoRunning = false;
let autoRunDirection = "right";
let queuedAction = null;
let persistentAnimation = "idle";
let currentPrompt = null;
let statusBubbleMessage = "";
let voiceEnabled = true;
let voiceVolume = 0.82;
let currentVoice = null;
let latestCursorPoint = null;
let lookActive = false;
let displayedLookIndex = null;
let smoothedLookAngle = null;
let lastLookFrameTime = performance.now();

const LOOK_DIRECTION_STEP = 22.5;
const LOOK_ENTER_DISTANCE = 82;
const LOOK_EXIT_DISTANCE = 62;
const LOOK_HYSTERESIS_DEGREES = 3.5;
const LOOK_SMOOTHING_MS = 52;

function applyAnimation(name, persistent = false) {
  const animation = animations[name] || animations.idle;
  lookActive = false;
  displayedLookIndex = null;
  smoothedLookAngle = null;
  sprite.style.backgroundPosition = `0 -${animation.row * 208}px`;
  const iterations = persistent ? "infinite" : animation.oneShotIterations;
  sprite.style.animation = `sprite-${name} ${animation.duration}ms steps(${animation.frames}) ${iterations}`;
  ensureKeyframes(name, animation);
}

function restorePersistentAnimation() {
  if (dragging) {
    applyAnimation(`running-${dragDirection}`, true);
    return;
  }
  if (autoRunning) {
    applyAnimation(`running-${autoRunDirection}`, true);
    return;
  }
  applyAnimation(persistentAnimation, true);
}

function playAction(name, lockMs = 0) {
  applyAnimation(name, false);
  if (lockMs > 0) {
    actionLocked = true;
    clearTimeout(actionTimer);
    actionTimer = setTimeout(() => {
      actionLocked = false;
      restorePersistentAnimation();
    }, lockMs);
  }
}

function ensureKeyframes(name, animation) {
  const id = `keyframes-${name}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  const y = -(animation.row * 208);
  style.textContent = `@keyframes sprite-${name}{from{background-position:0 ${y}px}to{background-position:-${animation.frames * 192}px ${y}px}}`;
  document.head.appendChild(style);
}

function renderPrompt(voiceDuration) {
  if (transientActive) return;
  messageActions.replaceChildren();
  if (!currentPrompt) {
    if (statusBubbleMessage) {
      message.classList.add("visible");
      message.classList.remove("actionable");
      typeMessage(statusBubbleMessage, `status:${statusBubbleMessage}`);
    } else {
      clearTimeout(typingTimer);
      activeMessageKey = "";
      message.classList.remove("visible", "actionable", "typing");
      message.style.width = "";
      message.style.minHeight = "";
      api.setBubbleBounds(null);
    }
    return;
  }
  const actions = Array.isArray(currentPrompt.actions) && currentPrompt.actions.length
    ? currentPrompt.actions
    : [{ id: "primary", label: currentPrompt.label || "我在" }];
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    const fallbackIcon = currentPrompt.type === "check-in" ? "check" : currentPrompt.type === "task-reminder" ? "list" : "check";
    const icon = action.id === "start" ? "start" : action.id === "snooze" ? "snooze" : action.id === "skip" ? "skip" : fallbackIcon;
    button.className = `message-action icon-${icon}`;
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      messageActions.querySelectorAll("button").forEach((item) => { item.disabled = true; });
      try { await api.respondPrompt(currentPrompt.id, action.id); }
      finally { messageActions.querySelectorAll("button").forEach((item) => { item.disabled = false; }); }
    });
    messageActions.append(button);
  });
  message.classList.add("visible", "actionable");
  typeMessage(currentPrompt.message, `prompt:${currentPrompt.id}`, undefined, voiceDuration);
}

function typeMessage(text, key, onComplete, voiceDuration) {
  if (activeMessageKey === key) return;
  clearTimeout(typingTimer);
  const generation = typingGeneration += 1;
  activeMessageKey = key;
  message.classList.remove("typing");
  message.style.width = "";
  message.style.minHeight = "";
  messageCopy.textContent = text;
  const finalBounds = message.getBoundingClientRect();
  message.style.width = `${Math.ceil(finalBounds.width)}px`;
  message.style.minHeight = `${Math.ceil(finalBounds.height)}px`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || completedMessageKeys.has(key)) {
    requestAnimationFrame(reportBubbleBounds);
    onComplete?.();
    return;
  }
  const characters = Array.from(text);
  messageCopy.textContent = "";
  message.classList.add("typing");
  const begin = (voiceDurationMs) => {
    if (generation !== typingGeneration || activeMessageKey !== key) return;
    let index = 0;
    const weightFor = (character) => /[。！？!?]/.test(character) ? 3.2 : /[，、；：,]/.test(character) ? 2 : 1;
    const totalWeight = Math.max(1, characters.reduce((sum, character) => sum + weightFor(character), 0));
    const targetDuration = Number.isFinite(voiceDurationMs)
      ? Math.max(650, voiceDurationMs - 420)
      : totalWeight * 72;
    const unitDelay = Math.max(48, Math.min(180, targetDuration / totalWeight));
    const next = () => {
      const character = characters[index] ?? "";
      messageCopy.textContent += character;
      index += 1;
      requestAnimationFrame(reportBubbleBounds);
      if (index >= characters.length) {
        message.classList.remove("typing");
        completedMessageKeys.add(key);
        requestAnimationFrame(reportBubbleBounds);
        onComplete?.();
        return;
      }
      typingTimer = setTimeout(next, unitDelay * weightFor(character));
    };
    next();
  };
  if (voiceDuration && typeof voiceDuration.then === "function") {
    void voiceDuration.then(begin, () => begin(undefined));
  } else {
    begin(undefined);
  }
}

function reportBubbleBounds() {
  if (!currentPrompt || !message.classList.contains("visible")) {
    api.setBubbleBounds(null);
    return;
  }
  const bounds = message.getBoundingClientRect();
  api.setBubbleBounds({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
}

function showTransientMessage(text, duration = 2800, voiceDuration) {
  if (!text) return;
  transientActive = true;
  messageActions.replaceChildren();
  message.classList.remove("actionable");
  message.classList.add("visible");
  clearTimeout(messageTimer);
  const key = `transient:${transientSequence += 1}`;
  typeMessage(text, key, () => {
    messageTimer = setTimeout(() => {
      transientActive = false;
      renderPrompt();
    }, duration);
  }, voiceDuration);
}

function showEffect(value) {
  if (!value) return;
  effect.textContent = value;
  effect.classList.remove("visible");
  void effect.offsetWidth;
  effect.classList.add("visible");
}

function playVoice(voice) {
  if (!voiceEnabled || typeof voice !== "string" || !/^[a-z0-9-]+$/.test(voice)) return undefined;
  if (currentVoice) {
    currentVoice.pause();
    currentVoice.currentTime = 0;
  }
  const audio = new Audio(`../assets/voice/${voice}.mp3`);
  audio.preload = "metadata";
  audio.volume = Math.max(0, Math.min(1, voiceVolume));
  currentVoice = audio;
  const duration = new Promise((resolve) => {
    if (Number.isFinite(audio.duration)) {
      resolve(audio.duration * 1000);
      return;
    }
    const fallback = setTimeout(() => resolve(undefined), 600);
    audio.addEventListener("loadedmetadata", () => {
      clearTimeout(fallback);
      resolve(Number.isFinite(audio.duration) ? audio.duration * 1000 : undefined);
    }, { once: true });
  });
  audio.addEventListener("ended", () => { if (currentVoice === audio) currentVoice = null; }, { once: true });
  audio.addEventListener("error", () => { if (currentVoice === audio) currentVoice = null; }, { once: true });
  void audio.play().catch(() => { if (currentVoice === audio) currentVoice = null; });
  return duration;
}

function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function nearestLookIndex(angle) {
  return Math.round(angle / LOOK_DIRECTION_STEP) % 16;
}

function setLookFrame(index) {
  if (displayedLookIndex === index) return;
  const row = index < 8 ? 9 : 10;
  const column = index % 8;
  sprite.style.animation = "none";
  sprite.style.backgroundPosition = `${-column * 192}px ${-row * 208}px`;
  displayedLookIndex = index;
}

function updateLookDirection(now) {
  const elapsed = Math.min(100, Math.max(0, now - lastLookFrameTime));
  lastLookFrameTime = now;
  if (!actionLocked && !dragging && !autoRunning && persistentAnimation === "idle" && latestCursorPoint) {
    const distance = Math.hypot(latestCursorPoint.x, latestCursorPoint.y);
    if (!lookActive && distance >= LOOK_ENTER_DISTANCE) {
      lookActive = true;
      const targetAngle = (Math.atan2(latestCursorPoint.x, -latestCursorPoint.y) * 180 / Math.PI + 360) % 360;
      smoothedLookAngle = targetAngle;
      setLookFrame(nearestLookIndex(targetAngle));
    } else if (lookActive && distance <= LOOK_EXIT_DISTANCE) {
      applyAnimation("idle", true);
    } else if (lookActive) {
      const targetAngle = (Math.atan2(latestCursorPoint.x, -latestCursorPoint.y) * 180 / Math.PI + 360) % 360;
      const smoothing = 1 - Math.exp(-elapsed / LOOK_SMOOTHING_MS);
      smoothedLookAngle = (smoothedLookAngle + shortestAngleDelta(smoothedLookAngle, targetAngle) * smoothing + 360) % 360;
      if (displayedLookIndex === null) {
        setLookFrame(nearestLookIndex(smoothedLookAngle));
      } else {
        const currentCenter = displayedLookIndex * LOOK_DIRECTION_STEP;
        const fromCenter = shortestAngleDelta(currentCenter, smoothedLookAngle);
        if (Math.abs(fromCenter) >= LOOK_DIRECTION_STEP / 2 + LOOK_HYSTERESIS_DEGREES) {
          setLookFrame(nearestLookIndex(smoothedLookAngle));
        }
      }
    }
  }
  requestAnimationFrame(updateLookDirection);
}

card.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  pointerHeld = true;
  dragging = false;
  dragStart = { x: event.screenX, y: event.screenY };
  card.setPointerCapture(event.pointerId);
});

card.addEventListener("pointermove", (event) => {
  if (!pointerHeld || !dragStart || dragging) return;
  if (Math.hypot(event.screenX - dragStart.x, event.screenY - dragStart.y) <= 4) return;
  dragging = true;
  applyAnimation(`running-${dragDirection}`, true);
  api.dragStart({ screenX: dragStart.x, screenY: dragStart.y });
});

function finishDrag(event) {
  if (!pointerHeld) return;
  const wasDragging = dragging;
  pointerHeld = false;
  dragging = false;
  dragStart = null;
  if (wasDragging) api.dragEnd();
  try { card.releasePointerCapture(event.pointerId); } catch {}
  if (wasDragging && queuedAction) {
    const action = queuedAction;
    queuedAction = null;
    const voiceDuration = playVoice(action.voice);
    if (action.message) showTransientMessage(action.message, 2800, voiceDuration);
    showEffect(action.effect);
    playAction(action.animation, action.lockMs || 1700);
  } else if (!actionLocked) {
    restorePersistentAnimation();
  }
}

card.addEventListener("pointerup", finishDrag);
card.addEventListener("pointercancel", finishDrag);
card.addEventListener("dblclick", () => void api.petDoubleClick());
card.addEventListener("contextmenu", (event) => { event.preventDefault(); api.openPanel(); });
card.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") void api.petDoubleClick();
  if (event.key === "ContextMenu") api.openPanel();
});

message.addEventListener("transitionend", reportBubbleBounds);

api.onCursor((point) => { latestCursorPoint = point; });
api.onDragDirection((direction) => {
  if (direction !== "left" && direction !== "right") return;
  dragDirection = direction;
  if (dragging) applyAnimation(`running-${dragDirection}`, true);
});
api.onAutoRun((state) => {
  autoRunning = state?.active === true;
  if (state?.direction === "left" || state?.direction === "right") autoRunDirection = state.direction;
  if (!dragging && !actionLocked) restorePersistentAnimation();
});
api.onPrompt((prompt) => {
  transientActive = false;
  clearTimeout(messageTimer);
  currentPrompt = prompt;
  const voiceDuration = playVoice(prompt.voice);
  renderPrompt(voiceDuration);
});
api.onClearPrompt(() => {
  currentPrompt = null;
  renderPrompt();
});
api.onStatusBubble((messageText) => {
  statusBubbleMessage = typeof messageText === "string" ? messageText : "";
  renderPrompt();
});
api.onClearStatusBubble(() => {
  statusBubbleMessage = "";
  renderPrompt();
});
api.onAction((action) => {
  if (dragging) {
    queuedAction = action;
    return;
  }
  const voiceDuration = playVoice(action.voice);
  if (action.message) showTransientMessage(action.message, 2800, voiceDuration);
  showEffect(action.effect);
  playAction(action.animation, action.lockMs || 1700);
});
api.onVoice(playVoice);
api.onState((state) => {
  if (typeof state.statusBubble === "string") statusBubbleMessage = state.statusBubble;
  voiceEnabled = state.settings?.voiceEnabled !== false;
  voiceVolume = Number.isFinite(state.settings?.voiceVolume) ? state.settings.voiceVolume : 0.82;
  if (currentVoice) currentVoice.volume = Math.max(0, Math.min(1, voiceVolume));
  if (!voiceEnabled && currentVoice) {
    currentVoice.pause();
    currentVoice = null;
  }
  persistentAnimation = animations[state.persistentAnimation] ? state.persistentAnimation : "idle";
  renderPrompt();
  if (!actionLocked && !dragging) restorePersistentAnimation();
});

restorePersistentAnimation();
requestAnimationFrame(updateLookDirection);
void api.getState().then((state) => {
  statusBubbleMessage = typeof state.statusBubble === "string" ? state.statusBubble : "";
  persistentAnimation = state.persistentAnimation || "idle";
  voiceEnabled = state.settings?.voiceEnabled !== false;
  voiceVolume = Number.isFinite(state.settings?.voiceVolume) ? state.settings.voiceVolume : 0.82;
  renderPrompt();
  restorePersistentAnimation();
});
