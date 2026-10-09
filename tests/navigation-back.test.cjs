const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
function harness(){
  const nodes = new Map();
  const callbacks = new Map();
  const observers = [];
  let androidBack;
  let exits = 0;
  function node(id){
    if(!nodes.has(id)){
      const classes = new Set();
      const events = new Map();
      nodes.set(id, {id,style:{},innerHTML:'',scrollIntoView(){},
        classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},
          contains:x=>classes.has(x),toggle(x,value){if(value)classes.add(x);else classes.delete(x);}},
        addEventListener(event,fn){events.set(event,fn);},click(){events.get('click')?.();}
      });
    }
    return nodes.get(id);
  }
  const window = {
    addEventListener(event,fn){if(!callbacks.has(event))callbacks.set(event,[]);callbacks.get(event).push(fn);},
    Capacitor:{Plugins:{App:{addListener(name,fn){if(name==='backButton')androidBack=fn;},exitApp(){exits++;}}}}
  };
  const history = {state:null,pushState(state){this.state=state;},back(){this.state=null;(callbacks.get('popstate')||[]).forEach(fn=>fn());}};
  window.history = history;
  const ctx = vm.createContext({window,history,Capacitor:window.Capacitor,
    document:{body:{style:{}},getElementById:node,addEventListener(){}},
    MutationObserver:class {constructor(fn){this.fn=fn;}observe(){observers.push(this.fn);}},
    setTimeout(){}, azkarOpenMode:null,namesReturnState:null,
    azkarOverlay:node('azkarOverlay'),tabTasbeeh:node('tabTasbeeh'),azkarPanelTasbeeh:node('azkarPanelTasbeeh'),
    navAzkarBtn:node('navAzkar'),
    azkarConfig:Object.fromEntries(['sabah','masaa','other'].map(mode=>[mode,{tab:node('tab-'+mode),panel:node('panel-'+mode)}])),
    renderAzkar(){},renderCurrentTasbeeh(){},stopTasbeehMic(){},
    setActiveNav(){},closeAllOverlays(){for(const n of nodes.values())n.classList.remove('open');},
  });
  for(const [fn,id] of [['openSettingsOverlay','settingsOverlay'],['openMoreOverlay','moreOverlay'],['openIslamicToolsOverlay','islamicToolsOverlay']]){
    ctx[fn]=()=>{ctx.closeAllOverlays();node(id).classList.add('open');ctx.document.body.style.overflow='hidden';};
  }
  vm.runInContext(html.slice(html.indexOf('function openAzkarTab(mode){'),html.indexOf('Object.keys(azkarConfig).forEach(mode => {',html.indexOf('function openAzkarTab(mode){'))),ctx);
  vm.runInContext(html.slice(html.indexOf('function openAzkarOverlay(){'),html.indexOf('function openSearchOverlay(){')),ctx);
  vm.runInContext(html.slice(html.indexOf('function openSimpleOverlay(id){'),html.indexOf('/* ============ حاسبة الزكاة')),ctx);
  const start=html.indexOf('  (function(){\n    (function(){window.__salatiPreBackState');
  vm.runInContext(html.slice(start,html.indexOf('function openQuranOverlay(){',start)),ctx);
  return {ctx,node,run:code=>vm.runInContext(code,ctx),flush:()=>observers.forEach(fn=>fn()),
    back:()=>history.back(),androidBack:()=>androidBack({canGoBack:!!history.state}),exits:()=>exits};
}
test('names header returns to the azkar list that opened it',()=>{
  const h=harness();h.run('openAzkarOverlay()');h.flush();
  h.run('openSimpleOverlay("namesOverlay")');h.flush();
  assert(h.node('namesOverlay').classList.contains('open'));
  h.run('closeNamesOverlay()');h.flush();
  assert(h.node('azkarOverlay').classList.contains('open'));
  assert(!h.node('namesOverlay').classList.contains('open'));
  assert.equal(h.ctx.azkarOpenMode,null);
  assert.equal(h.ctx.document.body.style.overflow,'hidden');
});
test('browser back from names returns to azkar; next back returns home',()=>{
  const h=harness();h.run('openAzkarOverlay()');h.flush();
  h.run('openSimpleOverlay("namesOverlay")');h.flush();
  h.back();h.flush();assert(h.node('azkarOverlay').classList.contains('open'));
  h.back();h.flush();assert(!h.node('azkarOverlay').classList.contains('open'));
});
test('Android back follows names to azkar without exiting the app',()=>{
  const h=harness();h.run('openAzkarOverlay()');h.flush();
  h.run('openSimpleOverlay("namesOverlay")');h.flush();
  h.androidBack();h.flush();
  assert(h.node('azkarOverlay').classList.contains('open'));
  assert.equal(h.exits(),0);
});
test('azkar header closes a detail and retains the azkar list',()=>{
  const h=harness();h.run('openAzkarOverlay();openAzkarTab("sabah")');h.flush();
  h.node('azkarClose').click();h.flush();
  assert(h.node('azkarOverlay').classList.contains('open'));
  assert.equal(h.ctx.azkarOpenMode,null);
});
test('browser back from an azkar detail returns to its list',()=>{
  const h=harness();h.run('openAzkarOverlay();openAzkarTab("masaa")');h.flush();
  h.back();h.flush();
  assert(h.node('azkarOverlay').classList.contains('open'));
  assert.equal(h.ctx.azkarOpenMode,null);
});
test('names preserves an existing azkar detail and returns to it',()=>{
  const h=harness();h.run('openAzkarOverlay();openAzkarTab("other");openSimpleOverlay("namesOverlay")');h.flush();
  h.run('closeNamesOverlay()');h.flush();
  assert.equal(h.ctx.azkarOpenMode,'other');
  assert(h.node('panel-other').classList.contains('open'));
});
for(const source of ['settingsOverlay','moreOverlay','islamicToolsOverlay']){
  test('names returns to its '+source+' entry point',()=>{
    const h=harness();h.node(source).classList.add('open');h.flush();
    h.run('openSimpleOverlay("namesOverlay")');h.flush();
    h.back();h.flush();assert(h.node(source).classList.contains('open'));
    assert(!h.node('azkarOverlay').classList.contains('open'));
  });
}
test('opening names directly does not reuse a prior return destination',()=>{
  const h=harness();h.run('openAzkarOverlay();openSimpleOverlay("namesOverlay");closeNamesOverlay()');h.flush();
  h.ctx.closeAllOverlays();h.flush();
  h.run('openSimpleOverlay("namesOverlay");closeNamesOverlay()');h.flush();
  assert(!h.node('azkarOverlay').classList.contains('open'));
});
