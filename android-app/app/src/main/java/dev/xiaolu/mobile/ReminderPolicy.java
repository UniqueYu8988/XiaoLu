package dev.xiaolu.mobile;

/** Pure policy: disconnection is not evidence of procrastination. */
final class ReminderPolicy {
    static final int[] HOURS = {9, 15, 21};
    static boolean shouldNotify(int mode, int step, long now, long scheduled,
                                boolean fresh, boolean studying, boolean pausedForToday) {
        int maximum = mode == 3 ? 3 : 1;
        return mode > 0 && step < maximum && !pausedForToday
                && now >= scheduled && now - scheduled < 45 * 60_000L
                && !(fresh && studying);
    }
}
