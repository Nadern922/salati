package com.nadern922.salati;

import android.content.Context;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class AdhanRefreshWorker extends Worker {
    public AdhanRefreshWorker(Context context, WorkerParameters parameters) { super(context, parameters); }
    @Override public Result doWork() {
        try { AdhanScheduler.refresh(getApplicationContext()); return Result.success(); }
        catch (Exception e) { return Result.retry(); }
    }
}
