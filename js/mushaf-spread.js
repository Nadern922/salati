/* Paired-page Uthmani Mushaf renderer */
(() => {
  const frame=document.querySelector('.mushaf-page-frame');
  if(!frame) return;
  const primary=document.getElementById('mushafText');
  const inner=primary.closest('.mushaf-page-inner');
  function makeScan(innerEl,textEl){
    const img=document.createElement('img');
    img.className='mushaf-scan-page'; img.alt='صفحة من المصحف الشريف';
    img.decoding='async'; img.loading='eager';
    img.onerror=()=>{img.style.display='none';textEl.style.display='block'};
    img.onload=()=>{textEl.style.display='none'};
    innerEl.insertBefore(img,textEl); textEl.style.display='none'; return img;
  }
  const primaryScan=makeScan(inner,primary);
  const secondaryPage=document.createElement('div');
  secondaryPage.className='mushaf-page-inner';
  secondaryPage.innerHTML='<div class="mushaf-text" id="mushafTextNext"></div><span class="mushaf-leaf-number" id="mushafLeafNext"></span>';
  const gutter=document.createElement('div'); gutter.className='mushaf-spread-gutter'; gutter.setAttribute('aria-hidden','true');
  inner.insertAdjacentElement('afterend',gutter); gutter.insertAdjacentElement('afterend',secondaryPage);
  const secondary=secondaryPage.querySelector('#mushafTextNext');
  const secondaryScan=makeScan(secondaryPage,secondary);
  const scanUrl=p=>'https://www.mp3quran.net/api/quran_pages_svg/'+String(p).padStart(3,'0')+'.svg';
  function showScan(img,textEl,page){
    textEl.style.display='none'; img.style.display='block';
    img.alt='صفحة '+page+' من المصحف الشريف'; img.src=scanUrl(page);
  }
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
      html+='<span class="ayah-block" data-page="'+(data.number||p)+'" data-ayah="'+a.number+'" data-surah="'+a.surah.name+'" data-surah-num="'+a.surah.number+'" data-in-surah="'+a.numberInSurah+'">'+a.text+' <span class="mushaf-ayah-num">'+a.numberInSurah+'</span><span class="mushaf-tafsir-toggle" title="عرض التفسير">ت</span><span class="mushaf-tafsir-box"></span></span> ';
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
    if(wide() && p%2===0) p=Math.max(1,p-1);
    mushafCurrentPage=p; mushafPageInput.value=p;
    prev.disabled=p<=1; next.disabled=p>=(wide()?MUSHAF_MAX_PAGE-1:MUSHAF_MAX_PAGE);
    primary.innerHTML=''; secondary.innerHTML='';
    showScan(primaryScan,primary,p); secondaryScan.style.display='none';
    mushafLoading.textContent='جارٍ تحميل الصفحة...';mushafLoading.style.display='block';
    document.getElementById('mushafContent').scrollTop=0;
    inner.scrollTop=0;secondaryPage.scrollTop=0;
    try{
      const first=await fetchPage(p);
      let second=null;
      if(wide()&&p<MUSHAF_MAX_PAGE){try{second=await fetchPage(p+1)}catch(e){second=null}}
      primary.innerHTML=markup(first.data);wire(primary);
      inner.querySelector('.mushaf-leaf-number')?.remove();
      const num=document.createElement('span');num.className='mushaf-leaf-number';num.textContent=''+p;inner.appendChild(num);
      secondary.style.display=second?'':'none';gutter.style.display=second?'':'none';
      if(second){
        secondary.innerHTML=markup(second.data);wire(secondary);
        showScan(secondaryScan,secondary,p+1);
        document.getElementById('mushafLeafNext').textContent=''+(p+1);
      }
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
      secondary.querySelectorAll('.ayah-block.bookmarked').forEach(el=>el.classList.remove('bookmarked'));
      const mark=getBookmark();
      const target=mark&&secondary.querySelector('.ayah-block[data-ayah="'+mark.global+'"]');
      if(target){target.classList.add('bookmarked');if(scrollToBookmark)target.scrollIntoView({behavior:'smooth',block:'center'})}
    }catch(e){
      mushafLoading.textContent='تعذّر تحميل الصفحة. تحقق من الاتصال أو افتح الصفحات مرة واحدة لحفظها للعمل دون إنترنت.';
      mushafLoading.style.display='block';
    }
  };
  window.toggleAyahBookmark=function(block){
    if(!block)return;
    const global=parseInt(block.dataset.ayah,10), current=getBookmark();
    if(current&&current.global===global){clearBookmark();applyBookmarkHighlight();showMushafToast('تم إلغاء علامة التوقف')}
    else {setBookmark({global,page:parseInt(block.dataset.page,10)||mushafCurrentPage,surah:block.dataset.surah,inSurah:block.dataset.inSurah});applyBookmarkHighlight();showMushafToast('🔖 تم حفظ موضعك: سورة '+block.dataset.surah+' - آية '+block.dataset.inSurah)}
  };
  prev.addEventListener('click',()=>loadMushafPage(mushafCurrentPage-(wide()?2:1)));
  next.addEventListener('click',()=>loadMushafPage(mushafCurrentPage+(wide()?2:1)));
  window.addEventListener('resize',()=>{if(mushafLoaded)loadMushafPage(mushafCurrentPage)});
})();
