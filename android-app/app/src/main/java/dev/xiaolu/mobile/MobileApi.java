package dev.xiaolu.mobile;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class MobileApi {
    static final class HttpError extends Exception {
        final int status;
        HttpError(int status, String message) { super(message); this.status = status; }
    }
    private MobileApi() {}

    static JSONObject request(String base, String path, String method, String token, String revision, JSONObject payload) throws Exception {
        return request(base, path, method, token, revision, payload, 6000);
    }

    static JSONObject request(String base, String path, String method, String token, String revision, JSONObject payload, int timeout) throws Exception {
        if (!base.matches("https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?")) throw new Exception("请输入 Tailscale 提供的 HTTPS 地址");
        HttpURLConnection connection = (HttpURLConnection) new URL(base + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(timeout);
        connection.setReadTimeout(timeout);
        connection.setRequestProperty("Accept", "application/json");
        if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (revision != null && !revision.isEmpty()) connection.setRequestProperty("If-Match", revision);
        if (payload != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.getOutputStream().write(payload.toString().getBytes(StandardCharsets.UTF_8));
        }
        int code = connection.getResponseCode();
        InputStream stream = code < 400 ? connection.getInputStream() : connection.getErrorStream();
        if (stream == null) throw new Exception("电脑没有回应");
        try (InputStream input = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int size;
            while ((size = input.read(buffer)) != -1) {
                if (bytes.size() + size > 256 * 1024) throw new Exception("响应过大");
                bytes.write(buffer, 0, size);
            }
            JSONObject result = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            if (code >= 400) throw new HttpError(code, result.optString("error", "连接失败，HTTP " + code));
            return result;
        } finally {
            connection.disconnect();
        }
    }
}
