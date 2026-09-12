import {auditActions} from './functionality_actions.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

export async function auditBrowser(base, tokens, bookId, cardNo) {
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'library-audit-edge-'));
 const browser=spawn(process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;
 try {
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++)await new Promise(r=>setTimeout(r,100));
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0,current='';const pending=new Map(),failures=[],controls=[],linkChecks=new Map();
  function send(method,params={}){return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
  ws.addEventListener('message',async e=>{
   const m=JSON.parse(e.data);
   if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}
   else if(m.method==='Page.javascriptDialogOpening')await send('Page.handleJavaScriptDialog',{accept:true});
   else if(m.method==='Runtime.exceptionThrown')failures.push({page:current,error:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});
   else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')failures.push({page:current,console:m.params.args.map(x=>x.description||x.value).join(' ')});
   else if(m.method==='Network.responseReceived'&&m.params.response.url.startsWith(base)&&m.params.response.status>=400)failures.push({page:current,status:m.params.response.status,url:new URL(m.params.response.url).pathname});
   else if(m.method==='Fetch.requestPaused')await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,body:''});
  });
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  // Only external fonts/icons/remote imagery are stubbed. All local assets and APIs are real.
  await send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('token',${JSON.stringify(tokens.member)});localStorage.setItem('adminToken',${JSON.stringify(tokens.admin)});localStorage.setItem('librarianToken',${JSON.stringify(tokens.staff)});`});
  await send('Network.setCookie',{name:'adminSession',value:tokens.admin,url:base,httpOnly:true});
  await send('Network.setCookie',{name:'userSession',value:tokens.member,url:base,httpOnly:true});
  const publicPages=fs.readdirSync('views').filter(x=>x.endsWith('.html')&&!['forget_password.html','reset_password.html','studentlibrary.html','overdue&fine.html'].includes(x)).map(x=>'/'+x+(['book.html','book_detail.html'].includes(x)?'?id='+bookId:''));
  const allPages=[...publicPages,'/admin/dashboard','/admin/librarians',...['dashboard','book-categories','books','borrow-return','members','pending-members','register-member'].map(x=>'/librarian/'+x)];
  const pages=process.env.AUDIT_PAGE?allPages.filter(p=>p===process.env.AUDIT_PAGE):allPages;
  for(const width of [1440,768,375,320]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   for(const page of pages){
    current=page+' @'+width;
    await send('Network.clearBrowserCookies');
    const staffPage=page.startsWith('/admin/')||page.startsWith('/librarian/');
    await send('Network.setCookie',{name:staffPage?'adminSession':'userSession',value:staffPage?tokens.admin:tokens.member,url:base,httpOnly:true});
    await send('Page.navigate',{url:base+page});
    await new Promise(r=>setTimeout(r,350));
    const result=await evaluate(`({ready:document.readyState,path:location.pathname,overflow:document.documentElement.scrollWidth-innerWidth,xss:Boolean(window.__auditXss)})`);
    if(result.overflow>1)failures.push({page:current,overflow:result.overflow,elements:await evaluate(`Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))`)});

    if(width===1440){
      const audit=await send('Runtime.evaluate',{includeCommandLineAPI:true,returnByValue:true,expression:`({links:[...document.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),label:a.textContent.trim(),visible:!!a.getClientRects().length,target:a.target,rel:a.rel})),controls:[...document.querySelectorAll('button,input,select,textarea,form')].map(e=>({tag:e.tagName,id:e.id,type:e.type,label:(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,100),disabled:e.disabled,visible:!!e.getClientRects().length,events:Object.keys(getEventListeners(e)),inline:[...e.attributes].filter(a=>a.name.startsWith('on')).map(a=>a.name)})),duplicateIds:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i)})`});
      const data=audit.result.value;controls.push({page,...data});
      if(data.duplicateIds.length)failures.push({page:current,duplicateIds:data.duplicateIds});
      for(const link of data.links){
        if(!link.href){if(link.visible)failures.push({page:current,missingHref:link.label});continue;}
        if(link.href==='#'){failures.push({page:current,deadLink:link.label});continue;}
        if(/^(mailto:|tel:|https?:)/.test(link.href))continue;
        const target=new URL(link.href,base+page);
        if(!linkChecks.has(target.href)){
          const r=await fetch(target,{headers:{Cookie:'adminSession='+tokens.admin+'; userSession='+tokens.member}});
          const body=await r.text();let valid=r.ok;
          if(target.hash && !['#login'].includes(target.hash))valid=valid&&(body.includes('id="'+target.hash.slice(1)+'"')||body.includes("id='"+target.hash.slice(1)+"'"));
          linkChecks.set(target.href,{url:target.pathname+target.search+target.hash,status:r.status,valid});
        }
        if(!linkChecks.get(target.href).valid)failures.push({page:current,brokenLink:link.href});
      }
    }
    if(page==='/librarian/borrow-return') {
     await evaluate(`document.querySelector('#i-member-search').value=${JSON.stringify(cardNo)};document.querySelector('#i-member-search').dispatchEvent(new Event('input',{bubbles:true}))`);
     await new Promise(r=>setTimeout(r,700));
     assert.ok(await evaluate(`document.querySelector('#i-member-search').classList.contains('border-green-600')`),'Valid card gets green indicator');
    }
    if(page==='/user_dashboard.html'&&width<760){
     await evaluate(`document.querySelector('#dashboardMenuToggle').click()`);
     await new Promise(r=>setTimeout(r,350));
     assert.ok(await evaluate(`getComputedStyle(document.querySelector('#dashboardNavigation')).visibility==='visible' && document.querySelector('#dashboardMenuToggle').getAttribute('aria-expanded')==='true'`),'Mobile menu opens');
     await evaluate(`document.querySelector('#dashboardMenuClose').click()`);
    }
    if(['/librarian/borrow-return','/librarian/members','/librarian/pending-members'].includes(page))assert.equal(await evaluate(`document.querySelectorAll('.sidebar a[href="/librarian/dashboard"]').length`),1,'One working sidebar Dashboard link');
    if(result.xss)failures.push({page:current,error:'Stored XSS executed'});
    if(result.path!==(page==='/add_to_cart.html'?'/my-books':page.split('?')[0]))failures.push({page:current,redirect:result.path});
    if(page==='/librarian/members'&&!await evaluate(`document.querySelector('#members-body').textContent.includes('<img')`))failures.push({page:current,error:'XSS fixture not rendered as text'});
   }
   console.log(`Browser scanned ${pages.length} pages at ${width}px`);
  }
  if(process.env.AUDIT_ACTIONS){const actions=await auditActions({base,send,evaluate,tokens});fs.writeFileSync('docs/action-audit-results.json',JSON.stringify(actions,null,2)+'\n');}
  // The action suite deliberately exercises a category-deletion conflict.
  fs.writeFileSync('docs/control-audit-results.json',JSON.stringify({pages:controls,links:[...linkChecks.values()]},null,2)+'\n');
  const unexpected = failures.filter(f=>!(f.status===409 && f.url?.startsWith('/api/categories/')));
  fs.writeFileSync('docs/browser-audit-results.json',JSON.stringify({pages,widths:[1440,768,375,320],externalResources:'mocked',failures},null,2)+'\n');
  assert.deepEqual(unexpected,[],'Browser console, local network, redirects, XSS and page overflow');
  await send('Browser.close');
 }finally{ws?.close();browser.kill();}
}
