// Four witches in one world on the real server, together for a while: walking, fighting and casting side by
// side. Measures what each one sees (frame time, how smoothly and how accurately the other three move on her
// screen), the network traffic per player and the server's work, and fails on any browser error or desync.
// Usage: node Scripts/four_player_sim.mjs [seconds] [quality]
import {launch,NAME} from './browsers.mjs';
import {spawn,execSync} from 'node:child_process';
const [seconds='40',quality='low']=process.argv.slice(2);
const server=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=/http:\/\/localhost:(\d+)/.exec(String(d));if(m)resolve(`http://127.0.0.1:${m[1]}`);});server.on('exit',()=>reject(new Error('server exited')));});
const cpu=()=>{try{return Number(execSync(`ps -o cputime= -p ${server.pid}`).toString().trim().split(':').reduce((a,b)=>a*60+Number(b),0));}catch{return 0;}};
let browser;
const errors=[];
try{
 browser=await launch();
 const join=async(name,cls)=>{
  const page=await (await browser.newContext({viewport:{width:640,height:400}})).newPage();
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errors.push(`${name}: ${m.text()}`);});
  await page.addInitScript(q=>{try{localStorage.setItem('coven-gfx',q);localStorage.setItem('coven-music','0');}catch{}
   // Count every byte and message on the game's WebSocket.
   const net=window.__traffic={sent:0,recv:0,sentMsgs:0,recvMsgs:0};const send=WebSocket.prototype.send;
   WebSocket.prototype.send=function(d){net.sent+=d.length??d.byteLength??0;net.sentMsgs++;return send.call(this,d);};
   const add=EventTarget.prototype.addEventListener;
   WebSocket.prototype.addEventListener=function(t,f,o){if(t==='message'){const g=f;f=e=>{net.recv+=e.data.length??e.data.byteLength??0;net.recvMsgs++;return g(e);};}return add.call(this,t,f,o);};
   Object.defineProperty(WebSocket.prototype,'onmessage',{set(f){this.addEventListener('message',f);}});},quality);
  await page.goto(origin+'/');await page.waitForFunction(()=>!!window.__coven);
  await page.check('#mp-enabled');await page.check('input[name="mp-mode"][value="server"]');
  await page.fill('#mp-name',name);await page.fill('#mp-coven','Fourfold');await page.fill('#mp-world','sim');
  await page.click('#play');await page.click(`[data-class="${cls}"]`);
  await page.waitForFunction(()=>__coven.net.online,null,{timeout:60000});
  return page;
 };
 const names=[['Agnes','hex'],['Bryony','wild'],['Clover','bloom'],['Dagny','bog']];
 const pages=[];for(const [n,c] of names)pages.push(await join(n,c));
 for(const p of pages)await p.waitForFunction(()=>__coven.remotes.size===3,null,{timeout:60000});
 // Gather at the meadow hearth in a square, then let each walk her own circle round the middle.
 const centre=await pages[0].evaluate(()=>{const h=__coven.world.hearthOf('meadow');return {x:h.x+20,z:h.z+20};});
 await Promise.all(pages.map((p,i)=>p.evaluate(([c,i])=>{const C=__coven,s=C.state,pl=s.player,a=i*Math.PI/2;pl.x=c.x+Math.cos(a)*6;pl.z=c.z+Math.sin(a)*6;pl.y=C.world.ground(pl.x,pl.z);pl.hp=pl.maxHp=5000;s.dayTime=.4;
  // A few beasts to fight together.
  if(i===0)for(let k=0;k<4;k++)C.spawn('wolf',c.x+Math.cos(k)*25,c.z+Math.sin(k)*25);
  // The driver: walk a circle, cast at whatever is near, and record every frame.
  const rec=window.__rec={frames:[],jumps:[],last:new Map()};let t0=performance.now(),lastT=t0;
  const keyDown=code=>dispatchEvent(new KeyboardEvent('keydown',{code})),keyUp=code=>dispatchEvent(new KeyboardEvent('keyup',{code}));
  keyDown('KeyW');
  const tick=now=>{const dt=now-lastT;lastT=now;rec.frames.push(dt);
   const ang=(now-t0)/1000*.35+i*Math.PI/2;C.aim(ang+Math.PI/2,.3);
   // How far each other witch's figure moved on screen this frame: big jumps are glitches.
   // (after a few seconds, once everyone has gathered)
   for(const [id,m] of C.view.entities.get('remotes')??[]){const prev=rec.last.get(id);if(prev&&dt<200&&now-t0>4000)rec.jumps.push(Math.hypot(m.position.x-prev.x,m.position.z-prev.z));rec.last.set(id,{x:m.position.x,z:m.position.z});}
   if(Math.random()<.02)dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1'}));
   requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
 },[centre,i])));
 const cpu0=cpu(),wall0=Date.now();
 const t0=await Promise.all(pages.map(p=>p.evaluate(()=>({...window.__traffic}))));
 // Halfway, compare where each witch really is with where the others draw her.
 await new Promise(r=>setTimeout(r,Number(seconds)*500));
 const truth=await Promise.all(pages.map(p=>p.evaluate(()=>({id:__coven.net.id,x:__coven.state.player.x,z:__coven.state.player.z,t:performance.now()}))));
 const seen=await Promise.all(pages.map(p=>p.evaluate(()=>[...__coven.remotes.values()].map(r=>({id:r.id,x:r.x,z:r.z})))));
 await new Promise(r=>setTimeout(r,Number(seconds)*500));
 const wall=(Date.now()-wall0)/1000,cpuUsed=cpu()-cpu0;
 const t1=await Promise.all(pages.map(p=>p.evaluate(()=>({...window.__traffic}))));
 // Moves over 50 m in a frame are deliberate snaps (a witch who fell and woke at home), counted apart.
 const stats=await Promise.all(pages.map(p=>p.evaluate(()=>{const f=[...window.__rec.frames].sort((a,b)=>a-b),all=window.__rec.jumps,j=all.filter(d=>d<50).sort((a,b)=>a-b);
  return {frames:f.length,avg:f.reduce((a,b)=>a+b,0)/f.length,p95:f[Math.floor(f.length*.95)],jumpP99:j[Math.floor(j.length*.99)]??0,jumpMax:j.at(-1)??0,snaps:all.length-j.length,remotes:__coven.remotes.size,creatures:__coven.creatures.length,online:__coven.net.online};})));
 const errorOf=seen.map((list,i)=>list.map(r=>{const real=truth.find(t=>t.id===r.id);return real?Math.hypot(real.x-r.x,real.z-r.z):NaN;}));
 console.log(`four players in ${NAME}, ${wall.toFixed(0)} s, ${quality} graphics (all four browsers share one CPU, so frame times are pessimistic)`);
 names.forEach(([n],i)=>{const s=stats[i],up=(t1[i].sent-t0[i].sent)/wall,down=(t1[i].recv-t0[i].recv)/wall;
  console.log(`${n.padEnd(7)} ${(1000/s.avg).toFixed(1)} fps (p95 ${s.p95.toFixed(0)} ms) · sees ${s.remotes} others · up ${(up/1024).toFixed(1)} KB/s ${((t1[i].sentMsgs-t0[i].sentMsgs)/wall).toFixed(1)} msg/s · down ${(down/1024).toFixed(1)} KB/s ${((t1[i].recvMsgs-t0[i].recvMsgs)/wall).toFixed(1)} msg/s · others drawn ${Math.max(...errorOf[i]).toFixed(2)} m from where they are · per-frame move p99 ${s.jumpP99.toFixed(2)} m, max ${s.jumpMax.toFixed(2)} m${s.snaps?` (+${s.snaps} teleport snap)`:''}`);});
 console.log(`server CPU ${(cpuUsed/wall*100).toFixed(1)}% of one core`);
 const bad=stats.some(s=>s.remotes!==3||!s.online)||errors.length||errorOf.flat().some(e=>!(e<6))||stats.some(s=>s.jumpMax>Math.max(4,s.p95/1000*30));
 if(errors.length)console.log('errors:\n'+errors.slice(0,10).join('\n'));
 console.log(bad?'FAIL':`PASS (${NAME}): four players stay in sync, smooth and error-free`);
 process.exitCode=bad?1:0;
}finally{await browser?.close();server.kill();}
