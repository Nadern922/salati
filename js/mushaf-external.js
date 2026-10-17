(() => {
  const target = 'https://www.mp3quran.net/ar/mushaf';
  document.addEventListener('click', (event) => {
    const control = event.target.closest('#mushafFab, #qpViewBtn');
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(target);
  }, true);
})();
