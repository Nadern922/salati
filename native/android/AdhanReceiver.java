package com.nadern922.salati;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

public class AdhanReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if ("com.nadern922.salati.ADHAN".equals(intent.getAction())) {
            if (!AdhanScheduler.preferences(context).getBoolean("enabled", false)) return;
            long at = intent.getLongExtra("at", 0);
            // Do not play a stale alarm after a long shutdown or a clock change.
            if (Math.abs(System.currentTimeMillis() - at) > 5 * 60000) return;
            try {
                ContextCompat.startForegroundService(context,
                    new Intent(context, AdhanService.class).putExtra("label", intent.getStringExtra("label")));
            } catch (RuntimeException e) { android.util.Log.w("SalatiAdhan", "Could not start playback", e); }
        } else {
            AdhanScheduler.restore(context);
        }
    }
}
