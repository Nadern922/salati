/* Original lecture recordings and a separate written story library. */
(function(){
  'use strict';
  const STORAGE_KEY = 'salati_story_progress_v1';
  const SPEEDS = [.75, 1, 1.25, 1.5];
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  let story = null;
  let chapterIndex = 0;
  let pendingSeek = null;
  let completed = false;
  let libraryParent = null;
  let playbackVersion = 0;
  let lastSavedSecond = -1;
  let lastWrittenProgress = null;
  let storageWarningShown = false;
  const el = id => document.getElementById(id);
  const audio = el('storyAudio');
  const library = el('storiesOverlay');
  const reader = el('storyReaderOverlay');
  if(!audio || !library || !reader) return;
  const catalog = window.SALATI_STORIES?.stories || [];
  const arabic = new Intl.NumberFormat('ar', {useGrouping:false});
  const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clock = seconds => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2,'0');
  };
  function readProgress(item){
    try{
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const saved = all[item.id];
      if(!saved || !Number.isInteger(saved.chapter) || saved.chapter < 0 || saved.chapter >= item.chapters.length) return null;
      const time = Number.isFinite(saved.time) ? Math.max(0, Math.min(saved.time, item.chapters[saved.chapter].duration)) : 0;
      return {chapter:saved.chapter, time, completed:saved.completed === true, rate:SPEEDS.includes(saved.rate) ? saved.rate : 1};
    }catch(e){ return null; }
  }
  function chapterDuration(){
    return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : story?.chapters[chapterIndex]?.duration || 0;
  }
  function currentTime(){ return pendingSeek !== null ? pendingSeek : Math.max(0, audio.currentTime || 0); }
  function overallProgress(item, index, time){
    if(!item.duration) return 0;
    const elapsed = item.chapters.slice(0,index).reduce((sum,chapter) => sum + chapter.duration,0) + time;
    return Math.min(100, Math.max(0, elapsed / item.duration * 100));
  }
  function saveProgress(force = false){
    if(!story || story.readOnly) return;
    const time = Math.min(currentTime(), story.chapters[chapterIndex].duration);
    const second = Math.floor(time);
    if(!force && second === lastSavedSecond) return;
    lastSavedSecond = second;
    const progress = {chapter:chapterIndex, time, rate:audio.playbackRate, completed};
    const serialized = JSON.stringify(progress);
    if(serialized === lastWrittenProgress) return;
    try{
      let all;
      try{ all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }catch(e){ all = {}; }
      if(!all || typeof all !== 'object' || Array.isArray(all)) all = {};
      all[story.id] = progress;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      lastWrittenProgress = serialized;
    }catch(e){
      if(!storageWarningShown){
        storageWarningShown = true;
        status('يمكنك الاستماع، لكن حفظ موضع الاستكمال غير متاح في هذا المتصفح.');
      }
    }
  }
  function status(message){ el('storyPlayerStatus').textContent = message; }
  function updatePlaybackUI(){
    const playing = !audio.paused && !audio.ended;
    el('storyPlay').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    el('storyPlay').setAttribute('aria-label', playing ? 'إيقاف السرد مؤقتًا' : 'تشغيل السرد الصوتي');
    el('storyPlay').setAttribute('aria-pressed', String(playing));
  }
  function pause(){
    playbackVersion++;
    if(!audio.paused) audio.pause();
    saveProgress(true);
    updatePlaybackUI();
  }
  function pauseOtherAudio(){
    const recitation = el('audio');
    if(recitation && !recitation.paused){
      recitation.pause();
      if(typeof isPlaying !== 'undefined') isPlaying = false;
      if(typeof updatePlayIcon === 'function') updatePlayIcon();
    }
    if(typeof azanPreviewEl !== 'undefined' && azanPreviewEl) azanPreviewEl.pause();
  }
  async function play(){
    if(!story || story.readOnly) return;
    if(completed){ loadChapter(0, {autoplay:true}); return; }
    const version = ++playbackVersion;
    pauseOtherAudio();
    if(audio.error){ pendingSeek = currentTime(); audio.load(); }
    status('جارٍ تحميل السرد…');
    try{
      await audio.play();
      if(version !== playbackVersion) return;
      status('');
      updatePlaybackUI();
      updateMediaSession();
    }catch(error){
      if(version !== playbackVersion) return;
      status(error.name === 'NotAllowedError' ? 'اضغط تشغيل للاستماع إلى هذا الفصل.' : 'تعذّر تشغيل الصوت. تحقق من الاتصال ثم اضغط تشغيل للمحاولة مجددًا.');
      updatePlaybackUI();
    }
  }
  function showOverlay(target){
    closeAllOverlays();
    target.classList.add('open');
    document.body.style.overflow = 'hidden';
    setActiveNav(navAzkarBtn);
  }
  function openLibrary(preserveParent = false){
    if(!preserveParent){
      libraryParent = ['islamicToolsOverlay','settingsOverlay','moreOverlay','azkarOverlay']
        .find(id => el(id)?.classList.contains('open')) || null;
    }
    pause();
    renderLibrary();
    showOverlay(library);
    el('storiesClose').focus({preventScroll:true});
  }
  function closeLibrary(){
    pause();
    closeAllOverlays();
    if(libraryParent === 'islamicToolsOverlay') openIslamicToolsOverlay();
    else if(libraryParent === 'settingsOverlay') openSettingsOverlay();
    else if(libraryParent === 'moreOverlay') openMoreOverlay();
    else if(libraryParent === 'azkarOverlay') openAzkarOverlay();
    if(libraryParent === 'islamicToolsOverlay') el('toolsStoriesBtn').focus({preventScroll:true});
    libraryParent = null;
  }
  function renderLibrary(){
    el('storiesCatalog').innerHTML = catalog.map(item => {
      const saved = item.readOnly ? null : readProgress(item);
      const continuing = saved && !saved.completed;
      const progress = saved ? (saved.completed ? 100 : overallProgress(item,saved.chapter,saved.time)) : 0;
      return `<article class="stories-catalog-item" data-story="${escape(item.id)}">
        <span class="stories-category">✦ ${escape(item.category)}</span>
        <div class="stories-feature">
          <img src="${escape(item.cover)}" alt="${escape(item.coverAlt || 'مشهد طبيعي رمزي لنهر وأشجار عند الفجر')}" width="1536" height="1024" loading="lazy">
          <div class="stories-feature-body">
            <span class="stories-feature-tag">${escape(item.readOnly ? 'قصة للقراءة' : 'بصوت '+item.narrator)}</span>
            <h2>${escape(item.title)}</h2>
            <p>${escape(item.description)}</p>
            <div class="stories-meta"><span>${arabic.format(item.chapters.length)} ${item.readOnly ? 'فصول' : 'مقاطع'}</span>${item.readOnly ? '<span>قراءة ومشاهد رمزية</span>' : `<span>${arabic.format(Math.ceil(item.duration/60))} دقيقة</span><span>تسجيل أصلي</span>`}</div>
            <div class="stories-actions">
              ${item.readOnly ? '' : `<button class="stories-button stories-button-primary" data-listen="${escape(item.id)}">${ICON_PLAY}${continuing ? 'استكمل الاستماع' : saved?.completed ? 'استمع مجددًا' : 'استمع للقصة'}</button>`}
              <button class="stories-button stories-button-secondary" data-read="${escape(item.id)}">${item.readOnly ? 'اقرأ القصة' : 'تصفّح المقاطع'}</button>
            </div>
          </div>
        </div>
        <div class="stories-resume" ${saved ? '' : 'hidden'}>
          <div class="stories-resume-head"><b>${saved?.completed ? 'أتممت الاستماع إلى القصة' : 'تابع رحلتك'}</b><span>${arabic.format(Math.round(progress))}٪</span></div>
          <div class="stories-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
          <div class="stories-resume-bottom"><span>${saved ? escape(item.chapters[saved.chapter].title) : ''}${continuing ? ' · '+clock(saved.time) : ''}</span><button class="stories-text-button" data-restart="${escape(item.id)}">من البداية</button></div>
        </div>
        <details class="stories-method"><summary>عن السرد والمصادر والمشاهد</summary><p>${escape(item.methodology)}</p><p>${escape(item.artNote)}</p><p><strong>${escape(item.narration)}</strong></p><p>يُحفظ موضع الاستكمال على هذا الجهاز. يمكنك متابعة النص في أي وقت دون تشغيل الصوت.</p></details>
      </article>`;
    }).join('');
  }
  function openStory(id, options = {}){
    const item = catalog.find(candidate => candidate.id === id);
    if(!item) return;
    pause();
    story = item;
    lastWrittenProgress = null;
    const saved = options.restart || item.readOnly ? null : readProgress(item);
    const index = saved && !saved.completed ? saved.chapter : 0;
    const time = saved && !saved.completed ? saved.time : 0;
    audio.playbackRate = saved?.rate || 1;
    el('storySpeed').value = String(audio.playbackRate);
    chapterIndex = index;
    pendingSeek = time;
    completed = false;
    el('storyReaderName').textContent = item.title;
    showOverlay(reader);
    loadChapter(index, {time, autoplay:options.autoplay === true});
    el('storyReaderClose').focus({preventScroll:true});
  }
  function loadChapter(index, {time = 0, autoplay = false} = {}){
    if(!story || !Number.isInteger(index) || index < 0 || index >= story.chapters.length) return;
    pause();
    chapterIndex = index;
    completed = false;
    pendingSeek = story.readOnly ? null : Math.max(0, Math.min(time, story.chapters[index].duration));
    lastSavedSecond = -1;
    const rate = audio.playbackRate;
    if(story.readOnly) audio.removeAttribute('src');
    else audio.src = story.chapters[index].audio;
    audio.load();
    audio.playbackRate = rate;
    renderChapter();
    saveProgress(true);
    if(autoplay && !story.readOnly) play();
    else status('');
  }
  function renderChapter(){
    const chapter = story.chapters[chapterIndex];
    reader.querySelector('.stories-player').hidden = !!story.readOnly;
    el('storyNarrator').textContent = story.narrator ? 'بصوت '+story.narrator : '';
    el('storyChapterDuration').parentElement.parentElement.hidden = !!story.readOnly;
    el('storyLesson').parentElement.hidden = !chapter.lesson;
    el('storySourcesHeading').textContent = story.readOnly ? 'من القرآن الكريم' : 'مصدر التسجيل';
    el('storySourcesNote').textContent = story.readOnly ? 'النص سرد موجز لمعاني الآيات، والعبرة تأمل تربوي. الصور طبيعة رمزية دون تجسيد الأنبياء.' : 'تسجيل أصلي بصوت '+story.narrator+'. يمكنك فتح المصدر إذا تعذّر تشغيل الصوت هنا.';
    el('storySceneImage').src = chapter.image;
    el('storySceneImage').alt = chapter.imageAlt;
    el('storyChapterEyebrow').textContent = chapter.eyebrow;
    el('storyChapterTitle').textContent = chapter.title;
    el('storyChapterCount').textContent = `${story.readOnly ? 'الفصل' : 'المقطع'} ${arabic.format(chapterIndex+1)} من ${arabic.format(story.chapters.length)}`;
    el('storyChapterDuration').textContent = clock(chapter.duration);
    el('storyTranscript').innerHTML = chapter.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join('');
    el('storyLesson').textContent = chapter.lesson;
    el('storySources').innerHTML = chapter.sources.map(source => `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)} ↗</a>`).join('');
    el('storyChaptersList').innerHTML = story.chapters.map((item,index) => `<button class="stories-chapter" data-chapter="${index}" aria-current="${index===chapterIndex}" aria-label="${story.readOnly ? 'الفصل' : 'المقطع'} ${index+1}: ${escape(item.title)}"><span class="stories-chapter-number">${index===chapterIndex ? '◉' : arabic.format(index+1)}</span><span class="stories-chapter-name">${escape(item.title)}</span>${story.readOnly ? '' : `<span class="stories-chapter-duration">${clock(item.duration)}</span>`}</button>`).join('');
    el('storyComplete').hidden = true;
    el('storyPrevChapter').disabled = chapterIndex === 0;
    el('storyNextChapter').disabled = chapterIndex === story.chapters.length-1;
    el('storyPlayerChapter').textContent = chapter.title;
    el('storyPlayerFraction').textContent = `المقطع ${arabic.format(chapterIndex+1)} / ${arabic.format(story.chapters.length)}`;
    el('storySeek').max = String(chapter.duration);
    el('storyReaderContent').scrollTop = 0;
    updateTime();
    updatePlaybackUI();
    updateMediaSession();
  }
  function seek(time){
    if(!story || story.readOnly || !Number.isFinite(time)) return;
    const target = Math.max(0, Math.min(time, chapterDuration()));
    completed = false;
    el('storyComplete').hidden = true;
    if(audio.readyState >= 1){ pendingSeek = null; audio.currentTime = target; }
    else pendingSeek = target;
    updateTime();
    saveProgress(true);
  }
  function updateTime(){
    if(!story || story.readOnly) return;
    const time = currentTime();
    const duration = chapterDuration();
    el('storySeek').value = String(time);
    el('storySeek').setAttribute('aria-valuetext', `${clock(time)} من ${clock(duration)}`);
    el('storyElapsed').textContent = clock(time);
    el('storyDuration').textContent = clock(duration);
    const progress = completed ? 100 : overallProgress(story,chapterIndex,time);
    el('storyOverallProgress').textContent = `${arabic.format(Math.round(progress))}٪ من القصة`;
    if('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0){
      try{ navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:Math.min(time,duration)}); }catch(e){}
    }
  }
  function updateMediaSession(){
    if(!story || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    if(story.readOnly){
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({title:story.chapters[chapterIndex].title,artist:story.narrator || 'صلاتي',album:'قصص القرآن والأنبياء · '+story.title});
    navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    const handlers = {play, pause, seekbackward:()=>seek(currentTime()-15), seekforward:()=>seek(currentTime()+15),
      previoustrack:()=>loadChapter(chapterIndex-1,{autoplay:!audio.paused}), nexttrack:()=>loadChapter(chapterIndex+1,{autoplay:!audio.paused}),
      seekto:event=>seek(event.seekTime)};
    Object.entries(handlers).forEach(([action,handler])=>{try{navigator.mediaSession.setActionHandler(action,handler);}catch(e){}});
  }
  el('toolsStoriesBtn').addEventListener('click',()=>openLibrary());
  el('storiesClose').addEventListener('click',closeLibrary);
  el('storyReaderClose').addEventListener('click',()=>openLibrary(true));
  el('storyChaptersJump').addEventListener('click',()=>el('storyChaptersSection').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'}));
  el('storiesCatalog').addEventListener('click',event=>{
    const button = event.target.closest('button');
    if(!button) return;
    if(button.dataset.listen) openStory(button.dataset.listen,{autoplay:true});
    else if(button.dataset.read) openStory(button.dataset.read);
    else if(button.dataset.restart) openStory(button.dataset.restart,{restart:true,autoplay:true});
  });
  el('storyChaptersList').addEventListener('click',event=>{
    const button = event.target.closest('[data-chapter]');
    if(button) loadChapter(Number(button.dataset.chapter),{autoplay:!audio.paused});
  });
  el('storyPlay').addEventListener('click',()=>{if(audio.paused)play();else pause();});
  el('storySeek').addEventListener('input',event=>seek(Number(event.target.value)));
  el('storyRewind').addEventListener('click',()=>seek(currentTime()-15));
  el('storyForward').addEventListener('click',()=>seek(currentTime()+15));
  el('storyPrevChapter').addEventListener('click',()=>loadChapter(chapterIndex-1,{autoplay:!audio.paused}));
  el('storyNextChapter').addEventListener('click',()=>loadChapter(chapterIndex+1,{autoplay:!audio.paused}));
  el('storySpeed').addEventListener('change',event=>{
    const rate = Number(event.target.value);
    if(SPEEDS.includes(rate)){audio.playbackRate=rate;saveProgress(true);updateTime();}
  });
  el('storyRestart').addEventListener('click',()=>loadChapter(0,{autoplay:true}));
  audio.addEventListener('loadedmetadata',()=>{
    if(pendingSeek !== null){ audio.currentTime=Math.min(pendingSeek,chapterDuration());pendingSeek=null; }
    el('storySeek').max=String(chapterDuration());updateTime();
  });
  audio.addEventListener('timeupdate',()=>{updateTime();saveProgress();});
  audio.addEventListener('play',()=>{updatePlaybackUI();updateMediaSession();});
  audio.addEventListener('playing',()=>{status('');updatePlaybackUI();});
  audio.addEventListener('pause',()=>{saveProgress(true);updatePlaybackUI();updateMediaSession();});
  audio.addEventListener('waiting',()=>{if(!audio.paused)status('جارٍ تحميل السرد…');});
  audio.addEventListener('error',()=>{status('تعذّر تحميل الصوت. يمكنك قراءة الفصل أو الضغط على تشغيل للمحاولة مجددًا.');updatePlaybackUI();});
  audio.addEventListener('ended',()=>{
    if(!story || !reader.classList.contains('open')) return;
    if(chapterIndex < story.chapters.length-1){loadChapter(chapterIndex+1,{autoplay:true});}
    else{
      completed=true;saveProgress(true);updateTime();updatePlaybackUI();
      status('اكتمل الاستماع إلى القصة.');el('storyComplete').hidden=false;
    }
  });
  document.addEventListener('play',event=>{if(event.target!==audio && !audio.paused)pause();},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveProgress(true);});
  window.addEventListener('pagehide',()=>saveProgress(true));
  document.addEventListener('keydown',event=>{
    const active = reader.classList.contains('open') ? reader : library.classList.contains('open') ? library : null;
    if(active && event.key === 'Escape'){
      event.preventDefault();
      active === reader ? openLibrary(true) : closeLibrary();
      return;
    }
    if(active && event.key === 'Tab'){
      const focusable = [...active.querySelectorAll('button:not(:disabled),a[href],input,select,summary')]
        .filter(node=>node.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length-1];
      if(first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)){
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }
    if(!reader.classList.contains('open') || /INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY/.test(event.target.tagName))return;
    if(event.code==='Space'){event.preventDefault();audio.paused?play():pause();}
  });
  window.SalatiStories = {openLibrary,closeLibrary,openStory,pause,isReaderOpen:()=>reader.classList.contains('open')};
})();

