// The music, heard by measurement: renders each mood (day, night, battle) offline in the browser, checks it is
// really playing (loud enough, never silent for long, never clipping, no broken samples), and saves each as a WAV
// recording in test-results/ to listen to. Needs no speakers.
// Usage: node Scripts/music_check.mjs [seconds]     (BROWSER=chrome|firefox|webkit to try another browser)
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {launch,NAME} from './browsers.mjs';
const seconds=Number(process.argv[2]??30);
const root=new URL('../',import.meta.url),out=new URL('test-results/',root);
await mkdir(out,{recursive:true});
const server=createServer(async(q,r)=>{
 if(q.url==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end('<!doctype html><title>music</title>');}
 if(/^\/Browser\/[\w.]+\.mjs$/.test(q.url)){try{const js=await readFile(new URL(q.url.slice(1),root));r.writeHead(200,{'Content-Type':'text/javascript'});return r.end(js);}catch{}}
 r.writeHead(404);r.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launch();
const failures=[];
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 console.log(`music in ${NAME}, ${seconds} s of each mood`);
 // Each mood at the default volume (half), recorded; then the loudest at full volume, which must not clip either.
 for(const [mood,volume,record] of [['day',.5,true],['night',.5,true],['battle',.5,true],['battle',1,false]]){
  const r=await page.evaluate(async([mood,seconds,volume])=>{
   const {Music}=await import('/Browser/music.mjs');
   const t0=performance.now(),buf=await Music.render(mood,seconds,volume),ms=performance.now()-t0;
   const ch=[buf.getChannelData(0),buf.getChannelData(1)],n=buf.length,rate=buf.sampleRate;
   let peak=0,sum=0,bad=0;const windows=[];
   for(let w=0;w<Math.floor(n/rate);w++){let s=0;for(let i=w*rate;i<(w+1)*rate;i++)for(const c of ch){const v=c[i];s+=v*v;}windows.push(10*Math.log10(s/(2*rate)+1e-12));}
   for(const c of ch)for(let i=0;i<n;i++){const v=c[i];if(!Number.isFinite(v)){bad++;continue;}const a=Math.abs(v);if(a>peak)peak=a;sum+=v*v;}
   // 16-bit stereo WAV, as base64.
   const bytes=new Uint8Array(44+n*4),dv=new DataView(bytes.buffer),str=(o,t)=>{for(let i=0;i<t.length;i++)bytes[o+i]=t.charCodeAt(i);};
   str(0,'RIFF');dv.setUint32(4,36+n*4,true);str(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,2,true);
   dv.setUint32(24,rate,true);dv.setUint32(28,rate*4,true);dv.setUint16(32,4,true);dv.setUint16(34,16,true);str(36,'data');dv.setUint32(40,n*4,true);
   for(let i=0;i<n;i++)for(let c=0;c<2;c++){const v=Math.max(-1,Math.min(1,ch[c][i]||0));dv.setInt16(44+i*4+c*2,v<0?v*32768:v*32767,true);}
   let bin='';for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode(...bytes.subarray(i,i+32768));
   return {wav:btoa(bin),peak,rms:10*Math.log10(sum/(2*n)+1e-12),windows,bad,ms,rate};
  },[mood,seconds,volume]);
  if(record)await writeFile(new URL(`music-${mood}.wav`,out),Buffer.from(r.wav,'base64'));
  const label=`${mood}${volume===1?' (full volume)':''}`;
  const quiet=r.windows.filter(db=>db<-55).length,peakDb=20*Math.log10(r.peak+1e-12);
  console.log(`${label.padEnd(20)} loudness ${r.rms.toFixed(1)} dBFS · peak ${peakDb.toFixed(1)} dBFS · quietest second ${Math.min(...r.windows).toFixed(1)} dBFS · loudest second ${Math.max(...r.windows).toFixed(1)} dBFS · rendered in ${(r.ms/1000).toFixed(1)} s${record?` → test-results/music-${mood}.wav`:''}`);
  // At the default volume, background music belongs roughly between -28 and -14 dBFS.
  if(r.bad)failures.push(`${label}: ${r.bad} broken samples (NaN or infinite)`);
  if(volume===.5&&r.rms<-28)failures.push(`${label}: too quiet (${r.rms.toFixed(1)} dBFS)`);
  if(volume===.5&&r.rms>-14)failures.push(`${label}: too loud (${r.rms.toFixed(1)} dBFS)`);
  if(r.peak>=.99)failures.push(`${label}: clips (peak ${r.peak.toFixed(3)})`);
  if(quiet>r.windows.length*.1)failures.push(`${label}: silent for ${quiet} of ${r.windows.length} seconds`);
 }
 if(errors.length)failures.push(...errors.map(e=>`browser error: ${e}`));
}finally{await browser.close();server.close();}
if(failures.length){console.log('FAILED:\n'+failures.map(f=>'  ✗ '+f).join('\n'));process.exitCode=1;}
else console.log(`PASS (${NAME}): the music plays in every mood, audible, never silent, never clipping.`);
