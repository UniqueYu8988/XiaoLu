package dev.xiaolu.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

public class JournalWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        SnapshotJob.schedule(context, true);
    }
    @Override public void onEnabled(Context context) { SnapshotJob.schedule(context, false); SnapshotJob.schedule(context, true); }
    @Override public void onDisabled(Context context) { SnapshotJob.schedule(context, false); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle options) { updateAll(context); }
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        render(context, manager, JournalWidget.class, false);
        render(context, manager, CompactWidget.class, true);
    }
    private static void render(Context context, AppWidgetManager manager, Class<?> type, boolean compact) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, type));
        if (ids.length == 0) return;
        MobileSnapshot snapshot = MobileStore.read(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_square);
        Bitmap card = WidgetArtwork.render(context, snapshot, compact);
        views.setImageViewBitmap(R.id.widget_card, card);
        views.setOnClickPendingIntent(R.id.widget_root, action(context, "dev.xiaolu.TODAY", 80));
        manager.updateAppWidget(ids, views);
        card.recycle();
    }
    static PendingIntent action(Context context, String action, int code) {
        return PendingIntent.getActivity(context, code, new Intent(context, MainActivity.class).setAction(action)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
