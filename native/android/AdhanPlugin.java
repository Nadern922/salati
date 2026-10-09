package com.nadern922.salati;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "Adhan", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class AdhanPlugin extends Plugin {
    private final AtomicLong generation = new AtomicLong();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(AdhanScheduler.status(getContext()));
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationResult");
        } else {
            notificationResult(call);
        }
    }

    @PermissionCallback
    private void notificationResult(PluginCall call) {
        JSObject status = AdhanScheduler.status(getContext());
        if (status.optBoolean("notifications", false) && !AdhanScheduler.canScheduleExact(getContext())) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + getContext().getPackageName()));
            try { getActivity().startActivity(intent); } catch (RuntimeException ignored) { }
        }
        call.resolve(status);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Double lat = call.getDouble("latitude");
        Double lon = call.getDouble("longitude");
        String method = call.getString("method", "4");
        String audio = call.getString("audio", "audio/ahmed.mp3");
        if (lat == null || lon == null || !Double.isFinite(lat) || !Double.isFinite(lon)
            || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !method.matches("[0-9]{1,2}")) {
            call.reject("Invalid prayer location or calculation method");
            return;
        }
        if (!"audio/ahmed.mp3".equals(audio) && !audio.matches("https://www\\.islamcan\\.com/audio/adhan/azan[1-8]\\.mp3")) {
            call.reject("Invalid adhan audio");
            return;
        }
        long request = generation.incrementAndGet();
        executor.execute(() -> {
            try {
                if (request != generation.get()) { call.resolve(AdhanScheduler.status(getContext())); return; }
                AdhanScheduler.configure(getContext(), lat, lon, method, audio);
                call.resolve(AdhanScheduler.status(getContext()));
            } catch (Exception e) { call.reject("Could not schedule adhan: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        generation.incrementAndGet();
        // Persist immediately so an alarm cannot start while a network refresh completes.
        AdhanScheduler.preferences(getContext()).edit().putBoolean("enabled", false).commit();
        getContext().stopService(new Intent(getContext(), AdhanService.class));
        executor.execute(() -> {
            AdhanScheduler.cancel(getContext());
            call.resolve(AdhanScheduler.status(getContext()));
        });
    }
}
