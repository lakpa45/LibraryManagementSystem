import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const base=process.env.SEARCH_TEST_URL || 'http://localhost:3000';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'homepage-search-'));
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
 const portFile=path.join(profile,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++) await new Promise(r=>setTimeout(r,100));
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 function send(method,params={}){return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function wait(expression){for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(200);}throw Error('Timed out: '+expression);}
 const check=async expression=>assert.ok(await evaluate(expression),expression);
 const go=async()=>{await send('Page.navigate',{url:base});await wait(`document.readyState==='complete' && document.querySelector('#navbarSearchInput')?.dataset.bookSearchAttached==='true'`);};
 await send('Page.enable');await send('Runtime.enable');
 for(const width of [1440,768,375,320]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await go();
  await check(`document.querySelectorAll('input[type=search]').length===1 && !document.querySelector('#heroSearchInput')`);
  await check(`new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size===document.querySelectorAll('[id]').length`);
  await check(`(()=>{const r=document.querySelector('#navbarSearchInput').getBoundingClientRect();return r.width>80 && r.left>=0 && r.right<=innerWidth})()`);
  await check(`document.documentElement.scrollWidth<=innerWidth`);
  await check(`document.querySelector('.hero__meta').getBoundingClientRect().top-document.querySelector('.hero__copy>p').getBoundingClientRect().bottom<=30`);
  if(width<=768){await evaluate(`document.querySelector('#menuToggle').click()`);await check(`document.querySelector('#menuToggle').getAttribute('aria-expanded')==='true'`);await evaluate(`document.querySelector('#menuClose').click()`);}
  await evaluate(`document.querySelector('#navbarSearchInput').focus();document.querySelector('#navbarSearchInput').value='zz-no-match-987654';document.querySelector('#navbarSearchInput').dispatchEvent(new Event('input',{bubbles:true}))`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',text:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait(`location.pathname==='/books' && new URLSearchParams(location.search).get('q')==='zz-no-match-987654'`);
  console.log('PASS layout, unique IDs, single search, Enter and menu at '+width+'px');
 }
 await go();
 const data=await evaluate(`fetch('/api/books?public=1&limit=48').then(r=>r.json())`);
 assert.ok(data.books?.length,'Live catalog must contain books');
 const book=data.books[0];
 for(const term of [book.title,book.category_name].filter(Boolean)){
  await evaluate(`document.querySelector('#navbarSearchInput').value=${JSON.stringify(term)};document.querySelector('#navbarSearchInput').dispatchEvent(new Event('input',{bubbles:true}))`);
  await wait(`document.querySelector('.search-dropdown__item')!==null`);
  console.log('PASS live suggestions: '+term);
  await evaluate(`document.querySelector('#navbarSearchInput').value='';document.querySelector('#navbarSearchInput').dispatchEvent(new Event('input',{bubbles:true}))`);
 }
 const isbnBook=data.books.find(b=>b.isbn);
 if(isbnBook){await evaluate(`document.querySelector('#navbarSearchInput').value=${JSON.stringify(isbnBook.isbn)};document.querySelector('#navbarSearchForm').requestSubmit()`);await wait(`location.pathname==='/books'`);const results=await evaluate(`fetch('/api/books?q='+encodeURIComponent(${JSON.stringify(isbnBook.isbn)})).then(r=>r.json())`);assert.ok(results.books.some(b=>b.book_id===isbnBook.book_id));console.log('PASS ISBN query and catalog results');}
 if(!isbnBook){const isbn='9780000000000';await go();await evaluate(`document.querySelector('#navbarSearchInput').value='${isbn}';document.querySelector('#navbarSearchForm').requestSubmit()`);await wait(`location.pathname==='/books' && new URLSearchParams(location.search).get('q')==='${isbn}'`);console.log('PASS ISBN query redirect (no catalog ISBN fixture available)');}
 console.log('PASS '+base);
} finally {ws?.close();browser.kill();}

