package dev.xiaolu.mobile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Android reader for the desktop's phone projection. V1 cache stays readable. */
final class MobileSnapshot {
    final String studyDay;
    final String generatedAt;
    final int studySeconds;
    final double readingPercent;
    final double questionsPercent;
    final double overallPercent;
    final int vocabularyCount;
    final int vocabularyTarget;
    final boolean mistakeReviewCompleted;
    final boolean oralReviewCompleted;
    final boolean settled;
    final boolean isStudying;
    final String studyState;
    final double medicinePercent;
    final double englishPercent;
    final double politicsPercent;
    final List<CheckIn> checkIns;
    final List<Todo> todos;
    final List<HistoryEntry> history;
    final Stats stats;
    final Settings settings;

    static final class CheckIn {
        final String slot;
        final String status;
        CheckIn(String slot, String status) { this.slot = slot; this.status = status; }
        String label() {
            switch (status) {
                case "checked": return "✓";
                case "missed": return "×";
                case "pending": return "现在";
                default: return "·";
            }
        }
    }

    static final class Stats {
        final int totalStudySeconds;
        final int checkedCount;
        final int togetherBookmarks;
        final int selfBookmarks;
        final int friendBookmarks;
        final int totalVocabulary;
        Stats(JSONObject json) {
            totalStudySeconds = json.optInt("totalStudySeconds");
            checkedCount = json.optInt("checkedCount");
            togetherBookmarks = json.optInt("togetherBookmarks");
            selfBookmarks = json.optInt("selfBookmarks");
            friendBookmarks = json.optInt("friendBookmarks");
            totalVocabulary = json.optInt("totalVocabulary");
        }
    }

    static final class Settings {
        final boolean launchAtLogin;
        final boolean yuReaderEnabled;
        final boolean patrolEnabled;
        final boolean voiceEnabled;
        Settings(JSONObject json) {
            launchAtLogin = json.optBoolean("launchAtLogin");
            yuReaderEnabled = json.optBoolean("yuReaderEnabled");
            patrolEnabled = json.optBoolean("patrolEnabled");
            voiceEnabled = json.optBoolean("voiceEnabled");
        }
    }

    static final class HistoryEntry {
        final String date;
        final int studySeconds;
        final boolean studyTimeUnknown;
        final int checkedCount;
        final int completedTaskCount;
        final int taskCount;
        final double readingPercent;
        final double questionsPercent;
        final int vocabularyCount;
        final String note;
        HistoryEntry(JSONObject json) throws JSONException {
            date = json.getString("date");
            studySeconds = json.optInt("studySeconds");
            studyTimeUnknown = json.optBoolean("studyTimeUnknown");
            checkedCount = json.optInt("checkedCount");
            completedTaskCount = json.optInt("completedTaskCount");
            taskCount = json.optInt("taskCount");
            readingPercent = json.optDouble("readingPercent");
            questionsPercent = json.optDouble("questionsPercent");
            vocabularyCount = json.optInt("vocabularyCount");
            note = json.optString("note");
        }
    }

    static final class Todo {
        final String id;
        final String title;
        final boolean completed;
        final boolean daily;

        Todo(String id, String title, boolean completed, boolean daily) {
            this.id = id;
            this.title = title;
            this.completed = completed;
            this.daily = daily;
        }
    }

    private MobileSnapshot(JSONObject root) throws JSONException {
        int schemaVersion = root.getInt("schemaVersion");
        if (schemaVersion != 1 && schemaVersion != 2) throw new JSONException("不支持的数据版本");
        studyDay = root.getString("studyDay");
        generatedAt = root.getString("generatedAt");
        if (!studyDay.matches("\\d{4}-\\d{2}-\\d{2}")) throw new JSONException("学习日期无效");

        JSONObject today = root.getJSONObject("today");
        studySeconds = Math.max(0, today.getInt("studySeconds"));
        readingPercent = percent(today, "readingPercent");
        questionsPercent = percent(today, "questionsPercent");
        overallPercent = percent(today, "overallPercent");
        vocabularyCount = Math.max(0, today.getInt("vocabularyCount"));
        vocabularyTarget = Math.max(1, today.optInt("vocabularyTarget", 100));
        mistakeReviewCompleted = today.optBoolean("mistakeReviewCompleted");
        oralReviewCompleted = today.optBoolean("oralReviewCompleted");
        settled = today.optBoolean("settled");
        JSONObject companion = root.optJSONObject("companion");
        isStudying = companion != null && companion.optBoolean("isStudying");
        studyState = companion == null ? "closed" : companion.optString("studyState", "closed");
        JSONObject subjects = today.getJSONObject("subjects");
        medicinePercent = percent(subjects, "medicine");
        englishPercent = percent(subjects, "english");
        politicsPercent = percent(subjects, "politics");

        checkIns = new ArrayList<>();
        JSONArray slots = today.getJSONArray("checkIns");
        for (int i = 0; i < slots.length(); i++) {
            JSONObject item = slots.getJSONObject(i);
            checkIns.add(new CheckIn(item.getString("slot"), item.getString("status")));
        }

        todos = new ArrayList<>();
        JSONArray items = root.getJSONArray("todos");
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            todos.add(new Todo(item.getString("id"), item.getString("title"), item.getBoolean("completed"), item.getBoolean("daily")));
        }
        stats = new Stats(root.optJSONObject("stats") == null ? new JSONObject() : root.getJSONObject("stats"));
        settings = new Settings(root.optJSONObject("settings") == null ? new JSONObject() : root.getJSONObject("settings"));
        history = new ArrayList<>();
        JSONArray historyItems = root.optJSONArray("history");
        if (historyItems != null) for (int i = 0; i < historyItems.length(); i++) history.add(new HistoryEntry(historyItems.getJSONObject(i)));
    }

    static MobileSnapshot parse(String json) throws JSONException {
        return new MobileSnapshot(new JSONObject(json));
    }

    private static double percent(JSONObject object, String key) throws JSONException {
        double value = object.getDouble(key);
        if (!Double.isFinite(value) || value < 0) throw new JSONException("进度数字无效：" + key);
        return value;
    }

}
