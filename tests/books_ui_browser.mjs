import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const root=process.cwd();
const covers=fs.readdirSync('public/images/books').filter(f=>/\.(png|jpe?g|webp)$/i.test(f)).slice(0,4);
const books=Array.from({length:12},(_,i)=>({book_id:i+1,title:i===0?'A very long book title to verify consistent card sizing across every row':'Book '+(i+1),description:i===0?'A detailed description. '.repeat(200):i%2?'Short description.':'Another useful description. '.repeat(12),category_name:'Literature',category_id:1,isbn:i%2?'9781234567890':null,author:i===0?'Example Author':null,book_type:i===2?'digital':'physical',available_copies:i===1?0:2,total_copies:2,cover_image:i===3?null:covers.length?'/images/books/'+encodeURIComponent(covers[i%covers.length]):'/images/placeholder-book.svg',wishlisted:false,pdf_file:i===2?'/test.pdf':null}));
const calls=[]; let borrowMode='success',wishlistMode='success',deleteMode='success',wishlistDelay=0;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const route=decodeURIComponent(url.pathname);
 if(route.startsWith('/api/')) {
  let raw='';for await(const chunk of req)raw+=chunk;
  calls.push({route,query:url.search,method:req.method,body:raw,authorization:req.headers.authorization});
  res.setHeader('Content-Type','application/json');
  if(route==='/api/categories'){res.end(JSON.stringify([{category_id:1,category_name:'Literature'}]));return;}
  if(route==='/api/books'){res.end(JSON.stringify(url.search?{books,total:12,page:1,pages:1}:books));return;}
  if(route.startsWith('/api/books/')){res.end(JSON.stringify(books[Number(route.split('/').pop())-1]));return;}
  if(route==='/api/wishlist'){await new Promise(r=>setTimeout(r,wishlistDelay));res.statusCode=wishlistMode==='error'?500:wishlistMode==='expired'?401:200;res.end(JSON.stringify(wishlistMode==='success'?books.filter(b=>b.wishlisted):{message:'Wishlist is temporarily unavailable.'}));return;}
  if(route.startsWith('/api/wishlist/')){if(req.method==='DELETE'&&deleteMode==='error'){res.statusCode=500;res.end(JSON.stringify({message:'Could not remove this book.'}));return;}const b=books[Number(route.split('/')[3])-1];if(req.method==='POST')b.wishlisted=true;if(req.method==='DELETE')b.wishlisted=false;res.end(JSON.stringify({wishlisted:b.wishlisted,message:'Wishlist updated'}));return;}
  if(route==='/api/loans/borrow'){res.statusCode=borrowMode==='conflict'?409:201;res.end(JSON.stringify({message:borrowMode==='conflict'?'You already borrowed this book.':'Borrowed'}));return;}
  res.end('[]');return;
 }
 const files={'/my-books':'views/my_books.html','/books':'views/all_books.html','/book.html':'views/book.html','/css/output.css':'public/output.css'};
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

 // My Books uses the same cards/modal; exercise stateful wishlist operations.
 let acceptRemoval=false,confirmations=0;
 ws.addEventListener('message',async event=>{const m=JSON.parse(event.data);if(m.method==='Page.javascriptDialogOpening'){confirmations++;await send('Page.handleJavaScriptDialog',{accept:acceptRemoval});}});
 for(const [width,columns] of [[1440,4],[1024,3],[768,2],[375,1],[320,1]]){
  books.forEach(b=>b.wishlisted=true);
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await go('/my-books');
  await check(`document.querySelector('#savedBookCount').textContent==='12 saved books' && document.querySelectorAll('#myBooksGrid .book-card').length===12`);
  await check(`getComputedStyle(document.querySelector('#myBooksGrid')).gridTemplateColumns.split(' ').length===${columns}`);
  await check(`new Set(Array.from(document.querySelectorAll('.book-card')).map(e=>Math.round(e.getBoundingClientRect().height))).size===1`);
  await check(`new Set(Array.from(document.querySelectorAll('.book-card .book-actions')).slice(0,${columns}).map(e=>Math.round(e.getBoundingClientRect().top))).size===1`);
  await check(`Array.from(document.querySelectorAll('.book-cover-frame')).every(e=>e.clientHeight<=281 && Math.abs(e.clientWidth/e.clientHeight-2/3)<.01)`);
  await check(`getComputedStyle(document.querySelector('.book-cover')).objectFit==='contain' && getComputedStyle(document.querySelector('.book-description')).webkitLineClamp==='2' && getComputedStyle(document.querySelector('.book-card h2')).webkitLineClamp==='2'`);
  await check(`document.documentElement.scrollWidth<=innerWidth && Array.from(document.querySelectorAll('.book-actions button')).filter(e=>!e.hidden).every(e=>e.getBoundingClientRect().height>=44)`);
  await click('.details-button');await check(`document.querySelector('dialog').open && document.documentElement.style.overflow==='hidden' && document.querySelector('.details-actions .remove-button').textContent==='Remove from Wishlist'`);
  await click('#detailsClose');
  if(width<=375){await click('#menuToggle');await check(`document.querySelector('#menuToggle').getAttribute('aria-expanded')==='true'`);await click('#menuClose');await check(`document.querySelector('#menuToggle').getAttribute('aria-expanded')==='false'`);}
  await evaluate(`document.querySelector('#myBooksSearch').value='Example Author';document.querySelector('#myBooksSearch').dispatchEvent(new Event('input'))`);
  await check(`document.querySelectorAll('.book-card').length===1 && document.querySelector('#savedBookCount').textContent==='12 saved books'`);
  await evaluate(`document.querySelector('#myBooksSearch').value='no-such-title';document.querySelector('#myBooksSearch').dispatchEvent(new Event('input'))`);
  await check(`document.querySelector('#myBooksState').textContent.includes('No matching books')`);await click('#myBooksState button');
  const beforeDelete=calls.filter(c=>c.method==='DELETE').length;
  acceptRemoval=false;await click('.remove-button');assert.equal(calls.filter(c=>c.method==='DELETE').length,beforeDelete);
  acceptRemoval=true;deleteMode='error';await click('.remove-button');await check(`document.querySelectorAll('.book-card').length===12 && document.querySelector('#myBooksToast').dataset.error==='true' && !document.querySelector('.remove-button').disabled`);
  deleteMode='success';const beforeLoad=calls.filter(c=>c.route==='/api/wishlist').length;
  await click('.remove-button');await check(`document.querySelectorAll('.book-card').length===11 && document.querySelector('#savedBookCount').textContent==='11 saved books' && !document.querySelector('#myBooksToast').hidden && document.querySelector('#myBooksToast').dataset.error==='false'`);
  assert.equal(calls.filter(c=>c.route==='/api/wishlist').length,beforeLoad,'Removal does not refetch the list');
  // Borrow a physical available book, then remove another from inside the shared modal.
  await evaluate(`document.querySelectorAll('.book-card')[2].querySelector('.detail-action').click()`);await pause();
  await check(`document.querySelectorAll('.book-card')[2].querySelector('.detail-action').textContent==='Borrowed' && document.querySelector('#myBooksToast').textContent.includes('borrowed successfully')`);
  await click('.details-button');await click('.details-actions .remove-button');await check(`!document.querySelector('dialog').open && document.querySelectorAll('.book-card').length===10 && document.body.style.overflow!=='hidden'`);
  console.log(`PASS: My Books ${width}px cards, search, details, mobile menu, confirmation/cancel, removal success/error without refetch, and borrowing`);
 }
 assert.ok(confirmations>=15);
 wishlistDelay=1000;await go('/my-books');await check(`document.querySelectorAll('.wishlist-skeleton').length===8 && document.querySelector('#myBooksGrid').getAttribute('aria-busy')==='true'`);await new Promise(r=>setTimeout(r,1100));wishlistDelay=0;
 wishlistMode='error';await go('/my-books');await check(`document.querySelector('#myBooksState').textContent.includes('could not load') && document.querySelector('#myBooksState button').textContent==='Retry'`);
 wishlistMode='success';await click('#myBooksState button');await check(`document.querySelectorAll('.book-card').length===10`);
 // Adding on All Books appears on My Books through the unchanged API.
 books.forEach(b=>b.wishlisted=false);await go('/my-books');await check(`document.querySelector('#myBooksState a').getAttribute('href')==='/books' && document.querySelector('#savedBookCount').textContent==='0 saved books'`);
 await go('/books');await click('.wishlist-button');await go('/my-books');await check(`document.querySelectorAll('.book-card').length===1`);
 await click('.remove-button');await check(`document.querySelector('#myBooksState').textContent.includes('next favourite') && document.querySelectorAll('.book-card').length===0`);
 wishlistMode='expired';await go('/my-books');await check(`!localStorage.getItem('token') && document.querySelector('#myBooksState').textContent.includes('Sign in')`);
 const readCount=calls.filter(c=>c.route==='/api/wishlist').length;await go('/my-books');assert.equal(calls.filter(c=>c.route==='/api/wishlist').length,readCount,'Signed-out page does not fetch private wishlist');
 await click('#myBooksState button');await check(`document.querySelector('#authOverlay').classList.contains('is-open')`);
 console.log('PASS: wishlist skeletons, load error/retry, add-to-wishlist cross-page flow, empty state, final removal and expired/signed-out authentication');
 wishlistMode='success';books.forEach(b=>b.wishlisted=true);await evaluate(`localStorage.setItem('token',${JSON.stringify(token)})`);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await go('/my-books');
 const myDesktop=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'wishlist-desktop.png'),Buffer.from(myDesktop.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});await go('/my-books');
 const myMobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'wishlist-mobile.png'),Buffer.from(myMobile.data,'base64'));
 assert.equal(errors.length,0,'No browser JavaScript errors');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await go('/books');
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'books-ui-desktop.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelectorAll('.details-button')[5].click()`);await pause();const detailShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'books-ui-details.png'),Buffer.from(detailShot.data,'base64'));
 await click('#detailsClose');await send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});await go('/books');
 const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'books-ui-mobile.png'),Buffer.from(mobile.data,'base64'));
 console.log('PASS: no JavaScript console errors. Screenshots saved in the OS temporary directory.');
 await send('Browser.close');
}finally{ws?.close();browser.kill();server.close();}
