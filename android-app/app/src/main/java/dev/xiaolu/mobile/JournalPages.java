package dev.xiaolu.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

/** Phone-sized copy of the desktop journal's hierarchy, palette and assets. */
final class JournalPages {
    static final String TODAY = "today", TASKS = "tasks", TODOS = "todos", STATS = "stats";
    static final String HISTORY = "history", BOOKMARKS = "bookmarks", RULES = "rules";
    private static final int INK = Color.rgb(75, 49, 94);
    private static final int PURPLE = Color.rgb(118, 85, 143);
    private static final int PAPER = Color.rgb(255, 253, 247);
    private static final int CREAM = Color.rgb(255, 248, 233);
    private static final int LILAC = Color.rgb(233, 221, 241);
    private static final int MUTED = Color.rgb(117, 106, 119);
    private static final int YELLOW = Color.rgb(244, 213, 123);
    private static final int GREEN = Color.rgb(232, 241, 229);
    private static final int RED = Color.rgb(252, 231, 232);
    private final Context context;
    private final MobileSnapshot snapshot;
    private final String page;
    private final String notice;
    private final boolean connected;
    private final int historyPage;
    private final Actions actions;
    private final Typeface pixel;
    private static Typeface cachedPixel;
    private final LinearLayout root;

    interface Actions {
        void navigate(String page);
        void changeHistoryPage(int page);
        void pair();
        void refresh();
        void disconnect();
        void importSnapshot();
        void addTodo(String title);
        String todoDraft();
        void saveTodoDraft(String title);
        void editTodo(MobileSnapshot.Todo todo);
        void toggleTodo(MobileSnapshot.Todo todo);
        void toggleDaily(MobileSnapshot.Todo todo);
        void deleteTodo(MobileSnapshot.Todo todo);
        void editVocabulary(MobileSnapshot snapshot);
        void openReader(String route);
    }

    JournalPages(Context context, MobileSnapshot snapshot, String page, String notice,
                 boolean connected, int historyPage, Actions actions) {
        this.context = context;
        this.snapshot = snapshot;
        this.page = page;
        this.notice = notice;
        this.connected = connected;
        this.historyPage = historyPage;
        this.actions = actions;
        Typeface loaded;
        try {
            if (cachedPixel == null) cachedPixel = Typeface.createFromAsset(context.getAssets(), "fonts/xiaolu-pixel-12.ttf");
            loaded = cachedPixel;
        }
        catch (Exception ignored) { loaded = Typeface.MONOSPACE; }
        pixel = loaded;
        root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackground(grid());
        root.setMinimumHeight(context.getResources().getDisplayMetrics().heightPixels - dp(110));
    }

    View build() {
        header();
        if (snapshot != null) hero();
        if (!notice.isEmpty() && !"已与电脑同步".equals(notice)) {
            labelCard(notice, CREAM);
        }
        if (!connected) {
            Button pair = button("与电脑配对", true);
            add(root, pair, 0, 10);
            pair.setOnClickListener(view -> actions.pair());
        }
        if (snapshot == null) {
            labelCard("还没有同步过来的学习近况。打开手机 Tailscale，再和电脑配对吧。", CREAM);
            if (connected) {
                Button refresh = button("重新同步", true);
                add(root, refresh, 10, 0);
                refresh.setOnClickListener(view -> actions.refresh());
            }
            Button importButton = button("从文件导入摘要（备用）", false);
            add(root, importButton, 10, 0);
            importButton.setOnClickListener(view -> actions.importSnapshot());
            return root;
        }
        tabs();
        switch (page) {
            case TASKS: tasks(); break;
            case TODOS: todos(); break;
            case STATS: stats(); break;
            case HISTORY: history(); break;
            case BOOKMARKS: bookmarks(); break;
            case RULES: rules(); break;
            default: today(); break;
        }
        return root;
    }

    private void header() {
        LinearLayout line = row();
        line.setGravity(Gravity.CENTER_VERTICAL);
        add(root, line, 0, 8);
        LinearLayout brand = column();
        line.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        brand.addView(text("XIAOLU STUDY JOURNAL", 10, PURPLE, true, true));
        brand.addView(text("共学日记", 23, INK, true, false));
        View bookmark = toolbarAction(true, "书签收藏", () -> actions.navigate(BOOKMARKS));
        line.addView(bookmark, box(39, 39, 4));
        View record = toolbarAction(false, "学习记录", () -> actions.navigate(HISTORY));
        line.addView(record, box(39, 39, 0));
    }

    private void hero() {
        LinearLayout card = row();
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(7), dp(4), dp(9), dp(4));
        card.setBackground(frame(LILAC));
        add(root, card, 0, 8);
        FrameLayout stage = new FrameLayout(context);
        card.addView(stage, box(76, 84, 10));
        View portraitFrame = new View(context);
        portraitFrame.setBackground(frame(CREAM));
        FrameLayout.LayoutParams frame = new FrameLayout.LayoutParams(dp(60), dp(55), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        frame.topMargin = dp(7);
        stage.addView(portraitFrame, frame);
        PixelSpriteView sprite = new PixelSpriteView(context);
        sprite.setCompanionState(snapshot);
        stage.addView(sprite, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout details = column();
        card.addView(details, new LinearLayout.LayoutParams(0, -2, 1));
        details.addView(text(snapshot.studyDay.replace('-', '.'), 11, PURPLE, true, true));
        TextView timer = text(clock(snapshot.studySeconds), 23, INK, true, true);
        details.addView(timer);
        String status = "learning".equals(snapshot.studyState)
                ? "YuReader 正在记录，我会安静陪着你。"
                : snapshot.isStudying ? "这一段，我陪你一起认真。"
                : snapshot.settled ? "今天的认真，已经收好啦。" : "准备好时，就一起开始吧。";
        details.addView(text(status, 11, MUTED, false, true));
        TextView badge = text(snapshot.isStudying || "learning".equals(snapshot.studyState) ? "学习中" : "陪着你", 11, Color.WHITE, true, true);
        badge.setPadding(dp(6), dp(3), dp(6), dp(3));
        badge.setBackgroundColor(PURPLE);
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(-2, -2);
        badgeParams.topMargin = dp(4);
        details.addView(badge, badgeParams);
    }

    private void tabs() {
        LinearLayout line = row();
        line.setBackground(frame(CREAM));
        add(root, line, 0, 9);
        tab(line, TODAY, "今日");
        tab(line, TASKS, "任务");
        tab(line, TODOS, "待办");
        tab(line, STATS, "统计");
    }

    private void tab(LinearLayout parent, String id, String title) {
        TextView item = text(title, 14, page.equals(id) ? Color.WHITE : INK, true, false);
        item.setGravity(Gravity.CENTER);
        item.setBackgroundColor(page.equals(id) ? INK : CREAM);
        parent.addView(item, new LinearLayout.LayoutParams(0, dp(38), 1));
        item.setOnClickListener(view -> actions.navigate(id));
    }

    private void today() {
        section("01", "今日在场", null);
        LinearLayout checkIns = row();
        checkIns.setBackground(frame(PAPER));
        add(root, checkIns, 0, 6);
        for (MobileSnapshot.CheckIn checkIn : snapshot.checkIns) {
            LinearLayout cell = column();
            cell.setGravity(Gravity.CENTER);
            int color = "checked".equals(checkIn.status) ? GREEN : "missed".equals(checkIn.status) ? RED : PAPER;
            cell.setBackgroundColor(color);
            checkIns.addView(cell, new LinearLayout.LayoutParams(0, dp(45), 1));
            TextView time = text(checkIn.slot, 11, INK, true, true);
            time.setGravity(Gravity.CENTER);
            cell.addView(time, new LinearLayout.LayoutParams(-1, -2));
            int markColor = "checked".equals(checkIn.status) ? Color.rgb(63, 125, 75)
                    : "missed".equals(checkIn.status) ? Color.rgb(181, 72, 88) : MUTED;
            TextView mark = text(checkIn.label(), 16, markColor, true, false);
            mark.setGravity(Gravity.CENTER);
            cell.addView(mark, new LinearLayout.LayoutParams(-1, -2));
        }
        section("02", "今日结算", null);
        tileRow(
                tile(R.drawable.stat_study_time, "学习时间", duration(snapshot.studySeconds), Color.rgb(255, 248, 223)),
                tile(R.drawable.stat_questions, "综合完成", percent(snapshot.overallPercent), Color.rgb(255, 242, 228)));
        tileRow(
                tile(R.drawable.stat_accuracy, "错题攻坚", snapshot.mistakeReviewCompleted ? "✓" : "×", Color.rgb(238, 247, 235)),
                tile(R.drawable.stat_notes, "每日复习", snapshot.oralReviewCompleted ? "✓" : "×", Color.rgb(247, 240, 251)),
                tile(R.drawable.stat_note_characters, "在场打卡", checkedCount() + "/5", Color.rgb(255, 240, 243)));
        tileRow(
                subjectTile(R.drawable.stat_subject_oral, "口腔", snapshot.medicinePercent, Color.rgb(237, 246, 233), "library/medicine"),
                subjectTile(R.drawable.stat_subject_english, "英语", snapshot.englishPercent, Color.rgb(238, 242, 255), "library/english"),
                subjectTile(R.drawable.stat_subject_politics, "政治", snapshot.politicsPercent, Color.rgb(255, 240, 235), "library/politics"));
        LinearLayout vocabulary = row();
        vocabulary.setGravity(Gravity.CENTER_VERTICAL);
        vocabulary.setPadding(dp(10), dp(9), dp(10), dp(9));
        vocabulary.setBackground(frame(CREAM));
        add(root, vocabulary, 9, 0);
        ImageView icon = image(R.drawable.stat_daily_summary, 26, 26);
        vocabulary.addView(icon, box(28, 28, 9));
        vocabulary.addView(text("今日背诵单词", 12, INK, true, true), new LinearLayout.LayoutParams(0, -2, 1));
        vocabulary.addView(text(snapshot.vocabularyCount + " / " + snapshot.vocabularyTarget, 15, PURPLE, true, true));
        vocabulary.setContentDescription("填写今日背诵单词总数");
        if (connected) vocabulary.setOnClickListener(view -> actions.editVocabulary(snapshot));
        TextView edit = text("›", 22, PURPLE, true, false);
        edit.setPadding(dp(9), 0, 0, 0);
        vocabulary.addView(edit);
        readerShortcuts();
    }

    private void tasks() {
        section("GOAL", "今日任务", percent(snapshot.overallPercent));
        LinearLayout gallery = row();
        gallery.setGravity(Gravity.BOTTOM);
        add(root, gallery, 8, 10);
        goal(gallery, R.drawable.bookmark_self, "做题达成", snapshot.questionsPercent, 205);
        goal(gallery, R.drawable.bookmark_together, "综合达成", snapshot.overallPercent, 240);
        goal(gallery, R.drawable.bookmark_friend, "阅读达成", snapshot.readingPercent, 205);
        Button rules = button("得分规则  ›", false);
        add(root, rules, 3, 0);
        rules.setOnClickListener(view -> actions.navigate(RULES));
        readerShortcuts();
    }

    private void goal(LinearLayout parent, int art, String label, double percent, int height) {
        LinearLayout column = column();
        column.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        parent.addView(column, new LinearLayout.LayoutParams(0, -2, 1));
        column.addView(new GoalBookmarkView(context, art, percent), new LinearLayout.LayoutParams(-1, dp(height)));
        TextView name = text(label, 12, INK, true, true);
        name.setGravity(Gravity.CENTER);
        column.addView(name);
        TextView amount = text(percent(percent), 17, PURPLE, true, true);
        amount.setGravity(Gravity.CENTER);
        column.addView(amount);
    }

    private void todos() {
        section("TODO", "待办清单", completedTodos() + " / " + snapshot.todos.size());
        if (connected) {
            LinearLayout form = row();
            add(root, form, 0, 10);
            EditText field = new EditText(context);
            field.setSingleLine(true);
            field.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(60) });
            field.setText(actions.todoDraft());
            field.addTextChangedListener(new android.text.TextWatcher() {
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
                public void onTextChanged(CharSequence s, int start, int before, int count) { actions.saveTodoDraft(s.toString()); }
                public void afterTextChanged(android.text.Editable s) {}
            });
            field.setTextSize(14);
            field.setHint("记下一件以后想做的事");
            field.setPadding(dp(10), 0, dp(10), 0);
            field.setBackground(frame(Color.WHITE));
            form.addView(field, new LinearLayout.LayoutParams(0, dp(46), 1));
            Button add = button("加入", true);
            form.addView(add, box(67, 46, 0));
            add.setOnClickListener(view -> {
                String title = field.getText().toString().trim();
                if (!title.isEmpty()) actions.addTodo(title);
            });
        }
        if (snapshot.todos.isEmpty()) {
            labelCard("这里还空着。记下一件以后想做的事吧。", CREAM);
        }
        for (MobileSnapshot.Todo todo : snapshot.todos) todoRow(todo);
    }

    private void todoRow(MobileSnapshot.Todo todo) {
        LinearLayout line = row();
        line.setGravity(Gravity.CENTER_VERTICAL);
        line.setBackground(frame(todo.completed ? GREEN : CREAM));
        add(root, line, 0, 7);
        TextView check = miniAction(todo.completed ? "✓" : "□", todo.completed ? "撤销完成" : "标记完成");
        line.addView(check, box(42, 44, 0));
        if (connected) check.setOnClickListener(view -> actions.toggleTodo(todo));
        TextView title = text(todo.title, 13, todo.completed ? MUTED : INK, false, true);
        title.setMaxLines(2);
        title.setPadding(dp(6), 0, dp(6), 0);
        line.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        if (connected) title.setOnClickListener(view -> actions.editTodo(todo));
        if (!connected) return;
        TextView daily = miniAction("日", todo.daily ? "取消每日刷新" : "设为每日刷新");
        daily.setBackgroundColor(todo.daily ? YELLOW : Color.TRANSPARENT);
        line.addView(daily, box(39, 44, 0));
        daily.setOnClickListener(view -> actions.toggleDaily(todo));
        TextView remove = miniAction("×", "删除待办");
        line.addView(remove, box(38, 44, 0));
        remove.setOnClickListener(view -> actions.deleteTodo(todo));
    }

    private void stats() {
        section("SUM", "累计统计", null);
        tileRow(metric("累计学习", duration(snapshot.stats.totalStudySeconds)), metric("按时打卡", snapshot.stats.checkedCount + " 次"));
        tileRow(metric("双人书签", snapshot.stats.togetherBookmarks + " 枚"), metric("累计背词", snapshot.stats.totalVocabulary + " 个"));
        setting("小鹿自启", "开机后准时来找你", snapshot.settings.launchAtLogin, R.drawable.stat_study_time);
        setting("小鹿学习", "连接 YuReader，同步阅读与做题进度", snapshot.settings.yuReaderEnabled, R.drawable.stat_questions);
        setting("小鹿巡逻", "约定时段没开始，就在桌面找你", snapshot.settings.patrolEnabled, R.drawable.stat_accuracy);
        setting("小鹿语音", "只在重要时刻开口", snapshot.settings.voiceEnabled, R.drawable.stat_daily_summary);
        section("LINK", "手机连接", null);
        LinearLayout connectionLine = row();
        connectionLine.setGravity(Gravity.CENTER_VERTICAL);
        add(root, connectionLine, 0, 6);
        connectionLine.addView(text(connected ? "已配对" : "未配对", 13, INK, true, true), new LinearLayout.LayoutParams(0, -2, 1));
        connectionLine.addView(text(updatedTime(), 10, MUTED, false, false));
        Button connection = button(connected ? "断开此手机" : "与电脑配对", false);
        LinearLayout controls = row();
        add(root, controls, 4, 0);
        Button refresh = button("刷新进度", true);
        controls.addView(refresh, new LinearLayout.LayoutParams(0, dp(44), 1));
        refresh.setOnClickListener(view -> actions.refresh());
        LinearLayout.LayoutParams connectionParams = new LinearLayout.LayoutParams(0, dp(44), 1);
        connectionParams.leftMargin = dp(8);
        controls.addView(connection, connectionParams);
        connection.setOnClickListener(view -> { if (connected) actions.disconnect(); else actions.pair(); });
        if (!connected) {
            Button importButton = button("导入摘要", false);
            add(root, importButton, 6, 0);
            importButton.setOnClickListener(view -> actions.importSnapshot());
        }
    }

    private void history() {
        section("LOG", "学习记录", String.valueOf(snapshot.history.size()));
        if (snapshot.history.isEmpty()) { labelCard("这里还空着，今天会成为第一页。", CREAM); return; }
        int pageSize = 6;
        int count = Math.max(1, (snapshot.history.size() + pageSize - 1) / pageSize);
        int current = Math.min(historyPage, count - 1);
        int from = current * pageSize;
        int to = Math.min(snapshot.history.size(), from + pageSize);
        for (int i = from; i < to; i++) {
            MobileSnapshot.HistoryEntry day = snapshot.history.get(i);
            LinearLayout card = column();
            card.setPadding(dp(11), dp(10), dp(11), dp(10));
            card.setBackground(frame(CREAM));
            add(root, card, 0, 9);
            LinearLayout head = row();
            card.addView(head);
            head.addView(text(day.date.replace('-', '.'), 13, INK, true, true), new LinearLayout.LayoutParams(0, -2, 1));
            head.addView(text(day.studyTimeUnknown ? "不详" : duration(day.studySeconds), 11, PURPLE, true, true));
            String meta = (day.readingPercent > 0 || day.questionsPercent > 0 || day.vocabularyCount > 0)
                    ? "阅读 " + percent(day.readingPercent) + " · 做题 " + percent(day.questionsPercent) + " · 单词 " + day.vocabularyCount
                    : "打卡 " + day.checkedCount + "/5 · 任务 " + day.completedTaskCount + "/" + day.taskCount;
            add(card, text(meta, 11, MUTED, false, true), 6, 0);
            if (!day.note.isEmpty()) {
                TextView quote = text(day.note, 12, INK, false, true);
                quote.setPadding(dp(8), dp(3), 0, 0);
                quote.setMaxLines(3);
                add(card, quote, 5, 0);
            }
        }
        LinearLayout pager = row();
        pager.setGravity(Gravity.CENTER_VERTICAL);
        add(root, pager, 5, 4);
        Button previous = button("‹", false);
        previous.setEnabled(current > 0);
        pager.addView(previous, box(46, 39, 0));
        previous.setOnClickListener(view -> actions.changeHistoryPage(current - 1));
        TextView number = text((current + 1) + " / " + count, 13, INK, true, true);
        number.setGravity(Gravity.CENTER);
        pager.addView(number, new LinearLayout.LayoutParams(0, -2, 1));
        Button next = button("›", false);
        next.setEnabled(current < count - 1);
        pager.addView(next, box(46, 39, 0));
        next.setOnClickListener(view -> actions.changeHistoryPage(current + 1));
    }

    private void bookmarks() {
        section("COL", "我们的书签", null);
        LinearLayout gallery = row();
        gallery.setGravity(Gravity.BOTTOM);
        add(root, gallery, 8, 8);
        collection(gallery, R.drawable.bookmark_self, "我的书签", snapshot.stats.selfBookmarks, 205);
        collection(gallery, R.drawable.bookmark_together, "双人书签", snapshot.stats.togetherBookmarks, 240);
        collection(gallery, R.drawable.bookmark_friend, "她的书签", snapshot.stats.friendBookmarks, 205);
    }

    private void collection(LinearLayout parent, int art, String label, int count, int height) {
        LinearLayout column = column();
        column.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM);
        parent.addView(column, new LinearLayout.LayoutParams(0, -2, 1));
        ImageView image = image(art, -1, height);
        column.addView(image, new LinearLayout.LayoutParams(-1, dp(height)));
        TextView number = text("× " + count, 15, PURPLE, true, true);
        number.setGravity(Gravity.CENTER);
        column.addView(number);
        TextView name = text(label, 11, INK, true, true);
        name.setGravity(Gravity.CENTER);
        column.addView(name);
    }

    private void rules() {
        section("RULE", "得分说明", null);
        helper("进度实时计算；目标在 YuReader 调整后，手机也会跟着更新。");
        rule("01", "阅读达成", "YuReader 阅读进度 ＋ 背词加成", "背词数 ÷ 当前单词目标 × 10 个百分点。超额背词继续累加。", GREEN);
        rule("02", "做题达成", "YuReader 做题进度 ＋ 两项复习加成", "错题攻坚、每日复习每完成一项，各加 10 个百分点。", RED);
        rule("03", "综合达成", "阅读 × 50% ＋ 做题 × 50% ＋ 在场打卡", "每次有效打卡再加 1 个百分点；三种进度都可以超过 100%。", LILAC);
        labelCard("阅读、做题、综合分别达到 100%，就各收下一枚对应书签。", CREAM);
        Button back = button("‹ 返回今日任务", false);
        add(root, back, 10, 0);
        back.setOnClickListener(view -> actions.navigate(TASKS));
    }

    private void rule(String number, String title, String formula, String explanation, int background) {
        LinearLayout card = column();
        card.setPadding(dp(11), dp(10), dp(11), dp(10));
        card.setBackground(frame(background));
        add(root, card, 5, 7);
        card.addView(text(number + "  " + title, 15, INK, true, true));
        add(card, text(formula, 13, INK, true, true), 6, 0);
        add(card, text(explanation, 11, MUTED, false, true), 5, 0);
    }

    private LinearLayout tile(int icon, String label, String value, int background) {
        LinearLayout tile = column();
        tile.setGravity(Gravity.CENTER_HORIZONTAL);
        tile.setPadding(dp(7), dp(8), dp(7), dp(7));
        tile.setMinimumHeight(dp(65));
        tile.setBackground(frame(background));
        LinearLayout main = row();
        main.setGravity(Gravity.CENTER);
        main.setBaselineAligned(false);
        tile.addView(main, new LinearLayout.LayoutParams(-1, -2));
        main.addView(image(icon, 27, 27), box(27, 27, 5));
        TextView amount = text(value, 15, INK, true, true);
        amount.setGravity(Gravity.CENTER);
        amount.setSingleLine(true);
        amount.setAutoSizeTextTypeUniformWithConfiguration(11, 15, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        if (value.equals("✓")) amount.setTextColor(Color.rgb(63, 125, 75));
        if (value.equals("×")) amount.setTextColor(Color.rgb(181, 72, 88));
        main.addView(amount, new LinearLayout.LayoutParams(0, dp(27), 1));
        TextView caption = text(label, 11, MUTED, false, true);
        caption.setGravity(Gravity.CENTER);
        add(tile, caption, 4, 0);
        return tile;
    }

    private LinearLayout subjectTile(int icon, String label, double progress, int color, String route) {
        LinearLayout card = tile(icon, label, percent(progress), color);
        return card;
    }

    private LinearLayout metric(String label, String value) {
        LinearLayout tile = column();
        tile.setPadding(dp(11), dp(10), dp(11), dp(9));
        tile.setMinimumHeight(dp(60));
        tile.setBackground(frame(CREAM));
        TextView amount = text(value, 16, INK, true, true);
        amount.setSingleLine(true);
        amount.setAutoSizeTextTypeUniformWithConfiguration(12, 16, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        tile.addView(amount, new LinearLayout.LayoutParams(-1, dp(23)));
        add(tile, text(label, 11, MUTED, false, true), 5, 0);
        return tile;
    }

    private void tileRow(LinearLayout... cells) {
        LinearLayout line = row();
        line.setBaselineAligned(false);
        add(root, line, 0, 7);
        for (int i = 0; i < cells.length; i++) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -1, 1);
            if (i > 0) params.leftMargin = dp(8);
            line.addView(cells[i], params);
        }
    }

    private void setting(String title, String subtitle, boolean enabled, int icon) {
        LinearLayout line = row();
        line.setGravity(Gravity.CENTER_VERTICAL);
        line.setPadding(dp(8), dp(5), dp(9), dp(5));
        line.setBackground(frame(LILAC));
        add(root, line, 7, 0);
        line.addView(image(icon, 27, 27), box(28, 28, 9));
        LinearLayout copy = column();
        line.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        copy.addView(text(title, 13, INK, true, false));
        TextView status = text(enabled ? "✓" : "·", 17, enabled ? Color.rgb(63, 125, 75) : MUTED, true, false);
        status.setGravity(Gravity.CENTER);
        status.setBackground(frame(enabled ? GREEN : PAPER));
        line.addView(status, box(35, 28, 0));
    }

    private void section(String code, String title, String metric) {
        LinearLayout line = row();
        line.setGravity(Gravity.CENTER_VERTICAL);
        add(root, line, 9, 6);
        TextView tag = text(code, 9, Color.WHITE, true, true);
        tag.setGravity(Gravity.CENTER);
        tag.setPadding(dp(5), dp(3), dp(5), dp(3));
        tag.setBackgroundColor(INK);
        line.addView(tag);
        TextView heading = text(title, 17, INK, true, false);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, -2, 1);
        titleParams.leftMargin = dp(8);
        line.addView(heading, titleParams);
        if (metric != null) {
            TextView value = text(metric, 13, Color.WHITE, true, true);
            value.setPadding(dp(7), dp(5), dp(7), dp(5));
            value.setBackground(frame(PURPLE));
            line.addView(value);
        }
    }

    private void helper(String value) {
        TextView text = text(value, 11, MUTED, false, true);
        text.setLineSpacing(dp(2), 1f);
        add(root, text, 2, 6);
    }

    private void labelCard(String value, int background) {
        TextView text = text(value, 12, INK, false, true);
        text.setPadding(dp(10), dp(9), dp(10), dp(9));
        text.setBackground(frame(background));
        add(root, text, 8, 0);
    }

    private Button button(String value, boolean primary) {
        Button button = new Button(context);
        button.setText(value);
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setTextColor(primary ? Color.WHITE : INK);
        button.setTypeface(pixel, Typeface.BOLD);
        button.setBackground(frame(primary ? PURPLE : CREAM));
        button.setStateListAnimator(null);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(12), dp(9), dp(12), dp(9));
        button.setMinimumHeight(dp(44));
        return button;
    }

    private View toolbarAction(boolean bookmark, String description, Runnable action) {
        View view = new View(context) {
            private final Paint paint = new Paint();
            @Override protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                float x = (getWidth() - dp(17)) / 2f;
                float y = (getHeight() - dp(20)) / 2f;
                if (bookmark) {
                    paint.setColor(INK);
                    Path outside = new Path();
                    outside.moveTo(x, y);
                    outside.lineTo(x + dp(17), y);
                    outside.lineTo(x + dp(17), y + dp(20));
                    outside.lineTo(x + dp(8.5f), y + dp(15));
                    outside.lineTo(x, y + dp(20));
                    outside.close();
                    canvas.drawPath(outside, paint);
                    paint.setColor(YELLOW);
                    Path inside = new Path();
                    inside.moveTo(x + dp(2), y + dp(2));
                    inside.lineTo(x + dp(15), y + dp(2));
                    inside.lineTo(x + dp(15), y + dp(16));
                    inside.lineTo(x + dp(8.5f), y + dp(12));
                    inside.lineTo(x + dp(2), y + dp(16));
                    inside.close();
                    canvas.drawPath(inside, paint);
                } else {
                    paint.setColor(INK);
                    canvas.drawRect(x, y, x + dp(17), y + dp(20), paint);
                    paint.setColor(PAPER);
                    canvas.drawRect(x + dp(2), y + dp(2), x + dp(15), y + dp(18), paint);
                    paint.setColor(PURPLE);
                    for (int i = 0; i < 3; i++) canvas.drawRect(x + dp(4), y + dp(5 + i * 4), x + dp(13), y + dp(6 + i * 4), paint);
                }
            }
        };
        view.setBackground(frame(CREAM));
        view.setContentDescription(description);
        view.setOnClickListener(item -> action.run());
        return view;
    }

    private TextView miniAction(String value, String description) {
        TextView view = text(value, 18, INK, true, false);
        view.setGravity(Gravity.CENTER);
        view.setContentDescription(description);
        return view;
    }

    private ImageView image(int resource, int width, int height) {
        ImageView image = new ImageView(context);
        image.setImageResource(resource);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        return image;
    }

    private TextView text(String value, int size, int color, boolean bold, boolean pixelFont) {
        TextView text = new TextView(context);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        text.setIncludeFontPadding(false);
        text.setLineSpacing(dp(3), 1f);
        if (pixelFont) text.setTypeface(pixel, bold ? Typeface.BOLD : Typeface.NORMAL);
        else if (bold) text.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return text;
    }

    private Drawable frame(int color) {
        GradientDrawable border = new GradientDrawable();
        border.setColor(color);
        border.setCornerRadius(0);
        border.setStroke(dp(2), INK);
        return border;
    }

    private void readerShortcuts() {
        LinearLayout line = row();
        add(root, line, 10, 4);
        Button practice = button("去学习  ↗", true);
        Button notes = button("去编程  ↗", false);
        line.addView(practice, new LinearLayout.LayoutParams(0, dp(44), 1));
        LinearLayout.LayoutParams second = new LinearLayout.LayoutParams(0, dp(44), 1);
        second.leftMargin = dp(8);
        line.addView(notes, second);
        practice.setOnClickListener(view -> actions.openReader("home"));
        notes.setOnClickListener(view -> actions.openReader("programming"));
    }

    private String updatedTime() {
        try {
            java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("MM.dd HH:mm", Locale.CHINA);
            return "更新 " + format.format(java.util.Date.from(java.time.Instant.parse(snapshot.generatedAt)));
        } catch (Exception ignored) { return "尚未更新"; }
    }

    private Drawable grid() {
        int tile = dp(16);
        Bitmap bitmap = Bitmap.createBitmap(tile, tile, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(PAPER);
        Paint paint = new Paint();
        paint.setColor(Color.rgb(249, 244, 250));
        canvas.drawRect(0, 0, tile, 1, paint);
        canvas.drawRect(0, 0, 1, tile, paint);
        BitmapDrawable drawable = new BitmapDrawable(context.getResources(), bitmap);
        drawable.setTileModeX(android.graphics.Shader.TileMode.REPEAT);
        drawable.setTileModeY(android.graphics.Shader.TileMode.REPEAT);
        return drawable;
    }

    private static LinearLayout row(Context context) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }
    private LinearLayout row() { return row(context); }
    private LinearLayout column() {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }
    private void add(LinearLayout parent, View child, int top, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(top);
        params.bottomMargin = dp(bottom);
        parent.addView(child, params);
    }
    private LinearLayout.LayoutParams box(int width, int height, int right) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width < 0 ? width : dp(width), height < 0 ? height : dp(height));
        params.rightMargin = dp(right);
        return params;
    }
    private int checkedCount() {
        int count = 0;
        for (MobileSnapshot.CheckIn item : snapshot.checkIns) if ("checked".equals(item.status)) count++;
        return count;
    }
    private int completedTodos() {
        int count = 0;
        for (MobileSnapshot.Todo item : snapshot.todos) if (item.completed) count++;
        return count;
    }
    private int dp(float value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    private static String percent(double value) {
        return value == Math.floor(value) ? String.format(Locale.CHINA, "%.0f%%", value)
                : String.format(Locale.CHINA, "%.1f%%", value);
    }
    private static String duration(int seconds) {
        int minutes = Math.max(0, seconds) / 60;
        return minutes < 60 ? minutes + " 分钟" : (minutes / 60) + " 小时 " + (minutes % 60) + " 分";
    }
    private static String clock(int seconds) {
        int value = Math.max(0, seconds);
        return String.format(Locale.CHINA, "%02d:%02d:%02d", value / 3600, (value / 60) % 60, value % 60);
    }
}
