# قصص القرآن والأنبياء

The first published story is Adam: seven chapters of original Arabic prose based on the Quran passages linked in each chapter. Lessons are editorial reflections. Landscapes are symbolic illustrations, with no depictions of prophets or angels; the garden illustrations do not claim to portray Paradise.

Audio is synthetic Arabic narration (`ar-SA-HamedNeural`, rate `-8%`), not Quran recitation. All MP3 and WebP assets are bundled with the website and Android builds. Playback does not call a speech service. It requires loading the bundled file, then the audio player can seek and change speed. Progress is stored locally per device; clearing browser storage removes it.

`adam.json` is the editable source. `catalog.js` is a generated browser catalog. To regenerate narration and catalog, install `edge-tts` and FFmpeg/ffprobe, then run from the repository root:

```sh
python scripts/generate-story-audio.py stories/adam.json
node --test tests/*.test.cjs
```

Generation requires network access; app playback does not require this dependency. Review the prose and referenced Quran passages before publishing another story. Include actual narration, images, duration, source links and lessons for every chapter; do not publish placeholder play buttons.

Browser verification used mobile widths 320/390 and desktop 1024, actual MP3 playback, seek/resume, speed retention, automatic next chapter, completion and browser back navigation. Serve with HTTP byte-range support (as GitHub Pages does) when testing audio seeking.
