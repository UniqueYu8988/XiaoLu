package dev.xiaolu.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import java.util.Locale;

/** A square card rendered independently from the launcher's possibly tall cell allocation. */
final class WidgetArtwork {
    private static Typeface pixelTypeface;
    private static final int[] PROGRESS_ART = {R.drawable.widget_progress_0, R.drawable.widget_progress_1,
            R.drawable.widget_progress_2, R.drawable.widget_progress_3, R.drawable.widget_progress_4};
    private static final int[] TIME_ART = {R.drawable.widget_time_0, R.drawable.widget_time_1,
            R.drawable.widget_time_2, R.drawable.widget_time_3, R.drawable.widget_time_4};
    static final String[] PROGRESS_LINES = {"我陪你，慢慢开始。", "已经走起来啦。", "看，我们越来越近了。", "就快把今天点亮啦。", "今天的约定，做到啦！"};
    static final String[] TIME_LINES = {"陪你翻开今天。", "已经有点学者气质啦。", "知识开始绕着你转啦。", "学进小宇宙，也记得歇歇。", "今天好投入，抱抱再休息。"};
    static int progressStage(double value) {
        return value <= 20 ? 0 : value < 40 ? 1 : value < 80 ? 2 : value < 100 ? 3 : 4;
    }
    static int timeStage(int seconds) { return Math.min(4, Math.max(0, seconds / 7200)); }
    static Bitmap render(Context context, MobileSnapshot snapshot, boolean time) {
        Bitmap output = Bitmap.createBitmap(480, 480, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.rgb(255, 248, 233));
        canvas.drawRoundRect(new RectF(0, 0, 480, 480), 48, 48, paint);
        int stage = snapshot == null ? 0 : time ? timeStage(snapshot.studySeconds) : progressStage(snapshot.overallPercent);
        String number = snapshot == null ? "共学日记" : time ? duration(snapshot.studySeconds)
                : String.format(Locale.CHINA, "%.1f%%", snapshot.overallPercent);
        String line = snapshot == null ? "点一下，来和我配对。" : (time ? TIME_LINES : PROGRESS_LINES)[stage];
        paint.setTextAlign(Paint.Align.CENTER);
        if (pixelTypeface == null) pixelTypeface = Typeface.createFromAsset(context.getAssets(), "fonts/xiaolu-pixel-12.ttf");
        paint.setTypeface(pixelTypeface);
        paint.setFakeBoldText(true);
        paint.setTextSize(58);
        while (paint.measureText(number) > 420 && paint.getTextSize() > 30) paint.setTextSize(paint.getTextSize() - 2);
        paint.setColor(Color.rgb(75, 49, 94));
        canvas.drawText(number, 240, 88, paint);
        paint.setFakeBoldText(false);
        paint.setTextSize(26);
        while (paint.measureText(line) > 420) paint.setTextSize(paint.getTextSize() - 1);
        paint.setColor(Color.rgb(118, 85, 143));
        canvas.drawText(line, 240, 132, paint);
        int resource = (time ? TIME_ART : PROGRESS_ART)[stage];
        if (resource != 0) {
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 4;
            Bitmap art = BitmapFactory.decodeResource(context.getResources(), resource, options);
            if (art != null) {
                float scale = Math.min(450f / art.getWidth(), 315f / art.getHeight());
                float width = art.getWidth() * scale, height = art.getHeight() * scale;
                paint.setFilterBitmap(false);
                canvas.drawBitmap(art, new Rect(0, 0, art.getWidth(), art.getHeight()),
                        new RectF((480 - width) / 2, 156 + (315 - height) / 2, (480 + width) / 2, 156 + (315 + height) / 2), paint);
                art.recycle();
            }
        }
        if (snapshot != null && stale(snapshot)) {
            paint.setColor(Color.rgb(118, 85, 143)); paint.setTextSize(18);
            canvas.drawText("离线摘要", 240, 466, paint);
        }
        return output;
    }
    private static boolean stale(MobileSnapshot snapshot) {
        try {
            long age = System.currentTimeMillis() - java.time.Instant.parse(snapshot.generatedAt).toEpochMilli();
            return age < 0 || age > 60 * 60_000L || !snapshot.studyDay.equals(java.time.LocalDate.now().toString());
        } catch (Exception ignored) { return true; }
    }
    static String duration(int seconds) {
        int minutes = Math.max(0, seconds) / 60;
        return minutes < 60 ? minutes + "分钟" : minutes / 60 + "小时" + minutes % 60 + "分";
    }
}
