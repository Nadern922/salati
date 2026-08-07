/* ============ Service Worker - تطبيق صلاتي ============ */
/* يوفر عمل التطبيق بدون إنترنت: يخزّن هيكل التطبيق دائمًا،
   ويخزّن بيانات مواقيت الصلاة وصفحات المصحف بعد أول استخدام لها. */

const APP_SHELL_CACHE = 'salati-shell-v1';
const API_CACHE = 'salati-api-v1';
const AUDIO_CACHE = 'salati-audio-v1';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

/* عناوين الخدمات الخارجية اللي نخزّن ردودها للاستخدام بدون نت */
const CACHEABLE_API_HOSTS = [
  'api.aladhan.com',
  'api.alquran.cloud'
];

const AUDIO_HOSTS = [
  'mp3quran.net',
  'server8.mp3quran.net',
  'server11.mp3quran.net',
  'islamcan.com'
];

/* ============ التثبيت: تخزين هيكل التطبيق فورًا ============ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

/* ============ التفعيل: حذف أي نسخ كاش قديمة ============ */
self.addEventListener('activate', (event) => {
  const keepCaches = [APP_SHELL_CACHE, API_CACHE, AUDIO_CACHE];
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => !keepCaches.includes(n)).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

function isAudioRequest(url){
  return AUDIO_HOSTS.some((h) => url.hostname.includes(h)) || url.pathname.endsWith('.mp3');
}
function isCacheableApi(url){
  return CACHEABLE_API_HOSTS.some((h) => url.hostname.includes(h));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;

  let url;
  try{ url = new URL(req.url); }catch(e){ return; }

  /* 1) طلبات الصوت (أذان/تلاوة): تخزين عند أول تشغيل فقط، بدون تحميل مسبق */
  if(isAudioRequest(url)){
    event.respondWith(
      caches.open(AUDIO_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if(cached) return cached;
          return fetch(req).then((res) => {
            if(res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  /* 2) طلبات API (مواقيت الصلاة / صفحات المصحف): جرّب الإنترنت أولاً، ولو تعذّر استخدم آخر نسخة محفوظة */
  if(isCacheableApi(url)){
    event.respondWith(
      fetch(req).then((res) => {
        if(res && res.status === 200){
          const resClone = res.clone();
          caches.open(API_CACHE).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() =>
        caches.open(API_CACHE).then((cache) => cache.match(req))
      )
    );
    return;
  }

  /* 3) نفس أصل التطبيق (index.html وملفاته): من الكاش أولاً لسرعة أعلى، وتحديث بالخلفية */
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if(res && res.status === 200){
            const resClone = res.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, resClone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  /* 4) أي شيء آخر: تصرف طبيعي بدون تدخل */
});
