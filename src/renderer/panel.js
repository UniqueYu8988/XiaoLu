const api = window.xiaoluHome;
const byId = (id) => document.getElementById(id);
let latestState = null;
let loadedReportKey = null;
let feedbackTimer = null;
let portraitLocked = false;
let portraitTimer = null;
let portraitPersistent = "idle";
let historyPage = 0;
let taskPage = 0;
let taskRenderKey = null;
let bookmarkCounts = null;
let goalParticleTimer = null;
const HISTORY_PAGE_SIZE = 4;
const TASK_PAGE_SIZE = 3;

const portraitAnimations = {
  idle: { row: 0, frames: 6, duration: 5500, iterations: 1 },
  waving: { row: 3, frames: 4, duration: 700, iterations: 2 },
  jumping: { row: 4, frames: 5, duration: 840, iterations: 2 },
  failed: { row: 5, frames: 8, duration: 1250, iterations: 1 },
  waiting: { row: 6, frames: 6, duration: 1100, iterations: 1 },
  running: { row: 7, frames: 6, duration: 1000, iterations: 1 },
  review: { row: 8, frames: 6, duration: 1100, iterations: 1 },
};

function ensurePortraitKeyframes(name, animation) {
  const id = `portrait-keyframes-${name}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  const y = -(animation.row * 208);
  style.textContent = `@keyframes portrait-${name}{from{background-position:0 ${y}px}to{background-position:-${animation.frames * 192}px ${y}px}}`;
  document.head.appendChild(style);
}

function setPortraitAnimation(name, persistent = true) {
  const animation = portraitAnimations[name] || portraitAnimations.idle;
  ensurePortraitKeyframes(name, animation);
  const iterations = persistent ? "infinite" : animation.iterations;
  const sprite = byId("portrait-sprite");
  sprite.style.backgroundPosition = `0 -${animation.row * 208}px`;
  sprite.style.animation = `portrait-${name} ${animation.duration}ms steps(${animation.frames}) ${iterations}`;
}

function playPortraitAction(action) {
  const name = portraitAnimations[action.animation] ? action.animation : "idle";
  portraitLocked = true;
  clearTimeout(portraitTimer);
  setPortraitAnimation(name, false);
  portraitTimer = setTimeout(() => {
    portraitLocked = false;
    setPortraitAnimation(portraitPersistent, true);
  }, action.lockMs || 1700);
}

function showFeedback(text) {
  if (!text) return;
  const feedback = byId("feedback");
  feedback.textContent = text;
  feedback.hidden = false;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 3200);
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

function compactDuration(milliseconds) {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

function displayDate(date) {
  return date.replaceAll("-", ".");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function statusLabel(status) {
  if (status === "checked") return "✓";
  if (status === "missed") return "×";
  if (status === "pending") return "现在";
  return "·";
}

function setCompletionMark(id, completed, detail) {
  const node = byId(id);
  node.textContent = completed ? "✓" : "×";
  node.classList.toggle("completion-yes", completed);
  node.classList.toggle("completion-no", !completed);
  node.title = detail ?? (completed ? "已完成" : "未完成");
  node.setAttribute("aria-label", node.title);
}

function bookmarkName(type) {
  if (type === "together") return "双人书签已收好";
  return "双人书签留待下一次";
}

function render(state) {
  latestState = state;
  byId("today-date").textContent = displayDate(state.date);
  byId("timer").textContent = formatDuration(state.today.studyMs);
  const yuReader = state.yuReader ?? { enabled: false, connected: false };
  byId("timer-status").textContent = yuReader.enabled && yuReader.snapshot?.studyState === "learning"
    ? "YuReader 正在记录，我会安静陪着你。"
    : state.isStudying ? "这一段，我陪你一起认真。" : state.today.report ? "今天的认真，已经收进日记了。" : "准备好时，叫我一起开始吧。";
  byId("toggle-study").textContent = state.isStudying ? "学习中" : state.today.report ? "今日已收好" : "开始学习";
  byId("toggle-study").disabled = Boolean(state.today.report && !state.isStudying);
  portraitPersistent = portraitAnimations[state.persistentAnimation] ? state.persistentAnimation : "idle";
  if (!portraitLocked) setPortraitAnimation(portraitPersistent, true);

  const checkins = byId("checkins");
  checkins.replaceChildren(...state.today.checkIns.map((item) => {
    const node = document.createElement("div");
    node.className = `checkin ${item.status}`;
    const time = document.createElement("strong");
    time.textContent = item.slot;
    const mark = document.createElement("span");
    mark.textContent = statusLabel(item.status);
    node.append(time, mark);
    return node;
  }));
  byId("check-in-now").hidden = !state.pendingCheckIn;
  byId("check-in-now").textContent = state.pendingCheckIn ? `${state.pendingCheckIn.slot} · 我在` : "我在";

  renderReport(state.today, yuReader);
  renderTasks(state.today.tasks ?? [], state.today, yuReader);
  renderHistory(state.history);
  renderBookmarkCollection(state.stats);
  renderStats(state.stats);
  byId("launch-at-login").checked = state.settings.launchAtLogin;
  byId("yuquiz-integration").checked = Boolean(yuReader.enabled);
  byId("yuquiz-integration").disabled = false;
  byId("patrol-enabled").checked = state.settings.patrolEnabled !== false;
  byId("voice-enabled").checked = state.settings.voiceEnabled !== false;
  byId("voice-volume").value = Number.isFinite(state.settings.voiceVolume) ? state.settings.voiceVolume : 0.82;
  byId("voice-volume").disabled = state.settings.voiceEnabled === false;
  byId("save-study-anchor").classList.toggle("saved", Boolean(state.settings.studyAnchor));
  if (state.message) showFeedback(state.message);
}

function renderReport(today, yuReader = { enabled: false }) {
  const report = today.report;
  const snapshot = yuReader.snapshot ?? today.yuReader;
  const key = `${report?.submittedAt ?? "empty"}:${snapshot?.vocabularyCount ?? 0}`;
  if (loadedReportKey !== key) {
    loadedReportKey = key;
    byId("vocabulary-count").value = String(snapshot?.vocabularyCount ?? report?.vocabularyCount ?? 0);
  }
  const checkedCount = (today.checkIns ?? []).filter((item) => item.status === "checked").length;
  byId("report-study-time").textContent = formatDuration(today.studyMs ?? 0);
  byId("report-questions").textContent = `${formatPercent(today.goals?.overallPercent ?? report?.overallProgress ?? 0)}%`;
  const mistakeCompleted = Boolean(snapshot?.mistakeReviewCompleted ?? report?.mistakeReviewCompleted);
  const oralCompleted = Boolean(snapshot?.oralReviewCompleted ?? report?.oralReviewCompleted);
  setCompletionMark("report-accuracy", mistakeCompleted, mistakeCompleted ? "错题攻坚已完成" : "错题攻坚未完成");
  setCompletionMark("report-note-entries", oralCompleted, oralCompleted ? "口腔背诵已完成" : "口腔背诵未完成");
  const checkInSummary = byId("report-note-characters");
  checkInSummary.classList.remove("completion-yes", "completion-no");
  checkInSummary.textContent = `${checkedCount}/5`;
  checkInSummary.title = `今日在场 ${checkedCount}/5`;
  const subjects = snapshot?.subjects ?? {};
  byId("report-subject-oral").textContent = `${formatPercent(subjects.medicine?.percent ?? 0)}%`;
  byId("report-subject-english").textContent = `${formatPercent(subjects.english?.percent ?? 0)}%`;
  byId("report-subject-politics").textContent = `${formatPercent(subjects.politics?.percent ?? 0)}%`;
  const result = byId("report-result");
  result.hidden = !report;
  if (report) result.textContent = `已结算 · ${bookmarkName(report.bookmark)}`;
  byId("submit-report").textContent = report ? "更新今日结算" : "收进今天的日记";
}

function renderHistory(history) {
  const list = byId("history-list");
  if (list.querySelector(".history-note-input")) return;
  list.classList.toggle("empty", history.length === 0);
  byId("history-total").textContent = String(history.length);
  if (history.length === 0) {
    list.replaceChildren(emptyMessage("这里还空着，今天会成为第一页。"));
    byId("history-pager").hidden = true;
    return;
  }
  const pageCount = Math.ceil(history.length / HISTORY_PAGE_SIZE);
  historyPage = Math.min(historyPage, pageCount - 1);
  const visible = history.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);
  list.replaceChildren(...visible.map((day) => {
    const item = document.createElement("article");
    item.className = "history-card";
    const top = document.createElement("div");
    top.className = "history-top";
    const date = document.createElement("strong");
    date.textContent = displayDate(day.date);
    const time = document.createElement("span");
    time.textContent = day.studyTimeUnknown ? "不详" : compactDuration(day.studyMs);
    top.append(date, time);
    const meta = document.createElement("p");
    if (day.report?.overallProgress !== undefined || day.yuReader) {
      const reading = day.report?.readingPercent ?? day.goals?.readingPercent ?? 0;
      const questions = day.report?.questionsPercent ?? day.goals?.questionsPercent ?? 0;
      const vocabulary = day.report?.vocabularyCount ?? day.yuReader?.vocabularyCount ?? 0;
      meta.textContent = `阅读 ${formatPercent(reading)}% · 做题 ${formatPercent(questions)}% · 单词 ${vocabulary}`;
    } else {
      meta.textContent = `打卡 ${day.checkedCount}/5 · 任务 ${day.completedTaskCount ?? 0}/${day.taskCount ?? 0} · 目标 ${day.completedBountyCount ?? 0}/2`;
    }
    item.append(top, meta);
    const note = document.createElement("blockquote");
    const displayedNote = day.externalDiary?.title || day.report?.note || "";
    note.textContent = displayedNote || "双击给今天留一句话";
    note.classList.toggle("empty", !displayedNote);
    if (day.externalDiary) {
      note.classList.add("synced");
      note.title = "来自外部 Markdown 日记标题";
      note.setAttribute("aria-label", `${displayedNote}。来自外部日记`);
    } else {
      note.tabIndex = 0;
      note.title = "双击编辑这一天的一句话";
      note.setAttribute("aria-label", `${displayedNote || "还没有写下一句话"}。双击编辑`);
      note.addEventListener("dblclick", () => beginHistoryNoteEdit(item, note, day));
      note.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          beginHistoryNoteEdit(item, note, day);
        }
      });
    }
    item.append(note);
    return item;
  }));
  renderPager("history", historyPage, pageCount, true);
}

function beginHistoryNoteEdit(item, noteNode, day) {
  if (item.querySelector(".history-note-input")) return;
  const input = document.createElement("input");
  input.className = "history-note-input";
  input.type = "text";
  input.maxLength = 120;
  input.value = day.report?.note ?? "";
  input.placeholder = "给今天留一句话";
  input.setAttribute("aria-label", `${displayDate(day.date)} 的一句话总结`);
  let finished = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    input.replaceWith(noteNode);
  };
  const save = async () => {
    if (finished) return;
    const value = input.value.trim();
    if (value === (day.report?.note ?? "")) {
      cancel();
      return;
    }
    finished = true;
    input.disabled = true;
    try {
      const state = await api.updateHistoryNote(day.date, value);
      input.remove();
      render(state);
    } catch (error) {
      input.disabled = false;
      finished = false;
      showFeedback(String(error?.message || error));
      input.focus();
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); void save(); }
    if (event.key === "Escape") { event.preventDefault(); cancel(); }
  });
  input.addEventListener("blur", () => void save());
  noteNode.replaceWith(input);
  input.focus();
  input.select();
}

function renderTasks(tasks, today, yuReader) {
  const ordered = tasks.filter((task) => !task.bountySlot).sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || Number(Boolean(b.recurringTaskId)) - Number(Boolean(a.recurringTaskId)) || a.createdAt.localeCompare(b.createdAt));
  const pageCount = Math.max(1, Math.ceil(ordered.length / TASK_PAGE_SIZE));
  taskPage = Math.min(taskPage, pageCount - 1);
  const goals = today?.goals ?? {};
  const snapshot = yuReader?.snapshot ?? today?.yuReader;
  const goalProgressPercent = Number(goals.overallPercent) || 0;
  const renderKey = JSON.stringify([tasks, goals, snapshot, taskPage]);
  if (taskRenderKey === renderKey) return;
  taskRenderKey = renderKey;
  renderGoalBoard(goals, snapshot, goalProgressPercent);
  byId("goal-helper").textContent = yuReader?.connected
    ? "书签会跟着 YuReader 的进度一点点亮起来，完成后正式收入收藏。"
    : "暂时没有连接到 YuReader，书签会替你保留上一次的进度。";
  const recurring = ordered.filter((task) => task.recurringTaskId);
  byId("task-progress").textContent = `每日 ${recurring.filter((task) => task.completedAt).length} / ${recurring.length}`;
  const list = byId("task-list");
  if (ordered.length === 0) {
    list.replaceChildren(emptyMessage("这里还空着。记下一件以后想做的事吧。"));
    byId("task-pager").hidden = true;
    return;
  }
  const visible = ordered.slice(taskPage * TASK_PAGE_SIZE, (taskPage + 1) * TASK_PAGE_SIZE);
  list.replaceChildren(...visible.map(taskRow));
  renderPager("task", taskPage, pageCount);
}

function renderGoalBoard(goals, snapshot, goalProgressPercent) {
  const slots = [
    {
      slot: "self", label: "做题达成", percent: goals.questionsPercent ?? snapshot?.questions?.percent ?? 0, image: "../assets/bookmarks/bookmark-self.png",
      completed: Number(goals.questionsPercent ?? snapshot?.questions?.percent ?? 0) >= 100,
    },
    {
      slot: "together", label: "综合达成", percent: goalProgressPercent, image: "../assets/bookmarks/bookmark-together.png",
      completed: goalProgressPercent >= 100,
    },
    {
      slot: "gift", label: "阅读达成", percent: goals.readingPercent ?? snapshot?.reading?.percent ?? 0, image: "../assets/bookmarks/bookmark-friend.png",
      completed: Number(goals.readingPercent ?? snapshot?.reading?.percent ?? 0) >= 100,
    },
  ];
  byId("goal-overall-progress").textContent = `${formatPercent(goalProgressPercent)}%`;
  byId("bounty-board").replaceChildren(...slots.map(goalCard));
  startGoalParticles();
}

function startGoalParticles() {
  clearInterval(goalParticleTimer);
  goalParticleTimer = null;
  if (!byId("view-tasks").classList.contains("active")) return;
  if (typeof window.confetti !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const emitters = [...document.querySelectorAll(".bounty-card.completed .goal-particles")]
    .map((canvas) => window.confetti.create(canvas, { resize: true, useWorker: false }));
  if (emitters.length === 0) return;
  const emit = () => emitters.forEach((launch, index) => launch({
    particleCount: 5,
    angle: 90,
    spread: 95,
    startVelocity: 7,
    decay: 0.9,
    gravity: 0.12,
    drift: index % 2 ? 0.15 : -0.15,
    ticks: 48,
    scalar: 0.42,
    shapes: ["square"],
    colors: ["#f4d57b", "#fff7b2", "#d8bfe8", "#ffffff"],
    origin: { x: 0.5, y: 0.46 },
    disableForReducedMotion: true,
  }));
  emit();
  goalParticleTimer = setInterval(emit, 1_250);
}

function goalCard(config) {
  const card = document.createElement("article");
  card.className = `bounty-card bounty-${config.slot}${config.completed ? " completed" : ""}`;
  const fillPercent = Math.max(0, Math.min(100, Number(config.percent) || 0));
  card.style.setProperty("--goal-fill", `${fillPercent}%`);
  const art = document.createElement("div");
  art.className = "bounty-mini-art";
  const mutedImage = document.createElement("img");
  mutedImage.className = "goal-image-muted";
  mutedImage.src = config.image;
  mutedImage.alt = "";
  const colorFill = document.createElement("div");
  colorFill.className = "goal-color-fill";
  const colorImage = document.createElement("img");
  colorImage.src = config.image;
  colorImage.alt = "";
  colorFill.append(colorImage);
  art.append(mutedImage, colorFill);

  const particles = document.createElement("canvas");
  particles.className = "goal-particles";
  particles.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  copy.className = "bounty-copy";
  const editor = document.createElement("div");
  editor.className = "goal-editor";
  const label = document.createElement("span");
  label.textContent = config.label;
  const value = document.createElement("strong");
  value.textContent = `${formatPercent(config.percent)}%`;
  editor.append(label, value);
  copy.append(editor);
  card.append(art, particles, copy);
  return card;
}

function taskRow(task) {
  const row = document.createElement("article");
  row.className = `task-row${task.completedAt ? " completed" : ""}${task.recurringTaskId ? " recurring" : ""}`;
  const check = document.createElement("button");
  check.className = "task-check";
  check.type = "button";
  check.setAttribute("aria-label", task.completedAt ? "恢复未完成" : "标记完成");
  check.addEventListener("click", () => void runTaskAction(() => api.setTaskCompleted(task.id, !task.completedAt)));
  const title = document.createElement("input");
  title.className = "task-inline-input";
  title.type = "text";
  title.maxLength = 60;
  title.value = task.title;
  title.setAttribute("aria-label", "任务名称");
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); title.blur(); }
    if (event.key === "Escape") { title.value = task.title; title.blur(); }
  });
  title.addEventListener("change", () => {
    const value = title.value.trim();
    if (!value) {
      title.value = task.title;
      showFeedback("任务名称不能留空哦。");
      return;
    }
    if (value !== task.title) void runTaskAction(() => api.editTask(task.id, value));
  });
  const recurring = document.createElement("button");
  recurring.className = `task-action task-recurring${task.recurringTaskId ? " active" : ""}`;
  recurring.type = "button";
  recurring.textContent = "日";
  recurring.setAttribute("aria-label", task.recurringTaskId ? "取消每日刷新" : "设为每日刷新");
  recurring.title = task.recurringTaskId ? "取消每日刷新" : "每日刷新并提醒";
  recurring.addEventListener("click", () => void runTaskAction(() => api.setTaskRecurring(task.id, !task.recurringTaskId)));
  const remove = document.createElement("button");
  remove.className = "task-action";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "删除任务");
  remove.addEventListener("click", () => void runTaskAction(() => api.deleteTask(task.id)));
  row.append(check, title, recurring, remove);
  return row;
}

async function runTaskAction(action) {
  try {
    const state = await action();
    taskRenderKey = null;
    render(state);
    return true;
  } catch (error) {
    showFeedback(String(error?.message || error));
    return false;
  }
}

function playBookmarkGain() {
  const gain = byId("bookmark-gain");
  gain.classList.remove("playing");
  void gain.offsetWidth;
  gain.classList.add("playing");
}

function renderBookmarkCollection(stats) {
  const nextCounts = [stats.selfBountyBookmarks, stats.giftBountyBookmarks, stats.togetherBookmarks];
  if (bookmarkCounts && nextCounts.some((value, index) => value > bookmarkCounts[index])) playBookmarkGain();
  bookmarkCounts = nextCounts;
  byId("bookmark-self-count").textContent = stats.selfBountyBookmarks;
  byId("bookmark-friend-count").textContent = stats.giftBountyBookmarks;
  byId("bookmark-together-count").textContent = stats.togetherBookmarks;
  const total = stats.selfBountyBookmarks + stats.giftBountyBookmarks + stats.togetherBookmarks;
  byId("bookmark-summary").textContent = total === 0
    ? "两枚学习书签和双人书签，都在等认真完成的一天。"
    : stats.togetherBookmarks > 0
      ? `我的书签 ${stats.selfBountyBookmarks} 枚、她的书签 ${stats.giftBountyBookmarks} 枚，双目标完成 ${stats.togetherBookmarks} 天。`
      : `两项目标已经赢下 ${stats.selfBountyBookmarks + stats.giftBountyBookmarks} 枚书签，双人书签还在等同一天全部完成。`;
}

function renderPager(name, page, pageCount, alwaysVisible = false) {
  const pager = byId(`${name}-pager`);
  pager.hidden = !alwaysVisible && pageCount <= 1;
  byId(`${name}-page`).textContent = `${page + 1} / ${pageCount}`;
  byId(`${name}-prev`).disabled = page === 0;
  byId(`${name}-next`).disabled = page >= pageCount - 1;
}

function renderStats(stats) {
  const entries = [
    ["累计学习", compactDuration(stats.totalStudyMs)],
    ["按时打卡", `${stats.checkedCount} 次`],
    ["双人书签", `${stats.togetherBookmarks} 枚`],
    ["累计背词", `${stats.totalVocabulary ?? 0} 个`],
  ];
  byId("stats-grid").replaceChildren(...entries.map(([label, value]) => {
    const card = document.createElement("article");
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    return card;
  }));
}

function emptyMessage(text) {
  const node = document.createElement("p");
  node.className = "empty-message";
  node.textContent = text;
  return node;
}

function switchTab(name) {
  if (name !== "tasks" && goalParticleTimer) {
    clearInterval(goalParticleTimer);
    goalParticleTimer = null;
  }
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  byId("open-bookmarks").classList.toggle("active", name === "bookmarks");
  byId("open-history").classList.toggle("active", name === "history");
  if (name === "tasks") requestAnimationFrame(startGoalParticles);
  if (name === "report") {
    switchTab("today");
    setTimeout(() => byId("report-section").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
document.querySelectorAll(".choice-grid .choice").forEach((choice) => {
  choice.addEventListener("click", () => {
    const wasActive = choice.classList.contains("active");
    choice.closest(".choice-grid").querySelectorAll(".choice").forEach((item) => item.classList.remove("active"));
    if (!wasActive) choice.classList.add("active");
  });
});
byId("history-prev").addEventListener("click", () => { historyPage = Math.max(0, historyPage - 1); renderHistory(latestState?.history ?? []); });
byId("history-next").addEventListener("click", () => { historyPage += 1; renderHistory(latestState?.history ?? []); });
byId("task-prev").addEventListener("click", () => { taskPage = Math.max(0, taskPage - 1); taskRenderKey = null; renderTasks(latestState?.today.tasks ?? [], latestState?.today, latestState?.yuReader); });
byId("task-next").addEventListener("click", () => { taskPage += 1; taskRenderKey = null; renderTasks(latestState?.today.tasks ?? [], latestState?.today, latestState?.yuReader); });
byId("open-bookmarks").addEventListener("click", () => switchTab("bookmarks"));
byId("open-history").addEventListener("click", () => switchTab("history"));
byId("close").addEventListener("click", () => api.hide());
byId("toggle-study").addEventListener("click", async () => {
  byId("toggle-study").disabled = true;
  try { render(await api.toggleStudy()); }
  finally { if (!latestState?.today.report) byId("toggle-study").disabled = false; }
});
byId("check-in-now").addEventListener("click", async () => {
  if (!latestState?.pendingCheckIn) return;
  render(await api.checkIn(latestState.pendingCheckIn.slot));
});
byId("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = byId("task-title");
  const title = input.value.trim();
  if (!title) {
    showFeedback("先写下一件想完成的事吧。");
    input.focus();
    return;
  }
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    taskPage = 0;
    const state = await api.addTask(title);
    input.value = "";
    taskRenderKey = null;
    render(state);
    input.focus();
  } catch (error) {
    showFeedback(String(error?.message || error));
  } finally {
    button.disabled = false;
  }
});
byId("report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("submit-report").disabled = true;
  try {
    const vocabularyCount = Number(byId("vocabulary-count").value);
    if (!Number.isFinite(vocabularyCount) || vocabularyCount < 0) throw new Error("单词数量要写成一个有效数字哦。");
    const state = await api.submitReport({ vocabularyCount });
    render(state);
    showFeedback("今天已经好好收进日记啦。");
  } catch (error) {
    showFeedback(String(error?.message || error));
  } finally {
    byId("submit-report").disabled = false;
  }
});
byId("launch-at-login").addEventListener("change", async (event) => {
  render(await api.setLaunchAtLogin(event.target.checked));
});
byId("yuquiz-integration").addEventListener("change", async (event) => {
  const input = event.target;
  input.disabled = true;
  try { render(await api.setYuQuizIntegration(input.checked)); }
  finally { input.disabled = false; }
});
byId("patrol-enabled").addEventListener("change", async (event) => {
  const input = event.target;
  input.disabled = true;
  try { render(await api.setPatrolEnabled(input.checked)); }
  finally { input.disabled = false; }
});
byId("voice-enabled").addEventListener("change", async (event) => {
  const input = event.target;
  input.disabled = true;
  try { render(await api.setVoiceEnabled(input.checked)); }
  finally { input.disabled = false; }
});
byId("voice-volume").addEventListener("change", async (event) => {
  render(await api.setVoiceVolume(Number(event.target.value)));
});
byId("portrait-preview").addEventListener("click", async () => render(await api.previewVoice()));
byId("save-study-anchor").addEventListener("click", async () => {
  const button = byId("save-study-anchor");
  button.disabled = true;
  try { render(await api.setStudyAnchor()); }
  finally { button.disabled = false; }
});

api.onView(switchTab);
api.onAction((action) => {
  playPortraitAction(action);
  if (action.message) showFeedback(action.message);
});
api.onState(render);
void api.getState().then(render);
