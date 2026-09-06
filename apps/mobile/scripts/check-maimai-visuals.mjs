import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'build/maimai-visual-check');
await fs.mkdir(output, { recursive: true });
const audit = path.join(root, 'build/maimai-skin-audit');
const manifest = JSON.parse(await fs.readFile(path.join(audit, 'manifest.json'), 'utf8'));
const images = Object.fromEntries(await Promise.all(manifest.map(async a => [a.path, `data:image/png;base64,${(await fs.readFile(path.join(audit, a.path))).toString('base64')}`])));
images['sensor.webp'] = `data:image/webp;base64,${(await fs.readFile(path.join(root, 'assets/maimai-chart-preview/sensor.webp'))).toString('base64')}`;
const source = `
import { parseSimaiBody } from './src/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { MainRenderer } from './src/features/maimai-chart-preview/engine/renderers/MainRenderer';
import { ChartPreviewSkin } from './src/features/maimai-chart-preview/engine/renderers/skinAtlas';
const skin = new ChartPreviewSkin();
const samples = {
 tap: '(120){4}1/2,3b/7,4x/8,5m/6bx,',
 hold: '(120){4}1hx[4:4]/5h[4:2],3hbx[4:2],7hm[4:2],',
 touch: '(120){4}Ch[4:4]/A1/A3, B2f/B6, D4/E8, A1/A1/A1,',
 slide: '(120){4}1-5[4:2]/3p7[4:2],5V71[4:2],7q3[4:2],',
 wifi: '(120){4}1w5[4:2],5w1b[4:2],',
 chain: '(120){4}1-5[4:1]-8[4:2]*p4[4:3],2CK6[4:3],',
 scroll: '(120){4}<SV*0>1h[4:4],<SV*-1>2/6,<SV*2>3c/7c,<HS*0.5>4/8,',
};
await skin.load();
const canvas = document.querySelector('canvas')!;
const renderer = new MainRenderer(canvas, { skin }); renderer.resizeToSize(540); renderer.setHighlightExNotes(true);
const charts = Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,parseSimaiBody(v)]));
window.visual = {
 samples: Object.keys(samples),
 render(name,time,mirror='none') { renderer.setMirrorMode(mirror); renderer.renderAtTime(charts[name],time); return renderer.frameOverlay; },
 settings(body,time) {
  renderer.setBackgroundImage(null); renderer.setBackgroundVideo(null); renderer.resizeToSize(540);
  renderer.setPinkSlideStart(true); renderer.setJudgeHint('unified'); renderer.setMirrorMode('none');
  renderer.renderAtTime(parseSimaiBody('(120)'+body+','),time);
 },
 async background(width,height,size,videoMode) {
  const media=document.createElement('canvas');media.width=width;media.height=height;
  const context=media.getContext('2d')!;context.fillStyle='#ffffff';context.fillRect(0,0,width,height);
  const image=new Image();image.src=media.toDataURL();await image.decode();
  const video=document.createElement('video');video.muted=true;video.playsInline=true;
  let stream: MediaStream | undefined, pump: ReturnType<typeof setInterval> | undefined;
  try {
   renderer.setBackgroundVideo(null);renderer.setBackgroundImage(image);renderer.resizeToSize(size);renderer.clear();
   const read=()=>{
    const ctx=canvas.getContext('2d')!,s=canvas.width;
    return [[.5,.5],[.1,.1],[.5,.05],[.05,.5]].map(([x,y])=>Array.from(ctx.getImageData(Math.floor(s*x),Math.floor(s*y),1,1).data));
   };
   const imagePixels=read();
   if(videoMode) {
    stream=media.captureStream(0);video.srcObject=stream;
    const track=stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    pump=setInterval(()=>{context.fillRect(0,0,width,height);track.requestFrame();},30);
    let playTimeout: ReturnType<typeof setTimeout> | undefined;
    try {await Promise.race([video.play(),new Promise((_,reject)=>{playTimeout=setTimeout(()=>reject(new Error('Video playback timeout')),5000);})]);}
    finally {clearTimeout(playTimeout);}
    await new Promise<void>((resolve,reject)=>{
     const timeout=setTimeout(()=>reject(new Error('Video frame timeout')),3000);
     video.requestVideoFrameCallback(()=>{clearTimeout(timeout);resolve();});
     context.fillRect(0,0,width,height);
    });
    renderer.setBackgroundVideo(video);renderer.clear();
   }
   return {imagePixels,pixels:read(),width:canvas.width,height:canvas.height};
  } finally {clearInterval(pump);video.pause();stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;renderer.setBackgroundVideo(null);}
 },
 async playback(name) {
  const start=performance.now(); let frames=0;
  await new Promise(resolve=>{ const tick=()=>{const elapsed=performance.now()-start; renderer.renderAtTime(charts[name],1500+elapsed); frames++;if(elapsed<3000)requestAnimationFrame(tick);else resolve(null);};requestAnimationFrame(tick); });
  return {frames,elapsed:performance.now()-start};
 }
};
window.ready=true;
`;
const bundled = await build({ stdin: { contents: source, loader: 'ts', resolveDir: root }, bundle: true, write: false, format: 'esm', target: 'es2022' });
await fs.writeFile(path.join(output, 'harness.js'), bundled.outputFiles[0].contents);
await fs.writeFile(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#181b22;color:white;font:16px sans-serif}canvas{display:block}</style><canvas></canvas><script>window.__MAIMAI_CHART_PREVIEW_SKINS__=${JSON.stringify(images)}</script><script type="module">${bundled.outputFiles[0].text}</script>`);
const modulePath = process.argv[2];
const playwright = modulePath ? await import(pathToFileURL(path.resolve(modulePath)).href) : await import('playwright');
const { chromium } = playwright.default ?? playwright;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 540, height: 540 }, deviceScaleFactor: 1 });
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(path.join(output,'index.html')).href);
 await page.waitForFunction(()=>window.ready===true);
 const samples=await page.evaluate(()=>window.visual.samples), results=[];
 for(const sample of samples) for(const time of [1450,1850,2000,2250,2750,3250]) {
   const stats=await page.evaluate(([name,time])=>window.visual.render(name,time),[sample,time]);
   const name=sample+'-'+time+'.png';await page.screenshot({path:path.join(output,name)});results.push({sample,time,name,stats});
 }
 const playback=await page.evaluate(()=>window.visual.playback('chain'));
 const settings=[];
 for(const [name,body,time] of [
  ['pink-single','1x-5[4:2]',1850],['pink-double','1x-5[4:2]*-7[4:2]',1850],
  ['pink-moving','1-5[4:2]',2750],['pink-wifi','1w5[4:2]',2750],
  ['special-stars','1b-5[4:2]/3-7[4:2]/5m-1[4:2]',1850],
  ['just','1-5[4:1]',3100],['just-curve','1<5[4:1]',3100],['just-wifi','1w5[4:1]b',3100],
  ['gold-hold','1h[4:2]/3hb[4:2]/Ch[4:2]',2250],
 ]) {
  await page.evaluate(([body,time])=>window.visual.settings(body,time),[body,time]);
  const file='settings-'+name+'.png';await page.screenshot({path:path.join(output,file)});settings.push(file);
 }
 const backgrounds=[];
 for(const [width,height] of [[1600,900],[900,1600],[800,800]]) for(const size of [320,540]) for(const video of [false,true]) {
  const result=await page.evaluate(args=>window.visual.background(...args),[width,height,size,video]);
  const expected=[140,0,height<width?0:140,width<height?0:140];
  result.pixels.forEach((pixel,i)=>{for(let c=0;c<3;c++)assert.ok(Math.abs(pixel[c]-expected[i])<=3);assert.equal(pixel[3],255);});
  result.pixels.forEach((pixel,i)=>pixel.forEach((value,c)=>assert.ok(Math.abs(value-result.imagePixels[i][c])<=3)));
  const file='background-'+width+'x'+height+'-'+size+'-'+(video?'video':'image')+'.png';
  await page.screenshot({path:path.join(output,file)});backgrounds.push({width,height,size,video,file,...result});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({errors,playback,frames:results,settings,backgrounds},null,2));
 console.log(JSON.stringify({output,frames:results.length,settings:settings.length,backgrounds:backgrounds.length,playback,errors}));
} finally { await browser.close(); }
