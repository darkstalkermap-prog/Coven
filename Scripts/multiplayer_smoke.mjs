// Starts the real Coven server and two browsers, and checks they share one world.
import {launch,NAME} from './browsers.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';

const server=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=/http:\/\/localhost:(\d+)/.exec(String(d));if(m)resolve(`http://127.0.0.1:${m[1]}`);});server.on('exit',()=>reject(new Error('Server exited')));});
let browser;
try{
 browser=await launch();
 const errors=[];
 const front=async page=>{await page.bringToFront();if(await page.evaluate(()=>__coven.mode)==='paused')await page.click('#play');await page.waitForTimeout(300);};
 async function witch(name,cls){
  const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  // Low graphics: this tests the network, and both games share the machine's CPU.
  await page.addInitScript(()=>{try{localStorage.setItem('coven-gfx','low');localStorage.setItem('coven-music','0');}catch{}});
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__coven);await page.waitForTimeout(800);
  await page.check('#mp-enabled');
  await page.fill('#mp-name',name);await page.fill('#mp-coven','Thornmoot');await page.fill('#mp-world','test');
  assert.equal(await page.inputValue('#mp-server'),origin,'Server defaults to the page host');
  await page.click('#play');await page.click(`[data-class="${cls}"]`);
  await page.waitForFunction(()=>__coven.net.online);
  return page;
 }
 const a=await witch('Agnes','hex'),b=await witch('Bryony','wild');
 await a.waitForFunction(()=>__coven.remotes.size===1);
 await b.waitForFunction(()=>__coven.remotes.size===1);
 assert.equal(await a.evaluate(()=>[...__coven.remotes.values()][0].name),'Bryony');

 // Bring Bryony beside Agnes: they form a real two-witch coven.
 const spot=await a.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z}));
 await b.evaluate(s=>{const p=__coven.state.player;p.x=s.x+3;p.z=s.z;},spot);
 await a.waitForFunction(()=>{const r=[...__coven.remotes.values()][0];return Math.hypot(r.x-__coven.state.player.x,r.z-__coven.state.player.z)<6;});
 // (The coven count on screen refreshes ten times a second.)
 await a.waitForFunction(()=>/COVEN 2\/4/.test(document.querySelector('#covenList small').textContent),null,{timeout:10000}).catch(()=>{});
 assert.match(await a.locator('#covenList small').textContent(),/COVEN 2\/4/,'Real coven-mate counts toward the coven');
 await a.evaluate(()=>{const p=__coven.state.player;p.skills.spellcraft=1000;p.inv.covenInk=1;p.mana=p.maxMana;__coven.cast(3);});
 assert.equal(await a.evaluate(()=>__coven.state.player.inv.covenInk??0),0,'Two-witch rite cast with a real player');

 // A node gathered by Agnes disappears for Bryony.
 const node=await a.evaluate(()=>{const p=__coven.state.player,n=__coven.view.nodesNear(p.x,p.z,200)[0];__coven.view.hideNode(n.id);__coven.state.harvested[n.id]=__coven.state.clock+600;__coven.net.send({type:'harvest',node:n.id,seconds:600});return n.id;});
 await b.waitForFunction(id=>!!__coven.state.harvested[id],node);

 // Villages are shared.
 await b.evaluate(()=>{Object.assign(__coven.state.player.inv,{wood:20,stone:20});__coven.placeBuilding('heart');});
 await a.waitForFunction(()=>[...__coven.villages.values()].some(v=>v.list.some(x=>x.type==='heart')));

 // Chat.
 // With windows on one screen (Firefox runs in one), the window in front pauses the other's game as any
 // switched-away game pauses; bring this one forward and carry on before typing.
 await front(a);
 await a.keyboard.press('Enter');await a.keyboard.type('Blessed be');await a.keyboard.press('Enter');
 await b.waitForFunction(()=>document.querySelector('#chatLog').textContent.includes('Agnes: Blessed be'));

 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 await b.evaluate(()=>{__coven.state.player.yaw+=Math.PI;});await b.waitForTimeout(500);
 await b.screenshot({path:new URL('../test-results/multiplayer.png',import.meta.url).pathname});

 // Shared creatures: a wolf Agnes spawns appears for Bryony, and Bryony's killing blow earns her the spoils.
 await a.evaluate(()=>{for(const c of __coven.creatures)if(c.village===undefined){c.dead=true;c.hp=0;}});
 await b.evaluate(()=>{for(const c of __coven.creatures)if(c.village===undefined){c.dead=true;c.hp=0;}const p=__coven.state.player;p.hp=p.maxHp=9999;});
 await a.evaluate(()=>{const p=__coven.state.player;p.hp=p.maxHp=9999;__coven.spawn('wolf',p.x,p.z+60);});
 await b.waitForFunction(()=>__coven.creatures.some(c=>c.remote&&c.kind==='wolf'));
 const kills=await b.evaluate(()=>__coven.state.player.stats.kills),aKills=await a.evaluate(()=>__coven.state.player.stats.kills);
 await b.evaluate(()=>{const c=__coven.creatures.find(c=>c.remote&&c.kind==='wolf');__coven.hit(c,9999);});
 await b.waitForFunction(k=>__coven.state.player.stats.kills===k+1,kills);
 await a.waitForFunction(()=>!__coven.creatures.some(c=>c.kind==='wolf'));
 assert.equal(await a.evaluate(()=>__coven.state.player.stats.kills),aKills,'The owner does not get the kill');
 assert.ok(await b.evaluate(()=>__coven.state.player.inv.hide>=2),'The killer gets the loot');

 // A creature Agnes runs hunts whoever is nearest, and its bites land on Bryony.
 const bHp=await b.evaluate(()=>__coven.state.player.hp);
 await a.evaluate(()=>{const r=[...__coven.remotes.values()][0];__coven.spawn('wolf',r.x+1.5,r.z);});
 await b.waitForFunction(h=>__coven.state.player.hp<h,bHp);
 assert.equal(await a.evaluate(()=>__coven.state.player.hp),await a.evaluate(()=>__coven.state.player.maxHp),'Agnes is not bitten');

 // When Agnes leaves, Bryony takes over the creatures near her.
 // (A fresh hare beside her makes sure there is one the server already knows about.)
 await a.evaluate(()=>{const r=[...__coven.remotes.values()][0];__coven.spawn('shadowhare',r.x+6,r.z+6);});
 await b.waitForFunction(()=>__coven.creatures.some(c=>c.remote&&c.kind==='shadowhare'&&c.hp>0));
 const owned=await b.evaluate(()=>__coven.creatures.filter(c=>c.remote&&c.hp>0).map(c=>c.id));
 await a.close();
 await b.waitForFunction(()=>__coven.remotes.size===0);
 await b.waitForFunction(ids=>ids.some(id=>__coven.creatures.some(c=>c.id===id&&!c.remote)),owned).catch(async e=>{
  console.log('handed over?',owned,await b.evaluate(()=>__coven.creatures.filter(c=>c.village===undefined).map(c=>[c.id,c.kind,c.remote?'remote':'ours',Math.round(c.hp)])));throw e;});
 assert.deepEqual(errors,[],'No browser errors');
 console.log(`PASS (${NAME}, ${Math.round(process.uptime())} s): two browsers share a world: presence, real coven count, coven rite, shared harvesting, shared villages, chat, shared creatures with kill credit, cross-player bites, creature handover on leave.`);
}finally{await browser?.close();server.kill();}
