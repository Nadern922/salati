/* Paired-page Uthmani Mushaf renderer */
(() => {
  const frame=document.querySelector('.mushaf-page-frame');
  if(!frame) return;
  const primary=document.getElementById('mushafText');
  const inner=primary.closest('.mushaf-page-inner');
  const secondaryPage=document.createElement('div');
  secondaryPage.className='mushaf-page-inner';
  secondaryPage.innerHTML='<div class="mushaf-text" id="mushafTextNext"></div><span class="mushaf-leaf-number" id="mushafLeafNext"></span>';
  const gutter=document.createElement('div'); gutter.className='mushaf-spread-gutter'; gutter.setAttribute('aria-hidden','true');
  inner.insertAdjacentElement('afterend',gutter); gutter.insertAdjacentElement('afterend',secondaryPage);
  const secondary=secondaryPage.querySelector('#mushafTextNext');
  const oldPrev=document.getElementById('mushafPrevBtn'), oldNext=document.getElementById('mushafNextBtn');
  const prev=oldPrev.cloneNode(true), next=oldNext.cloneNode(true);
  oldPrev.replaceWith(prev); oldNext.replaceWith(next);
  const wide=()=>window.matchMedia('(min-width: 721px)').matches;
  const cacheKey=p=>'mushaf_page_'+p;
  async function fetchPage(p){
    const cached=offlineCacheGet(cacheKey(p));
    try{
      const res=await fetch('https://api.alquran.cloud/v1/page/'+p+'/quran-uthmani');
      if(!res.ok) throw Error('HTTP '+res.status);
      const json=await res.json(); offlineCacheSet(cacheKey(p),json.data);
      return {data:json.data,fromCache:false};
    }catch(e){ if(cached)return {data:cached.data,fromCache:true}; throw e; }
  }
  function markup(data){
    let html='',last=null;
    data.ayahs.forEach(a=>{
      if(a.surah.name!==last){html+='<div class="mushaf-surah-header">سورة '+a.surah.name+'</div>';last=a.surah.name}
      html+='<span class="ayah-block" data-ayah="'+a.number+'" data-surah="'+a.surah.name+'" data-surah-num="'+a.surah.number+'" data-in-surah="'+a.numberInSurah+'">'+a.text+' <span class="mushaf-ayah-num">'+a.numberInSurah+'</span><span class="mushaf-tafsir-toggle" title="عرض التفسير">ت</span><span class="mushaf-tafsir-box"></span></span> ';
    });
    return html;
  }
  function wire(text){
    text.querySelectorAll('.mushaf-ayah-num').forEach(el=>el.addEventListener('click',()=>toggleAyahBookmark(el.closest('.ayah-block'))));
    text.querySelectorAll('.mushaf-tafsir-toggle').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();toggleMushafTafsir(el)}));
  }
  window.loadMushafPage=async function(page,scrollToBookmark){
    const requested=Math.min(MUSHAF_MAX_PAGE,Math.max(1,parseInt(page,10)||1));
    let p=requested;
    if(wide() && requested===mushafCurrentPage+1) p=Math.min(MUSHAF_MAX_PAGE,mushafCurrentPage+2);
    else if(wide() && requested===mushafCurrentPage-1) p=Math.max(1,mushafCurrentPage-2);
    mushafCurrentPage=p; mushafPageInput.value=p;
    prev.disabled=p<=1; next.disabled=p>=(wide()?MUSHAF_MAX_PAGE-1:MUSHAF_MAX_PAGE);
    primary.innerHTML=''; secondary.innerHTML='';
    mushafLoading.textContent='جارٍ تحميل الصفحة...';mushafLoading.style.display='block';
    document.getElementById('mushafContent').scrollTop=0;
    inner.scrollTop=0;secondaryPage.scrollTop=0;
    try{
      const first=await fetchPage(p);
      const second=wide()&&p<MUSHAF_MAX_PAGE?await fetchPage(p+1):null;
      primary.innerHTML=markup(first.data);wire(primary);
      inner.querySelector('.mushaf-leaf-number')?.remove();
      const num=document.createElement('span');num.className='mushaf-leaf-number';num.textContent=''+p;inner.appendChild(num);
      secondary.style.display=second?'':'none';gutter.style.display=second?'':'none';
      if(second){secondary.innerHTML=markup(second.data);wire(secondary);document.getElementById('mushafLeafNext').textContent=''+(p+1)}
      const a=first.data.ayahs[0], name=a?.surah?.name;
      mushafPageInfo.textContent=name?'سورة '+name:'المصحف الشريف';
      const juz=a?.juz||'';
      document.getElementById('mushafCaptionText').textContent='صفحة '+p+(juz?' · جزء '+juz:'')+((first.fromCache||second?.fromCache)?' (بدون إنترنت)':'');
      mushafLoading.style.display='none';
      if(a?.surah?.number)mushafSurahSelect.value=a.surah.number;
      mushafPageFirstSurahNum=a?.surah?.number||null;
      if(typeof updateMushafPlayIcon==='function')updateMushafPlayIcon();
      localStorage.setItem(MUSHAF_STORAGE_KEY,p);refreshMushafLastLabel();
      if(typeof renderKhatma==='function')renderKhatma();
      if(typeof logStreakActivity==='function')logStreakActivity();
      applyBookmarkHighlight(scrollToBookmark);
    }catch(e){
      mushafLoading.textContent='تعذّر تحميل الصفحة. تحقق من الاتصال أو افتح الصفحات مرة واحدة لحفظها للعمل دون إنترنت.';
      mushafLoading.style.display='block';
    }
  };
  prev.addEventListener('click',()=>loadMushafPage(mushafCurrentPage-(wide()?2:1)));
  next.addEventListener('click',()=>loadMushafPage(mushafCurrentPage+(wide()?2:1)));
  window.addEventListener('resize',()=>{if(mushafLoaded)loadMushafPage(mushafCurrentPage)});
})();
