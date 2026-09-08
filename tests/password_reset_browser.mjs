import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
const root=process.cwd();
let forgotRequests=0, resetRequests=0, mode='success'; const requestedEmails=[];
const server=http.createServer(async(req,res)=>{
 const url=req.url.split('?')[0];
 if(url.startsWith('/api/')){
  let requestBody='';for await(const chunk of req) requestBody+=chunk;
  res.setHeader('Content-Type','application/json');
  if(url.endsWith('/forgot-password')) {forgotRequests++;requestedEmails.push(JSON.parse(requestBody).email);res.end(JSON.stringify({message:'If an account exists for this email, a password reset link has been sent.'}));return;}
  if(url.endsWith('/reset-password')) {resetRequests++;res.statusCode=mode==='invalid'?400:mode==='server'?500:200;res.end(JSON.stringify(mode==='invalid'?{code:'INVALID_RESET_LINK',message:'This reset link is invalid, expired, or already used. Please request a new link.'}:mode==='server'?{message:'Server error'}:{message:'Password reset successful'}));return;}
  res.end(req.url.startsWith('/api/books?')?JSON.stringify({books:[]}):'[]');return;
 }
 const files={'/forgot_password.html':'views/forget_password.html','/reset_password.html':'views/reset_password.html','/':'views/index.html'};
 const file=files[url]||'public'+url;
 try{const body=fs.readFileSync(path.join(root,file));res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dashboard-edge-'));
const browser=spawn(process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
 const portFile=path.join(profile,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++) await new Promise(r=>setTimeout(r,100));
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();const errors=[];
 ws.addEventListener('message',async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params);else if(m.method==='Fetch.requestPaused') await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,body:''});});
 function send(method,params={}){return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 await send('Page.enable');await send('Runtime.enable');
 await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
 const pause=()=>new Promise(r=>setTimeout(r,200));
 const go=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${page}`});await pause();};
 const check=async expression=>{if(!await evaluate(expression))throw Error('Browser assertion failed: '+expression);};
 const fill=async(a,b=a)=>evaluate(`document.querySelector('#newPassword').value=${JSON.stringify(a)};document.querySelector('#confirmPassword').value=${JSON.stringify(b)};document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));`);
 for(const width of [1440,768,375,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await go('/reset_password.html');
  await check(`document.querySelector('#submitBtn').disabled && !document.querySelector('#resendLink').classList.contains('hidden') && document.querySelector('#alertBox').textContent.includes('missing')`);
  await check(`document.documentElement.scrollWidth <= innerWidth`);
  await evaluate(`document.querySelector('#resendLink').click()`);await pause();
  await check(`document.querySelector('#forgotPasswordForm') !== null`);
  await check(`document.documentElement.scrollWidth <= innerWidth`);
  console.log('PASS: missing-token recovery and responsive forms at '+width+'px');
 }
 await evaluate(`localStorage.clear()`);await go('/forgot_password.html');
 await evaluate(`document.querySelector('#email').value='Mixed@Example.com';for(let i=0;i<5;i++)document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));`);await pause();
 if(forgotRequests!==1)throw Error('Repeated clicks bypassed cooldown');
 await check(`document.querySelector('#submitBtn').disabled && document.querySelector('#cooldownText').textContent.includes('Resend link in') && document.querySelector('#resendBtn').disabled && !document.querySelector('#resendBtn').classList.contains('hidden')`);
 // The resend button must reuse the original email even if the input was edited.
 await evaluate(`Date.now=()=>${Date.now()+61000};renderButton();document.querySelector('#email').value='changed@example.com';document.querySelector('#resendBtn').click();document.querySelector('#resendBtn').click();`);await pause();
 if(forgotRequests!==2 || requestedEmails[1]!=='mixed@example.com')throw Error('Resend changed recipient or duplicated request');
 await go('/forgot_password.html');await check(`document.querySelector('#submitBtn').disabled`);
 console.log('PASS: resend, repeated-click guard and cooldown survives reload');
 const token='a'.repeat(64);
 await go('/reset_password.html?token='+token);
 await check(`location.search===''`);
 await fill('short');await check(`document.querySelector('#alertBox').textContent.includes('at least 8')`);
 await fill('StrongPass123!','Different123!');await check(`document.querySelector('#alertBox').textContent.includes('do not match')`);
 if(resetRequests)throw Error('Invalid password sent to API');
 mode='invalid';await fill('StrongPass123!');await pause();
 await check(`document.querySelector('#submitBtn').disabled && !document.querySelector('#resendLink').classList.contains('hidden')`);
 mode='server';await go('/reset_password.html?token='+token);await fill('StrongPass123!');await pause();
 await check(`!document.querySelector('#submitBtn').disabled && document.querySelector('#alertBox').textContent.includes('try again later')`);
 mode='success';await fill('StrongPass123!');await pause();
 await check(`document.querySelector('#alertBox').textContent.includes('successfully') && document.querySelector('#submitBtn').disabled`);
 await evaluate(`document.querySelector('#loginLink').click()`);await pause();
 await check(`location.search==='?login=1' && document.querySelector('#authOverlay').classList.contains('is-open')`);
 console.log('PASS: weak/mismatched passwords, invalid/expired recovery, server retry, success and login modal redirect');
 if(errors.length)throw Error('JavaScript console errors were captured during browser tests');
 console.log('PASS: no JavaScript console errors (API responses and external fonts/icons mocked).');
 await send('Browser.close');
}finally{ws?.close();browser.kill();server.close();}
