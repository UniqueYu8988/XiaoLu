package dev.xiaolu.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

/** The same private cache for activity, widgets and scheduled work. No study clock is inferred here. */
final class MobileStore {
    static SharedPreferences preferences(Context context) { return context.getSharedPreferences("MainActivity", Context.MODE_PRIVATE); }
    static synchronized MobileSnapshot read(Context context) {
        try {
            byte[] data = new AtomicFile(context.getFileStreamPath("mobile-snapshot.json")).readFully();
            return MobileSnapshot.parse(new String(data, StandardCharsets.UTF_8));
        } catch (Exception ignored) { return null; }
    }
    static synchronized boolean save(Context context, JSONObject response) throws Exception {
        String json = response.getJSONObject("snapshot").toString();
        MobileSnapshot next = MobileSnapshot.parse(json);
        MobileSnapshot old = read(context);
        if (old != null && java.time.Instant.parse(old.generatedAt).isAfter(java.time.Instant.parse(next.generatedAt))) return false;
        AtomicFile file = new AtomicFile(context.getFileStreamPath("mobile-snapshot.json"));
        java.io.FileOutputStream stream = file.startWrite();
        try { stream.write(json.getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
        catch (Exception error) { file.failWrite(stream); throw error; }
        preferences(context).edit().putString("revision", response.optString("revision"))
                .putString("vocabularyRevision", response.optString("vocabularyRevision"))
                .putLong("syncedAt", System.currentTimeMillis()).apply();
        JournalWidget.updateAll(context);
        return true;
    }
    static boolean sync(Context context) {
        SharedPreferences prefs = preferences(context);
        String token = prefs.getString("token", "");
        if (token.isEmpty()) return false;
        try {
            JSONObject result = MobileApi.request(prefs.getString("base", BuildConfig.DEFAULT_BASE_URL), "/v1/snapshot", "GET", token, "", null, 2500);
            if (!token.equals(prefs.getString("token", ""))) return false;
            save(context, result);
            return true;
        } catch (Exception ignored) { return false; }
    }
}
