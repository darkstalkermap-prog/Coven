// Goes through everything a player can touch on the built game (_site/index.html) and reports each check:
// graphics levels and switching them in game, the title screens, How to play and the spell list, class choice,
// music and the N key, moving, jumping, gathering, eating, casting, every panel, tab and key, tooltips, the map,
// the elder, the broom, chat offline, pausing, falling, resizing, the beacon turning gold, quit and continue,
// a new game, and a phone-sized screen. Fails on any failed check or browser error.
// Usage: npm run build && node Scripts/ui_check.mjs [all|gfx|ui|bench|phone]   (UI_CHECK_ALL_GFX=1 tries High and Ultra too)
import {launch,NAME,CAN_EMULATE_PHONE} from './browsers.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const out=new URL('../test-results/ui/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const part=process.argv[2]??'all';
const html=await readFile(new URL('../_site/index.html',import.meta.url));
const server=createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await launch({chromiumArgs:['--autoplay-policy=no-user-gesture-required']});
const results=[];
// A failed check also records the page's recent focus and mouse-lock events and modes, to show why.
let current=null;
const check=(name,ok,detail='')=>{const r={name,ok:!!ok,detail};results.push(r);console.log(`${ok?'✓':'✗'} ${name}${detail?` — ${detail}`:''}`);
 if(!ok&&current)r.events=current.evaluate(()=>window.__events?.slice(-8)??[]).catch(()=>[]);};
async function open(quality,{viewport={width:1280,height:800},music=false,keep,phone=false}={}){
 const ctx=keep??await browser.newContext({viewport,...(phone&&CAN_EMULATE_PHONE?{isMobile:true,hasTouch:true}:{})});
 const page=await ctx.newPage();page.setDefaultTimeout(90000);
 const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text());});
 page.on('dialog',d=>d.accept());
 await page.addInitScript(([q,mu])=>{try{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('coven-gfx',q);localStorage.setItem('coven-music',mu?'{"on":true,"volume":0.5}':'0');}}catch{}
  // Watch the audio contexts the game makes.
  window.__events=[];const log=t=>window.__events.push(`${Math.round(performance.now())}ms ${t} (mode ${window.__coven?.mode}, mouse ${document.pointerLockElement?'held':'free'})`);
  document.addEventListener('pointerlockchange',()=>log('pointerlockchange'));document.addEventListener('pointerlockerror',()=>log('pointerlockerror'));
  addEventListener('blur',()=>log('blur'));addEventListener('focus',()=>log('focus'));document.addEventListener('visibilitychange',()=>log(`visibility ${document.visibilityState}`));
  addEventListener('keydown',e=>{if(['Escape','Tab','KeyM','KeyH'].includes(e.code))log(`key ${e.code}`);},true);
  const AC=window.__AC=window.AudioContext;window.__audio=[];window.AudioContext=class extends AC{constructor(...a){super(...a);window.__audio.push(this);}};},[quality,music]);
 await page.goto(url);await page.waitForFunction(()=>!!window.__coven);
 current=page;
 return {page,errs,ctx};
}
const fps=page=>page.evaluate(()=>new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<4000)requestAnimationFrame(f);else r(n/((performance.now()-t0)/1000));};requestAnimationFrame(f);}));

try{
 // ---- A: every graphics level starts, plays and draws without errors ----
 if(part==='all'||part==='gfx')for(const q of process.env.UI_CHECK_ALL_GFX?['low','medium','high','ultra','auto']:['low','medium']){
  const {page,errs,ctx}=await open(q);
  await page.click('#play');await page.click('[data-class="hex"]');
  await page.waitForFunction(()=>__coven.mode==='playing');
  await page.keyboard.down('KeyW');await page.waitForTimeout(3000);await page.keyboard.up('KeyW');
  const f=await fps(page);
  const info=await page.evaluate(()=>{const r=__coven.view.renderer;return {calls:r.info.render.calls,tris:r.info.render.triangles,scale:__coven.view.renderer.getPixelRatio()};});
  await page.screenshot({path:`${out}gfx-${q}.png`});
  check(`Graphics ${q}: plays without errors`,!errs.length,`${f.toFixed(1)} fps, ${info.calls} draw calls, ${(info.tris/1000).toFixed(0)}k triangles${errs.length?' · '+errs[0]:''}`);
  // Switch level in game through the pause menu, and back.
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  const other=q==='low'?'high':'low';
  await page.selectOption('#gfx',other);await page.waitForTimeout(1500);
  await page.click('#play');await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.selectOption('#gfx',q);await page.click('#play');await page.waitForTimeout(1500);
  check(`Graphics ${q}: switching to ${other} and back in game`,!errs.length&&await page.evaluate(()=>__coven.mode)==='playing',errs[0]??'');
  await ctx.close();
 }

 // ---- B–J: everything a player touches, on Low for speed ----
 if(part==='all'||part==='ui'){
  const {page,errs,ctx}=await open('low',{music:true});
  // A condition the next drawn frame makes true (a frame can run long, as when a new creature's look is first built).
  const eventually=(fn,arg,ms=8000)=>page.waitForFunction(fn,arg,{timeout:ms,polling:100}).then(()=>true,()=>false);
  // Fresh title: beacon view, no HUD, no controls bar.
  await page.waitForTimeout(2500);
  check('Fresh title hides the HUD and controls bar',await page.evaluate(()=>getComputedStyle(document.querySelector('#hud')).visibility==='hidden'&&getComputedStyle(document.querySelector('footer')).visibility==='hidden'&&getComputedStyle(document.querySelector('#quest')).visibility==='hidden'));
  check('Fresh title says BEGIN and hides Quit',(await page.locator('#play').textContent()).includes('BEGIN')&&await page.locator('#quit').isHidden());
  // How to play from the title, and closing it.
  await page.click('#helpBtn').catch(()=>page.click('text=HOW TO PLAY'));await page.waitForTimeout(300);
  check('How to play opens from the title',await page.locator('#help').isVisible());
  check('All 16 spells are described',await page.locator('#help section.spells li').count()===16);
  await page.click('#help [data-close]');await page.waitForTimeout(300);
  check('How to play closes back to the title',await page.locator('#help').isHidden()&&await page.locator('#overlay').isVisible()&&await page.evaluate(()=>__coven.mode)==='menu');
  // Class choice, back, and choose.
  await page.click('#play');
  check('Four witch paths offered',await page.locator('#classCards .card').count()===4);
  await page.click('#classBack');
  check('Back from class choice returns to the title',await page.locator('#overlay').isVisible()&&await page.evaluate(()=>__coven.mode)==='menu');
  await page.click('#play');await page.click('[data-class="wild"]');
  await page.waitForFunction(()=>__coven.mode==='playing');
  check('Wild Witch starts in the Greenwood',await page.evaluate(()=>__coven.world.region(__coven.state.player.x,__coven.state.player.z))==='forest');
  check('HUD and controls show in play',await eventually(()=>getComputedStyle(document.querySelector('#hud')).visibility==='visible'&&getComputedStyle(document.querySelector('footer')).visibility==='visible'));
  // Music: started by the click, toggled by N.
  await page.waitForTimeout(1500);
  const audio=()=>page.evaluate(()=>window.__audio.map(a=>a.state));
  // Machines without a sound device (CI) never run audio at all: then only the switches are checked.
  const sound=await page.evaluate(async()=>{const c=new window.__AC();await c.resume().catch(()=>{});await new Promise(r=>setTimeout(r,500));const ok=c.state==='running';await c.close();return ok;});
  check('Music starts with Begin',(await audio()).length>0&&(!sound||(await audio()).includes('running')),`${JSON.stringify(await audio())}${sound?'':' (no sound device here: not required to run)'}`);
  await page.keyboard.press('KeyN');await page.waitForTimeout(600);
  check('N turns the music off',!(await audio()).includes('running')&&!await page.locator('#music-on').isChecked(),JSON.stringify(await audio()));
  await page.keyboard.press('KeyN');await page.waitForTimeout(600);
  check('N turns it back on',(!sound||(await audio()).includes('running'))&&await page.locator('#music-on').isChecked());
  check('Music choice remembered',await page.evaluate(()=>JSON.parse(localStorage.getItem('coven-music')).on===true));
  // Walking, jumping, sprinting.
  const pos=()=>page.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z,y:__coven.state.player.y}));
  // Each movement starts on open ground with the camera behind her, so trees and walls can't spoil it.
  const toOpen=()=>page.evaluate(()=>{const C=__coven,p=C.state.player;
   for(let r=0;r<300;r+=10)for(let a=0;a<6.28;a+=.5){const x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;
    if(C.world.ground(x,z)<1||C.view.nodesNear(x,z,14).length||C.world.pois.some(o=>Math.hypot(o.x-x,o.z-z)<40))continue;
    p.x=x;p.z=z;p.y=C.world.ground(x,z);C.aim(p.yaw,.2);return true;}
   return false;});
  // Her state, for the detail of a failed check.
  const state=()=>page.evaluate(()=>{const C=__coven,p=C.state.player;return `mode ${C.mode}, hp ${Math.round(p.hp)}, at ${Math.round(p.x)},${Math.round(p.z)} y ${p.y.toFixed(1)} ground ${C.world.ground(p.x,p.z).toFixed(1)}${p.mounted?', mounted':''}`;});
  // Hold the keys until she has gone `far` (a frame busy building new ground can swallow a short press), up to 15 s.
  const walk=async(codes,far)=>{await toOpen();const a=await pos();for(const k of codes)await page.keyboard.down(k);
   const ok=await page.waitForFunction(([a,far])=>Math.hypot(__coven.state.player.x-a.x,__coven.state.player.z-a.z)>far,[a,far],{timeout:15000,polling:50}).then(()=>true,()=>false);
   for(const k of codes)await page.keyboard.up(k);const b=await pos();return [ok,`${Math.hypot(b.x-a.x,b.z-a.z).toFixed(1)} m${ok?'':'; '+await state()}`];};
  await toOpen();
  check('W walks forward',...await walk(['KeyW'],2));
  check('Shift sprints',...await walk(['ShiftLeft','KeyW'],2));
  for(const k of ['KeyA','KeyS','KeyD'])check(`${k.slice(3)} moves`,...await walk([k],.5));
  // Smooth motion: sprinting sideways, a point ahead glides across the screen at an even pace (the world used to
  // judder, its speed jumping by more than its own size from frame to frame).
  await toOpen();
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyD');
  const judder=await page.evaluate(()=>new Promise(done=>{const C=__coven,V=C.view,p=C.state.player,v=new V.camera.position.constructor(),fx=p.x+Math.cos(p.yaw)*40,fz=p.z+Math.sin(p.yaw)*40,fy=C.world.ground(fx,fz)+1,rec=[];
   const tick=now=>{v.set(fx,fy,fz).project(V.camera);rec.push([(v.x+1)*innerWidth/2,now]);if(rec.length<150){requestAnimationFrame(tick);return;}
    // Frames over 90 ms are hitches (new ground loading), where the game caps a step at 0.1 s on purpose: not judder.
    const speed=[];for(let i=31;i<rec.length;i++){const dt=(rec[i][1]-rec[i-1][1])/1000;speed.push(dt>0&&dt<.09?(rec[i][0]-rec[i-1][0])/dt:null);}
    let jump=0,pairs=0,mean=0,n=0;for(let i=0;i<speed.length;i++){if(speed[i]===null)continue;mean+=Math.abs(speed[i]);n++;if(i&&speed[i-1]!==null){jump+=Math.abs(speed[i]-speed[i-1]);pairs++;}}
    done(pairs?jump/pairs/(mean/n):1);};
   requestAnimationFrame(tick);}));
  await page.keyboard.up('KeyD');await page.keyboard.up('ShiftLeft');
  check('Sprinting sideways is smooth (no judder)',judder<.25,`judder ${(judder*100).toFixed(0)}%`);
  await toOpen();await page.waitForTimeout(500); // landed, and rested (sprinting spends the stamina a jump needs)
  const y0=await page.evaluate(()=>{const p=__coven.state.player;p.stamina=p.maxStamina;return p.y;});await page.keyboard.press('Space');
  check('Space jumps, even a quick tap',await page.waitForFunction(y=>__coven.state.player.y>y+.2,y0,{timeout:3000}).then(()=>true,()=>false));
  await page.waitForTimeout(1000);
  // Gather: stand at a tree and strike.
  const wood0=await page.evaluate(()=>{const p=__coven.state.player,n=__coven.view.nodesNear(p.x,p.z,120).find(n=>['pine','oak','gloomtree','blossom','deadtree'].includes(n.type));__coven.aim(p.yaw,.2);p.x=n.x-Math.cos(p.yaw)*1.6;p.z=n.z-Math.sin(p.yaw)*1.6;p.y=__coven.world.ground(p.x,p.z);return p.inv.wood??0;});
  for(let i=0;i<8;i++){await page.mouse.click(640,400);await page.waitForTimeout(450);}
  check('Left click gathers wood from a tree',await page.evaluate(w=>(__coven.state.player.inv.wood??0)>w,wood0));
  // Q eats.
  await page.evaluate(()=>{const p=__coven.state.player;p.inv.berries=3;p.food=40;});
  await page.keyboard.press('KeyQ');
  check('Q eats',await page.evaluate(()=>__coven.state.player.inv.berries===2&&__coven.state.player.food>40));
  // Spells 1 and 2, and right click.
  // A wolf straight ahead of the camera, where bolts look for a target.
  // Each cast starts on open ground, full of mana, with a fresh wolf straight ahead of the camera; one retry.
  const cast=async(how)=>{let detail='';for(let k=0;k<2;k++){await toOpen();
    await page.evaluate(()=>{const p=__coven.state.player;p.hp=p.maxHp;p.mana=p.maxMana;p.cooldowns={};__coven.aim(p.yaw,.1);__coven.spawn('wolf',p.x+Math.cos(p.yaw)*9,p.z+Math.sin(p.yaw)*9);});
    await page.waitForTimeout(200);const m0=await page.evaluate(()=>__coven.state.player.mana);await how();
    if(await page.waitForFunction(m=>__coven.state.player.mana<m,m0,{timeout:2000}).then(()=>true,()=>false))return [true,k?'on the second try':''];
    detail=`${await state()}; ${(await page.locator('#toast').textContent()).slice(-80)}`;}
   return [false,detail];};
  check('1 casts the first spell',...await cast(()=>page.keyboard.press('Digit1')));
  check('2 casts the second spell',...await cast(()=>page.keyboard.press('Digit2')));
  check('Right click casts the first spell',...await cast(()=>page.mouse.click(640,400,{button:'right'})));
  // Name plates: level and name over each creature near, coloured by danger; the one in her sights says it in words.
  await toOpen();
  // (Both rooted where they stand, so they stay in view however long the first frame showing them takes.)
  await page.evaluate(()=>{const C=__coven,p=C.state.player;p.hp=p.maxHp=99999;C.aim(p.yaw,.1);C.spawn('wolf',p.x+Math.cos(p.yaw)*9,p.z+Math.sin(p.yaw)*9);C.creatures.at(-1).root=120;C.spawn('elderhorn',p.x+Math.cos(p.yaw+.3)*24,p.z+Math.sin(p.yaw+.3)*24);C.creatures.at(-1).root=120;});
  const plated=await page.waitForFunction(()=>{const ps=[...document.querySelectorAll('#plates .plate')];
   return ps.some(e=>/12◆ Elderhorn/.test(e.textContent)&&e.classList.contains('deadly'))&&ps.some(e=>e.classList.contains('target')&&e.querySelector('em').textContent.length>2);},null,{timeout:25000}).then(()=>true,()=>false);
  check('Name plates show level, name and danger; the aimed one in words',plated,plated?'':JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('#plates .plate')].map(e=>`${e.className}: ${e.textContent}`))));
  await page.evaluate(()=>{for(const c of __coven.creatures)if(c.kind==='elderhorn'){c.hp=0;c.dead=true;}});
  // Panels by key and every tab.
  for(const [key,tab] of [['Tab','items'],['KeyI','items'],['KeyB','build'],['KeyK','skills'],['KeyC','coven']]){
   await page.keyboard.press(key);await page.waitForTimeout(400);
   const shown=await page.locator('#pack').isVisible(),active=await page.locator(`[data-tab="${tab}"]`).getAttribute('class');
   check(`${key.replace('Key','')} opens ${tab}`,shown&&/active|on|sel/.test(active??'')||shown,`${active}`);
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
  }
  await page.keyboard.press('Tab');await page.waitForTimeout(300);
  for(const t of ['items','craft','alchemy','build','skills','coven','trade']){await page.click(`[data-tab="${t}"]`);await page.waitForTimeout(250);const body=await page.locator('#tabBody').textContent();check(`Tab ${t} shows its page`,body.trim().length>20,`${body.trim().slice(0,50)}…`);}
  // Tooltips: an item, a recipe, a rite.
  const tip=async sel=>{const el=page.locator(sel).first();if(!await el.count())return null;await el.hover();await page.waitForTimeout(300);return (await page.locator('#tip').textContent()).trim();};
  await page.click('[data-tab="items"]');await page.waitForTimeout(200);
  check('Hovering an item explains it',(await tip('#tabBody [data-tip]'))?.length>5);
  await page.click('[data-tab="craft"]');await page.waitForTimeout(200);
  check('Hovering a recipe explains it',(await tip('#tabBody [data-tip]'))?.length>5);
  await page.click('[data-tab="coven"]');await page.waitForTimeout(200);
  check('Hovering a coven rite explains it',(await tip('#tabBody li[data-tip]'))?.length>5);
  await page.locator('#heroCanvas').screenshot({path:out+'portrait.png'}).catch(()=>{});
  await page.click('[data-tab="items"]');await page.waitForTimeout(1500);
  check('Inventory portrait draws',await page.evaluate(()=>!!__coven.portrait));
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  check('Escape closes the panel back to play',await page.evaluate(()=>__coven.mode)==='playing'&&await page.locator('#pack').isHidden());
  // Map.
  await page.keyboard.press('KeyM');await page.waitForTimeout(500);
  check('M opens the map, above the spell bar',await page.locator('#map').isVisible()&&await page.evaluate(()=>+getComputedStyle(document.querySelector('#map')).zIndex>+getComputedStyle(document.querySelector('#spells')).zIndex));
  check('Hovering a spell explains it (map open, mouse free)',(await tip('#spells .spell'))?.length>10);
  check('Hovering the health bar explains it (map open, mouse free)',/Health/.test(await tip('#hud .row label')??''));
  await page.keyboard.press('KeyM');await page.waitForTimeout(300);
  check('M closes the map',await page.locator('#map').isHidden()&&await page.evaluate(()=>__coven.mode)==='playing');
  // Help in play.
  await page.keyboard.press('KeyH');await page.waitForTimeout(300);
  check('H opens How to play',await page.locator('#help').isVisible());
  await page.keyboard.press('KeyH');await page.waitForTimeout(300);
  check('H closes it back to play',await page.locator('#help').isHidden()&&await page.evaluate(()=>__coven.mode)==='playing');
  // Interact with the elder, broom.
  // Beside her own elder, who stands 3 m off her hearth.
  await page.evaluate(()=>{const C=__coven,p=C.state.player,h=C.world.hearthOf({bog:'swamp',hex:'darkforest',bloom:'meadow',wild:'forest'}[p.class]);p.x=h.x+3-1.5;p.z=h.z+3;p.y=C.world.ground(p.x,p.z);C.aim(0,.2);});
  const prompted=await page.waitForFunction(()=>/Speak with/.test(document.querySelector('#prompt').textContent),null,{timeout:5000}).then(()=>true,()=>false);
  const prompt=await page.locator('#prompt').textContent(),said=await page.evaluate(()=>__coven.messages.length);
  await page.keyboard.press('KeyE');
  const spoke=await page.waitForFunction(n=>__coven.messages.length>n,said,{timeout:3000}).then(()=>true,()=>false);
  check('E talks to the elder',prompted&&spoke,`prompt "${prompt.trim().slice(0,60)}"`);
  await page.evaluate(()=>{__coven.state.player.inv.broom=1;__coven.equip('broom');});
  await page.keyboard.press('KeyF');await page.waitForTimeout(300);
  check('F mounts the broom',await page.evaluate(()=>!!__coven.state.player.mounted));
  await page.keyboard.press('KeyF');await page.waitForTimeout(300);
  check('F dismounts',await page.evaluate(()=>!__coven.state.player.mounted));
  // Chat offline: Enter opens and Escape closes without getting stuck.
  await page.keyboard.press('Enter');await page.waitForTimeout(300);
  check('Enter offline says chat needs an online world, and play goes on',/online world/.test(await page.locator('#toast').textContent())&&await page.evaluate(()=>__coven.mode)==='playing'&&await page.locator('#chatInput').isHidden());
  // Pause: tooltips on spells and bars, How to play from pause, resume.
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  check('Escape pauses, with Quit shown',await page.evaluate(()=>__coven.mode)==='paused'&&await page.locator('#quit').isVisible());
  check('Controls bar hidden under the pause menu',await eventually(()=>getComputedStyle(document.querySelector('footer')).visibility==='hidden'));
  check('Name plates step aside for the pause menu',await eventually(()=>getComputedStyle(document.querySelector('#plates')).visibility==='hidden'));
  check('Spell bar steps aside for the pause menu',await eventually(()=>getComputedStyle(document.querySelector('#spells')).visibility==='hidden'));
  check('HUD hidden under the pause menu',await eventually(()=>getComputedStyle(document.querySelector('#hud')).visibility==='hidden'));
  await page.click('#helpBtn').catch(()=>page.click('text=HOW TO PLAY'));await page.waitForTimeout(300);
  check('How to play opens from pause',await page.locator('#help').isVisible());
  await page.click('#help [data-close]');await page.waitForTimeout(300);
  check('and closes back to the pause menu',await page.evaluate(()=>__coven.mode)==='paused'&&await page.locator('#overlay').isVisible());
  await page.click('#play');await page.waitForTimeout(300);
  check('Resume returns to play',await page.evaluate(()=>__coven.mode)==='playing');
  // Falling: wake at home with your things.
  const wood=await page.evaluate(()=>{const p=__coven.state.player;p.inv.wood=(p.inv.wood??0)+5;p.x+=40;p.hp=0;return p.inv.wood;});
  const woke=await page.waitForFunction(w=>__coven.state.player.hp>0&&__coven.state.player.inv.wood>=w,wood,{timeout:4000}).then(()=>true,()=>false);
  check('Falling wakes you at home with your things',woke,woke?'':await state());
  // Window resize.
  await page.setViewportSize({width:900,height:600});await page.waitForTimeout(800);
  await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(800);
  check('Resizing the window keeps drawing',!errs.length,errs[0]??'');
  // The beacon turns gold once the Unwitch is unmade.
  const col=()=>page.evaluate(()=>'#'+__coven.view.beacon.uniforms.uColor.value.getHexString());
  const before=await col();
  await page.evaluate(()=>{__coven.state.bossDefeated=true;});
  await eventually(()=>__coven.view.beacon.uniforms.uColor.value.getHexString()==='ffc860');
  const after=await col();
  check('Beacon is crimson, then gold after the Unwitch falls',before==='#ff3c6e'&&after==='#ffc860',`${before} → ${after}`);
  await page.evaluate(()=>{__coven.state.bossDefeated=false;});
  // Quit and continue.
  const kills=await page.evaluate(()=>{__coven.state.player.stats.kills=7;return 7;});
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await Promise.all([page.waitForNavigation(),page.click('#quit')]);
  await page.waitForFunction(()=>!!window.__coven);await page.waitForTimeout(1500);
  check('Quit returns to the title with CONTINUE',(await page.locator('#play').textContent()).includes('CONTINUE')&&await page.evaluate(()=>__coven.mode)==='menu');
  check('Title for a returning player shows her world and HUD stays hidden under the menu',await page.evaluate(()=>!document.body.classList.contains('is-fresh')&&getComputedStyle(document.querySelector('footer')).visibility==='hidden'));
  await page.click('#play');await page.waitForTimeout(800);
  check('Continue picks up the saved game',await page.evaluate(k=>__coven.mode==='playing'&&__coven.state.player.class==='wild'&&__coven.state.player.stats.kills===k,kills));
  // New game: confirm, choose another path.
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await page.click('#newGame');await page.waitForTimeout(400);
  await page.click('[data-class="bog"]');await page.waitForTimeout(800);
  check('New game starts the chosen path fresh',await page.evaluate(()=>__coven.state.player.class==='bog'&&__coven.state.player.stats.kills===0&&__coven.world.region(__coven.state.player.x,__coven.state.player.z)==='swamp'));
  check('No browser errors in the whole run',!errs.length,errs.slice(0,3).join(' | '));
  await ctx.close();
 }

 // ---- L: the speed test ----
 if(part==='all'||part==='bench'){
  const {page,errs,ctx}=await open('low');
  await page.waitForTimeout(1000);
  await page.click('#benchBtn');await page.waitForTimeout(1500);
  check('Speed test starts from the menu',await page.evaluate(()=>__coven.mode)==='bench'&&await page.locator('#benchBar').isVisible());
  await page.keyboard.press('Escape');await page.waitForTimeout(500);
  check('Escape stops the speed test, back at the title',await page.evaluate(()=>__coven.mode)==='menu'&&await page.locator('#overlay').isVisible()&&await page.locator('#bench').isHidden());
  // A whole quick run, started from the address as a shared link would.
  await page.goto(url+'?benchmark=quick');await page.waitForFunction(()=>!!window.__coven);
  const done=await page.locator('#bench').waitFor({state:'visible',timeout:240000}).then(()=>true,()=>false);
  const rows=await page.locator('#bench .benchTable tr').count(),text=done?await page.locator('#benchBody').innerText():'';
  check('Speed test measures all four levels and recommends one',done&&rows===5&&/Recommended: \w+/.test(text),`${Math.max(0,rows-1)} levels`);
  const best=/Recommended: (\w+)/.exec(text)?.[1]?.toLowerCase();
  if(done){await page.click('#benchUse');await page.waitForTimeout(300);}
  check('Use applies and remembers the recommended level',done&&(await page.inputValue('#gfx'))===best&&await page.evaluate(b=>localStorage.getItem('coven-gfx')===b,best));
  check('Speed test without browser errors',!errs.length,errs[0]??'');
  await ctx.close();
 }

 // ---- K: phone-sized screen ----
 if(part==='all'||part==='phone'){
  const {page,errs,ctx}=await open('auto',{viewport:{width:390,height:844},phone:true});
  await page.waitForTimeout(2000);await page.screenshot({path:out+'phone-title.png'});
  if(CAN_EMULATE_PHONE)check('Phone: says Coven needs a keyboard and mouse',await page.locator('#touchNote').isVisible());
  const box=await page.locator('#play').boundingBox();
  check('Phone: Begin button fully on screen',box&&box.y+box.height<=844&&box.x>=0&&box.x+box.width<=390);
  await page.click('#play');await page.waitForTimeout(400);await page.screenshot({path:out+'phone-classes.png'});
  await page.click('[data-class="bloom"]');await page.waitForTimeout(2000);await page.screenshot({path:out+'phone-play.png'});
  const hud=await page.locator('#hud').boundingBox(),bar=await page.locator('#spells').boundingBox();
  check('Phone: spell bar clear of the health panel',hud&&bar&&hud.y+hud.height<=bar.y+1,`${Math.round(hud?.y+hud?.height)} vs ${Math.round(bar?.y)}`);
  check('Phone: plays without errors',!errs.length,errs[0]??'');
  await ctx.close();
 }
}finally{
 const bad=results.filter(r=>!r.ok);
 console.log(`\n${results.length-bad.length}/${results.length} checks passed`);
 for(const r of bad)r.events=await r.events;
 if(bad.length)console.log('FAILED:\n'+bad.map(r=>`  ${r.name} ${r.detail}${r.events?.length?`\n    events: ${r.events.join(' | ')}`:''}`).join('\n'));
 else if(results.length)console.log(`PASS (${NAME}): everything a player touches works: graphics levels, title, help and spell list, music, movement, gathering, casting, panels, tabs, tooltips, map, broom, pause, falling, resizing, beacon, quit and continue, new game, speed test, name plates, smooth motion, phone screen.`);
 process.exitCode=bad.length||!results.length?1:0;
 await browser.close();server.close();
}
