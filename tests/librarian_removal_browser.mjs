import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

export async function testLibrarianRemovalBrowser(base,token,linkedId){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'librarian-removal-browser-'));
 const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++)await pause(100);
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let seq=0,accept=false;const pending=new Map(),dialogs=[],errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++seq,{resolve,reject});ws.send(JSON.stringify({id:seq,method,params}));});
  ws.addEventListener('message',async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){dialogs.push(m.params.message);await send('Page.handleJavaScriptDialog',{accept});}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params);else if(m.method==='Fetch.requestPaused')await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,body:''});});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  async function wait(expression){for(let i=0;i<70;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Timed out: '+expression);}
  const check=async expression=>assert.ok(await evaluate(expression),expression);
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('adminToken',${JSON.stringify(token)});`});
  await send('Page.navigate',{url:base+'/admin/librarians'});await wait(`document.querySelectorAll('[data-remove-librarian]').length===2`);
  await evaluate(`window.removalPageMarker='same document';document.querySelector('#openLibrarianModal').click();for(const [name,value] of Object.entries({name:'Browser Librarian',email:'browser@example.test',phone:'12345678',password:'TestPass123!',confirmPassword:'TestPass123!'}))document.querySelector('#librarianForm').elements[name].value=value;document.querySelector('#librarianForm').requestSubmit()`);
  await wait(`document.querySelector('#librarianTableBody').textContent.includes('Browser Librarian') && document.querySelector('#librarianModal').classList.contains('hidden')`);
  const button=`[...document.querySelectorAll('[data-remove-librarian]')].find(b=>b.getAttribute('aria-label')==='Remove Browser Librarian')`;
  await evaluate(`${button}.click()`);await pause(200);
  assert.equal(dialogs.at(-1),'Are you sure you want to remove this librarian?');
  await check(`${button}!==undefined`);
  const count=await(await fetch(base+'/api/admin/librarians',{headers:{Authorization:'Bearer '+token}})).json();assert.equal(count.length,3,'cancel does not delete');
  accept=true;await evaluate(`${button}.click()`);await wait(`!document.querySelector('#librarianTableBody').textContent.includes('Browser Librarian')`);
  await check(`window.removalPageMarker==='same document' && document.querySelector('#librarianNotice').textContent==='Librarian removed successfully.'`);
  await evaluate(`document.querySelector('[data-remove-librarian="${linkedId}"]').click()`);
  await wait(`document.querySelector('#librarianNotice').textContent==='This librarian cannot be removed because the account is connected to existing library records.'`);
  await check(`!document.querySelector('[data-remove-librarian="${linkedId}"]').disabled`);
  for(const width of [1440,768,375,320]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   await check(`document.documentElement.scrollWidth<=innerWidth`);
   await check(`[...document.querySelectorAll('[data-remove-librarian]')].every(b=>{const r=b.getBoundingClientRect();return r.height>=44 && r.left>=0 && r.right<=innerWidth && b.getAttribute('aria-label').startsWith('Remove ')})`);
   console.log('PASS librarian Remove controls at '+width+'px');
  }
  assert.deepEqual(errors,[]);
 }finally{ws?.close();browser.kill();}
}
