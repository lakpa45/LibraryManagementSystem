import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:3187';
const server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,PORT:'3187',JWT_SECRET:'footer-local-test-only',DATABASE_URL:'postgresql://unused:unused@127.0.0.1:1/unused'},stdio:'ignore'});
let browser,ws;
try {
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const files=fs.readdirSync('views').filter(f=>f.endsWith('.html')&&!['forget_password.html','reset_password.html'].includes(f));
 let count=0;const checked=new Map();
 const expected={'/':'index.html','/books':'all_books.html','/categories':'categories.html','/e-books':'e_books.html','/my-books':'my_books.html','/register':'register.html'};
 for(const f of files){const response=await fetch(base+'/'+f);assert.equal(response.status,200,f);const html=await response.text();
 for(const footer of html.match(/<footer\b[\s\S]*?<\/footer>/gi)||[])for(const a of footer.matchAll(/<a\b([^>]*?)href="([^"]*)"([^>]*)>/g)){
 const href=a[2];count++;assert.notEqual(href,'#',f);assert.match(href,/^(\/|mailto:|tel:|https?:)/,f);
 if(href.startsWith('mailto:')){assert.match(href,/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/);continue;}
 if(href.startsWith('tel:')){assert.equal(href,'tel:9366375318',f);continue;}
 if(/^https?:/.test(href)){assert.match(a[0],/target="_blank"/);assert.match(a[0],/rel="noopener noreferrer"/);continue;}
 const url=new URL(href,base);let body=checked.get(url.pathname+url.search);if(!body){const r=await fetch(url);assert.equal(r.status,200,href);body=await r.text();assert(!body.includes('Cannot GET'));const file=expected[url.pathname]||url.pathname.slice(1);assert.equal(body,fs.readFileSync('views/'+file,'utf8'),href);checked.set(url.pathname+url.search,body);}
 if(url.hash)assert(body.includes('id="'+url.hash.slice(1)+'"'),href);
 }}
 for(const [route,file] of Object.entries(expected))assert.equal(await (await fetch(base+route)).text(),fs.readFileSync('views/'+file,'utf8'));
 console.log(`PASS: ${files.length} public HTML pages; ${count} footer links; all internal destinations return the correct HTML and valid anchors.`);
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'footer-edge-'));
 browser=spawn(process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await new Promise(r=>setTimeout(r,100));
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();function send(method,params={}){return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
 ws.addEventListener('message',async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Fetch.requestPaused')await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{}').toString('base64')});});
 await send('Page.enable');await send('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'*/api/*'}]});
 for(const width of [320,375,768,1440]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 for(const f of files.filter(f=>fs.readFileSync('views/'+f,'utf8').includes('<footer'))){await send('Page.navigate',{url:base+'/'+f});for(let attempt=0;attempt<100;attempt++){const ready=await send('Runtime.evaluate',{expression: "document.readyState === 'complete' && location.pathname === "+JSON.stringify('/'+f),returnByValue:true});if(ready.result.value){await new Promise(r=>setTimeout(r,250));break;}await new Promise(r=>setTimeout(r,50));}
 const r=await send('Runtime.evaluate',{expression:`JSON.stringify([...document.querySelectorAll('footer a')].map(a=>{const r=a.getBoundingClientRect();return {href:a.getAttribute('href'),height:r.height,left:r.left,right:r.right}}))`,returnByValue:true});
 for(const a of JSON.parse(r.result.value)){assert(a.left>=-1&&a.right<=width+1,`${f} ${width}: overflow ${JSON.stringify(a)}`);if(width<=768)assert(a.height>=44,`${f} ${width}: tap height ${JSON.stringify(a)}`);}
 }}
 console.log('PASS: footer links fit at 320, 375, 768 and 1440px; all mobile tap targets are at least 44px tall. APIs/external assets stubbed in browser; real Express used for navigation.');
} finally {ws?.close();browser?.kill();server.kill();}
