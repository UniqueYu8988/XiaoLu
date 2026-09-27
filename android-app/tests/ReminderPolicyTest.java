package dev.xiaolu.mobile;

public final class ReminderPolicyTest {
    private static void check(boolean result, String name) { if (!result) throw new AssertionError(name); }
    public static void main(String[] args) {
        long now = 1_000_000L;
        check(!ReminderPolicy.shouldNotify(0, 0, now, now, false, false, false), "off means no reminders");
        check(ReminderPolicy.shouldNotify(1, 0, now, now, false, false, false), "offline still allows a neutral scheduled invitation");
        check(!ReminderPolicy.shouldNotify(1, 1, now, now, false, false, false), "light mode has no automatic repeats");
        check(!ReminderPolicy.shouldNotify(2, 1, now, now, false, false, false), "sound mode has no automatic repeats");
        check(ReminderPolicy.shouldNotify(3, 2, now, now, false, false, false), "agreement permits third reminder");
        check(!ReminderPolicy.shouldNotify(3, 3, now, now, false, false, false), "agreement stops after three");
        check(!ReminderPolicy.shouldNotify(3, 0, now, now, true, true, false), "fresh desktop learning suppresses phone reminder");
        check(ReminderPolicy.shouldNotify(3, 0, now, now, false, true, false), "old learning state must not indefinitely suppress reminders");
        check(!ReminderPolicy.shouldNotify(3, 0, now, now, false, false, true), "rest for today is respected");
        check(!ReminderPolicy.shouldNotify(3, 0, now, now + 1, false, false, false), "future alarm cannot fire early");
        check(!ReminderPolicy.shouldNotify(3, 0, now + 45 * 60_000L, now, false, false, false), "late alarms do not burst after sleep");
        System.out.println("Reminder policy: 11 checks passed.");
    }
}
