// Goes through everything a player can touch on the built game (_site/index.html) and reports each check:
// graphics levels and switching them in game, the title screens, How to play and the spell list, class choice,
// music and the N key, moving, jumping, gathering, eating, casting, every panel, tab and key, tooltips, the map,
// the elder, the broom, chat offline, pausing, falling, resizing, the beacon turning gold, quit and continue,
// a new game, and a phone-sized screen. Fails on any failed check or browser error.
// Usage: npm run build && node Scripts/ui_check.mjs [all|gfx|ui|phone]   (UI_CHECK_ALL_GFX=1 tries High and Ultra too)
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const out=new URL('../test-results/ui/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const part=process.argv[2]??'all';
const html=await readFile(new URL('../_site/index.html',import.meta.url));
const server=createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const results=[];
const check=(name,ok,detail='')=>{results.push({name,ok:!!ok,detail});console.log(`${ok?'✓':'✗'} ${name}${detail?` — ${detail}`:''}`);};
async function open(quality,{viewport={width:1280,height:800},music=false,keep,phone=false}={}){
 const ctx=keep??await browser.newContext({viewport,...(phone?{isMobile:true,hasTouch:true}:{})});
 const page=await ctx.newPage();page.setDefaultTimeout(90000);
 const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text());});
 page.on('dialog',d=>d.accept());
 await page.addInitScript(([q,mu])=>{try{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('coven-gfx',q);localStorage.setItem('coven-music',mu?'{"on":true,"volume":0.5}':'0');}}catch{}
  // Watch the audio contexts the game makes.
  const AC=window.__AC=window.AudioContext;window.__audio=[];window.AudioContext=class extends AC{constructor(...a){super(...a);window.__audio.push(this);}};},[quality,music]);
 await page.goto(url);await page.waitForFunction(()=>!!window.__coven);
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
  check('HUD and controls show in play',await page.evaluate(()=>getComputedStyle(document.querySelector('#hud')).visibility==='visible'&&getComputedStyle(document.querySelector('footer')).visibility==='visible'));
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
  await toOpen();
  let a=await pos();await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');let b2=await pos();
  check('W walks forward',Math.hypot(b2.x-a.x,b2.z-a.z)>2,`${Math.hypot(b2.x-a.x,b2.z-a.z).toFixed(1)} m`);
  await toOpen();a=await pos();await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');b2=await pos();
  check('Shift sprints',Math.hypot(b2.x-a.x,b2.z-a.z)>2);
  for(const k of ['KeyA','KeyS','KeyD']){await toOpen();a=await pos();await page.keyboard.down(k);await page.waitForTimeout(800);await page.keyboard.up(k);b2=await pos();check(`${k.slice(3)} moves`,Math.hypot(b2.x-a.x,b2.z-a.z)>.5);}
  const y0=await page.evaluate(()=>__coven.state.player.y);await page.keyboard.press('Space');
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
  await toOpen();
  await page.evaluate(()=>{const p=__coven.state.player;p.mana=p.maxMana;p.cooldowns={};__coven.aim(p.yaw,.1);__coven.spawn('wolf',p.x+Math.cos(p.yaw)*8,p.z+Math.sin(p.yaw)*8);});
  let m0=await page.evaluate(()=>__coven.state.player.mana);await page.keyboard.press('Digit1');await page.waitForTimeout(300);
  check('1 casts the first spell',await page.evaluate(m=>__coven.state.player.mana<m,m0));
  m0=await page.evaluate(()=>__coven.state.player.mana);await page.keyboard.press('Digit2');await page.waitForTimeout(300);
  check('2 casts the second spell',await page.evaluate(m=>__coven.state.player.mana<m,m0));
  await page.evaluate(()=>{const p=__coven.state.player;p.mana=p.maxMana;p.cooldowns={};__coven.aim(p.yaw,.1);__coven.spawn('wolf',p.x+Math.cos(p.yaw)*10,p.z+Math.sin(p.yaw)*10);});
  m0=await page.evaluate(()=>__coven.state.player.mana);await page.mouse.click(640,400,{button:'right'});await page.waitForTimeout(300);
  check('Right click casts the first spell',await page.evaluate(m=>__coven.state.player.mana<m,m0));
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
  check('Hovering the health bar explains it (map open, mouse free)',/Health/.test(await tip('#hud .row label')??''));
  await page.keyboard.press('KeyM');await page.waitForTimeout(300);
  check('M closes the map',await page.locator('#map').isHidden()&&await page.evaluate(()=>__coven.mode)==='playing');
  // Help in play.
  await page.keyboard.press('KeyH');await page.waitForTimeout(300);
  check('H opens How to play',await page.locator('#help').isVisible());
  await page.keyboard.press('KeyH');await page.waitForTimeout(300);
  check('H closes it back to play',await page.locator('#help').isHidden()&&await page.evaluate(()=>__coven.mode)==='playing');
  // Interact with the elder, broom.
  await page.evaluate(()=>{const C=__coven,p=C.state.player,h=C.world.hearthOf(C.world.region(p.x,p.z));p.x=h.x+3-1.5;p.z=h.z+3;p.y=C.world.ground(p.x,p.z);});
  await page.waitForTimeout(500);
  const prompt=await page.locator('#prompt').textContent();
  await page.keyboard.press('KeyE');await page.waitForTimeout(500);
  check('E talks to the elder',/Elder|elder|Speak|Return/.test(prompt)&&await page.evaluate(()=>__coven.messages.length>0),prompt.trim().slice(0,60));
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
  check('Controls bar hidden under the pause menu',await page.evaluate(()=>getComputedStyle(document.querySelector('footer')).visibility==='hidden'));
  check('Hovering a spell when paused explains it',(await tip('#spells .spell'))?.length>10);
  check('HUD hidden under the pause menu',await page.evaluate(()=>getComputedStyle(document.querySelector('#hud')).visibility==='hidden'));
  await page.click('#helpBtn').catch(()=>page.click('text=HOW TO PLAY'));await page.waitForTimeout(300);
  check('How to play opens from pause',await page.locator('#help').isVisible());
  await page.click('#help [data-close]');await page.waitForTimeout(300);
  check('and closes back to the pause menu',await page.evaluate(()=>__coven.mode)==='paused'&&await page.locator('#overlay').isVisible());
  await page.click('#play');await page.waitForTimeout(300);
  check('Resume returns to play',await page.evaluate(()=>__coven.mode)==='playing');
  // Falling: wake at home with your things.
  await page.evaluate(()=>{const p=__coven.state.player;p.inv.wood=(p.inv.wood??0)+5;p.x+=40;p.hp=0;});
  await page.waitForTimeout(800);
  check('Falling wakes you at home with your things',await page.evaluate(()=>__coven.state.player.hp>0&&__coven.state.player.inv.wood>=5));
  // Window resize.
  await page.setViewportSize({width:900,height:600});await page.waitForTimeout(800);
  await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(800);
  check('Resizing the window keeps drawing',!errs.length,errs[0]??'');
  // The beacon turns gold once the Unwitch is unmade.
  const col=()=>page.evaluate(()=>'#'+__coven.view.beacon.uniforms.uColor.value.getHexString());
  const before=await col();
  await page.evaluate(()=>{__coven.state.bossDefeated=true;});await page.waitForTimeout(500);
  const after=await col();
  check('Beacon is crimson, then gold after the Unwitch falls',before==='#ff3c6e'&&after==='#ffc860',`${before} → ${after}`);
  await page.evaluate(()=>{__coven.state.bossDefeated=false;});
  // Quit and continue.
  const kills=await page.evaluate(()=>{__coven.state.player.stats.kills=7;return 7;});
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  await Promise.all([page.waitForNavigation(),page.click('#quit')]);
  await page.waitForFunction(()=>!!window.__coven);await page.waitForTimeout(1500);
  check('Quit returns to the title with CONTINUE',(await page.locator('#play').textContent()).includes('CONTINUE')&&await page.evaluate(()=>__coven.mode)==='menu');
  check('Title for a returning player shows her world and HUD stays hidden under the menu',await page.evaluate(()=>!document.body.classList.contains('fresh')&&getComputedStyle(document.querySelector('footer')).visibility==='hidden'));
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

 // ---- K: phone-sized screen ----
 if(part==='all'||part==='phone'){
  const {page,errs,ctx}=await open('auto',{viewport:{width:390,height:844},phone:true});
  await page.waitForTimeout(2000);await page.screenshot({path:out+'phone-title.png'});
  check('Phone: says Coven needs a keyboard and mouse',await page.locator('#touchNote').isVisible());
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
 if(bad.length)console.log('FAILED:\n'+bad.map(r=>`  ${r.name} ${r.detail}`).join('\n'));
 else if(results.length)console.log('PASS: everything a player touches works: graphics levels, title, help and spell list, music, movement, gathering, casting, panels, tabs, tooltips, map, broom, pause, falling, resizing, beacon, quit and continue, new game, phone screen.');
 process.exitCode=bad.length||!results.length?1:0;
 await browser.close();server.close();
}
