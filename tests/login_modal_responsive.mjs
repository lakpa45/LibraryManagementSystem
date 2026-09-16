import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const root=process.cwd();
const pages={'/':'views/index.html','/books':'views/all_books.html','/categories':'views/categories.html','/e-books':'views/e_books.html','/my-books':'views/my_books.html'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(url.pathname==='/api/books'&&url.search?JSON.stringify({books:[],total:0,page:1,pages:1}):'[]');return;}
 const relative=pages[url.pathname]||url.pathname.replace(/^\//,'public/');const file=path.join(root,relative);
 try{const body=fs.readFileSync(file);const ext=path.extname(file);res.setHeader('Content-Type',ext==='.css'?'text/css':ext==='.js'?'text/javascript':ext==='.svg'?'image/svg+xml':'text/html');res.end(body);}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'login-modal-edge-'));
const browser=spawn(process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await new Promise(r=>setTimeout(r,100));
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 let id=0;const pending=new Map();const errors=[];
 ws.addEventListener('message',async event=>{const message=JSON.parse(event.data);if(message.id){const job=pending.get(message.id);pending.delete(message.id);message.error?job.reject(message.error):job.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown'||message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params);else if(message.method==='Fetch.requestPaused')await send('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,body:''});});
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const pause=()=>new Promise(r=>setTimeout(r,180));await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
 const go=async route=>{await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${route}`});for(let i=0;i<80;i++){if(await evaluate(`document.readyState==='complete'`))break;await pause();}await pause();await evaluate(`document.querySelector('#authOverlay').classList.add('is-open')`);await new Promise(r=>setTimeout(r,300));};
 const check=async expression=>assert.ok(await evaluate(expression),expression);
 for(const width of [320,360,375,390,396,768]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
  for(const route of Object.keys(pages)){
   await go(route);
   await check(`(()=>{const modal=document.querySelector('.auth-modal').getBoundingClientRect();return modal.left>=0&&modal.right<=innerWidth&&modal.width<=400})()`);
   await check(`Array.from(document.querySelectorAll('#loginForm input,#loginForm select,#loginForm .auth-submit,#loginForm .auth-switch,.auth-modal__close')).every(el=>{const r=el.getBoundingClientRect(),m=document.querySelector('.auth-modal').getBoundingClientRect();return r.left>=m.left&&r.right<=m.right})`);
   const geometry=await evaluate(`(()=>{const w=document.querySelector('.auth-password').getBoundingClientRect(),i=document.querySelector('.auth-password input').getBoundingClientRect(),b=document.querySelector('.auth-password__toggle').getBoundingClientRect(),m=document.querySelector('.auth-modal').getBoundingClientRect();return {ok:w.right<=m.right&&i.left>=w.left&&i.right<=w.right&&b.left>=i.left&&b.right<=i.right&&b.width>=40&&b.height>=40,w:{left:w.left,right:w.right,width:w.width},i:{left:i.left,right:i.right,width:i.width},b:{left:b.left,right:b.right,width:b.width,height:b.height},m:{left:m.left,right:m.right,width:m.width}}})()`);assert.ok(geometry.ok,JSON.stringify({width,route,geometry}));
   if(width<396){const modalSize=await evaluate(`({rendered:document.querySelector('.auth-modal').getBoundingClientRect().width,available:document.documentElement.clientWidth,css:getComputedStyle(document.querySelector('.auth-modal')).width,overlayPadding:getComputedStyle(document.querySelector('.auth-overlay')).padding})`);assert.ok(Math.abs(modalSize.rendered-(modalSize.available-24))<1,JSON.stringify({width,route,modalSize}));}
   await check(`getComputedStyle(document.querySelector('.auth-password')).position==='relative'&&getComputedStyle(document.querySelector('.auth-password input')).boxSizing==='border-box'&&getComputedStyle(document.querySelector('.auth-password__toggle')).position==='absolute'`);
   await evaluate(`document.querySelector('.auth-password__toggle').click()`);await check(`document.querySelector('.auth-password input').type==='text'`);await evaluate(`document.querySelector('.auth-password__toggle').click()`);await check(`document.querySelector('.auth-password input').type==='password'`);
  }
  console.log(`PASS: shared login modal at ${width}px`);
 }
 assert.equal(errors.length,0,'No browser JavaScript errors: '+JSON.stringify(errors));
 console.log('PASS: all shared login-modal pages fit and password visibility toggles twice');
 await send('Browser.close');
}finally{ws?.close();browser.kill();server.close();}
