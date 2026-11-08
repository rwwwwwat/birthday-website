import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicEngine } from '../src/js/components/music-engine.js';
import { relationshipLabel } from '../src/js/components/relationship.js';
import { letterCopy, birthdayCopy } from '../src/config/copy.js';
class FakeAudio extends EventTarget {
  paused = true; volume = 1; currentTime = 0; duration = 300; loop = true; plays = []; reject = false;
  play() { this.plays.push({ src: this.src, time: this.currentTime, volume: this.volume });
    if (this.reject) return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));
    this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.currentTime = 0; }
  time(seconds) { this.currentTime = seconds; this.dispatchEvent(new Event('timeupdate')); }
  end() { this.paused = true; this.dispatchEvent(new Event('ended')); }
}
const config = { tracks: ['cry','iri','danger','aimer'].map((id)=>({id,src:id+'.mp3'})), defaultId:'cry',specialId:'danger',volume:.15 };
const tick = () => new Promise((resolve)=>setImmediate(resolve));
function setup() { const audio=new FakeAudio(); return {audio,engine:createMusicEngine(audio,config)}; }
test('default track and volume; autoplay tries once with one gesture fallback, never polls policy', async()=>{
  const {audio,engine}=setup(); audio.reject=true; engine.autoplay(); await tick();
  assert.equal(engine.current().status,'blocked'); engine.autoplay(); engine.start(); await tick(); engine.start();
  assert.equal(audio.plays.length,2); assert.ok(audio.plays.every((p)=>p.volume===.15&&p.src==='cry.mp3'));
  audio.reject=false; engine.resume(); await tick(); assert.equal(engine.current().status,'playing');
});
test('explicit pause survives later login/start and autoplay calls',async()=>{
  const {audio,engine}=setup(); engine.pause(); engine.start(); engine.autoplay(); await tick(); assert.equal(audio.plays.length,0);
});
test('normal playlist progresses and wraps; all four tracks are selectable',async()=>{
  const {audio,engine}=setup(); for(const t of config.tracks){engine.select(t.id);await tick();assert.equal(engine.current().track.id,t.id);}
  audio.end(); await tick(); assert.equal(engine.current().track.id,'cry'); assert.equal(audio.loop,false);
  engine.previous(); await tick(); assert.equal(engine.current().track.id,'aimer');
});
test('photo special starts at zero without overwriting ordinary index or progress; repeats do not restart',async()=>{
  const {audio,engine}=setup(); engine.resume(); await tick(); audio.time(83);
  assert.equal(engine.special(),true); await tick(); assert.equal(engine.current().mode,'special'); assert.equal(audio.currentTime,0);
  assert.equal(engine.current().normalIndex,0); assert.equal(engine.current().positions.cry,83);
  audio.time(45);const before=audio.plays.length; assert.equal(engine.special(),false);assert.equal(audio.plays.length,before);assert.equal(audio.currentTime,45);
  assert.equal(engine.current().positions.cry,83);
  // Closing a photo/unmounting a scene does not own or cancel the global engine.
  audio.end();await tick();assert.equal(engine.current().mode,'normal');assert.equal(engine.current().track.id,'iri');
  assert.equal(engine.special(),false); engine.select('cry');await tick();assert.equal(audio.currentTime,83);
});
test('special completion skips danger if it is the ordinary next track',async()=>{
  const {audio,engine}=setup();engine.select('iri');await tick();audio.time(25);engine.special();await tick();audio.end();await tick();
  assert.equal(engine.current().track.id,'aimer');assert.equal(engine.current().positions.iri,25);
});
test('manual track selection exits special mode and stale play completion cannot restore it',async()=>{
  const {audio,engine}=setup();engine.special();engine.select('aimer');await tick();
  assert.equal(engine.current().mode,'normal');assert.equal(engine.current().track.id,'aimer');assert.equal(audio.src,'aimer.mp3');
});
test('pause/resume and seek in special do not mutate normal progress',async()=>{
  const {audio,engine}=setup();engine.resume();await tick();audio.time(32);engine.special();await tick();
  engine.seek(66);engine.pause();await tick();assert.equal(engine.current().positions.cry,32);assert.equal(audio.currentTime,66);
  engine.resume();await tick();assert.equal(audio.currentTime,66);assert.equal(audio.volume,.15);
});
test('a finished normal track rearms photo egg, not an immediate repeated photo click',async()=>{
  const {audio,engine}=setup();engine.special();await tick();audio.end();await tick();assert.equal(engine.special(),false);
  audio.end();await tick();assert.equal(engine.special(),true);
});
test('media errors remain errors until explicit action, without auto skip loops',async()=>{
  const {audio,engine}=setup();engine.resume();await tick();audio.dispatchEvent(new Event('error'));await tick();
  assert.equal(engine.current().status,'error');assert.equal(audio.plays.length,1);
});
test('network/auth media failure preserves normal and special time until an explicit resume',async()=>{
  for (const special of [false,true]) {
    const {audio,engine}=setup();engine.resume();await tick();audio.time(32);
    if(special){engine.special();await tick();audio.time(48);}
    const plays=audio.plays.length;audio.error={code:2};audio.dispatchEvent(new Event('error'));
    audio.currentTime=0;audio.dispatchEvent(new Event('timeupdate'));await tick();
    assert.equal(engine.current().currentTime,special?48:32);assert.equal(audio.plays.length,plays);
    audio.error=null;engine.resume();audio.dispatchEvent(new Event('loadedmetadata'));await tick();
    assert.equal(audio.currentTime,special?48:32);assert.equal(engine.current().mode,special?'special':'normal');assert.equal(audio.volume,.15);
  }
});
test('queued old media events cannot make a paused player look active or a playing one look paused',async()=>{
  const {audio,engine}=setup();engine.resume();await tick();
  audio.dispatchEvent(new Event('pause'));assert.equal(engine.current().status,'playing');
  engine.pause();audio.dispatchEvent(new Event('playing'));assert.equal(engine.current().status,'paused');
});
test('anniversary uses inclusive days including exact birthday example',()=>{
  assert.equal(relationshipLabel('2026-06-27',new Date('2026-06-27T04:00:00Z')),'在一起第 1 天');
  assert.equal(relationshipLabel('2026-06-27',new Date('2026-11-10T04:00:00Z')),'在一起第 137 天');
});
test('approved copy is final, with opening/ending paragraphs and birthday wishes intact',()=>{
  assert.equal(letterCopy.isPlaceholder,false);assert.ok(letterCopy.text.startsWith('很高兴，能够陪你一起走进二十岁。'));
  assert.ok(letterCopy.text.endsWith('愿我们有很多个以后。'));assert.equal(letterCopy.text.split('\n\n').length,8);
  assert.equal(birthdayCopy.title,'20岁生日快乐！');assert.ok(birthdayCopy.blessing.endsWith('而我也希望，未来的很多个生日，都能继续陪你一起度过。'));
});
