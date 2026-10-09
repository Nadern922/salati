package com.nadern922.salati;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

public class AdhanService extends Service {
    private static final String CHANNEL = "salati_adhan_playback";
    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest focus;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) stopSelf();
    };
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::stopSelf;

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "STOP".equals(intent.getAction())
            || !AdhanScheduler.preferences(this).getBoolean("enabled", false)) {
            stopSelf(); return START_NOT_STICKY;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "أذان الصلاة", NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
        PendingIntent stop = PendingIntent.getService(this, 0, new Intent(this, AdhanService.class).setAction("STOP"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("حان وقت صلاة " + intent.getStringExtra("label"))
            .setContentText("الله أكبر، حي على الصلاة")
            .setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .setCategory(NotificationCompat.CATEGORY_ALARM).setOngoing(true).setSilent(true)
            .addAction(android.R.drawable.ic_media_pause, "إيقاف الأذان", stop).build();
        startForeground(2001, notification);
        releasePlayer();
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, 6 * 60000);
        try {
            AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
            audioManager = getSystemService(AudioManager.class);
            int granted;
            if (Build.VERSION.SDK_INT >= 26) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener).build();
                granted = audioManager.requestAudioFocus(focus);
            } else {
                granted = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_ALARM,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
            if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                stopSelf(); return START_NOT_STICKY;
            }
            player = new MediaPlayer();
            player.setAudioAttributes(attributes);
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            player.setOnCompletionListener(p -> stopSelf());
            player.setOnErrorListener((p, what, extra) -> { stopSelf(); return true; });
            player.setOnPreparedListener(MediaPlayer::start);
            String audio = AdhanScheduler.preferences(this).getString("audio", "audio/ahmed.mp3");
            if (audio.startsWith("https://")) { player.setDataSource(audio); }
            else {
                try (AssetFileDescriptor asset = getAssets().openFd("public/audio/ahmed.mp3")) {
                    player.setDataSource(asset.getFileDescriptor(), asset.getStartOffset(), asset.getLength());
                }
            }
            player.prepareAsync();
        } catch (Exception e) { stopSelf(); }
        return START_NOT_STICKY;
    }
    private void releasePlayer() {
        if (player != null) { player.release(); player = null; }
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= 26 && focus != null) {
                audioManager.abandonAudioFocusRequest(focus); focus = null;
            } else { audioManager.abandonAudioFocus(focusListener); }
        }
    }
    @Override public void onDestroy() {
        handler.removeCallbacks(timeout);
        releasePlayer();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
