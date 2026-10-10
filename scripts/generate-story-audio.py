"""Generate bundled Arabic narration for an authored story (not part of app startup).
Legacy synthetic narration helper; not used for original recordings or written-only stories.
Rebuild the browser catalog without generating audio: pass --catalog-only.
The audio is synthetic narration of the story prose, not a Quran recitation.
"""
import asyncio
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def write_catalog():
    catalog_path = ROOT / 'stories/catalog.js'
    current = json.loads(catalog_path.read_text().split('=', 1)[1].strip().rstrip(';'))
    sources = {story['id']: story for path in sorted((ROOT / 'stories').glob('*.json'))
        for story in [json.loads(path.read_text())]}
    order = [story['id'] for story in current['stories'] if story['id'] in sources]
    order += [story_id for story_id in sources if story_id not in order]
    data = {'stories': [sources[story_id] for story_id in order]}
    catalog_path.write_text('window.SALATI_STORIES = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')

async def main():
    if sys.argv[1] == '--catalog-only':
        write_catalog()
        return
    story_path = ROOT / sys.argv[1]
    story = json.loads(story_path.read_text())
    if story.get('readOnly') or story.get('narrator'):
        raise SystemExit('Original recordings and written-only stories must not receive synthetic narration.')
    import edge_tts
    from edge_tts import communicate
    # Respect the managed environment's CA trust and proxy; never disable TLS checks.
    communicate._SSL_CTX = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))
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
    write_catalog()
    print('Narration and story catalog generated.', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
