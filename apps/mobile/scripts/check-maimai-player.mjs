import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'build/maimai-visual-check');
await fs.mkdir(output, { recursive: true });
const module = process.argv[2] ? await import(pathToFileURL(path.resolve(process.argv[2])).href) : await import('playwright');
const { chromium } = module.default ?? module;
const [html, bundle, js, manifest] = await Promise.all([
  fs.readFile(path.join(root, 'assets/maimai-chart-preview/index.html'), 'utf8'),
  fs.readFile(path.join(root, 'assets/maimai-chart-preview/player.bundle')),
  fs.readFile(path.join(root, 'assets/maimai-chart-preview/player.js')),
  fs.readFile(path.join(root, 'build/maimai-skin-audit/manifest.json'), 'utf8').then(JSON.parse),
]);
assert.deepEqual(bundle, js);
const images = Object.fromEntries(await Promise.all(manifest.map(async a => [a.path, `data:image/png;base64,${(await fs.readFile(path.join(root, 'build/maimai-skin-audit', a.path))).toString('base64')}`])));
images['sensor.webp'] = `data:image/webp;base64,${(await fs.readFile(path.join(root, 'assets/maimai-chart-preview/sensor.webp'))).toString('base64')}`;
function wav(seconds) {
 const n=Math.floor(seconds*44100), bytes=Buffer.alloc(44+n*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(44100,24);bytes.writeUInt32LE(88200,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(n*2,40);
 return bytes;
}
const music=wav(30),answer=wav(0.2);
const body='(120){4}1,2hx[4:2],3-7[4:2],Cf,5w1[4:2],6/8,(180)1,2,3,4,5,6,7,8,';
const chart=`&title=Playback verification\n&inote_5=${body}\n&inote_2=${body}\n&inote_102=(150){4}8,7,6h[4:2],5,4-8[4:2],3,2,1,`;
await build({ entryPoints: [path.join(root, 'src/features/simai-chart-preview/engine/core/parser/SimaiParser.ts')], outfile: path.join(output, 'simai-parser.mjs'), bundle: true, platform: 'node', format: 'esm' });
const { parseSimaiChart } = await import(pathToFileURL(path.join(output, 'simai-parser.mjs')).href);
const extended = '&title=Majdata preview\n&inote_7=(120){4}1m,2hbx[4:2],Chm[4:2],3?-5-7[4:2],4-8b[4:2]*-6m[4:1],<HS*2><SV*0.5>5CK1[4:2],';
// Synthetic duration fixtures exercise the packaged player; they are not the actual raputa assets or device acceptance.
const audioTailChart = `&title=Audio tail regression\n&inote_5=(120){4}1${','.repeat(308)}`;
const chartTailChart = '&title=Chart tail regression\n&inote_5=(120){4}1h[#8],';
assert.equal(parseSimaiChart(audioTailChart, 5).durationMs, 158000);
assert.equal(parseSimaiChart(chartTailChart, 5).durationMs, 12000);
const tailFixtures = {
 'audio-tail': { chart: audioTailChart, musicSeconds: 161, totalMs: 163000, endLabel: '2:43 / 2:43' },
 'chart-tail': { chart: chartTailChart, musicSeconds: 1.5, totalMs: 12000, endLabel: '0:12 / 0:12' },
};
async function seekToMs(page, chartMs, totalMs) {
 await page.locator('#timeline-host').evaluate((element, percent) => {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + rect.width * percent / 100, clientY: rect.top + rect.height / 2 }));
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
 }, chartMs / totalMs * 100);
}
async function chartPositionMs(page, totalMs) {
 return page.locator('#timeline-playhead').evaluate((element, duration) => parseFloat(element.style.left) / 100 * duration, totalMs);
}
async function checkTailPlayback(page, mode, fixture) {
 const { totalMs, musicSeconds, endLabel } = fixture;
 assert.equal((await page.locator('#time-label').innerText()).split(' / ')[1], endLabel.split(' / ')[1], `${mode}: timeline must include the full audio and chart duration`);
 if (mode === 'audio-tail') {
  await seekToMs(page, 157500, totalMs);
  await page.locator('#play').click();
  await page.waitForFunction(duration => parseFloat(document.querySelector('#timeline-playhead').style.left) / 100 * duration > 158300, totalMs, { timeout: 3000 });
  assert.equal(await page.locator('#play').getAttribute('aria-label'), '暂停', 'the 161 s song must still play after the 156 s chart tail');
  assert.equal(await page.evaluate(() => window.sources.some(source => source.duration === 161 && source.started && !source.stopped && !source.ended)), true);
  await page.locator('#play').click();
  const pausedMs = await chartPositionMs(page, totalMs);
  await page.waitForTimeout(150);
  assert.equal(await chartPositionMs(page, totalMs), pausedMs, 'pausing in the audio tail must freeze the playhead');
  await page.locator('#play').click();
  await page.waitForTimeout(200);
  assert.ok(await chartPositionMs(page, totalMs) > pausedMs, 'resuming in the audio tail must advance');
  const previousSources = await page.evaluate(() => window.sources.length);
  await seekToMs(page, 162970, totalMs);
  await page.waitForFunction(count => window.sources.slice(count).some(source => source.duration === 161 && source.started), previousSources);
  await page.waitForFunction(count => window.sources.slice(count).some(source => source.duration === 161 && source.ended), previousSources, { timeout: 3000 });
  const lastSource = await page.evaluate(count => window.sources.slice(count).find(source => source.duration === 161), previousSources);
  assert.ok(Math.abs(lastSource.offset - 160.97) < 0.002, `the final 30 ms must be seekable: ${lastSource.offset}`);
  assert.equal(lastSource.stopped, false, 'the final audio source must end naturally, including its last 50 ms');
 } else {
  await seekToMs(page, 3150, totalMs);
  await page.evaluate(duration => {
   window.tailFrames = [];
   const record = timestamp => {
    const percent = parseFloat(document.querySelector('#timeline-playhead').style.left);
    window.tailFrames.push({ timestamp, chartMs: percent / 100 * duration });
    if (window.tailFrames.length < 180) requestAnimationFrame(record);
   };
   requestAnimationFrame(record);
  }, totalMs);
  await page.locator('#play').click();
  await page.waitForFunction(() => window.sources.some(source => source.duration === 1.5 && source.ended), undefined, { timeout: 3000 });
  const endedSource = await page.evaluate(() => window.sources.find(source => source.duration === 1.5));
  assert.equal(endedSource.stopped, false, 'short audio must end naturally before the sustained chart tail');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#play').getAttribute('aria-label'), '暂停');
  const frames = await page.evaluate(() => window.tailFrames);
  const transitionFrames = frames.filter(frame => frame.timestamp >= endedSource.endedAt - 100 && frame.timestamp <= endedSource.endedAt + 250);
  assert.ok(transitionFrames.length >= 3, 'sample playback across natural audio completion');
  for (let i = 1; i < transitionFrames.length; i++) {
   const elapsed = transitionFrames[i].timestamp - transitionFrames[i - 1].timestamp;
   const advanced = transitionFrames[i].chartMs - transitionFrames[i - 1].chartMs;
   assert.ok(advanced >= -1 && advanced <= elapsed + 80, `clock must not rewind or jump at audio end: ${advanced} ms in ${elapsed} ms`);
  }
  const transitionStart = transitionFrames[0], transitionEnd = transitionFrames.at(-1);
  assert.ok(Math.abs((transitionEnd.chartMs - transitionStart.chartMs) - (transitionEnd.timestamp - transitionStart.timestamp)) < 120, 'clock must keep advancing through audio completion');
  const speedSwitchStart = await page.evaluate(duration => ({ timestamp: performance.now(), chartMs: parseFloat(document.querySelector('#timeline-playhead').style.left) / 100 * duration }), totalMs);
  await page.locator('#speed-trigger').click();
  await page.locator('#speed-wheel').evaluate(element => element.scrollTo(0, 14 * 28));
  await page.waitForFunction(() => document.querySelector('#speed-val').textContent === '1.5');
  await page.locator('#speed-trigger').click();
  const speedStart = await page.evaluate(duration => ({ timestamp: performance.now(), chartMs: parseFloat(document.querySelector('#timeline-playhead').style.left) / 100 * duration }), totalMs);
  const switchElapsed = speedStart.timestamp - speedSwitchStart.timestamp;
  const switchAdvanced = speedStart.chartMs - speedSwitchStart.chartMs;
  assert.ok(switchAdvanced >= switchElapsed - 120 && switchAdvanced <= switchElapsed * 1.5 + 120, 'changing the playback rate must preserve the current position');
  await page.waitForTimeout(250);
  const speedEnd = await page.evaluate(duration => ({ timestamp: performance.now(), chartMs: parseFloat(document.querySelector('#timeline-playhead').style.left) / 100 * duration }), totalMs);
  assert.ok(Math.abs((speedEnd.chartMs - speedStart.chartMs) - (speedEnd.timestamp - speedStart.timestamp) * 1.5) < 120, 'speed changes after audio end must keep the same position and advance at the selected rate');
  assert.ok(speedEnd.chartMs > speedStart.chartMs && speedEnd.chartMs < totalMs - 1000, 'changing speed after audio end must not rewind or jump to the endpoint');
  await page.locator('#play').click();
  const pausedMs = await chartPositionMs(page, totalMs);
  await page.waitForTimeout(150);
  assert.equal(await chartPositionMs(page, totalMs), pausedMs);
  const musicSources = await page.evaluate(() => window.sources.filter(source => source.duration === 1.5).length);
  await seekToMs(page, 11600, totalMs);
  assert.ok(Math.abs(await chartPositionMs(page, totalMs) - 11600) < 1, 'seek must reach a held-note tail beyond the final Simai comma');
  await page.locator('#play').click();
  await page.waitForTimeout(150);
  assert.ok(await chartPositionMs(page, totalMs) > 11600);
  assert.equal(await page.evaluate(() => window.sources.filter(source => source.duration === 1.5).length), musicSources, 'resuming beyond audio end must not replay music');
 }
 await page.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === '播放', undefined, { timeout: 3000 });
 assert.equal(await page.locator('#time-label').innerText(), endLabel);
 assert.equal(await page.locator('#timeline-playhead').evaluate(element => parseFloat(element.style.left)), 100);
 await seekToMs(page, totalMs, totalMs);
 assert.equal(await page.locator('#time-label').innerText(), endLabel, 'seeking to 100% must use the same endpoint as playback');
 return { mode, syntheticAudioSeconds: musicSeconds, totalMs, audioEndedNaturally: true, tailSeekAndPauseResume: true, speedChangeAfterAudioEnd: mode === 'chart-tail' };
}
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for(const mode of (process.argv[3] ? [process.argv[3]] : ['normal','buddy','majdata','missing','audio-tail','chart-tail'])) {
  const buddy = mode === 'buddy';
  const tailFixture = tailFixtures[mode];
  const modeMusic = tailFixture ? wav(tailFixture.musicSeconds) : music;
  const page=await browser.newPage({viewport:{width:900,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.addInitScript(()=>{
   window.messages=[];window.ReactNativeWebView={postMessage:s=>window.messages.push(JSON.parse(s))};
   window.sources=[];
   const Original=window.AudioContext;
   window.AudioContext=class extends Original {
    createBufferSource(){const source=super.createBufferSource(),entry={started:false,stopped:false,ended:false,when:0,duration:0,offset:0,endedAt:0};window.sources.push(entry);
     const start=source.start.bind(source),stop=source.stop.bind(source);
     source.start=(when=0,...args)=>{entry.started=true;entry.when=when;entry.duration=source.buffer?.duration??0;entry.offset=args[0]??0;return start(when,...args);};
     source.stop=(...args)=>{entry.stopped=true;return stop(...args);};source.addEventListener('ended',()=>{entry.ended=true;entry.endedAt=performance.now();});return source;
    }
   };
  });
  const config={chartId:1,chartUrl:'https://preview.test/1.txt',musicUrl:'https://preview.test/1.mp3',difficulty:5,title:'Playback verification',buddySide:buddy?'dual':undefined,answerSoundUrl:'https://preview.test/answer.wav',backgroundImageUrl:images['outline.png'],settings:{musicVolume:0,soundVolume:0,backgroundMode:'none'}};
  if (mode === 'majdata') Object.assign(config, { chartId: '0dff2974-9419-4290-bea9-307caa5825b7', difficulty: 7, parsedChart: parseSimaiChart(extended, 7) });
  if (mode === 'missing') config.difficulty = 6;
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url.startsWith('data:'))return route.continue();
   if(url.endsWith('/index.html'))return route.fulfill({contentType:'text/html',body:html.replace('<!--CHART_PREVIEW_CONFIG-->',`<script>window.__CHART_PREVIEW__=${JSON.stringify(config)}</script>`)});
   if(url.endsWith('/player.js'))return route.fulfill({contentType:'text/javascript',body:bundle});
   if(url.endsWith('/skin-data.js'))return route.fulfill({contentType:'text/javascript',body:`window.__MAIMAI_CHART_PREVIEW_SKINS__=${JSON.stringify(images)};`});
   if(url.endsWith('.txt'))return route.fulfill({body:tailFixture?.chart??chart});
   if(url.endsWith('.mp3'))return route.fulfill({contentType:'audio/wav',body:modeMusic});
   if(url.endsWith('/answer.wav'))return route.fulfill({contentType:'audio/wav',body:answer});
   return route.abort();
  });
  await page.goto('https://preview.test/index.html');
  if (mode === 'missing') {
    await page.waitForFunction(()=>window.messages.some(m=>m.type==='error'));
    assert.ok((await page.evaluate(()=>window.messages)).some(m=>m.type==='error' && m.diagnostic?.includes('所选难度')));
    results.push({mode, rejected: true}); await page.close(); continue;
  }
  try { await page.waitForFunction(()=>window.messages.some(m=>m.type==='ready'), undefined, {timeout: 10000}); } catch (error) { console.error(mode, errors, await page.evaluate(()=>({messages:window.messages, status:document.querySelector('#status')?.textContent, config: window.__CHART_PREVIEW__?.chartId, scripts:[...document.scripts].map(s=>s.src)}))); throw error; }
  if (tailFixture) {
   results.push(await checkTailPlayback(page, mode, tailFixture));
   assert.deepEqual(errors, []);
   assert.equal(await page.evaluate(() => window.messages.some(message => message.type === 'error')), false);
   await page.close();
   continue;
  }
  await page.locator('#play').click();
  try { await page.waitForFunction(()=>document.querySelector('#play').getAttribute('aria-label')==='暂停', undefined, {timeout: 10000}); } catch (error) { console.error(mode, errors, await page.evaluate(()=>({messages: window.messages, play: document.querySelector('#play').outerHTML, status: document.querySelector('#status')?.textContent}))); throw error; }
  await page.waitForTimeout(400);
  const intro=await page.locator('#info-combo').innerText();assert.match(intro,/^0\s*\//);
  await page.locator('#play').click();
  const paused=await page.locator('#info-beat').innerText();await page.waitForTimeout(150);assert.equal(await page.locator('#info-beat').innerText(),paused);
  await page.locator('#btn-next-measure').click();
  await page.locator('#btn-loop-a').click();
  await page.locator('#btn-next-measure').click();
  await page.locator('#btn-loop-b').click();
  await page.locator('#btn-prev-measure').click();
  await page.locator('#play').click();await page.waitForTimeout(150);
  const oldIds=await page.evaluate(()=>window.sources.map((s,i)=>s.started&&!s.stopped&&!s.ended&&s.duration<1?i:-1).filter(i=>i>=0));
  await page.locator('#speed-trigger').click();await page.locator('#speed-wheel').evaluate(el=>el.scrollTo(0,14*28));
  await page.waitForFunction(()=>document.querySelector('#speed-val').textContent==='1.5');
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(ids=>ids.every(i=>window.sources[i].stopped||window.sources[i].ended),oldIds),true);
  await page.locator('#speed-trigger').click();
  await page.waitForTimeout(1700);
  await page.locator('#play').click();
  await page.locator('#mirror-trigger').click();await page.locator('#mirror-wheel').evaluate(el=>el.scrollTo(0,28));await page.waitForTimeout(180);await page.locator('#mirror-trigger').click();
  await page.locator('#background-trigger').click();await page.locator('#background-wheel').evaluate(el=>el.scrollTo(0,28));await page.waitForTimeout(180);await page.locator('#background-trigger').click();
  await page.locator('#btn-fullscreen').click();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('fullscreen')),true);
  await page.screenshot({path:path.join(output,buddy?'player-buddy.png':'player-single.png')});
  await page.evaluate(()=>window.postMessage({type:'exit-fullscreen'},'*'));await page.waitForFunction(()=>!document.body.classList.contains('fullscreen'));
  await page.locator('#play').click();await page.waitForTimeout(100);await page.evaluate(()=>window.postMessage({type:'stop'},'*'));
  await page.waitForFunction(()=>document.querySelector('#play').getAttribute('aria-label')==='播放');
  assert.equal(await page.evaluate(()=>window.sources.every(s=>!s.started||s.stopped||s.ended)),true);
  assert.deepEqual(errors,[]);
  const messages=await page.evaluate(()=>window.messages);assert.equal(messages.some(m=>m.type==='error'),false);
  results.push({mode,buddy,errors,intro,paused,scheduledAnswersCanceled:oldIds.length,settings:messages.filter(m=>m.type==='settings'),stoppedAllSources:true});
  await page.close();
 }
 await fs.writeFile(path.join(output,'player-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
