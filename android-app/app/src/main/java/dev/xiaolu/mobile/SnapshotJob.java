package dev.xiaolu.mobile;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.util.concurrent.Future;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class SnapshotJob extends JobService {
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final java.util.Map<Integer, Future<?>> work = new java.util.concurrent.ConcurrentHashMap<>();
    static void schedule(Context context, boolean immediate) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        android.appwidget.AppWidgetManager widgets = android.appwidget.AppWidgetManager.getInstance(context);
        boolean enabled = widgets.getAppWidgetIds(new ComponentName(context, JournalWidget.class)).length > 0
                || widgets.getAppWidgetIds(new ComponentName(context, CompactWidget.class)).length > 0;
        if (!enabled) { scheduler.cancel(501); scheduler.cancel(502); return; }
        JobInfo.Builder job = new JobInfo.Builder(immediate ? 502 : 501, new ComponentName(context, SnapshotJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        if (immediate) job.setMinimumLatency(0); else job.setPeriodic(30 * 60_000L).setPersisted(true);
        scheduler.schedule(job.build());
    }
    @Override public boolean onStartJob(JobParameters params) {
        work.put(params.getJobId(), executor.submit(() -> { MobileStore.sync(this); jobFinished(params, false); }));
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        Future<?> running = work.remove(params.getJobId()); if (running != null) running.cancel(true); return true;
    }
}
