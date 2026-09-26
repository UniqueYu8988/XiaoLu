package dev.xiaolu.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.view.View;

/** Renders the original XiaoLu frames; no replacement illustration is used. */
final class PixelSpriteView extends View {
    private static final int FRAME_WIDTH = 192;
    private static final int FRAME_HEIGHT = 208;
    private static Bitmap sheet;
    private final Paint paint = new Paint();
    private String state = "idle";
    private int frame = 0;
    private long nextFrameAt = 0;
    private long temporaryUntil = 0;
    private String baseState = "idle";

    PixelSpriteView(Context context) {
        super(context);
        if (sheet == null) sheet = BitmapFactory.decodeResource(getResources(), R.drawable.xiaolu_spritesheet);
        paint.setFilterBitmap(false);
        paint.setAntiAlias(false);
        setContentDescription("小鹿同学，点一下会向你挥手");
        setOnClickListener(view -> wave());
    }

    void setCompanionState(MobileSnapshot snapshot) {
        baseState = snapshot.checkIns.stream().anyMatch(item -> "pending".equals(item.status))
                ? "waiting"
                : snapshot.isStudying || "learning".equals(snapshot.studyState) ? "running" : "idle";
        if (System.currentTimeMillis() >= temporaryUntil) setAnimation(baseState);
    }

    private void wave() {
        setAnimation("waving");
        temporaryUntil = System.currentTimeMillis() + 1_400;
    }

    private void setAnimation(String next) {
        if (state.equals(next)) return;
        state = next;
        frame = 0;
        nextFrameAt = 0;
        invalidate();
    }

    private int row() {
        switch (state) {
            case "waving": return 3;
            case "waiting": return 6;
            case "running": return 7;
            default: return 0;
        }
    }

    private int frames() { return "waving".equals(state) ? 4 : 6; }

    private int interval() {
        switch (state) {
            case "waving": return 175;
            case "waiting": return 185;
            case "running": return 170;
            default: return 915;
        }
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (sheet == null) return;
        long now = System.currentTimeMillis();
        if (temporaryUntil > 0 && now >= temporaryUntil) {
            temporaryUntil = 0;
            setAnimation(baseState);
        }
        if (now >= nextFrameAt) {
            frame = (frame + (nextFrameAt == 0 ? 0 : 1)) % frames();
            nextFrameAt = now + interval();
        }
        int left = frame * FRAME_WIDTH;
        int top = row() * FRAME_HEIGHT;
        Rect source = new Rect(left, top, left + FRAME_WIDTH, top + FRAME_HEIGHT);
        float scale = Math.min(getWidth() / (float) FRAME_WIDTH, getHeight() / (float) FRAME_HEIGHT);
        float width = FRAME_WIDTH * scale;
        float height = FRAME_HEIGHT * scale;
        float x = (getWidth() - width) / 2f;
        float y = getHeight() - height;
        canvas.drawBitmap(sheet, source, new android.graphics.RectF(x, y, x + width, y + height), paint);
        if (isAttachedToWindow()) postInvalidateDelayed(Math.max(40, nextFrameAt - now));
    }
}
