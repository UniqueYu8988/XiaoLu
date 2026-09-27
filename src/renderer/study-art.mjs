// Presentation state only: never changes recorded study facts or rewards.
export function progressStage(percent) {
  return percent >= 100 ? 4 : percent >= 80 ? 3 : percent >= 40 ? 2 : percent > 20 ? 1 : 0;
}
export function timeStage(ms) {
  return Math.min(4, Math.floor(Math.max(0, ms || 0) / 7_200_000));
}
export function advanceStudyArt(previous, date, percent, ms) {
  const progress = progressStage(percent), time = timeStage(ms);
  if (!previous || previous.date !== date || !Number.isInteger(previous.progress) || !Number.isInteger(previous.time) || !['progress','time'].includes(previous.kind) || !Number.isInteger(previous.index) || previous.index < 0 || previous.index > 4) {
    const kind = progress > 0 ? 'progress' : time > 0 ? 'time' : Number(String(date).slice(-2)) % 2 ? 'time' : 'progress';
    return { date, progress, time, kind, index: kind === 'progress' ? progress : time };
  }
  let next = { ...previous };
  if (progress > previous.progress) next = { ...next, kind: 'progress', index: progress };
  // If both thresholds arrive in the same snapshot, time is the stable tie-breaker.
  if (time > previous.time) next = { ...next, kind: 'time', index: time };
  return { ...next, progress: Math.max(progress, previous.progress), time: Math.max(time, previous.time) };
}
