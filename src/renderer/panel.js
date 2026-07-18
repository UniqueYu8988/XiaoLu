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
const HISTORY_PAGE_SIZE = 4;
const TASK_PAGE_SIZE = 7;

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

function statusLabel(status) {
  if (status === "checked") return "已到";
  if (status === "missed") return "错过";
  if (status === "pending") return "现在";
  return "待定";
}

function bookmarkName(type) {
  if (type === "together") return "双人书签";
  if (type === "self") return "我的单人书签";
  if (type === "friend") return "她的单人书签";
  return "未生成书签";
}

function render(state) {
  latestState = state;
  byId("today-date").textContent = displayDate(state.date);
  byId("timer").textContent = formatDuration(state.today.studyMs);
  byId("timer-status").textContent = state.isStudying ? "这一段，我陪你一起认真。" : state.today.report ? "今天的认真，已经收进日记了。" : "准备好时，叫我一起开始吧。";
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

  renderReport(state.today.report);
  renderTasks(state.today.tasks ?? []);
  renderHistory(state.history);
  renderBookmarkCollection(state.stats);
  renderStats(state.stats);
  byId("launch-at-login").checked = state.settings.launchAtLogin;
  if (state.message) showFeedback(state.message);
}

function renderReport(report) {
  const key = report ? report.submittedAt : "empty";
  if (loadedReportKey !== key) {
    loadedReportKey = key;
    byId("problem-count").value = report?.problemCount ?? 0;
    byId("note").value = report?.note ?? "";
    document.querySelectorAll('[data-choice-group="self-completed"] .choice').forEach((choice) => {
      choice.classList.toggle("active", report ? choice.dataset.value === (report.selfCompleted ? "yes" : "no") : false);
    });
    document.querySelectorAll('[data-choice-group="friend-completed"] .choice').forEach((choice) => {
      choice.classList.toggle("active", report ? choice.dataset.value === (report.friendCompleted ? "yes" : "no") : false);
    });
  }
  const result = byId("report-result");
  result.hidden = !report;
  if (report) result.textContent = `已结算 · ${bookmarkName(report.bookmark)}`;
  byId("submit-report").textContent = report ? "更新今日结算" : "收进今天的日记";
}

function renderHistory(history) {
  const list = byId("history-list");
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
    time.textContent = compactDuration(day.studyMs);
    top.append(date, time);
    const meta = document.createElement("p");
    meta.textContent = `打卡 ${day.checkedCount}/5 · 任务 ${day.completedTaskCount ?? 0}/${day.taskCount ?? 0} · 做题 ${day.report?.problemCount ?? 0}`;
    item.append(top, meta);
    if (day.report?.note) {
      const note = document.createElement("blockquote");
      note.textContent = day.report.note;
      item.append(note);
    }
    return item;
  }));
  renderPager("history", historyPage, pageCount);
}

function renderTasks(tasks) {
  const ordered = [...tasks].sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || a.createdAt.localeCompare(b.createdAt));
  const pageCount = Math.max(1, Math.ceil(ordered.length / TASK_PAGE_SIZE));
  taskPage = Math.min(taskPage, pageCount - 1);
  const renderKey = JSON.stringify([ordered, taskPage]);
  if (taskRenderKey === renderKey) return;
  taskRenderKey = renderKey;
  const completed = ordered.filter((task) => task.completedAt).length;
  byId("task-progress").textContent = `${completed} / ${ordered.length}`;
  const list = byId("task-list");
  if (ordered.length === 0) {
    list.replaceChildren(emptyMessage("今天还没有任务。想做什么，就从一件开始吧。"));
    byId("task-pager").hidden = true;
    return;
  }
  const visible = ordered.slice(taskPage * TASK_PAGE_SIZE, (taskPage + 1) * TASK_PAGE_SIZE);
  list.replaceChildren(...visible.map(taskRow));
  renderPager("task", taskPage, pageCount);
}

function taskRow(task) {
  const row = document.createElement("article");
  row.className = `task-row${task.completedAt ? " completed" : ""}`;
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
  recurring.textContent = "固";
  recurring.setAttribute("aria-label", task.recurringTaskId ? "取消每日固定" : "设为每日固定");
  recurring.title = task.recurringTaskId ? "取消每日固定" : "每天重复";
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
  } catch (error) {
    showFeedback(String(error?.message || error));
  }
}

function renderBookmarkCollection(stats) {
  byId("bookmark-self-count").textContent = stats.selfBookmarks;
  byId("bookmark-friend-count").textContent = stats.friendBookmarks;
  byId("bookmark-together-count").textContent = stats.togetherBookmarks;
  const total = stats.selfBookmarks + stats.friendBookmarks + stats.togetherBookmarks;
  byId("bookmark-summary").textContent = total === 0
    ? "我们的第一枚书签，还在等一个认真完成的日子。"
    : stats.togetherBookmarks > 0
      ? `我们已经一起完成 ${stats.togetherBookmarks} 天，也收好了 ${total} 枚认真生活的证明。`
      : `这里已经收好了 ${total} 枚认真完成的书签。`;
}

function renderPager(name, page, pageCount) {
  const pager = byId(`${name}-pager`);
  pager.hidden = pageCount <= 1;
  byId(`${name}-page`).textContent = `${page + 1} / ${pageCount}`;
  byId(`${name}-prev`).disabled = page === 0;
  byId(`${name}-next`).disabled = page >= pageCount - 1;
}

function renderStats(stats) {
  const entries = [
    ["累计学习", compactDuration(stats.totalStudyMs)],
    ["累计做题", `${stats.totalProblems} 题`],
    ["按时打卡", `${stats.checkedCount} 次`],
    ["双人书签", `${stats.togetherBookmarks} 枚`],
    ["累计完成任务", `${stats.completedTasks} 项`],
    ["最长共同连续", `${stats.longestTogetherStreak} 天`],
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
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  byId("open-bookmarks").classList.toggle("active", name === "bookmarks");
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
byId("task-prev").addEventListener("click", () => { taskPage = Math.max(0, taskPage - 1); taskRenderKey = null; renderTasks(latestState?.today.tasks ?? []); });
byId("task-next").addEventListener("click", () => { taskPage += 1; taskRenderKey = null; renderTasks(latestState?.today.tasks ?? []); });
byId("open-bookmarks").addEventListener("click", () => switchTab("bookmarks"));
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
  const self = document.querySelector('[data-choice-group="self-completed"] .choice.active');
  const friend = document.querySelector('[data-choice-group="friend-completed"] .choice.active');
  if (!self || !friend) {
    showFeedback("你和她今天的约定，还要一起确认一下哦。");
    return;
  }
  byId("submit-report").disabled = true;
  try {
    const state = await api.submitReport({
      problemCount: Number(byId("problem-count").value || 0),
      note: byId("note").value,
      selfCompleted: self.dataset.value === "yes",
      friendCompleted: friend.dataset.value === "yes",
    });
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

api.onView(switchTab);
api.onAction((action) => {
  playPortraitAction(action);
  if (action.message) showFeedback(action.message);
});
api.onState(render);
void api.getState().then(render);
