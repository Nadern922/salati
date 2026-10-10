const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const story = JSON.parse(fs.readFileSync('stories/adam.json','utf8'));
test('story catalog agrees with source and ships every playable chapter', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync('stories/catalog.js','utf8'),context);
  assert.equal(JSON.stringify(context.window.SALATI_STORIES.stories[0]),JSON.stringify(story));
  assert.equal(story.chapters.length,7);
  assert.ok(Math.abs(story.duration-story.chapters.reduce((sum,c)=>sum+c.duration,0))<.1);
  const ids = new Set();
  for(const chapter of story.chapters){
    assert.ok(!ids.has(chapter.id)); ids.add(chapter.id);
    assert.ok(chapter.duration>20 && chapter.duration<120);
    assert.ok(chapter.paragraphs.length>=2 && chapter.lesson.length>20);
    assert.ok(chapter.sources.length>0);
    for(const source of chapter.sources) assert.match(source.url,/^https:\/\/quran\.com\/\d+\/\d+(?:-\d+)?$/);
    assert.ok(fs.statSync(chapter.audio).size>100000);
    assert.ok(fs.statSync(chapter.image).size>10000);
    assert.equal(fs.readFileSync(chapter.image).subarray(8,12).toString(),'WEBP');
  }
  new vm.Script(fs.readFileSync('js/stories.js','utf8'));
});
test('both Android bundles include stories and styles',()=>{
  for(const workflow of ['build-android','verify-android']){
    const source=fs.readFileSync(`.github/workflows/${workflow}.yml`,'utf8');
    assert.match(source,/cp -R audio js stories styles www\//);
  }
});
