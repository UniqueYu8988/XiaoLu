package dev.xiaolu.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.view.View;

/** Same three desktop assets, with progress restoring color from the bottom. */
final class GoalBookmarkView extends View {
    private final Bitmap image;
    private final Paint muted = new Paint();
    private final Paint color = new Paint();
    private final Paint sparkle = new Paint();
    private final double percent;
    private boolean starPhase;

    GoalBookmarkView(Context context, int resource, double percent) {
        super(context);
        image = BitmapFactory.decodeResource(getResources(), resource);
        this.percent = Math.max(0, percent);
        muted.setFilterBitmap(false);
        muted.setAlpha(115);
        ColorMatrix matrix = new ColorMatrix();
        matrix.setSaturation(0);
        muted.setColorFilter(new ColorMatrixColorFilter(matrix));
        color.setFilterBitmap(false);
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (image == null) return;
        float margin = getWidth() * .07f;
        float usableWidth = getWidth() - 2 * margin;
        float usableHeight = getHeight() - 12;
        float scale = Math.min(usableWidth / image.getWidth(), usableHeight / image.getHeight());
        float width = image.getWidth() * scale;
        float height = image.getHeight() * scale;
        float left = (getWidth() - width) / 2f;
        float top = (getHeight() - height) / 2f;
        Rect source = new Rect(0, 0, image.getWidth(), image.getHeight());
        RectF target = new RectF(left, top, left + width, top + height);
        canvas.drawBitmap(image, source, target, muted);
        canvas.save();
        canvas.clipRect(left, top + height * (1f - (float) Math.min(100, percent) / 100f), left + width, top + height);
        canvas.drawBitmap(image, source, target, color);
        canvas.restore();
        if (percent >= 100) {
            star(canvas, left + width * .08f, top + height * .18f, starPhase ? 5 : 3);
            star(canvas, left + width * .88f, top + height * .55f, starPhase ? 3 : 5);
            star(canvas, left + width * .3f, top + height * .83f, starPhase ? 4 : 2);
            starPhase = !starPhase;
            if (isAttachedToWindow()) postInvalidateDelayed(900);
        }
    }

    private void star(Canvas canvas, float x, float y, float radius) {
        sparkle.setColor(Color.rgb(244, 213, 123));
        canvas.drawRect(x - radius, y - 2, x + radius, y + 2, sparkle);
        canvas.drawRect(x - 2, y - radius, x + 2, y + radius, sparkle);
        sparkle.setColor(Color.WHITE);
        canvas.drawRect(x - 1, y - 1, x + 1, y + 1, sparkle);
    }
}
