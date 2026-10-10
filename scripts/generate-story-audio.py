"""Generate bundled Arabic narration for an authored story (not part of app startup).
Install edge-tts, then: python scripts/generate-story-audio.py stories/adam.json
The audio is synthetic narration of the story prose, not a Quran recitation.
"""
import asyncio
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys

import edge_tts
from edge_tts import communicate

# Respect the managed environment's CA trust and proxy; never disable TLS checks.
communicate._SSL_CTX = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))
ROOT = Path(__file__).resolve().parents[1]

async def main():
    story_path = ROOT / sys.argv[1]
    story = json.loads(story_path.read_text())
    semaphore = asyncio.Semaphore(2)
    async def generate(index, chapter):
        path = ROOT / 'stories/audio' / (story['id'] + '-' + chapter['id'] + '.mp3')
        path.parent.mkdir(parents=True, exist_ok=True)
        async with semaphore:
            text = chapter['title'] + '. ' + ' '.join(chapter['paragraphs'])
            for attempt in range(3):
                try:
                    narration = edge_tts.Communicate(text, 'ar-SA-HamedNeural', rate='-8%',
                        proxy=os.environ.get('HTTPS_PROXY'), connect_timeout=15, receive_timeout=45)
                    await narration.save(str(path))
                    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'json', str(path)], check=True, capture_output=True, text=True)
                    chapter['duration'] = round(float(json.loads(result.stdout)['format']['duration']), 2)
                    if chapter['duration'] < 10:
                        raise ValueError('Narration unexpectedly short')
                    chapter['audio'] = str(path.relative_to(ROOT))
                    print(f"Chapter {index + 1}: {chapter['duration']} seconds", flush=True)
                    break
                except Exception:
                    path.unlink(missing_ok=True)
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2)
    await asyncio.gather(*(generate(i, chapter) for i, chapter in enumerate(story['chapters'])))
    story['duration'] = round(sum(chapter['duration'] for chapter in story['chapters']), 2)
    story_path.write_text(json.dumps(story, ensure_ascii=False, indent=2) + '\n')
    data = {'stories': [json.loads(path.read_text()) for path in sorted((ROOT / 'stories').glob('*.json'))]}
    (ROOT / 'stories/catalog.js').write_text('window.SALATI_STORIES = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
    print('Narration and story catalog generated.', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
