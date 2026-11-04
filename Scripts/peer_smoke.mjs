// Player-hosted games: one browser hosts and gets a code, another joins with it, and they share the world.
// Uses a local PeerJS broker and no STUN servers, so it needs no internet.
import {launch,NAME} from './browsers.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import express from 'express';
import {ExpressPeerServer} from 'peer';

const html=await readFile(new URL('../_site/index.html',import.meta.url));
const site=createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html);});
await new Promise(r=>site.listen(0,'127.0.0.1',r));
// The broker on IPv4 loopback (PeerServer's own listener wants IPv6, which some machines lack).
const app=express(),broker=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
app.use('/',ExpressPeerServer(broker,{path:'/'}));
const url=`http://127.0.0.1:${site.address().port}/Coven/?peerhost=127.0.0.1&peerport=${broker.address().port}&peerice=none`;
// Check on a timer: a tab that lost focus pauses the game and renders no frames to poll on.
const poll={polling:200,timeout:60000};
let browser;
try{
 browser=await launch();
 const errors=[];
 const front=async page=>{await page.bringToFront();if(await page.evaluate(()=>__coven.mode)==='paused')await page.click('#play');await page.waitForTimeout(300);};
 // Each player's page, on Low graphics: this tests the network, and three games share the machine's CPU.
 async function open(viewport={width:1000,height:700}){
  const page=await (await browser.newContext({viewport})).newPage();
  page.setDefaultTimeout(60000);
  await page.addInitScript(()=>{try{localStorage.setItem('coven-gfx','low');localStorage.setItem('coven-music','0');}catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__coven,null,poll);
  return page;
 }
 async function witch(name,cls,mode,code=''){
  const page=await open();
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  await page.check('#mp-enabled');await page.check(`[name="mp-mode"][value="${mode}"]`);
  await page.fill('#mp-name',name);await page.fill('#mp-coven','Moonmoot');
  if(code)await page.fill('#mp-code',code);
  await page.click('#play');await page.click(`[data-class="${cls}"]`);
  await page.waitForFunction(()=>__coven.net.online,null,poll);
  return page;
 }
 const host=await witch('Hazel','bloom','host');
 const code=await host.evaluate(()=>__coven.net.code);
 assert.match(code,/^[A-Z]{4}$/,'Host gets a four-letter code');
 await host.waitForFunction(c=>document.querySelector('#netStatus').textContent.includes(`HOSTING · CODE ${c}`),code,poll);
 const guest=await witch('Ivy','hex','join',code);
 await host.waitForFunction(()=>__coven.remotes.size===1,null,poll);
 await guest.waitForFunction(()=>__coven.remotes.size===1,null,poll);
 assert.equal(await host.evaluate(()=>[...__coven.remotes.values()][0].name),'Ivy');
 await guest.waitForFunction(c=>document.querySelector('#netStatus').textContent.includes(`GAME ${c}`),code,poll);

 // Same coven: bring Ivy beside Hazel, then share a creature, a chat line and a harvest.
 const spot=await host.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z}));
 await guest.evaluate(s=>{const p=__coven.state.player;p.x=s.x+3;p.z=s.z;},spot);
 await host.waitForFunction(()=>/COVEN 2\/4/.test(document.querySelector('#covenList small').textContent),null,poll);
 await front(host); // the host runs the creatures, so its game must be going
 await host.evaluate(()=>{const p=__coven.state.player;__coven.spawn('wolf',p.x,p.z+60);});
 await guest.waitForFunction(()=>__coven.creatures.some(c=>c.remote&&c.kind==='wolf'),null,poll);
 // With windows on one screen (Firefox runs in one), the window in front pauses the other's game as any
 // switched-away game pauses; bring this one forward and carry on before typing.
 await front(guest);
 await guest.keyboard.press('Enter');await guest.keyboard.type('Found you!');await guest.keyboard.press('Enter');
 await host.waitForFunction(()=>document.querySelector('#chatLog').textContent.includes('Ivy: Found you!'),null,poll);
 const node=await guest.evaluate(()=>{const p=__coven.state.player,n=__coven.view.nodesNear(p.x,p.z,200)[0];__coven.state.harvested[n.id]=__coven.state.clock+600;__coven.view.hideNode(n.id);__coven.net.send({type:'harvest',node:n.id,seconds:600});return n.id;});
 await host.waitForFunction(id=>!!__coven.state.harvested[id],node,poll);

 // A wrong code is reported, not hung on.
 const lost=await open({width:800,height:600});
 await lost.check('#mp-enabled');await lost.check('[name="mp-mode"][value="join"]');await lost.fill('#mp-code','ZZZZ');
 await lost.click('#play');await lost.click('[data-class="wild"]');
 await lost.waitForFunction(()=>/No game found with code ZZZZ/.test(document.querySelector('#toast').textContent),null,poll);
 await lost.close();

 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 await guest.screenshot({path:new URL('../test-results/hosted.png',import.meta.url).pathname});

 // When the host leaves, the guest is told and goes back to solo play.
 await host.close();
 await guest.waitForFunction(()=>__coven.net.status==='offline'&&/closed the game/.test(document.querySelector('#toast').textContent),null,poll);
 assert.deepEqual(errors,[],'No browser errors');
 console.log(`PASS (${NAME}): player-hosted game: four-letter code, join by code, presence, coven count, shared creatures, chat, harvests, wrong code reported, host leaving handled.`);
}finally{
 await browser?.close();
 // Drop lingering keep-alive and broker sockets so the servers close and the process exits.
 for(const s of [site,broker]){s.closeAllConnections();s.close();}
}
// The local broker keeps housekeeping timers running; nothing else is left to wait for.
process.exit(0);
