/* Keep Quran playback visible to mobile OS media controls. */
(() => {
  const audioEl = document.getElementById('audio');
  if (!audioEl || !('mediaSession' in navigator)) return;
  const session = navigator.mediaSession;

  function syncState() {
    try {
      session.playbackState = audioEl.paused ? 'paused' : 'playing';
    } catch (_) {}
  }

  function syncMetadata() {
    if (!('MediaMetadata' in window) || currentIndex === null) return;
    try {
      session.metadata = new MediaMetadata({
        title: 'سورة ' + SURAHS[currentIndex],
        artist: RECITERS[currentReciterIndex].name,
        album: 'القرآن الكريم · صلاتي'
      });
    } catch (_) {}
  }

  function play() {
    if (currentIndex === null) {
      loadSurah(0, true);
      return;
    }
    audioEl.play().then(() => {
      isPlaying = true;
      updatePlayIcon();
      syncState();
    }).catch(() => syncState());
  }

  function pause() {
    audioEl.pause();
    isPlaying = false;
    updatePlayIcon();
    syncState();
  }

  function setAction(name, handler) {
    try { session.setActionHandler(name, handler); } catch (_) {}
  }

  setAction('play', play);
  setAction('pause', pause);
  setAction('stop', pause);
  setAction('previoustrack', () => prevBtn.click());
  setAction('nexttrack', () => nextBtn.click());
  setAction('seekbackward', (details) => {
    if (Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - (details.seekOffset || 10));
    }
  });
  setAction('seekforward', (details) => {
    if (Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + (details.seekOffset || 10));
    }
  });
  setAction('seekto', (details) => {
    if (Number.isFinite(details.seekTime) && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Math.max(0, Math.min(audioEl.duration, details.seekTime));
    }
  });

  audioEl.addEventListener('play', () => {
    isPlaying = true;
    updatePlayIcon();
    syncMetadata();
    syncState();
  });
  audioEl.addEventListener('pause', syncState);
  audioEl.addEventListener('loadedmetadata', syncMetadata);
  audioEl.addEventListener('timeupdate', () => {
    try {
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        session.setPositionState({
          duration: audioEl.duration,
          playbackRate: audioEl.playbackRate || 1,
          position: Math.min(audioEl.currentTime, audioEl.duration)
        });
      }
    } catch (_) {}
  });
  audioEl.addEventListener('ended', syncState);
  document.addEventListener('visibilitychange', syncState);
})();
