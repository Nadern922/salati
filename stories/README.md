# قصص القرآن والأنبياء

The audio library uses original recordings of Sheikh Muhammad bin Ali Al-Shanqiti: three Moses episodes, a lecture about Hud and the people of Ad, and the story of the People of the Cave. Each episode links to its source page on Way2Allah. Stable HTTPS Archive.org media links support streaming and seeking; playback requires internet access. The first Moses episode uses the original MP4 through the audio element, without displaying video. Written descriptions identify the recordings and are not transcripts of the Sheikh's words.

Adam remains a written story in seven chapters based on the linked Quran passages. It has no playable audio until a verified recording by the requested narrator is available. Existing synthetic MP3 assets are retained as historical files and are not referenced by the active catalog.

Landscape illustrations are symbolic, with no depictions of prophets or angels and no claim to portray Paradise. Progress and listening speed are saved locally on each device. Clearing browser storage removes saved progress.

Each story has an editable JSON source in this directory. Rebuild `catalog.js` while preserving the current library order, then run the checks:

```sh
python scripts/generate-story-audio.py --catalog-only
node --test tests/*.test.cjs
```

The legacy narration generator rejects original-recording and written-only stories. Never replace an original recording with generated speech while retaining the Sheikh's name. New audio entries need a verified narrator, a stable playable URL, duration, source page and a symbolic image.

Verification covered mobile navigation, saved progress, speed controls, written-only Adam, source links, and playback and seeking of the actual media files. All remote media URLs returned HTTP 206 byte ranges. Browser media tests used copies fetched with verified TLS because Chromium does not trust this environment's network proxy certificate.
