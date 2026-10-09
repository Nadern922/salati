package com.nadern922.salati;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

public final class AdhanScheduler {
    private static final String WORK = "salati-adhan-refresh";
    private static final String[] PRAYERS = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
    private static final String[] LABELS = {"الفجر", "الظهر", "العصر", "المغرب", "العشاء"};
    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("adhan_schedule", Context.MODE_PRIVATE);
    }
    static boolean canScheduleExact(Context context) {
        return Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }
    static JSObject status(Context context) {
        SharedPreferences prefs = preferences(context);
        int count = 0;
        long until = 0;
        try {
            JSONArray alarms = new JSONArray(prefs.getString("alarms", "[]"));
            for (int i = 0; i < alarms.length(); i++) {
                long at = alarms.getJSONObject(i).getLong("at");
                if (at > System.currentTimeMillis()) { count++; until = Math.max(until, at); }
            }
        } catch (Exception ignored) { }
        JSObject result = new JSObject();
        result.put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled());
        result.put("exactAlarms", canScheduleExact(context));
        result.put("enabled", prefs.getBoolean("enabled", false));
        result.put("count", count);
        result.put("until", until);
        return result;
    }
    static synchronized void configure(Context context, double lat, double lon, String method, String audio) throws Exception {
        SharedPreferences prefs = preferences(context);
        if (!canScheduleExact(context) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            throw new IllegalStateException("Notification and exact alarm permissions are required");
        }
        String location = lat + "," + lon + "," + method;
        if (!location.equals(prefs.getString("location", ""))) {
            cancelAlarms(context);
            prefs.edit().remove("alarms").remove("refreshed").commit();
        }
        prefs.edit().putBoolean("enabled", true).putString("location", location)
            .putString("audio", audio).commit();
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(AdhanRefreshWorker.class, 1, TimeUnit.DAYS)
            .setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, work);
        try {
            if (System.currentTimeMillis() - prefs.getLong("refreshed", 0) > TimeUnit.HOURS.toMillis(12)
                || status(context).optInt("count", 0) < 5) {
                refresh(context);
            } else { restore(context); }
        } catch (Exception e) {
            restore(context);
            if (status(context).optInt("count", 0) == 0) throw e;
        }
    }
    static synchronized void refresh(Context context) throws Exception {
        SharedPreferences prefs = preferences(context);
        if (!prefs.getBoolean("enabled", false)) return;
        String[] location = prefs.getString("location", "").split(",");
        if (location.length != 3) return;
        JSONArray alarms = new JSONArray();
        Calendar month = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        // Include the previous UTC month at its boundary: the chosen city's local
        // date may still be yesterday, even if the device is elsewhere.
        int months = month.get(Calendar.DAY_OF_MONTH) == 1 ? 3 : 2;
        if (months == 3) month.add(Calendar.MONTH, -1);
        month.set(Calendar.DAY_OF_MONTH, 1);
        for (int n = 0; n < months; n++, month.add(Calendar.MONTH, 1)) {
            String url = "https://api.aladhan.com/v1/calendar/" + month.get(Calendar.YEAR) + "/"
                + (month.get(Calendar.MONTH) + 1) + "?latitude=" + location[0]
                + "&longitude=" + location[1] + "&method=" + location[2];
            JSONArray days = readJson(url).getJSONArray("data");
            for (int d = 0; d < days.length(); d++) {
                JSONObject day = days.getJSONObject(d);
                String zone = day.getJSONObject("meta").getString("timezone");
                String date = day.getJSONObject("date").getJSONObject("gregorian").getString("date");
                SimpleDateFormat format = new SimpleDateFormat("dd-MM-yyyy HH:mm", Locale.US);
                format.setLenient(false);
                format.setTimeZone(TimeZone.getTimeZone(zone));
                JSONObject times = day.getJSONObject("timings");
                for (int p = 0; p < PRAYERS.length; p++) {
                    String time = times.getString(PRAYERS[p]).split(" ")[0];
                    long at = format.parse(date + " " + time).getTime();
                    if (at <= System.currentTimeMillis()) continue;
                    int id = Integer.parseInt(date.replace("-", "")) * 10 + p;
                    alarms.put(new JSONObject().put("id", id).put("at", at).put("label", LABELS[p]));
                }
            }
        }
        if (alarms.length() == 0) throw new IllegalStateException("No future prayer times returned");
        // A disable request may have arrived while the API was being fetched.
        if (!prefs.getBoolean("enabled", false)) return;
        cancelAlarms(context);
        prefs.edit().putString("alarms", alarms.toString()).putLong("refreshed", System.currentTimeMillis()).commit();
        restore(context);
    }
    static synchronized void restore(Context context) {
        SharedPreferences prefs = preferences(context);
        if (!prefs.getBoolean("enabled", false) || !canScheduleExact(context)) return;
        try {
            JSONArray alarms = new JSONArray(prefs.getString("alarms", "[]"));
            AlarmManager manager = context.getSystemService(AlarmManager.class);
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject alarm = alarms.getJSONObject(i);
                if (alarm.getLong("at") <= System.currentTimeMillis()) continue;
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.getLong("at"), pending(context, alarm));
            }
        } catch (Exception e) { android.util.Log.w("SalatiAdhan", "Could not restore alarms", e); }
    }
    private static PendingIntent pending(Context context, JSONObject alarm) throws Exception {
        Intent intent = new Intent(context, AdhanReceiver.class).setAction("com.nadern922.salati.ADHAN")
            .putExtra("at", alarm.getLong("at")).putExtra("label", alarm.getString("label"));
        return PendingIntent.getBroadcast(context, alarm.getInt("id"), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void cancelAlarms(Context context) {
        try {
            JSONArray alarms = new JSONArray(preferences(context).getString("alarms", "[]"));
            AlarmManager manager = context.getSystemService(AlarmManager.class);
            for (int i = 0; i < alarms.length(); i++) {
                PendingIntent pending = pending(context, alarms.getJSONObject(i));
                manager.cancel(pending);
                pending.cancel();
            }
        } catch (Exception e) { android.util.Log.w("SalatiAdhan", "Could not cancel alarms", e); }
    }
    static synchronized void cancel(Context context) {
        preferences(context).edit().putBoolean("enabled", false).commit();
        cancelAlarms(context);
        preferences(context).edit().remove("alarms").remove("refreshed").commit();
        WorkManager.getInstance(context).cancelUniqueWork(WORK);
    }
    private static JSONObject readJson(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("Prayer API unavailable");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int size;
                while ((size = input.read(buffer)) != -1) {
                    bytes.write(buffer, 0, size);
                    if (bytes.size() > 2000000) throw new IllegalStateException("Prayer response too large");
                }
                JSONObject result = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                if (result.getInt("code") != 200) throw new IllegalStateException("Invalid prayer response");
                return result;
            }
        } finally { connection.disconnect(); }
    }
}
