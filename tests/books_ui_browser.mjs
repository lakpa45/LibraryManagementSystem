import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const root=process.cwd();
const covers=fs.readdirSync('public/images/books').filter(f=>/\.(png|jpe?g|webp)$/i.test(f)).slice(0,4);
const books=Array.from({length:12},(_,i)=>({book_id:i+1,title:i===0?'A very long book title to verify consistent card sizing across every row':'Book '+(i+1),description:i===0?'A detailed description. '.repeat(200):i%2?'Short description.':'Another useful description. '.repeat(12),category_name:'Literature',category_id:1,isbn:i%2?'9781234567890':null,author:i===0?'Example Author':null,book_type:i===2?'digital':'physical',available_copies:i===1?0:2,total_copies:2,cover_image:i===3?null:covers.length?'/images/books/'+encodeURIComponent(covers[i%covers.length]):'/images/placeholder-book.svg',wishlisted:false,pdf_file:i===2?'/test.pdf':null}));
const calls=[]; let borrowMode='success';
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const route=decodeURIComponent(url.pathname);
 if(route.startsWith('/api/')) {
  let raw='';for await(const chunk of req)raw+=chunk;
  calls.push({route,query:url.search,method:req.method,body:raw,authorization:req.headers.authorization});
  res.setHeader('Content-Type','application/json');
  if(route==='/api/categories'){res.end(JSON.stringify([{category_id:1,category_name:'Literature'}]));return;}
  if(route==='/api/books'){res.end(JSON.stringify(url.search?{books,total:12,page:1,pages:1}:books));return;}
  if(route.startsWith('/api/books/')){res.end(JSON.stringify(books[Number(route.split('/').pop())-1]));return;}
  if(route.startsWith('/api/wishlist/')){const b=books[Number(route.split('/')[3])-1];if(req.method==='POST')b.wishlisted=true;if(req.method==='DELETE')b.wishlisted=false;res.end(JSON.stringify({wishlisted:b.wishlisted,message:'Wishlist updated'}));return;}
  if(route==='/api/loans/borrow'){res.statusCode=borrowMode==='conflict'?409:201;res.end(JSON.stringify({message:borrowMode==='conflict'?'You already borrowed this book.':'Borrowed'}));return;}
  res.end('[]');return;
 }
 const files={'/books':'views/all_books.html','/book.html':'views/book.html','/css/output.css':'public/output.css'};
 const file=path.join(root,files[route]||'public'+route);
 try {const body=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':/\.jpe?g$/i.test(file)?'image/jpeg':file.endsWith('.webp')?'image/webp':'text/html');res.end(body);}catch{res.statusCode=404;res.end();}
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
 const pause=()=>new Promise(r=>setTimeout(r,250));
 const go=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${page}`});await pause();};
 const check=async expression=>{assert.ok(await evaluate(expression),expression);};
 const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause();};
 for(const [width,columns] of [[1440,4],[1024,3],[768,2],[375,1],[320,1]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await go('/books');
  await check(`getComputedStyle(document.querySelector('#booksGrid')).gridTemplateColumns.split(' ').length===${columns}`);
  await check(`new Set(Array.from(document.querySelectorAll('.book-card')).map(e=>Math.round(e.getBoundingClientRect().height))).size===1`);
  await check(`Array.from(document.querySelectorAll('.book-cover-frame')).every(e=>{const r=e.getBoundingClientRect();return r.height<=281 && Math.abs(r.width/r.height-2/3)<.01})`);
  await check(`Array.from(document.querySelectorAll('.book-cover')).every(e=>getComputedStyle(e).objectFit==='contain')`);
  await check(`getComputedStyle(document.querySelector('.book-description')).webkitLineClamp==='2'`);
  await check(`Array.from(document.querySelectorAll('.book-card .wishlist-button')).every(b=>b.textContent.length===1 && b.hasAttribute('aria-label'))`);
  await check(`new Set(Array.from(document.querySelectorAll('.book-card .book-actions')).slice(0,${columns}).map(e=>Math.round(e.getBoundingClientRect().top))).size===1`);
  await check(`document.documentElement.scrollWidth<=innerWidth`);
  await check(`getComputedStyle(document.querySelector('#booksGrid')).paddingTop==='0px'`);
  await click('.details-button');
  await check(`document.querySelector('dialog').open && document.body.style.overflow==='hidden' && document.documentElement.style.overflow==='hidden'`);
  await check(`document.querySelector('#detailsTitle').textContent.includes('very long') && document.querySelector('.details-meta').textContent.includes('Example Author') && document.querySelector('.details-meta').textContent.includes('ISBN')`);
  await check(`getComputedStyle(document.querySelector('.details-content')).gridTemplateColumns.split(' ').length===${width<=640?1:2}`);
  await check(`document.querySelector('dialog').getBoundingClientRect().height<=innerHeight && document.querySelector('dialog').scrollHeight>document.querySelector('dialog').clientHeight`);
  await check(`document.querySelector('.details-content .book-cover-frame').getBoundingClientRect().width<=280 && document.querySelector('.details-content .book-cover-frame').getBoundingClientRect().height<=400`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause();
  await check(`!document.querySelector('dialog').open && document.body.style.overflow!== 'hidden' && document.documentElement.style.overflow!== 'hidden' && document.activeElement.classList.contains('details-button')`);
  await click('.details-button');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});await pause();
  await check(`!document.querySelector('dialog').open`);
  await click('.details-button');await click('#detailsClose');await check(`!document.querySelector('dialog').open`);
  await go('/book.html?id=1');
  await check(`!document.querySelector('#bookDetailContent').hidden && document.querySelector('#bookAuthor').textContent==='Example Author' && getComputedStyle(document.querySelector('#bookCover')).objectFit==='contain' && document.documentElement.scrollWidth<=innerWidth`);
  console.log(`PASS: ${width}px / ${columns} columns, equal cards, contained covers, two-line descriptions, scrollable details, Escape/outside/close and standalone page`);
 }
 await go('/books');await click('.details-button');
 await click('.details-actions .detail-action');
 await check(`!document.querySelector('dialog').open && document.querySelector('#authOverlay').classList.contains('is-open') && document.body.style.overflow==='hidden'`);
 assert.equal(calls.filter(c=>c.route.startsWith('/api/wishlist/')&&c.method==='POST').length,0);
 await click('#authClose');
 // Synthetic JWT for client-only authentication guards; no production credentials.
 const token='x.'+Buffer.from(JSON.stringify({email:'reader@example.test',role:'member',exp:9999999999})).toString('base64')+'.x';
 await evaluate(`localStorage.setItem('token',${JSON.stringify(token)})`);await go('/books');await click('.details-button');
 await click('.details-actions .detail-action');await check(`document.querySelector('.details-actions .detail-action').getAttribute('aria-pressed')==='true' && document.querySelector('.book-card .wishlist-button').getAttribute('aria-pressed')==='true'`);
 await click('.details-actions .detail-action');await check(`document.querySelector('.details-actions .detail-action').getAttribute('aria-pressed')==='false'`);
 borrowMode='conflict';await click('.details-actions .detail-action--primary');await check(`document.querySelector('.details-message').textContent.includes('already borrowed') && !document.querySelector('.details-actions .detail-action--primary').disabled`);
 borrowMode='success';await click('.details-actions .detail-action--primary');await check(`document.querySelector('.details-actions .detail-action--primary').disabled && document.querySelector('.details-message').textContent.includes('successfully')`);
 const borrowCalls=calls.filter(c=>c.route==='/api/loans/borrow');assert.equal(borrowCalls.length,2);assert.equal(JSON.parse(borrowCalls[0].body).book_id,1);assert.equal(borrowCalls[0].authorization,'Bearer '+token);
 await click('#detailsClose');await evaluate(`document.querySelectorAll('.details-button')[1].click()`);await pause();await check(`document.querySelector('.details-actions .detail-action--primary').disabled`);await click('#detailsClose');
 await evaluate(`document.querySelectorAll('.details-button')[2].click()`);await pause();await check(`document.querySelector('.details-actions button.detail-action--primary').hidden && document.querySelector('.details-actions a').textContent==='Read PDF'`);await click('#detailsClose');
 await evaluate(`document.querySelector('#bookSearch').value='History';document.querySelector('#bookSearch').dispatchEvent(new Event('input'))`);await new Promise(r=>setTimeout(r,500));assert.ok(calls.some(c=>c.route==='/api/books'&&c.query.includes('q=History')));
 await go('/book.html?id=1');await click('#bookWishlistButton');await check(`document.querySelector('#bookWishlistButton').getAttribute('aria-pressed')==='true'`);await click('#bookBorrowButton');await check(`document.querySelector('#bookBorrowButton').disabled && document.querySelector('#bookBorrowMessage').textContent.includes('successfully')`);
 await go('/book.html?id=3');await check(`document.querySelector('#bookBorrowButton').hidden && !document.querySelector('#bookReadPdf').hidden && document.querySelector('#bookAuthorRow').hidden`);
 console.log('PASS: login guard, wishlist add/remove and card synchronization, borrowing success/conflict, digital/unavailable states, search API and standalone actions (mock API).');
 assert.equal(errors.length,0,'No browser JavaScript errors');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await go('/books');
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'books-ui-desktop.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelectorAll('.details-button')[5].click()`);await pause();const detailShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'books-ui-details.png'),Buffer.from(detailShot.data,'base64'));
 await click('#detailsClose');await send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});await go('/books');
 const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'books-ui-mobile.png'),Buffer.from(mobile.data,'base64'));
 console.log('PASS: no JavaScript console errors. Screenshots saved in the OS temporary directory.');
 await send('Browser.close');
}finally{ws?.close();browser.kill();server.close();}
