package dev.xiaolu.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int OPEN_SNAPSHOT = 1001;
    private static final String SNAPSHOT_FILE = "mobile-snapshot.json";
    private static final int MAX_SNAPSHOT_BYTES = 256 * 1024;
    private static final int INK = Color.rgb(75, 49, 94);
    private static final int PAPER = Color.rgb(255, 253, 247);
    private static final int CREAM = Color.rgb(255, 248, 233);
    private static final int PURPLE = Color.rgb(118, 85, 143);
    private static final int MUTED = Color.rgb(117, 106, 119);
    private LinearLayout body;
    private ScrollView scroll;
    private String selectedPage = JournalPages.TODAY;
    private int historyPage = 0;
    private boolean resetScrollNext = false;
    private String revision = "";
    private String vocabularyRevision = "";
    private String notice = "";
    private boolean networkBusy = false;
    private boolean editingTodo = false;
    private JournalPages renderedPages;
    private String renderedPage = "";
    private String pendingAction = "";
    private final java.util.Map<String, Integer> pageScroll = new java.util.HashMap<>();
    private int navigationDirection = 0;
    private final Handler refreshHandler = new Handler(Looper.getMainLooper());
    private final Runnable periodicRefresh = new Runnable() {
        @Override public void run() {
            if (!savedToken().isEmpty() && !editingTodo && todoDraft().isEmpty()) refreshOnline();
            refreshHandler.postDelayed(this, 30_000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(INK);
        getWindow().setNavigationBarColor(INK);
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAPER);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(14), dp(10), dp(14), dp(12));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            scroll.setOnApplyWindowInsetsListener((view, insets) -> {
                int top = insets.getInsets(WindowInsets.Type.systemBars()).top;
                int bottom = insets.getInsets(WindowInsets.Type.systemBars()).bottom;
                body.setPadding(dp(14), dp(10) + top, dp(14), dp(12) + bottom);
                return insets;
            });
        }
        scroll.addView(body);
        setContentView(scroll);
        revision = MobileStore.preferences(this).getString("revision", "");
        vocabularyRevision = MobileStore.preferences(this).getString("vocabularyRevision", "");
        handleEntry(getIntent());
        render();
        runEntry();
        SnapshotJob.schedule(this, false);
        StudyReminder.schedule(this);
    }

    @Override protected void onResume() {
        super.onResume();
        refreshHandler.removeCallbacks(periodicRefresh);
        periodicRefresh.run();
    }

    @Override protected void onPause() {
        refreshHandler.removeCallbacks(periodicRefresh);
        super.onPause();
    }

    private void render() {
        boolean reset = resetScrollNext;
        int previousY = reset ? 0 : scroll.getScrollY();
        resetScrollNext = false;
        MobileSnapshot snapshot = MobileStore.read(this);
        if (!reset && snapshot != null && renderedPages != null && renderedPage.equals(selectedPage)
                && renderedPages.updateProgress(snapshot, notice)) return;
        body.removeAllViews();
        JournalPages pages = new JournalPages(this, snapshot, selectedPage, notice,
                !savedToken().isEmpty(), historyPage, new JournalPages.Actions() {
            @Override public void navigate(String page) {
                pageScroll.put(selectedPage, scroll.getScrollY());
                navigationDirection = tabIndex(page) >= tabIndex(selectedPage) ? 1 : -1;
                selectedPage = page;
                resetScrollNext = true;
                render();
            }
            @Override public void changeHistoryPage(int page) {
                historyPage = Math.max(0, page);
                resetScrollNext = true;
                render();
            }
            @Override public void pair() { pairingDialog(); }
            @Override public void refresh() { refreshOnline(); }
            @Override public void disconnect() {
                new AlertDialog.Builder(MainActivity.this).setMessage("断开后只保留上次摘要；电脑托盘仍可单独撤销授权。")
                        .setNegativeButton("取消", null)
                        .setPositiveButton("断开", (dialog, which) -> {
                            getPreferences(MODE_PRIVATE).edit().remove("token").remove("base").apply();
                            revision = "";
                            notice = "";
                            render();
                        }).show();
            }
            @Override public void importSnapshot() { openSnapshotPicker(); }
            @Override public void addTodo(String title) {
                try { mutate("POST", new JSONObject().put("title", title)); }
                catch (JSONException error) { toast("操作无法提交"); }
            }
            @Override public String todoDraft() { return MainActivity.this.todoDraft(); }
            @Override public void saveTodoDraft(String title) { getPreferences(MODE_PRIVATE).edit().putString("todoDraft", title).apply(); }
            @Override public void editTodo(MobileSnapshot.Todo todo) { MainActivity.this.editTodo(todo); }
            @Override public void toggleTodo(MobileSnapshot.Todo todo) {
                try { mutate("PUT", new JSONObject().put("id", todo.id).put("completed", !todo.completed)); }
                catch (JSONException error) { toast("操作无法提交"); }
            }
            @Override public void toggleDaily(MobileSnapshot.Todo todo) {
                try { mutate("PUT", new JSONObject().put("id", todo.id).put("daily", !todo.daily)); }
                catch (JSONException error) { toast("操作无法提交"); }
            }
            @Override public void deleteTodo(MobileSnapshot.Todo todo) {
                new AlertDialog.Builder(MainActivity.this).setMessage("删除「" + todo.title + "」？")
                        .setNegativeButton("取消", null)
                        .setPositiveButton("删除", (dialog, which) -> {
                            try { mutate("DELETE", new JSONObject().put("id", todo.id)); }
                            catch (JSONException error) { toast("操作无法提交"); }
                        }).show();
            }
            @Override public void editVocabulary(MobileSnapshot snapshot) { vocabularyDialog(snapshot); }
            @Override public void openReader(String route) { MainActivity.this.openReader(route); }
            @Override public void reminderSettings() { reminderDialog(); }
            @Override public String reminderLabel() { return StudyReminder.label(MainActivity.this); }
        });
        body.addView(pages.build());
        renderedPages = pages;
        renderedPage = selectedPage;
        int targetY = navigationDirection == 0 ? previousY : pageScroll.getOrDefault(selectedPage, 0);
        scroll.post(() -> scroll.scrollTo(0, targetY));
        if (navigationDirection != 0 && android.animation.ValueAnimator.areAnimatorsEnabled()) {
            View content = pages.contentView();
            content.setTranslationX(dp(12) * navigationDirection);
            content.setAlpha(0f);
            content.animate().translationX(0f).alpha(1f).setDuration(200).start();
        }
        navigationDirection = 0;
    }

    private String savedBase() { return getPreferences(MODE_PRIVATE).getString("base", BuildConfig.DEFAULT_BASE_URL); }
    private String savedToken() { return getPreferences(MODE_PRIVATE).getString("token", ""); }
    private String todoDraft() { return getPreferences(MODE_PRIVATE).getString("todoDraft", ""); }

    private void connectionControls() {
        if (!notice.isEmpty()) message(notice, CREAM);
        if (savedToken().isEmpty()) {
            Button pair = new Button(this);
            pair.setText("与电脑配对");
            pair.setAllCaps(false);
            pair.setBackground(block(CREAM));
            body.addView(pair);
            pair.setOnClickListener(view -> pairingDialog());
        } else {
            LinearLayout row = new LinearLayout(this);
            body.addView(row);
            Button refresh = new Button(this);
            refresh.setText("刷新进度");
            refresh.setAllCaps(false);
            refresh.setBackground(block(CREAM));
            row.addView(refresh, new LinearLayout.LayoutParams(0, dp(46), 1));
            refresh.setOnClickListener(view -> refreshOnline());
            Button disconnect = new Button(this);
            disconnect.setText("断开");
            disconnect.setAllCaps(false);
            disconnect.setBackground(block(CREAM));
            row.addView(disconnect, new LinearLayout.LayoutParams(0, dp(46), 1));
            disconnect.setOnClickListener(view -> new AlertDialog.Builder(this)
                    .setMessage("断开后只保留上次摘要；电脑的授权也可从托盘撤销。")
                    .setNegativeButton("取消", null)
                    .setPositiveButton("断开", (dialog, which) -> {
                        getPreferences(MODE_PRIVATE).edit().remove("token").remove("base").apply();
                        revision = "";
                        render();
                    }).show());
        }
    }

    private void pairingDialog() {
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        fields.setPadding(dp(18), dp(8), dp(18), 0);
        TextView destination = text(savedBase().isEmpty()
                ? "尚未设置电脑地址，请先点「更换电脑」。"
                : "已预设你的电脑。手机需先连接 Tailscale。", 12, MUTED, false);
        fields.addView(destination);
        EditText code = new EditText(this);
        code.setSingleLine(true);
        code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        code.setHint("电脑托盘里的 6 位配对码");
        fields.addView(code);
        new AlertDialog.Builder(this).setTitle("与电脑配对").setView(fields)
                .setNegativeButton("取消", null)
                .setNeutralButton("更换电脑", (dialog, which) -> changeComputerDialog())
                .setPositiveButton("连接", (dialog, which) -> {
                    String base = savedBase();
                    String entered = code.getText().toString().trim();
                    if (!entered.matches("[0-9]{6}")) { toast("请输入 6 位配对码"); return; }
                    network(() -> {
                        JSONObject response = MobileApi.request(base, "/v1/pair", "POST", "", "", new JSONObject().put("code", entered));
                        String token = response.getString("token");
                        runOnUiThread(() -> getPreferences(MODE_PRIVATE).edit().putString("base", base).putString("token", token).apply());
                        JSONObject snapshot = MobileApi.request(base, "/v1/snapshot", "GET", token, "", null);
                        runOnUiThread(() -> {
                            saveSnapshot(snapshot);
                        });
                    });
                }).show();
    }

    private void changeComputerDialog() {
        EditText address = new EditText(this);
        address.setSingleLine(true);
        address.setText(savedBase());
        address.setHint("https://电脑名.tailnet.ts.net:8786");
        new AlertDialog.Builder(this).setTitle("更换电脑地址").setView(address)
                .setNegativeButton("取消", (dialog, which) -> pairingDialog())
                .setPositiveButton("保存", (dialog, which) -> {
                    String base = address.getText().toString().trim().replaceAll("/+$", "");
                    if (!base.matches("https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?")) {
                        toast("请输入 Tailscale 提供的 HTTPS 地址");
                    } else {
                        getPreferences(MODE_PRIVATE).edit().putString("base", base).apply();
                    }
                    pairingDialog();
                }).show();
    }

    private void refreshOnline() {
        if (networkBusy) return;
        String base = savedBase();
        String token = savedToken();
        network(() -> {
            JSONObject response = MobileApi.request(base, "/v1/snapshot", "GET", token, "", null);
            runOnUiThread(() -> saveSnapshot(response));
        });
    }

    private void saveSnapshot(JSONObject response) {
        try {
            MobileStore.save(this, response);
            revision = MobileStore.preferences(this).getString("revision", "");
            vocabularyRevision = MobileStore.preferences(this).getString("vocabularyRevision", "");
            notice = "已与电脑同步";
            render();
            runEntry();
        } catch (Exception error) {
            toast("同步数据无法读取");
        }
    }

    private interface NetworkAction { void run() throws Exception; }

    private void network(NetworkAction action) {
        if (networkBusy) { toast("正在同步，稍等一下就好"); return; }
        networkBusy = true;
        new Thread(() -> {
            try { action.run(); }
            catch (Exception error) { runOnUiThread(() -> {
                if (error instanceof MobileApi.HttpError && ((MobileApi.HttpError) error).status == 409) {
                    notice = "数据已有新变化。请刷新后确认再提交，你填写的内容还在。";
                } else if (error instanceof MobileApi.HttpError && ((MobileApi.HttpError) error).status == 401) {
                    notice = "手机授权已失效，请重新与电脑配对。未提交的文字仍保留着。";
                } else if (error instanceof UnknownHostException) {
                    notice = "找不到电脑。请先打开手机上的 Tailscale，确认已连接到与电脑相同的网络，再重试。";
                } else if (error instanceof ConnectException || error instanceof SocketTimeoutException) {
                    notice = "电脑暂时没有回应。检查电脑是否开机、共学日记是否运行，以及两端 Tailscale 是否都已连接。";
                } else {
                    notice = "连接没有完成：" + error.getMessage();
                }
                render();
            }); } finally { runOnUiThread(() -> networkBusy = false); }
        }, "xiaolu-mobile-sync").start();
    }

    private void toast(String value) { Toast.makeText(this, value, Toast.LENGTH_LONG).show(); }

    private void mutate(String method, JSONObject input) {
        mutate(method, input, null);
    }

    private void mutate(String method, JSONObject input, Runnable onSuccess) {
        if (savedToken().isEmpty()) { toast("连接电脑后才能修改待办"); return; }
        if (revision.isEmpty()) { toast("先刷新进度，再修改待办"); return; }
        String currentRevision = revision;
        String base = savedBase();
        String token = savedToken();
        network(() -> {
            JSONObject response = MobileApi.request(base, "/v1/todos", method, token, currentRevision, input);
            runOnUiThread(() -> {
                if (method.equals("POST") && todoDraft().trim().equals(input.optString("title"))) {
                    getPreferences(MODE_PRIVATE).edit().remove("todoDraft").apply();
                }
                if (onSuccess != null) onSuccess.run();
                saveSnapshot(response);
            });
        });
    }

    private void todoMenu(MobileSnapshot.Todo todo) {
        if (savedToken().isEmpty()) return;
        new AlertDialog.Builder(this).setTitle(todo.title)
                .setItems(new String[] { todo.completed ? "撤销完成" : "标记完成", "修改文字", todo.daily ? "取消每日刷新" : "设为每日刷新", "删除" },
                        (dialog, which) -> {
                            try {
                                JSONObject input = new JSONObject().put("id", todo.id);
                                if (which == 0) mutate("PUT", input.put("completed", !todo.completed));
                                if (which == 1) editTodo(todo);
                                if (which == 2) mutate("PUT", input.put("daily", !todo.daily));
                                if (which == 3) new AlertDialog.Builder(this).setMessage("删除这条待办？")
                                        .setNegativeButton("取消", null)
                                        .setPositiveButton("删除", (d, w) -> mutate("DELETE", input)).show();
                            } catch (JSONException error) { toast("操作无法提交"); }
                        }).show();
    }

    private void editTodo(MobileSnapshot.Todo todo) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(60) });
        String draftKey = "todoEdit:" + todo.id;
        field.setText(getPreferences(MODE_PRIVATE).getString(draftKey, todo.title));
        field.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                getPreferences(MODE_PRIVATE).edit().putString(draftKey, s.toString()).apply();
            }
            public void afterTextChanged(android.text.Editable s) {}
        });
        field.setSelection(field.length());
        editingTodo = true;
        AlertDialog editor = new AlertDialog.Builder(this).setTitle("修改待办").setView(field)
                .setNegativeButton("取消", null)
                .setNeutralButton("刷新电脑数据", null)
                .setPositiveButton("保存", null).create();
        editor.setOnDismissListener(dialog -> editingTodo = false);
        editor.setOnShowListener(dialog -> {
            editor.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> refreshOnline());
            editor.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                    String title = field.getText().toString().trim();
                    if (title.isEmpty()) { field.setError("写点内容再保存吧"); return; }
                    try { mutate("PUT", new JSONObject().put("id", todo.id).put("title", title), () -> {
                        getPreferences(MODE_PRIVATE).edit().remove(draftKey).apply();
                        editor.dismiss();
                    }); }
                    catch (JSONException error) { toast("操作无法提交"); }
                });
        });
        editor.show();
        styleEditor(editor);
    }

    private void vocabularyDialog(MobileSnapshot snapshot) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        field.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(4) });
        String key = "vocabularyDraft:" + snapshot.studyDay;
        field.setText(getPreferences(MODE_PRIVATE).getString(key, String.valueOf(snapshot.vocabularyCount)));
        field.setTextColor(INK);
        field.setBackground(block(CREAM));
        field.setPadding(dp(14), dp(12), dp(14), dp(12));
        field.setSelection(field.length());
        field.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                getPreferences(MODE_PRIVATE).edit().putString(key, s.toString()).apply();
            }
            public void afterTextChanged(android.text.Editable s) {}
        });
        editingTodo = true;
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(snapshot.studyDay.replace('-', '.') + " · 今日背词总数")
                .setView(field).setNegativeButton("取消", null)
                .setNeutralButton("刷新", null).setPositiveButton("保存", null).create();
        dialog.setOnDismissListener(d -> editingTodo = false);
        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> refreshOnline());
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                int count;
                try { count = Integer.parseInt(field.getText().toString()); }
                catch (NumberFormatException error) { field.setError("填写 0～5000 的整数"); return; }
                if (count < 0 || count > 5000) { field.setError("填写 0～5000 的整数"); return; }
                if (vocabularyRevision.isEmpty()) { toast("请先刷新；电脑需要新版手机接口"); return; }
                String base = savedBase(), token = savedToken(), expected = vocabularyRevision;
                network(() -> {
                    JSONObject result = MobileApi.request(base, "/v1/vocabulary", "PUT", token, expected,
                            new JSONObject().put("studyDay", snapshot.studyDay).put("count", count));
                    runOnUiThread(() -> {
                        getPreferences(MODE_PRIVATE).edit().remove(key).apply();
                        dialog.dismiss();
                        saveSnapshot(result);
                        toast("今天背过的单词，记好啦");
                    });
                });
            });
        });
        dialog.show();
        styleEditor(dialog);
    }

    private void styleEditor(AlertDialog dialog) {
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(block(PAPER));
        for (int which : new int[] { AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE, AlertDialog.BUTTON_NEUTRAL }) {
            Button button = dialog.getButton(which);
            if (button != null) {
                button.setTextColor(PURPLE);
                button.setAllCaps(false);
            }
        }
    }

    private void openReader(String route) {
        if (route.equals("programming")) {
            try {
                android.net.Uri target = android.net.Uri.parse(BuildConfig.PROGRAMMING_URL);
                if (!"https".equals(target.getScheme()) || !"antigravity.google.com".equals(target.getHost())) throw new Exception();
                startActivity(new Intent(Intent.ACTION_VIEW, target));
            } catch (Exception error) { toast("尚未配置编程入口，或手机没有可用浏览器"); }
            return;
        }
        if (!route.equals("home")) return;
        StudyReminder.cancelRepeat(this);
        try {
            android.net.Uri base = android.net.Uri.parse(savedBase());
            if (!"https".equals(base.getScheme()) || base.getHost() == null) throw new Exception();
            android.net.Uri target = new android.net.Uri.Builder().scheme("https")
                    .encodedAuthority(base.getHost() + ":8776").path("/")
                    .appendQueryParameter("companion_device", "mobile").build();
            startActivity(new Intent(Intent.ACTION_VIEW, target));
        } catch (Exception error) { toast("请先设置电脑地址，并确认手机上有浏览器"); }
    }

    private static int tabIndex(String page) { return java.util.Arrays.asList("today", "tasks", "todos", "stats").indexOf(page); }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent); handleEntry(intent); renderedPages = null; render(); runEntry();
    }

    private void handleEntry(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                String shared = text.trim();
                if (shared.length() > 60) { shared = shared.substring(0, 60); toast("先收下前60字，提交前可以修改"); }
                if (todoDraft().isEmpty()) getPreferences(MODE_PRIVATE).edit().putString("todoDraft", shared).apply();
                else toast("已有待办草稿还没提交，先保留原来的内容");
                selectedPage = JournalPages.TODOS;
            }
        } else if ("dev.xiaolu.TODO".equals(action)) selectedPage = JournalPages.TODOS;
        else if ("dev.xiaolu.WORDS".equals(action)) { selectedPage = JournalPages.TODAY; pendingAction = "words"; }
        else if ("dev.xiaolu.LEARN".equals(action)) pendingAction = "learn";
        else if ("dev.xiaolu.TODAY".equals(action)) selectedPage = JournalPages.TODAY;
    }

    private void runEntry() {
        if (pendingAction.equals("learn")) { pendingAction = ""; openReader("home"); }
        else if (pendingAction.equals("words") && !vocabularyRevision.isEmpty()) {
            MobileSnapshot snapshot = MobileStore.read(this);
            if (snapshot != null && !savedToken().isEmpty()) { pendingAction = ""; vocabularyDialog(snapshot); }
        }
    }

    private void reminderDialog() {
        new AlertDialog.Builder(this).setTitle("学习提醒 · 9/15/21点")
                .setSingleChoiceItems(new String[] {"关闭", "轻提醒", "声音与振动", "约定提醒（最多三次）"}, StudyReminder.mode(this), (dialog, which) -> {
                    MobileStore.preferences(this).edit().putInt("reminderMode", which).apply();
                    StudyReminder.cancelRepeat(this); StudyReminder.schedule(this);
                    dialog.dismiss(); renderedPages = null; render();
                    if (which > 0) toast("系统省电可能延后提醒；不会强行打开页面");
                    if (which > 0 && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, 2001);
                    }
                })
                .setNegativeButton("返回", null).show();
    }

    private void showSnapshot(MobileSnapshot snapshot) {
        TextView date = text(snapshot.studyDay.replace('-', '.'), 14, INK, true);
        date.setPadding(0, 0, 0, dp(8));
        body.addView(date);

        section("今日任务");
        LinearLayout bookmarks = new LinearLayout(this);
        bookmarks.setOrientation(LinearLayout.HORIZONTAL);
        body.addView(bookmarks);
        bookmark(bookmarks, R.drawable.bookmark_friend, "阅读达成", snapshot.readingPercent);
        bookmark(bookmarks, R.drawable.bookmark_together, "综合达成", snapshot.overallPercent);
        bookmark(bookmarks, R.drawable.bookmark_self, "做题达成", snapshot.questionsPercent);

        section("今日结算");
        pair("学习时间", duration(snapshot.studySeconds));
        pair("今日背词", snapshot.vocabularyCount + " 个");
        pair("口腔 · 英语 · 政治", percent(snapshot.medicinePercent) + " · "
                + percent(snapshot.englishPercent) + " · " + percent(snapshot.politicsPercent));

        section("在场打卡");
        message(snapshot.checkIns.size() + " 个打卡时段", CREAM);

        section("待办");
        if (!savedToken().isEmpty()) {
            Button add = new Button(this);
            add.setText("＋ 记一件待办");
            add.setAllCaps(false);
            add.setBackground(block(CREAM));
            body.addView(add);
            add.setOnClickListener(view -> {
                EditText field = new EditText(this);
                field.setSingleLine(true);
                field.setHint("以后想做的事");
                new AlertDialog.Builder(this).setTitle("新待办").setView(field)
                        .setNegativeButton("取消", null)
                        .setPositiveButton("加入", (dialog, which) -> {
                            try { mutate("POST", new JSONObject().put("title", field.getText().toString())); }
                            catch (JSONException error) { toast("操作无法提交"); }
                        }).show();
            });
        }
        if (snapshot.todos.isEmpty()) {
            message("今天没有待办。", CREAM);
        } else {
            for (MobileSnapshot.Todo todo : snapshot.todos) {
                String label = (todo.completed ? "✓  " : "□  ") + todo.title + (todo.daily ? "  · 每日" : "");
                TextView item = message(label, todo.completed ? Color.rgb(232, 241, 229) : CREAM);
                if (!savedToken().isEmpty()) item.setOnClickListener(view -> todoMenu(todo));
            }
        }
        TextView updated = text("更新于 " + snapshot.generatedAt.replace('T', ' '), 10, MUTED, false);
        updated.setPadding(0, dp(10), 0, 0);
        body.addView(updated);
    }

    private void bookmark(LinearLayout row, int image, String label, double value) {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        row.addView(column, new LinearLayout.LayoutParams(0, -2, 1));
        ImageView art = new ImageView(this);
        art.setImageResource(image);
        art.setScaleType(ImageView.ScaleType.FIT_CENTER);
        column.addView(art, new LinearLayout.LayoutParams(-1, dp(126)));
        TextView caption = text(label, 11, INK, true);
        caption.setGravity(Gravity.CENTER);
        column.addView(caption);
        TextView score = text(percent(value), 15, PURPLE, true);
        score.setGravity(Gravity.CENTER);
        column.addView(score);
    }

    private void section(String title) {
        TextView heading = text(title, 16, INK, true);
        heading.setPadding(0, dp(20), 0, dp(8));
        body.addView(heading);
    }

    private void pair(String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(10), dp(9), dp(10), dp(9));
        row.setBackground(block(CREAM));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(5);
        body.addView(row, params);
        row.addView(text(label, 12, MUTED, false), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(text(value, 13, INK, true));
    }

    private TextView message(String value, int background) {
        TextView text = text(value, 12, INK, false);
        text.setPadding(dp(10), dp(10), dp(10), dp(10));
        text.setBackground(block(background));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(6);
        body.addView(text, params);
        return text;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        if (bold) text.setTypeface(Typeface.create("monospace", Typeface.BOLD));
        return text;
    }

    private GradientDrawable block(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(0);
        drawable.setStroke(dp(2), INK);
        return drawable;
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String percent(double value) {
        return value == Math.floor(value)
                ? String.format(Locale.CHINA, "%.0f%%", value)
                : String.format(Locale.CHINA, "%.1f%%", value);
    }

    private static String duration(int seconds) {
        int minutes = seconds / 60;
        return String.format(Locale.CHINA, "%d 小时 %d 分", minutes / 60, minutes % 60);
    }

    private void openSnapshotPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(intent, OPEN_SNAPSHOT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != OPEN_SNAPSHOT || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        try (InputStream input = getContentResolver().openInputStream(data.getData())) {
            if (input == null) throw new IOException("文件无法打开");
            byte[] bytes = readLimited(input);
            MobileSnapshot.parse(new String(bytes, StandardCharsets.UTF_8));
            try (java.io.FileOutputStream output = openFileOutput(SNAPSHOT_FILE, MODE_PRIVATE)) {
                output.write(bytes);
            }
            render();
        } catch (IOException | JSONException error) {
            Toast.makeText(this, "导入失败：请选共学日记的摘要 JSON", Toast.LENGTH_LONG).show();
        }
    }

    private static byte[] readLimited(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (output.size() + read > MAX_SNAPSHOT_BYTES) throw new IOException("摘要文件过大");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }
}
