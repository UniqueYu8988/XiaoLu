package dev.xiaolu.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.time.LocalDate;
import java.util.Calendar;

public final class StudyReminder extends BroadcastReceiver {
    static final String ALARM = "dev.xiaolu.REMIND", SNOOZE = "dev.xiaolu.SNOOZE", REST = "dev.xiaolu.REST";
    static int mode(Context context) { return MobileStore.preferences(context).getInt("reminderMode", 0); }
    static String label(Context context) { return new String[] {"关闭", "轻提醒", "声音振动", "约定提醒"}[Math.max(0, Math.min(3, mode(context)))]; }
    static PendingIntent alarmIntent(Context context, int code, long when, int step) {
        return PendingIntent.getBroadcast(context, code, new Intent(context, StudyReminder.class).setAction(ALARM)
                .putExtra("when", when).putExtra("step", step).putExtra("code", code), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void schedule(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        for (int hour : ReminderPolicy.HOURS) {
            Calendar next = Calendar.getInstance(); next.set(Calendar.HOUR_OF_DAY, hour);
            next.set(Calendar.MINUTE, 0); next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
            if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
            PendingIntent action = alarmIntent(context, 600 + hour, next.getTimeInMillis(), 0);
            alarms.cancel(action);
            if (mode(context) > 0) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), action);
        }
        if (mode(context) == 0) cancelRepeat(context);
    }
    static void cancelRepeat(Context context) {
        context.getSystemService(AlarmManager.class).cancel(alarmIntent(context, 699, 0, 0));
        context.getSystemService(NotificationManager.class).cancel(701);
    }
    static void repeat(Context context, int step) {
        long when = System.currentTimeMillis() + 10 * 60_000L;
        context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarmIntent(context, 699, when, step));
    }
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        SharedPreferences prefs = MobileStore.preferences(context);
        if (REST.equals(action)) {
            prefs.edit().putString("reminderRestDay", LocalDate.now().toString()).apply(); cancelRepeat(context); return;
        }
        if (SNOOZE.equals(action)) { cancelRepeat(context); if (mode(context) > 0) repeat(context, 0); return; }
        if (!ALARM.equals(action)) { schedule(context); return; }
        if (intent.getIntExtra("code", 0) != 699) schedule(context);
        PendingResult pending = goAsync();
        new Thread(() -> {
            try { MobileStore.sync(context); deliver(context, intent); }
            finally { pending.finish(); }
        }, "xiaolu-reminder-check").start();
    }

    private static void deliver(Context context, Intent intent) {
        SharedPreferences prefs = MobileStore.preferences(context);
        MobileSnapshot snapshot = MobileStore.read(context);
        long now = System.currentTimeMillis();
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (hour < 9 || hour >= 23) return;
        long scheduled = intent.getLongExtra("when", 0);
        int step = intent.getIntExtra("step", 0);
        boolean fresh = false;
        try { fresh = snapshot != null && snapshot.studyDay.equals(LocalDate.now().toString())
                && now >= java.time.Instant.parse(snapshot.generatedAt).toEpochMilli()
                && now - java.time.Instant.parse(snapshot.generatedAt).toEpochMilli() < 5 * 60_000L; }
        catch (Exception ignored) {}
        boolean studying = snapshot != null && (snapshot.isStudying || snapshot.studyState.equals("learning") || snapshot.studyState.equals("consulting"));
        if (!ReminderPolicy.shouldNotify(mode(context), step, now, scheduled, fresh, studying,
                LocalDate.now().toString().equals(prefs.getString("reminderRestDay", "")))) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return;
        boolean sound = mode(context) >= 2;
        String channelId = sound ? "xiaolu-study-sound" : "xiaolu-study-quiet";
        NotificationChannel channel = new NotificationChannel(channelId, sound ? "学习约定（声音与振动）" : "轻声提醒", sound ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT);
        channel.enableVibration(sound);
        if (!sound) channel.setSound(null, null);
        manager.createNotificationChannel(channel);
        String line = !fresh ? "到了约定时间。要不要一起打开学习台？"
                : step == 0 ? "准备好了吗？先陪我学一小会儿吧。"
                : step == 1 ? "我又来找你啦。先从最小的一步开始，好不好？"
                : "这次提醒后我先安静下来。想开始时，我还在。";
        Notification notification = new Notification.Builder(context, channelId).setSmallIcon(R.drawable.ic_reminder)
                .setContentTitle("小鹿来找你啦").setContentText(line).setStyle(new Notification.BigTextStyle().bigText(line))
                .setContentIntent(JournalWidget.action(context, "dev.xiaolu.TODAY", 90)).setAutoCancel(true)
                .addAction(new Notification.Action.Builder(null, "去学习", JournalWidget.action(context, "dev.xiaolu.LEARN", 91)).build())
                .addAction(new Notification.Action.Builder(null, "10分钟后", PendingIntent.getBroadcast(context, 92,
                        new Intent(context, StudyReminder.class).setAction(SNOOZE), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build())
                .addAction(new Notification.Action.Builder(null, "今天先休息", PendingIntent.getBroadcast(context, 93,
                        new Intent(context, StudyReminder.class).setAction(REST), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build()).build();
        try { manager.notify(701, notification); } catch (SecurityException ignored) { return; }
        if (mode(context) == 3 && step < 2) repeat(context, step + 1);
    }
}
