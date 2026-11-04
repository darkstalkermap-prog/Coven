import {launch,NAME,CHROMIUM_FAMILY} from './browsers.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const html=await readFile(new URL('../_site/index.html',import.meta.url));
const server=createServer((req,res)=>{if(req.url==='/Coven/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const shot=async(page,name)=>page.screenshot({path:new URL(`../test-results/${name}.png`,import.meta.url).pathname});
let browser;
try{
 browser=await launch();
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.setDefaultTimeout(60000);
 if(process.env.CPU_THROTTLE&&CHROMIUM_FAMILY){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.CPU_THROTTLE)});}
 // Wait for the game itself to reach a state, however slowly frames render.
 const until=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:60000,polling:100});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon'))errors.push(msg.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/Coven/`);
 // If the game cannot start (no WebGL 2, a script error), say why rather than only timing out.
 await until(()=>!!window.__coven).catch(async e=>{
  const why=await page.evaluate(()=>({message:document.querySelector('#description')?.textContent,webgl2:!!document.createElement('canvas').getContext('webgl2'),webgl:!!document.createElement('canvas').getContext('webgl')})).catch(()=>({}));
  console.log(`The game did not start in ${NAME}: ${JSON.stringify(why)}${errors.length?`\nbrowser errors:\n  ${errors.slice(0,5).join('\n  ')}`:''}`);throw e;});
 assert.equal(await page.locator('#play').isEnabled(),true,'WebGL initializes');
 assert.ok(await page.evaluate(()=>!!document.querySelector('canvas').getContext('webgl2')),'Uses WebGL 2');
 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 await shot(page,'menu');

 await page.click('#play');
 assert.equal(await page.locator('#classCards .card').count(),4,'Four witch classes offered');
 await shot(page,'classes');
 await page.click('[data-class="bog"]');
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>__coven.mode),'playing');
 assert.equal(await page.evaluate(()=>__coven.state.player.class),'bog');
 assert.equal(await page.evaluate(()=>__coven.world.region(__coven.state.player.x,__coven.state.player.z)),'swamp','Bog Witch starts in the Mirefen');

 const before=await page.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z}));
 await page.keyboard.down('KeyW');
 await until(b=>Math.hypot(__coven.state.player.x-b.x,__coven.state.player.z-b.z)>1,before);
 await page.keyboard.up('KeyW');
 assert.equal(await page.locator('#spells .spell').count(),10,'Spell bar shows class and coven spells');
 assert.match(await page.locator('#prompt').textContent()+await page.locator('#questTitle').textContent(),/Elder/,'Elder quest is shown');

 // Found a village and brew at the cauldron through the real UI.
 await page.evaluate(()=>{const p=__coven.state.player;Object.assign(p.inv,{wood:30,stone:30,sunpetal:2,honeyclover:1});});
 await page.keyboard.press('KeyB');
 await page.locator('[data-build="heart"]').click();
 await page.keyboard.press('KeyB');
 await page.evaluate(()=>{__coven.state.player.yaw+=Math.PI/2;});
 await page.locator('[data-build="cauldron"]').click();
 assert.deepEqual(await page.evaluate(()=>__coven.state.buildings.map(b=>b.type)),['heart','cauldron']);
 await page.evaluate(()=>{const p=__coven.state.player,c=__coven.state.buildings[1];p.x=c.x+2;p.z=c.z;});
 await page.keyboard.press('Tab');
 await page.locator('[data-tab="alchemy"]').click();
 await page.locator('[data-craft="healing"]').click();
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.healing>=1),true,'Brewed a Healing Draught');
 for(const t of ['skills','coven','craft','items'])await page.locator(`[data-tab="${t}"]`).click();
 await shot(page,'pack');
 await page.keyboard.press('Escape');

 // Playing alone, a coven rite needs only its materials: no Spellcraft level and no second witch.
 await page.evaluate(()=>{const p=__coven.state.player;p.inv.covenInk=2;p.mana=p.maxMana;__coven.cast(3);});
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.covenInk),1,'Binding Circle cast alone with its Coven Ink');
 await page.evaluate(()=>{const p=__coven.state.player;p.cooldowns={};p.coven.push('hex');__coven.allies.push({id:999,ally:'witch',cls:'hex',x:p.x+2,z:p.z,y:p.y,yaw:0,life:Infinity,cooldown:0,walk:0});__coven.cast(3);});
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.covenInk??0),0,'Binding Circle cast again with a sister beside you');

 // Inventory: equip armor and a broom from the pack.
 await page.evaluate(()=>{Object.assign(__coven.state.player.inv,{hideJerkin:1,broom:1});});
 await page.keyboard.press('KeyI');
 await page.locator('[data-equip="hideJerkin"]').click();
 await page.locator('[data-equip="broom"]').click();
 assert.equal(await page.locator('.slot:not(.empty)').count()>=2,true,'Slots show worn gear');
 assert.deepEqual(await page.evaluate(()=>[__coven.state.player.equip.chest,__coven.state.player.equip.mount]),['hideJerkin','broom']);
 await shot(page,'inventory');
 await page.keyboard.press('Escape');

 // The broom: ride it; it won't fly until the Hex sister helps cast the Skyward Charm [0]. Then it flies alone.
 await page.evaluate(()=>{const p=__coven.state.player;p.mana=p.maxMana=999;p.inv.feather=4;p.cooldowns={};});
 await page.keyboard.press('KeyF');
 await until(()=>__coven.state.player.mounted);
 assert.equal(await page.evaluate(()=>__coven.state.player.flying),false);
 await page.keyboard.press('Digit0');
 await until(()=>__coven.state.player.equip.mount==='skyBroom');
 const sister=await page.evaluate(()=>{const i=__coven.allies.findIndex(a=>a.cls==='hex');return __coven.allies.splice(i,1)[0];});
 const y0=await page.evaluate(()=>__coven.state.player.y);
 await page.keyboard.down('Space');
 await until(y=>__coven.state.player.flying&&__coven.state.player.y>y+8,y0); // flies with no sister near
 await page.keyboard.up('Space');
 await shot(page,'flying');
 await page.keyboard.down('KeyX');
 await until(()=>!__coven.state.player.flying);
 await page.keyboard.up('KeyX');
 await page.evaluate(s=>__coven.allies.push(s),sister);
 await page.keyboard.press('KeyF');
 assert.equal(await page.evaluate(()=>__coven.state.player.mounted),false,'Dismounted');

 // Human villages: walking in as a witch raises the alarm.
 const goTo=(x,z)=>page.evaluate(([x,z])=>{const p=__coven.state.player;p.x=x;p.z=z;p.y=__coven.world.ground(x,z);},[x,z]);
 const [v1,v2]=await page.evaluate(()=>__coven.humanVillages.slice(0,2).map(v=>({id:v.id,x:v.x,z:v.z,stall:v.layout.stall,name:v.name})));
 await page.evaluate(()=>{const p=__coven.state.player;p.hp=p.maxHp=5000;});
 await goTo(v1.x+5,v1.z+5);
 await until(id=>__coven.villageState.get(id).alarm>0,v1.id); // undisguised witch raises the alarm
 await until(id=>__coven.creatures.some(c=>c.village===id&&c.kind==='hunter'&&c.state==='chase'),v1.id); // witch hunters give chase
 await shot(page,'village-alarm');

 // Glamoured, a witch can walk into another village and trade.
 await goTo(v2.x,v2.z+120);
 await until(id=>__coven.villageState.get(id).spawned,v2.id);
 await page.evaluate(()=>{const p=__coven.state.player;Object.assign(p.inv,{glamourDust:1,hide:5,soulJar:1});p.mana=p.maxMana;__coven.cast(7);});
 assert.ok(await page.evaluate(()=>__coven.state.player.effects.glamour>0),'Glamour cast');
 await goTo(v2.stall.x-2.5,v2.stall.z);
 const ticks=await page.evaluate(()=>__coven.state.clock);
 await until(t=>__coven.state.clock>t+.5,ticks);
 assert.equal(await page.evaluate(id=>__coven.villageState.get(id).alarm,v2.id),0,'Glamoured witch is not recognised');
 await shot(page,'village-glamour');
 await page.evaluate(()=>__coven.interact());
 await page.locator('[data-sell="hide"]').first().click();
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.silver),3,'Sold hide for silver');
 await page.keyboard.press('Escape');

 // Striking a villager breaks the glamour, raises the alarm, and the soul fills the jar.
 await page.evaluate(id=>{const c=__coven.creatures.find(c=>c.village===id&&c.kind==='villager');__coven.hit(c,999);},v2.id);
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.humanSoul),1,'Captured a human soul');
 assert.ok(await page.evaluate(id=>__coven.villageState.get(id).alarm>0&&!__coven.state.player.effects.glamour,v2.id),'Violence breaks glamour and raises the alarm');

 // The ultimate summon: four witches, three souls and a Heartfire Sigil.
 await page.evaluate(()=>{const p=__coven.state.player;p.skills.spellcraft=99999;p.mana=p.maxMana=999;Object.assign(p.inv,{humanSoul:3,heartSigil:1});
  for(const cls of ['hex','bloom','wild'])if(!p.coven.includes(cls)){p.coven.push(cls);__coven.allies.push({id:9000+p.coven.length,ally:'witch',cls,x:p.x+1,z:p.z+1,y:p.y,yaw:0,life:Infinity,cooldown:0,walk:0});}
  for(const a of __coven.allies){a.x=p.x+1;a.z=p.z+1;}p.cooldowns={};__coven.cast(8);});
 assert.ok(await page.evaluate(()=>__coven.allies.some(a=>a.ally==='titan')),'Wyrd Titan summoned');
 assert.equal(await page.evaluate(()=>__coven.state.player.inv.humanSoul??0),0,'Souls consumed');
 await page.waitForTimeout(400);
 await shot(page,'titan');
 await page.evaluate(()=>{const p=__coven.state.player;p.coven=p.coven.filter(c=>c==='hex');__coven.allies.splice(0,__coven.allies.length,...__coven.allies.filter(a=>a.cls==='hex'));});

 // Hunt: a wolf in front of you falls to Leech Bolts and drops loot.
 await page.evaluate(()=>{const p=__coven.state.player;p.mana=p.maxMana=999;p.hp=p.maxHp=999;for(const c of __coven.creatures){c.dead=true;c.hp=0;}__coven.spawn('wolf',p.x+Math.cos(p.yaw)*10,p.z+Math.sin(p.yaw)*10);});
 const k0=await page.evaluate(()=>__coven.state.player.stats.kills);
 for(let i=0;i<40&&(await page.evaluate(()=>__coven.state.player.stats.kills))===k0;i++){await page.keyboard.press('Digit1');await page.waitForTimeout(1300);}
 assert.equal(await page.evaluate(()=>__coven.state.player.stats.kills),k0+1,'Wolf slain by spells');
 assert.ok(await page.evaluate(()=>__coven.state.player.inv.hide>=2),'Wolf dropped hide');

 await page.keyboard.press('KeyM');
 await page.locator('#map').waitFor({state:'visible'});
 await shot(page,'map');
 await page.keyboard.press('KeyM');

 // Visit the Crown and see the warded boss.
 await page.evaluate(()=>{const p=__coven.state.player;p.x=60;p.z=60;p.y=__coven.world.ground(60,60);p.hp=p.maxHp=5000;});
 await until(()=>__coven.boss?.warded===true); // the Unwitch appears, warded
 await page.evaluate(()=>{const p=__coven.state.player;p.x=12;p.z=0;for(const cls of ['bloom','wild'])if(!p.coven.includes(cls)){p.coven.push(cls);__coven.allies.push({id:990+p.coven.length,ally:'witch',cls,x:p.x,z:p.z+2,y:p.y,yaw:0,life:Infinity,cooldown:0,walk:0});}for(const a of __coven.allies){a.x=p.x+1;a.z=p.z+1;}p.inv.heartSigil=1;p.mana=p.maxMana;__coven.cast(6);});
 assert.equal(await page.evaluate(()=>__coven.boss?.warded),false,'Grand Rite of four witches breaks the ward');
 assert.ok(await page.evaluate(()=>__coven.boss.hp<=4600),'Grand Rite deals full damage once the ward breaks');
 await shot(page,'crown');

 // How to play lists every spell with what it does; Quit game in the pause menu saves and returns to the title.
 await page.keyboard.press('KeyH');
 assert.equal(await page.locator('#help section.spells li').count(),16,'How to play describes all 16 spells');
 await page.keyboard.press('KeyH');
 await page.keyboard.press('Escape');
 await page.locator('#quit').waitFor({state:'visible'});
 const kills=await page.evaluate(()=>__coven.state.player.stats.kills);
 // The menu must have the mouse (a capture granted just after pausing is let go again).
 await until(()=>!document.pointerLockElement).catch(()=>{});
 const reloaded=page.waitForNavigation();
 await page.click('#quit');
 await reloaded.catch(async e=>{console.log(`Quit did not reload: ${JSON.stringify(await page.evaluate(()=>({mode:__coven.mode,quit:!!document.querySelector('#quit:not(.hidden)'),mouseHeld:!!document.pointerLockElement})).catch(()=>({})))}`);throw e;});
 await until(()=>!!window.__coven);
 assert.equal(await page.evaluate(()=>__coven.mode),'menu','Quit returns to the title screen');
 assert.equal(await page.evaluate(()=>__coven.state.player.stats.kills),kills,'Quit saved the game');
 assert.deepEqual(errors,[],'No browser errors');
 console.log(`PASS (${NAME}, ${Math.round(process.uptime())} s): WebGL 2, Pages subpath, class choice, homeland start, walking, spell bar, village building, alchemy, solo casting with materials, equipment slots, broom riding, Skyward Charm and flight, human village alarm, glamour and trade, soul capture, Wyrd Titan, hunting and loot, map, boss ward and Grand Rite, spell descriptions, quit and continue, no browser errors.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
