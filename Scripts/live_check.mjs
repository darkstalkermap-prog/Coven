// After a deploy: opens the live site and checks the game really starts there (WebGL 2, the title, choosing a
// witch, walking), with no browser errors. Tries a few times, as a new deploy can take a minute to reach everyone.
// Usage: node Scripts/live_check.mjs [url]     (BROWSER=chrome|firefox|webkit to try another browser)
import {mkdir} from 'node:fs/promises';
import {launch,NAME,BROWSER} from './browsers.mjs';
const url=process.argv[2]||'https://darkstalkermap-prog.github.io/Coven/';
const out=new URL('../test-results/',import.meta.url);
await mkdir(out,{recursive:true});

async function attempt(){
 const browser=await launch(),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  // Failed requests are reported by address (the console's own message doesn't name them); a missing site icon is fine.
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!/favicon\.ico/.test(r.url()))errors.push(`${r.status()} for ${r.url()}`);});
  await page.addInitScript(()=>{try{localStorage.setItem('coven-gfx','low');localStorage.setItem('coven-music','0');}catch{}});
  await page.goto(`${url}${url.includes('?')?'&':'?'}live=${Date.now()}`,{waitUntil:'domcontentloaded'});
  // The site may forward to the game page first; wait for the game itself, whichever page it ends up on.
  const t0=Date.now();
  while(!(await page.evaluate(()=>!!window.__coven).catch(()=>false))){if(Date.now()-t0>90000)throw new Error(`the game did not load at ${page.url()}`);await page.waitForTimeout(500);}
  const webgl2=await page.evaluate(()=>!!document.querySelector('canvas').getContext('webgl2'));
  const title=(await page.locator('h1').textContent()).trim();
  await page.click('#play');await page.click('[data-class="bloom"]');
  await page.waitForFunction(()=>__coven.mode==='playing');
  const a=await page.evaluate(()=>({x:__coven.state.player.x,z:__coven.state.player.z}));
  await page.keyboard.down('KeyW');
  const walked=await page.waitForFunction(a=>Math.hypot(__coven.state.player.x-a.x,__coven.state.player.z-a.z)>1,a,{timeout:15000}).then(()=>true,()=>false);
  await page.keyboard.up('KeyW');
  await page.screenshot({path:new URL(`live-${BROWSER}.png`,out).pathname});
  const problems=[!webgl2&&'no WebGL 2',title!=='COVEN'&&`title "${title}"`,!walked&&'could not walk',...errors.map(e=>`browser error: ${e}`)].filter(Boolean);
  return {ok:!problems.length,problems,at:page.url()};
 }finally{await browser.close();}
}

let result;
for(let i=1;i<=3;i++){
 result=await attempt().catch(e=>({ok:false,problems:[e.message.split('\n')[0]]}));
 if(result.ok)break;
 console.log(`try ${i}: ${result.problems.join('; ')}`);
 if(i<3)await new Promise(r=>setTimeout(r,30000));
}
if(result.ok)console.log(`PASS (${NAME}): the live game at ${result.at} loads, starts and walks, with no browser errors.`);
else{console.log(`FAILED (${NAME}) at ${url}:\n  ✗ ${result.problems.join('\n  ✗ ')}`);process.exitCode=1;}
