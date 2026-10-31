// A full playthrough by a bot witch (Scripts/playbot.mjs): every quest from the elder's first word to the
// Unwitch, played through the game's own controls at many times normal speed. Writes what happened, and every
// problem she ran into, to test-results/playthrough-<class>.md with screenshots along the way.
// Usage: npm run build && node Scripts/playthrough.mjs [class] [first quest] [last quest]
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const [cls='bloom',from='0',to='14']=process.argv.slice(2);
const root=new URL('../',import.meta.url), out=new URL('test-results/',root);
await mkdir(out,{recursive:true});
const html=await readFile(new URL('_site/index.html',root));
const server=createServer(async(q,r)=>{
 const path=q.url.split('?')[0];
 if(path==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(html);}
 if(/^\/(Browser|Scripts)\/[\w.]+\.mjs$/.test(path)){try{const js=await readFile(new URL(path.slice(1),root));r.writeHead(200,{'Content-Type':'text/javascript'});return r.end(js);}catch{}}
 r.writeHead(404);r.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const lines=[],errors=[],results=[],shots=[];
const say=t=>{console.log(t);lines.push(t);};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>!!window.__coven);
 await page.click('#play');await page.click(`[data-class="${cls}"]`);
 await page.waitForFunction(()=>__coven.mode==='playing');
 await page.addScriptTag({url:'/Scripts/playbot.mjs',type:'module'});
 await page.waitForFunction(()=>!!window.bot,null,{timeout:30000});
 const shot=async name=>{await page.waitForTimeout(2500);const file=`playthrough-${cls}-${name}.png`;await page.screenshot({path:new URL(file,out).pathname});shots.push(file);};
 await shot('start');
 const titles=await page.evaluate(()=>bot.QUESTS);
 // Hang watch: the debugger is switched on now because it cannot be once the page is stuck. A quest that runs
 // well past the bot's own limit (two tries of 8 min) is paused, and where it was stuck is printed.
 const cdp=await page.context().newCDPSession(page);await cdp.send('Debugger.enable');
 const HANG_MS=18*60*1000;
 const playQuest=async i=>{
  let timer;const hang=new Promise(r=>{timer=setTimeout(()=>r(null),HANG_MS);});
  const r=await Promise.race([page.evaluate(i=>bot.playQuest(i),i),hang]);clearTimeout(timer);
  if(r)return r;
  const frames=new Promise(r=>cdp.once('Debugger.paused',e=>r(e.callFrames.slice(0,8).map(f=>`${f.functionName||'(anonymous)'} ${f.url.split('/').pop()||'page'}:${f.location.lineNumber+1}`))));
  await cdp.send('Debugger.pause');
  throw new Error(`quest ${i} (${titles[i]}) hung for ${HANG_MS/60000} min, stuck in: ${(await frames).join(' < ')}`);
 };
 for(let i=Number(from);i<=Number(to);i++){
  const t0=Date.now();
  const r=await playQuest(i);
  const rep=await page.evaluate(()=>bot.report());
  for(const l of rep.log)say('  '+l);
  say(r.already?`✓ ${i} ${titles[i]} — done along the way`:`${r.done?'✓':'✗'} ${i} ${titles[i]} — ${r.minutes} min of play, level ${r.level}, ${Math.round((Date.now()-t0)/1000)} s real`);
  if(!r.done){await page.evaluate(i=>bot.assist(i),i);for(const l of (await page.evaluate(()=>bot.report())).log)say('  '+l);}
  results.push({...r,stats:rep.stats});
  await shot(`q${String(i).padStart(2,'0')}`);
 }
 const final=await page.evaluate(()=>bot.report());
 const md=[`# Playthrough: ${cls}`,'',`Quests finished unaided: ${results.filter(r=>r.done).length}/${results.length}. Deaths ${final.stats.deaths}, times stuck ${final.stats.stuck}, kills ${final.stats.kills}, walked ${Math.round(final.stats.walked)} m, ${final.stats.drinks} drinks, ${final.stats.meals} meals, day ${final.stats.day}.`,'',
  '## Quests','',...results.map(r=>`- ${r.done?'✓':'✗'} ${r.title} — ${r.minutes} minutes of play, level ${r.level}`),'',
  '## Problems','',...(final.problems.length?final.problems.map(p=>`- [q${p.quest} ${p.questTitle}, L${p.level}${p.at?` at ${p.at.join(', ')}`:''}] ${p.text}${p.stack?` (${p.stack})`:''}`):['None.']),'',
  '## Browser errors','',...(errors.length?errors.map(e=>`- ${e}`):['None.']),'',
  '## Log','','```',...lines,'```','',`Final pack: ${JSON.stringify(final.stats.inv)}`,`Equipped: ${JSON.stringify(final.stats.equip)}`,'',...shots.map(f=>`![${f}](${f})`)].join('\n');
 await writeFile(new URL(`playthrough-${cls}.md`,out),md);
 say(`report: test-results/playthrough-${cls}.md`);
}finally{await browser.close();server.close();}
