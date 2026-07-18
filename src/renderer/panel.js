const api = window.xiaoluHome;
const byId = (id) => document.getElementById(id);
let latestState = null;
let loadedReportKey = null;
let feedbackTimer = null;
let portraitLocked = false;
let portraitTimer = null;
let portraitPersistent = "idle";
let historyPage = 0;
let bookmarkPage = 0;
const HISTORY_PAGE_SIZE = 4;
const BOOKMARK_PAGE_SIZE = 4;

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
  renderHistory(state.history);
  renderBookmarks(state.history);
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
    meta.textContent = `打卡 ${day.checkedCount}/5 · 做题 ${day.report?.problemCount ?? 0}`;
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

function renderBookmarks(history) {
  const bookmarks = history.filter((day) => day.report?.bookmark);
  const list = byId("bookmark-list");
  if (bookmarks.length === 0) {
    list.replaceChildren(emptyMessage("等我们一起完成约定，就把第一枚书签收好。"));
    byId("bookmark-pager").hidden = true;
    return;
  }
  const pageCount = Math.ceil(bookmarks.length / BOOKMARK_PAGE_SIZE);
  bookmarkPage = Math.min(bookmarkPage, pageCount - 1);
  const visible = bookmarks.slice(bookmarkPage * BOOKMARK_PAGE_SIZE, (bookmarkPage + 1) * BOOKMARK_PAGE_SIZE);
  list.replaceChildren(...visible.map((day, index) => {
    const card = document.createElement("article");
    card.className = `bookmark ${day.report.bookmark} palette-${index % 4}`;
    const pin = document.createElement("span");
    pin.className = "bookmark-pin";
    pin.textContent = day.report.bookmark === "together" ? "WE" : day.report.bookmark === "self" ? "ME" : "HER";
    const title = document.createElement("strong");
    title.textContent = bookmarkName(day.report.bookmark);
    const date = document.createElement("time");
    date.textContent = displayDate(day.date);
    const meta = document.createElement("p");
    meta.textContent = `${compactDuration(day.studyMs)} · ${day.report.problemCount} 题`;
    card.append(pin, title, date, meta);
    if (day.report.note) {
      const note = document.createElement("small");
      note.textContent = day.report.note;
      card.append(note);
    }
    return card;
  }));
  renderPager("bookmark", bookmarkPage, pageCount);
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
    ["当前共同连续", `${stats.currentTogetherStreak} 天`],
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
byId("bookmark-prev").addEventListener("click", () => { bookmarkPage = Math.max(0, bookmarkPage - 1); renderBookmarks(latestState?.history ?? []); });
byId("bookmark-next").addEventListener("click", () => { bookmarkPage += 1; renderBookmarks(latestState?.history ?? []); });
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
