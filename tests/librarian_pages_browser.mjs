import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const root = process.cwd();
const calls = [];
const screenshotDir = path.join(os.tmpdir(),'librarian-pages-screenshots');
fs.mkdirSync(screenshotDir,{recursive:true});
const members = [{member_id:1,first_name:'Lakpa',last_name:'Sherpa',email:'lakpa@example.com',phone:'9876543210',member_type:'Student',department:'BCA',card_no:'STU-2026-0001',roll_id:'12',registered_on:'2026-09-01',valid_till:'2027-09-01',dob:'2002-05-18',status:'Approved'}];
const books = [{book_id:1,title:'Algorithms',description:'A practical introduction.',category_id:1,category_name:'Computer Science',book_type:'physical',total_copies:2,available_copies:2,cover_image:'/images/placeholder-book.svg'}];
const loans = [{issue_id:1,title:'Algorithms',first_name:'Lakpa',last_name:'Sherpa',issue_date:'2026-09-01',due_date:'2026-09-20',status:'Active',fine_amount:0}];
const routes = {
  '/admin/dashboard':'views/admin/admin_dashboard.html',
  '/admin/librarians':'views/admin/admin_librarians.html',
  '/librarian/dashboard':'views/librarian/librarian_dashboard.html',
  '/librarian/book-categories':'views/librarian/librarian_book_category.html',
  '/librarian/books':'views/librarian/librarian_books.html',
  '/librarian/borrow-return':'views/librarian/librarian_borrow_return.html',
  '/librarian/members':'views/librarian/librarian_members.html',
  '/librarian/pending-members':'views/librarian/librarian_pending_members.html',
  '/librarian/register-member':'views/librarian/librarian_register_member.html'
};
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let raw=''; for await (const chunk of req) raw += chunk;
    calls.push({url:url.pathname,method:req.method,body:raw});
    res.setHeader('Content-Type','application/json');
    if (url.pathname === '/api/categories') return res.end(JSON.stringify([{category_id:1,category_name:'Computer Science',description:'Technology titles',color:'#f5b301',book_count:1}]));
    if (url.pathname === '/api/dashboard/stats') return res.end(JSON.stringify({books:1,borrowers:1,overdue:0}));
    if (url.pathname === '/api/dashboard/activity' || url.pathname === '/api/dashboard/due-soon') return res.end(JSON.stringify([]));
    if (url.pathname === '/api/books') return res.end(JSON.stringify(books));
    if (url.pathname === '/api/members/pending') return res.end(JSON.stringify(members));
    if (url.pathname === '/api/members/search') return res.end(JSON.stringify(members));
    if (url.pathname === '/api/members') return res.end(JSON.stringify(members));
    if (/^\/api\/members\/1\/(approve|reject)$/.test(url.pathname)) return res.end(JSON.stringify({member:members[0]}));
    if (url.pathname === '/api/loans/active') return res.end(JSON.stringify(loans));
    if (url.pathname === '/api/loans/members/search') {
      const match = {member_id:1,display_name:'Lakpa Sherpa',unique_id:'STU-2026-0001',roll_id:'12',member_type:'Student',department:'BCA',status:'Approved',valid_till:'2027-09-01',active_borrowings:1};
      const matches = url.searchParams.get('q') === 'Shared' ? [{...match,display_name:'Shared Name'},{...match,member_id:2,display_name:'Shared Name',unique_id:'STU-2026-0002'}] : [match];
      return res.end(JSON.stringify({valid:true,count:matches.length,members:matches,member:matches.length===1?matches[0]:null}));
    }
    if (url.pathname.includes('/active')) return res.end(JSON.stringify(loans));
    return res.end(JSON.stringify([]));
  }
  const relative = routes[url.pathname] || url.pathname.replace(/^\//,'public/');
  const file = path.join(root,relative);
  try {
    const body = fs.readFileSync(file);
    const ext = path.extname(file);
    res.setHeader('Content-Type',ext==='.css'?'text/css':ext==='.js'?'text/javascript':ext==='.svg'?'image/svg+xml':'text/html');
    res.end(body);
  } catch { res.statusCode=404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));

const profile = fs.mkdtempSync(path.join(os.tmpdir(),'librarian-pages-edge-'));
const browser = spawn(process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++) await new Promise(r=>setTimeout(r,100));
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
  ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let id=0; const pending=new Map(); const errors=[];
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const job=pending.get(message.id);pending.delete(message.id);message.error?job.reject(message.error):job.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown'||message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,180));
  await send('Page.enable'); await send('Runtime.enable');
  const token='x.'+Buffer.from(JSON.stringify({role:'admin',exp:9999999999})).toString('base64')+'.x';
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('adminToken',${JSON.stringify(token)});localStorage.setItem('adminName','Test Librarian')`});
  const go=async route=>{await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${route}`});for(let i=0;i<80;i++){if(await evaluate(`document.readyState==='complete'`))break;await pause();}await pause();};
  const check=async expression=>assert.ok(await evaluate(expression),expression);
  const pages=[['/librarian/dashboard','dashboard'],['/librarian/book-categories','books'],['/librarian/books','books'],['/librarian/borrow-return','borrow-return'],['/librarian/members','members'],['/librarian/pending-members','pending-members'],['/librarian/register-member','register-member']];
  for (const [width,height] of [[1440,1000],[768,900],[375,812]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for (const [route,section] of pages) {
      await go(route);
      if (width === 1440 || width === 375) {
        const shot = await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(screenshotDir,`${route.split('/').pop()}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      if(route!=='/librarian/dashboard') await check(`document.body.classList.contains('librarian-page')`);
      await check(`document.querySelectorAll('.side-nav a.active').length===1 && document.querySelector('.side-nav a.active').getAttribute('href').includes(${JSON.stringify(section==='books'?'book-categories':section)})`);
      await check(`document.querySelectorAll('.side-nav a').length===10 && document.querySelector('.sidebar-brand').textContent.includes('APNA')`);
      await check(`!document.querySelector('.brand-grid') && document.querySelector('.sidebar-brand').children.length===1 && document.querySelector('.sidebar-brand').textContent.trim()==='APNA'`);
      await check(`document.querySelector('.top-header .profile') && document.querySelector('.top-header .header-page-name') && document.querySelector('.top-header .header-label').textContent.trim()==='Librarian'`);
      await check(`getComputedStyle(document.querySelector('.top-header')).display==='flex' && getComputedStyle(document.querySelector('.top-header')).justifyContent==='space-between' && getComputedStyle(document.querySelector('.top-header')).alignItems==='center'`);
      await check(`document.querySelectorAll('.top-header .avatar').length===1 && document.querySelector('.header-right .today').compareDocumentPosition(document.querySelector('.header-right .avatar')) & Node.DOCUMENT_POSITION_FOLLOWING`);
      await check(`(()=>{const h=document.querySelector('.top-header').getBoundingClientRect(),a=document.querySelector('.top-header .avatar').getBoundingClientRect();return a.right>h.left+h.width*.8})()`);
      await check(`document.documentElement.scrollWidth<=innerWidth`);
      await check(`Array.from(document.querySelectorAll('.dashboard-content table')).every(t=>t.parentElement.scrollWidth>=t.parentElement.clientWidth || t.scrollWidth<=innerWidth)`);
      if(width>900) await check(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)===190`);
      else {
        await check(`getComputedStyle(document.querySelector('#mobileMenuBtn')).display==='grid'`);
        await evaluate(`document.querySelector('#mobileMenuBtn').click()`); await pause();
        await check(`document.querySelector('#sidebar').classList.contains('open')`);
        await evaluate(`document.querySelector('#sidebarOverlay').click()`); await pause();
        await check(`!document.querySelector('#sidebar').classList.contains('open')`);
      }
      if(route==='/librarian/books') await check(`getComputedStyle(document.querySelector('.book-cover')).objectFit==='contain' && document.querySelector('#physicalBooksTab') && document.querySelector('#digitalBooksTab')`);
      if(route==='/librarian/pending-members'&&width<=640) await check(`Array.from(document.querySelectorAll('.pending-action-button')).filter(button=>button.getClientRects().length).every(button=>button.getBoundingClientRect().height>=48)`);
      if(route==='/librarian/borrow-return') {
        await check(`(()=>{const icon=document.querySelector('#i-member-validation-icon');icon.classList.remove('hidden');icon.classList.add('flex');const i=icon.getBoundingClientRect(),p=document.querySelector('#i-member-search').getBoundingClientRect();return i.right<=p.right&&i.left>=p.left})()`);
        if(width===375){await evaluate(`document.querySelector('#i-member-search').value='Shared';document.querySelector('#i-member-search').dispatchEvent(new Event('input',{bubbles:true}))`);await new Promise(resolve=>setTimeout(resolve,650));await check(`(()=>{const input=document.querySelector('#i-member-search').getBoundingClientRect(),menu=document.querySelector('#i-member-suggest').getBoundingClientRect();return Math.abs(input.left-menu.left)<1&&Math.abs(input.width-menu.width)<1&&menu.right<=innerWidth})()`);}
      }
      if(route==='/librarian/register-member'&&width<=640) await check(`getComputedStyle(document.querySelector('.member-form-grid')).gridTemplateColumns.split(' ').length===1`);
    }
    for (const route of ['/admin/dashboard','/admin/librarians']) {
      await go(route);
      await check(`!document.querySelector('.brand-grid') && document.querySelector('.sidebar-brand').children.length===1 && document.querySelector('.sidebar-brand').textContent.trim()==='APNA'`);
      await check(`getComputedStyle(document.querySelector('.sidebar-brand')).alignItems==='center' && document.querySelector('.sidebar-brand').getBoundingClientRect().height>=80`);
      await check(`document.documentElement.scrollWidth<=innerWidth`);
      if(width<=900){await evaluate(`document.querySelector('#mobileMenuBtn').click()`);await pause();await check(`document.querySelector('#sidebar').classList.contains('open')`);await evaluate(`document.querySelector('#sidebarOverlay').click()`);}
    }
    console.log(`PASS: librarian workspace layout at ${width}px`);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await go('/librarian/books');
  await evaluate(`document.querySelector('#digitalBooksTab').click()`); await check(`document.querySelector('#digitalBooksTab').getAttribute('aria-selected')==='true'`);
  await evaluate(`document.querySelector('#topAddBookBtn').click()`); await check(`!document.querySelector('#bookModal').classList.contains('hidden')`);
  await evaluate(`document.querySelector('#cancelModalBtn').click()`); await check(`document.querySelector('#bookModal').classList.contains('hidden')`);
  await go('/librarian/book-categories'); await evaluate(`document.querySelector('#topAddCategoryBtn').click()`); await check(`!document.querySelector('#categoryModal').classList.contains('hidden')`); await evaluate(`document.querySelector('#cancelModalBtn').click()`);
  await go('/librarian/borrow-return');
  await evaluate(`document.querySelector('#i-member-search').value='Shared';document.querySelector('#i-member-search').dispatchEvent(new Event('input',{bubbles:true}))`);
  await check(`document.querySelector('#i-member-search').value==='Shared' && document.querySelector('#i-member-id').value==='' && !document.querySelector('#i-member-search').classList.contains('border-green-600')`);
  await new Promise(resolve=>setTimeout(resolve,650));
  await check(`document.querySelectorAll('#i-member-suggest [data-member-index]').length===2 && !document.querySelector('#i-member-suggest').classList.contains('hidden') && document.querySelector('#i-member-search').value==='Shared' && document.querySelector('#i-member-id').value===''`);
  await evaluate(`document.querySelector('#i-member-suggest [data-member-index="1"]').click()`);
  await check(`document.querySelector('#i-member-id').value==='2' && document.querySelector('#i-member-search').value==='Shared Name' && document.querySelector('#i-member-search').classList.contains('border-green-600')`);
  await evaluate(`document.querySelector('#i-member-search').value='Lak';document.querySelector('#i-member-search').dispatchEvent(new Event('input',{bubbles:true}))`);
  await check(`document.querySelector('#i-member-id').value==='' && !document.querySelector('#i-member-search').classList.contains('border-green-600')`);
  await new Promise(resolve=>setTimeout(resolve,650));
  await evaluate(`document.querySelector('#i-member-search').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));document.querySelector('#i-member-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await new Promise(resolve=>setTimeout(resolve,100));
  await check(`document.querySelector('#i-member-id').value==='1' && document.querySelector('#i-member-search').value==='Lakpa Sherpa' && document.querySelector('#i-member-search').classList.contains('border-green-600')`);
  await evaluate(`document.querySelector('#tab-return').click()`); await check(`!document.querySelector('#return-form').classList.contains('hidden')`);
  await go('/librarian/members'); await evaluate(`document.querySelector('[data-type="Student"]').click()`); await check(`document.querySelector('[data-type="Student"]').classList.contains('active')`);
  await go('/librarian/pending-members'); await evaluate(`document.querySelector('[data-action="approve"]').click()`); await pause(); assert.ok(calls.some(call=>call.url==='/api/members/1/approve'&&call.method==='PUT'));
  assert.equal(errors.length,0,'No browser JavaScript errors');
  console.log('PASS: tabs, modals, filters, approval API, responsive shell, and no console errors');
  console.log(`Screenshots: ${screenshotDir}`);
  await send('Browser.close');
} finally { ws?.close(); browser.kill(); server.close(); }
