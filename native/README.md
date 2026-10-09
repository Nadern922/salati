# Android background adhan

The generated Capacitor project is not tracked. `scripts/install-android-adhan.py`
installs the Adhan plugin, receiver, foreground media service and WorkManager
refresh job after `npx cap add android`. Both Android workflows run this installer.

Enable the bell in the Android app and grant notifications and **Alarms & reminders**.
After returning from Android settings, scheduling resumes automatically. The settings
screen shows whether permissions are missing and the final scheduled date.

Five prayers are scheduled (sunrise is excluded). Aladhan returns each day's local
date and IANA time zone; the scheduler converts these to absolute instants, including
DST changes. Current and next month's times are persisted, renewed daily when online,
and restored after reboot, package updates and time changes. Location and calculation
method changes replace the schedule. Turning the bell off cancels alarms, renewal and
any current native playback. Native playback also owns foreground adhan to avoid a
second WebView playback.

Ahmed's MP3 is bundled and plays offline on the Android alarm audio stream. Other
voices retain their HTTPS sources and require Internet at playback time. The media
service shows an ongoing notification with an **إيقاف الأذان** action, releases audio
focus on completion/interruption, and stops after at most six minutes.

The website still requires an open page. An existing installed Android app must be
updated with a new APK/AAB; updating GitHub Pages cannot install native code. Android
force-stop disables alarms until the app is reopened. Alarm volume, Do Not Disturb,
and manufacturer battery restrictions can affect delivery. Offline scheduling lasts
until the displayed date; renewal needs Internet before the saved schedule expires.

Validation:
- `node --test tests/adhan-background.test.cjs`
- GitHub Actions `Verify Android adhan` builds an unsigned-for-release debug APK.
- `Build Android AAB` creates the existing signed release APK/AAB on manual dispatch.
- Device check: enable permissions, verify schedule status, lock/swipe away the app,
  wait for a prayer, stop from its notification, reboot and verify the next prayer,
  then disable the bell and verify no adhan plays. Repeat with airplane mode for Ahmed.
