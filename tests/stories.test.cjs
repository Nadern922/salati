const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const story = JSON.parse(fs.readFileSync('stories/adam.json','utf8'));
test('story catalog agrees with sources and preserves the written Adam story', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync('stories/catalog.js','utf8'),context);
  const catalog = context.window.SALATI_STORIES.stories;
  assert.equal(new Set(catalog.map(item=>item.id)).size,catalog.length);
  for(const item of catalog){
    const source = JSON.parse(fs.readFileSync(`stories/${item.id}.json`,'utf8'));
    assert.equal(JSON.stringify(item),JSON.stringify(source));
  }
  assert.equal(JSON.stringify(catalog.find(item=>item.id==='adam')),JSON.stringify(story));
  assert.equal(story.chapters.length,7);
  assert.equal(story.readOnly,true);
  assert.equal(story.duration,0);
  const ids = new Set();
  for(const chapter of story.chapters){
    assert.ok(!ids.has(chapter.id)); ids.add(chapter.id);
    assert.equal(chapter.duration,0);
    assert.equal(chapter.audio,undefined);
    assert.ok(chapter.paragraphs.length>=2 && chapter.lesson.length>20);
    assert.ok(chapter.sources.length>0);
    for(const source of chapter.sources) assert.match(source.url,/^https:\/\/quran\.com\/\d+\/\d+(?:-\d+)?$/);
    assert.ok(fs.statSync(chapter.image).size>10000);
    assert.equal(fs.readFileSync(chapter.image).subarray(8,12).toString(),'WEBP');
  }
  new vm.Script(fs.readFileSync('js/stories.js','utf8'));
});
test('playable stories use original Shanqiti recordings with stable source links',()=>{
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync('stories/catalog.js','utf8'),context);
  const recordings = context.window.SALATI_STORIES.stories.filter(item=>!item.readOnly);
  assert.ok(recordings.length>=3);
  for(const item of recordings){
    assert.equal(item.narrator,'الشيخ محمد بن علي الشنقيطي');
    assert.ok(Math.abs(item.duration-item.chapters.reduce((sum,c)=>sum+c.duration,0))<.1);
    assert.equal(new Set(item.chapters.map(c=>c.id)).size,item.chapters.length);
    for(const chapter of item.chapters){
      const audio = new URL(chapter.audio);
      assert.equal(audio.protocol,'https:');
      assert.equal(audio.hostname,'archive.org');
      assert.match(audio.pathname,/^\/download\/.+\.(mp3|mp4)$/);
      assert.equal(audio.search,''); // Expiring signed URLs must not ship.
      assert.ok(chapter.duration>0);
      assert.ok(chapter.sources.some(s=>/^https:\/\/way2allah\.com\/khotab-item-\d+\.htm$/.test(s.url)));
      assert.equal(fs.readFileSync(chapter.image).subarray(8,12).toString(),'WEBP');
    }
  }
});
test('both Android bundles include stories and styles',()=>{
  for(const workflow of ['build-android','verify-android']){
    const source=fs.readFileSync(`.github/workflows/${workflow}.yml`,'utf8');
    assert.match(source,/cp -R audio js stories styles www\//);
  }
});
