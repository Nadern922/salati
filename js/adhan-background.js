/* Android owns adhan playback, even while the WebView is visible. */
let nativeAdhanPlugin = null;
let nativeAdhanSyncVersion = 0;
let nativeAdhanSyncQueue = Promise.resolve();
function getNativeAdhan(){
  const cap = window.Capacitor;
  if(!cap || cap.getPlatform?.() !== 'android') return null;
  if(cap.isPluginAvailable && !cap.isPluginAvailable('Adhan')) return null;
  if(!nativeAdhanPlugin){
    nativeAdhanPlugin = cap.registerPlugin ? cap.registerPlugin('Adhan') : cap.Plugins?.Adhan;
  }
  return nativeAdhanPlugin || null;
}
function setBackgroundAdhanStatus(message){
  const el = document.getElementById('backgroundAdhanStatus');
  if(el) el.textContent = message;
}
async function renderBackgroundAdhanStatus(status){
  if(!azanAlertEnabled){ setBackgroundAdhanStatus('تنبيه الأذان متوقف.'); return; }
  if(!status.notifications){
    setBackgroundAdhanStatus('اسمح بالإشعارات من إعدادات الهاتف لتفعيل الأذان.');
  }else if(!status.exactAlarms){
    setBackgroundAdhanStatus('اسمح بالمنبّهات والتذكيرات لتشغيل الأذان في وقته حتى عند قفل الشاشة.');
  }else if(status.enabled && status.count > 0){
    const date = new Date(status.until).toLocaleDateString('ar');
    const network = getSelectedAzanVoice().id === 9 ? 'صوت أحمد يعمل دون إنترنت.' : 'الصوت المختار يحتاج اتصالاً بالإنترنت.';
    setBackgroundAdhanStatus(`الأذان في الخلفية مفعّل حتى ${date}، وتتجدد المواقيت تلقائيًا عند توفر الإنترنت. ${network}`);
  }else{
    setBackgroundAdhanStatus('لم تُجدول المواقيت بعد. اتصل بالإنترنت وحدد مدينتك ثم اضغط تفعيل الأذان في الخلفية.');
  }
}
async function requestBackgroundAdhanAccess(){
  const plugin = getNativeAdhan();
  if(!plugin) return false;
  await plugin.requestAccess();
  const status = await plugin.status();
  await renderBackgroundAdhanStatus(status);
  // Keep the user's enable choice while Android's exact-alarm settings are open.
  // Returning to the app schedules it once that permission has been granted.
  return status.notifications;
}
function syncBackgroundAdhan(){
  const plugin = getNativeAdhan();
  if(!plugin) return Promise.resolve();
  const version = ++nativeAdhanSyncVersion;
  const enabled = azanAlertEnabled;
  // Cancel immediately, rather than waiting for an outstanding calendar fetch.
  if(!enabled){
    const canceled = plugin.cancel();
    setBackgroundAdhanStatus('تنبيه الأذان متوقف.');
    return canceled.catch(() => setBackgroundAdhanStatus('تعذّر إيقاف الجدولة. حاول مجددًا.'));
  }
  nativeAdhanSyncQueue = nativeAdhanSyncQueue.catch(() => {}).then(async () => {
    if(version !== nativeAdhanSyncVersion || !azanAlertEnabled) return;
    try{
      const status = await plugin.status();
      if(version !== nativeAdhanSyncVersion || !azanAlertEnabled) return;
      if(!status.notifications || !status.exactAlarms){ await renderBackgroundAdhanStatus(status); return; }
      if(lastFetchedLat === null || lastFetchedLon === null){
        setBackgroundAdhanStatus('حدد مدينتك أولًا لحفظ مواقيت الأذان.'); return;
      }
      setBackgroundAdhanStatus('جارٍ حفظ مواقيت الأذان للعمل في الخلفية…');
      const result = await plugin.configure({
        latitude:lastFetchedLat, longitude:lastFetchedLon,
        method:getCalcMethod(), audio:getSelectedAzanUrl()
      });
      if(version === nativeAdhanSyncVersion) await renderBackgroundAdhanStatus(result);
    }catch(e){
      if(version === nativeAdhanSyncVersion){
        setBackgroundAdhanStatus('تعذّر تحديث الجدولة. اتصل بالإنترنت وأعد التفعيل؛ تبقى المواقيت المحفوظة مسبقًا إن وجدت.');
      }
      console.warn('Background adhan scheduling failed', e);
    }
  });
  return nativeAdhanSyncQueue;
}
function initBackgroundAdhan(){
  const plugin = getNativeAdhan();
  const button = document.getElementById('backgroundAdhanEnable');
  if(!plugin){
    setBackgroundAdhanStatus('في نسخة الويب يعمل الأذان أثناء فتح الصفحة فقط. للعمل عند قفل الشاشة، ثبّت نسخة أندرويد.');
    return;
  }
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try{
      if(await requestBackgroundAdhanAccess()){
        azanAlertEnabled = true;
        localStorage.setItem(AZAN_ALERT_KEY, '1');
        refreshBellUI();
        await syncBackgroundAdhan();
      }
    }catch(e){ setBackgroundAdhanStatus('تعذّر طلب الأذونات. حاول مجددًا من إعدادات الهاتف.'); }
    finally{ button.disabled = false; }
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') syncBackgroundAdhan();
  });
  const cap = window.Capacitor;
  const app = cap.isPluginAvailable?.('App') && cap.registerPlugin
    ? cap.registerPlugin('App') : cap.Plugins?.App;
  app?.addListener('appStateChange', state => {
    if(state.isActive) syncBackgroundAdhan();
  });
  window.addEventListener('online', syncBackgroundAdhan);
  syncBackgroundAdhan();
}
document.addEventListener('DOMContentLoaded', initBackgroundAdhan);
