const api = window.xiaoluPet;
const sprite = document.getElementById("sprite");
const card = document.getElementById("pet-card");
const message = document.getElementById("message");
const messageCopy = document.getElementById("message-copy");
const messageAction = document.getElementById("message-action");
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
let dragging = false;
let dragMoved = false;
let dragStart = null;
let dragDirection = "right";
let queuedAction = null;
let persistentAnimation = "idle";
let currentPrompt = null;
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

function renderPrompt() {
  if (!currentPrompt) {
    message.classList.remove("visible", "actionable");
    messageAction.textContent = "";
    return;
  }
  messageCopy.textContent = currentPrompt.message;
  messageAction.textContent = currentPrompt.label || "我在";
  message.classList.add("visible", "actionable");
}

function showTransientMessage(text, duration = 2800) {
  if (!text) return;
  messageCopy.textContent = text;
  messageAction.textContent = "";
  message.classList.remove("actionable");
  message.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    if (currentPrompt) renderPrompt();
    else message.classList.remove("visible");
  }, duration);
}

function showEffect(value) {
  if (!value) return;
  effect.textContent = value;
  effect.classList.remove("visible");
  void effect.offsetWidth;
  effect.classList.add("visible");
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
  if (!actionLocked && !dragging && persistentAnimation === "idle" && latestCursorPoint) {
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
  dragging = true;
  dragMoved = false;
  dragStart = { x: event.screenX, y: event.screenY };
  card.setPointerCapture(event.pointerId);
  applyAnimation(`running-${dragDirection}`, true);
  api.dragStart({ screenX: event.screenX, screenY: event.screenY });
});

card.addEventListener("pointermove", (event) => {
  if (!dragging || !dragStart) return;
  if (Math.hypot(event.screenX - dragStart.x, event.screenY - dragStart.y) > 4) dragMoved = true;
});

function finishDrag(event) {
  if (!dragging) return;
  dragging = false;
  dragStart = null;
  api.dragEnd();
  try { card.releasePointerCapture(event.pointerId); } catch {}
  if (queuedAction) {
    const action = queuedAction;
    queuedAction = null;
    if (action.message) showTransientMessage(action.message);
    showEffect(action.effect);
    playAction(action.animation, action.lockMs || 1700);
  } else if (!actionLocked) {
    restorePersistentAnimation();
  }
}

card.addEventListener("pointerup", finishDrag);
card.addEventListener("pointercancel", finishDrag);
card.addEventListener("dblclick", () => void api.toggleStudy());
card.addEventListener("contextmenu", (event) => { event.preventDefault(); api.openPanel(); });
card.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") void api.toggleStudy();
  if (event.key === "ContextMenu") api.openPanel();
});

message.addEventListener("click", async () => {
  if (!currentPrompt) return;
  if (currentPrompt.type === "task-reminder") {
    api.openPanel("tasks");
    return;
  }
  if (currentPrompt.type !== "check-in") return;
  message.disabled = true;
  try {
    await api.checkIn(currentPrompt.slot);
  } finally {
    message.disabled = false;
  }
});

api.onCursor((point) => { latestCursorPoint = point; });
api.onDragDirection((direction) => {
  if (direction !== "left" && direction !== "right") return;
  dragDirection = direction;
  if (dragging) applyAnimation(`running-${dragDirection}`, true);
});
api.onPrompt((prompt) => {
  currentPrompt = prompt;
  renderPrompt();
});
api.onClearPrompt(() => {
  currentPrompt = null;
  message.classList.remove("visible", "actionable");
});
api.onAction((action) => {
  if (dragging) {
    queuedAction = action;
    return;
  }
  if (action.message) showTransientMessage(action.message);
  showEffect(action.effect);
  playAction(action.animation, action.lockMs || 1700);
});
api.onState((state) => {
  persistentAnimation = animations[state.persistentAnimation] ? state.persistentAnimation : "idle";
  if (!actionLocked && !dragging) restorePersistentAnimation();
});

restorePersistentAnimation();
requestAnimationFrame(updateLookDirection);
void api.getState().then((state) => {
  persistentAnimation = state.persistentAnimation || "idle";
  restorePersistentAnimation();
});
