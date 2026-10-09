const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
const js = fs.readFileSync('js/adhan-background.js','utf8');
function harness({android = true, allowed = true, enabled = true, deferred = false} = {}){
  const calls = [];
  const elements = new Map(['backgroundAdhanStatus','backgroundAdhanEnable'].map(id => [id,{textContent:'',hidden:true,addEventListener(){}}]));
  const status = {notifications:allowed,exactAlarms:allowed,enabled:true,count:150,until:Date.now()+86400000};
  let release;
  const plugin = {
    status:async()=>status,
    requestAccess:async()=>status,
    configure:async config=>{calls.push(config);if(deferred) await new Promise(resolve=>{release=resolve;});return status;},
    cancel:async()=>{calls.push('cancel');return {...status,enabled:false,count:0};}
  };
  const ctx = vm.createContext({
    window:{Capacitor:android?{getPlatform:()=> 'android',isPluginAvailable:()=>true,Plugins:{Adhan:plugin}}:undefined,addEventListener(){}},
    document:{getElementById:id=>elements.get(id),addEventListener(){}},
    console,Date,localStorage:{setItem(){}},
    azanAlertEnabled:enabled,lastFetchedLat:24.7136,lastFetchedLon:46.6753,
    AZAN_ALERT_KEY:'azan_alert_enabled', getCalcMethod:()=> '4',
    getSelectedAzanUrl:()=> 'audio/ahmed.mp3',getSelectedAzanVoice:()=>({id:9}),refreshBellUI(){}
  });
  vm.runInContext(js,ctx);
  return {ctx,calls,elements,release:()=>release(),run:code=>vm.runInContext(code,ctx)};
}
test('web does not attempt native scheduling and explains requirement',async()=>{
  const h=harness({android:false});
  h.run('initBackgroundAdhan()'); await h.run('syncBackgroundAdhan()');
  assert.equal(h.calls.length,0);
  assert.match(h.elements.get('backgroundAdhanStatus').textContent,/نسخة أندرويد/);
});
test('native schedule uses chosen city, method and bundled default sound',async()=>{
  const h=harness(); await h.run('syncBackgroundAdhan()');
  assert.equal(h.calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{latitude:24.7136,longitude:46.6753,method:'4',audio:'audio/ahmed.mp3'});
  assert.match(h.elements.get('backgroundAdhanStatus').textContent,/دون إنترنت/);
});
test('denied permissions never schedule',async()=>{
  const h=harness({allowed:false});await h.run('syncBackgroundAdhan()');
  assert.equal(h.calls.length,0);
  assert.match(h.elements.get('backgroundAdhanStatus').textContent,/اسمح بالإشعارات/);
});
test('disabling cancels native alarms',async()=>{
  const h=harness({enabled:false});await h.run('syncBackgroundAdhan()');
  assert.deepEqual(h.calls,['cancel']);
});
test('disable does not wait for a calendar fetch or display its stale success',async()=>{
  const h=harness({deferred:true});
  const configuring=h.run('syncBackgroundAdhan()');
  await new Promise(resolve=>setImmediate(resolve));
  await h.run('azanAlertEnabled=false; syncBackgroundAdhan()');
  assert.equal(h.calls[1],'cancel');
  h.release();await configuring;
  assert.match(h.elements.get('backgroundAdhanStatus').textContent,/متوقف/);
});
test('rapid city and voice changes coalesce to latest schedule',async()=>{
  const h=harness();
  const a=h.run('syncBackgroundAdhan()');
  const b=h.run('lastFetchedLat=21.4; getSelectedAzanUrl=()=>"https://www.islamcan.com/audio/adhan/azan2.mp3"; syncBackgroundAdhan()');
  await Promise.all([a,b]);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].latitude,21.4);
  assert.match(h.calls[0].audio,/azan2/);
});
test('native playback and sunrise do not trigger a second web adhan',()=>{
  const h=harness();h.ctx.playRealAzan=()=>{throw Error('duplicate playback');};
  const part=html.slice(html.indexOf('let lastAzanFiredKey = null;'),html.indexOf('/* ============ تنبيه مسبق'));
  vm.runInContext(part,h.ctx);
  h.run('checkAzanAlert("Fajr",0);checkAzanAlert("Sunrise",0)');
  const web=harness({android:false});web.ctx.playRealAzan=()=>{throw Error('sunrise is not a prayer');};
  vm.runInContext(part,web.ctx);web.run('checkAzanAlert("Sunrise",0)');
});
test('all inline scripts and background bridge parse',()=>{
  new vm.Script(js);
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(!/\bsrc=|application\/ld\+json/.test(match[1]))new vm.Script(match[2]);
  }
});
test('custom native plugin is registered before first use',async()=>{
  const h=harness();
  const cap=h.ctx.window.Capacitor;
  const plugin=cap.Plugins.Adhan;
  delete cap.Plugins.Adhan;
  let registered=0;
  cap.registerPlugin=name=>{assert.equal(name,'Adhan');registered++;return plugin;};
  await h.run('syncBackgroundAdhan()');
  h.run('getNativeAdhan()');
  assert.equal(registered,1);
  assert.equal(h.calls.length,1);
});
test('enable choice survives pending exact-alarm permission settings',async()=>{
  const h=harness();
  h.ctx.window.Capacitor.Plugins.Adhan.status=async()=>({notifications:true,exactAlarms:false,count:0});
  assert.equal(await h.run('requestBackgroundAdhanAccess()'),true);
  await h.run('syncBackgroundAdhan()');
  assert.equal(h.calls.length,0);
  assert.match(h.elements.get('backgroundAdhanStatus').textContent,/المنبّهات/);
});
test('GPS failure preserves last prayer location instead of replacing its alarms with Riyadh',()=>{
  let saved=JSON.stringify({lat:21.4,lon:39.8,name:'مكة'});
  const calls=[];
  const ctx=vm.createContext({localStorage:{getItem:()=>saved},fetchTimings:(...args)=>calls.push(args)});
  const part=fs.readFileSync('index.html','utf8').split('function useRiyadhDefault(){')[1].split('/* ============ حفظ الموقع الأساسي')[0];
  vm.runInContext('function useRiyadhDefault(){'+part,ctx);
  vm.runInContext('useRiyadhDefault()',ctx);
  assert.deepEqual(calls[0],[21.4,39.8,'مكة']);
  saved='invalid';vm.runInContext('useRiyadhDefault()',ctx);
  assert.deepEqual(calls[1],[24.7136,46.6753,'الرياض (افتراضي)']);
});
test('disable during permission-status lookup cannot re-enable a stale native schedule',async()=>{
  const h=harness();
  let finishStatus;
  h.ctx.window.Capacitor.Plugins.Adhan.status=()=>new Promise(resolve=>{finishStatus=resolve;});
  const pending=h.run('syncBackgroundAdhan()');
  await new Promise(resolve=>setImmediate(resolve));
  await h.run('azanAlertEnabled=false; syncBackgroundAdhan()');
  finishStatus({notifications:true,exactAlarms:true});await pending;
  assert.deepEqual(h.calls,['cancel']);
});
