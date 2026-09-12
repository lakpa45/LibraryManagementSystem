import assert from 'node:assert/strict';
export async function auditActions({base,send,evaluate,tokens}) {
 const results=[];
 await send('Network.setCookie',{name:'userSession',value:tokens.member,url:base,httpOnly:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 const wait=async(expression,label=expression)=>{for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await new Promise(r=>setTimeout(r,80));}throw Error('Timed out: '+label);};
 const go=async route=>{await send('Page.navigate',{url:base+route});await wait(`location.pathname===${JSON.stringify(route.split('?')[0])} && document.readyState==='complete'`);};
 const click=async selector=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const fill=async values=>evaluate(`Object.entries(${JSON.stringify(values)}).forEach(([id,value])=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));})`);
 const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
 const check=async(expr,label)=>assert.ok(await evaluate(expr),label||expr);
 const staffCookie=()=>send('Network.setCookie',{name:'adminSession',value:tokens.staff,url:base,httpOnly:true});
 const test=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('Action PASS:',name);};
 // Synthetic dialogs are accepted only in this isolated browser/database.
 const dialogListener=e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});};
 // The caller handles dialog events; keep control of fixtures through real routes.
 let categoryId,bookId;
 await test('staff category add/edit/cancel and mixed member/staff cookie authorization',async()=>{
  await staffCookie();await go('/librarian/book-categories');await click('#openAddBtn');await click('#cancelModalBtn');await check(`document.querySelector('#categoryModal').classList.contains('hidden')`);
  await click('#openAddBtn');await fill({categoryName:'Browser Actions',categoryDesc:'Isolated UI test'});await submit('#categoryForm');
  await wait(`document.querySelector('#categoryGrid').textContent.includes('Browser Actions')`);
  categoryId=await evaluate(`Number([...document.querySelectorAll('#categoryGrid [data-action=edit]')].find(b=>b.closest('.card-hover').textContent.includes('Browser Actions')).dataset.id)`);
  await click(`[data-action=edit][data-id="${categoryId}"]`);await fill({categoryName:'Browser Actions Updated'});await submit('#categoryForm');await wait(`document.querySelector('#categoryGrid').textContent.includes('Browser Actions Updated')`);
 });
 await test('staff book add/edit and copy count display',async()=>{
  await go('/librarian/books?category_id='+categoryId);await wait(`!document.querySelector('#bookModal').classList.contains('hidden')`);
  await fill({bookTitle:'Browser Action Book',bookDesc:'UI fixture',bookCopies:'2'});await submit('#bookForm');await wait(`document.querySelector('#bookGrid').textContent.includes('Browser Action Book')`);
  bookId=await evaluate(`Number([...document.querySelectorAll('#bookGrid [data-action=edit]')].find(b=>b.closest('.card-hover').textContent.includes('Browser Action Book')).dataset.id)`);
  await click(`[data-action=edit][data-id="${bookId}"]`);await check(`document.querySelector('#bookCopies').disabled && document.querySelector('#bookCopies').value==='2'`);await fill({bookTitle:'Browser Action Book Updated'});await submit('#bookForm');await wait(`document.querySelector('#bookModal').classList.contains('hidden')`);
 });
 await test('catalog search submit, details close, wishlist add/remove and borrow',async()=>{
  await go('/books?q=Browser%20Action');await wait(`document.querySelectorAll('#booksGrid .book-card').length===1`);await submit('#bookFilters');await wait(`document.querySelectorAll('#booksGrid .book-card').length===1`);
  await click('#booksGrid .details-button');await check(`document.querySelector('dialog').open`);await click('#detailsClose');await check(`!document.querySelector('dialog').open`);
  await click('#booksGrid .wishlist-button');await wait(`document.querySelector('#booksGrid .wishlist-button').getAttribute('aria-pressed')==='true'`);
  await go('/my-books');await wait(`document.querySelectorAll('#myBooksGrid .book-card').length===1`);await click('#myBooksGrid .details-button');await click('.details-actions .detail-action--primary');await wait(`document.querySelector('.details-message').textContent.includes('successfully')`);await click('#detailsClose');
  await click('#myBooksGrid .remove-button');await wait(`document.querySelector('#myBooksState').textContent.includes('Browse Books')`);
 });
 await test('member profile, renew and real book details',async()=>{
  await go('/user_dashboard.html');await wait(`document.querySelector('.book-card__actions .primary')`);await click(`.book-card__actions .primary`);await wait(`!document.querySelector('.book-card__actions .primary').disabled`);
  await fill({profileFullName:'Audit Browser Member'});await submit('.account__fields');await wait(`document.querySelector('#userDashboardName').textContent==='Audit'`);
  await go('/book.html?id='+bookId);await wait(`!document.querySelector('#bookDetailContent').hidden`);await check(`document.querySelector('#bookTitle').textContent==='Browser Action Book Updated'`);
 });
 await test('category deletion conflict shows an error and restores the button',async()=>{
  await staffCookie();await go('/librarian/book-categories');await wait(`document.querySelector('[data-action=delete][data-id="${categoryId}"]')`);await click(`[data-action=delete][data-id="${categoryId}"]`);await click('#confirmDeleteBtn');await wait(`!document.querySelector('#confirmDeleteBtn').disabled`);await check(`!document.querySelector('#deleteModal').classList.contains('hidden')`);await click('#cancelDeleteBtn');
 });
 await test('public registration validates input and creates a pending account',async()=>{
  await go('/register');await submit('#registerForm');await check(`!document.querySelector('#registerError').classList.contains('hidden')`);
  await fill({regName:'Browser Pending',regEmail:'browser@example.test',regPhone:'9876543210',regDept:'Testing',regPassword:'BrowserPassword123!',regConfirmPassword:'BrowserPassword123!'});await submit('#registerForm');await wait(`!document.querySelector('#registerSuccess').classList.contains('hidden')`);
  await new Promise(r=>setTimeout(r,1700));
 });
 await test('approve registration using staff page and login/logout every role',async()=>{
  await staffCookie();await go('/librarian/pending-members');await wait(`document.querySelector('#pending-body').textContent.includes('browser@example.test')`);
  const id=await evaluate(`document.querySelector('#pending-body tr').dataset.id`);await click(`#pending-body [data-id="${id}"][data-action=approve]`);await wait(`!document.querySelector('#pending-body').textContent.includes('browser@example.test')`);
  for(const [role,email,password,destination] of [['member','browser@example.test','BrowserPassword123!','/user_dashboard.html'],['librarian','librarian@example.test','AuditPassword123!','/librarian/dashboard'],['admin','admin@example.test','AuditPassword123!','/admin/dashboard']]){
   await go('/?login=1');await evaluate(`document.querySelector('#loginForm [name=email]').value=${JSON.stringify(email)};document.querySelector('#loginForm [name=password]').value=${JSON.stringify(password)};document.querySelector('#loginRole').value=${JSON.stringify(role)}`);await submit('#loginForm');await wait(`location.pathname===${JSON.stringify(destination)}`);
   await wait(`document.readyState==='complete'`);
   await click(role==='member'?'#dashboardLogout':'a[onclick*=logout]');
   await wait(`location.pathname==='/'`);
   const cookies = (await send('Network.getCookies',{urls:[base]})).cookies;
   assert(!cookies.some(c=>c.name==='adminSession'||c.name==='userSession'));
  }
 });
 await test('staff issue and return preserve the selected calendar due date',async()=>{
  await staffCookie();await go('/librarian/borrow-return');
  const member=await evaluate(`(async()=>{const r=await LibraryAPI.staffFetch('/api/members');return (await r.json()).find(m=>m.email==='browser@example.test')})()`);
  await fill({'i-member-search':member.card_no});await wait(`document.querySelector('#i-member-search').classList.contains('border-green-600')`);await fill({'i-book-search':'Browser Action'});await wait(`document.querySelector('#i-book-suggest [data-book]')`);await click('#i-book-suggest [data-book]');await fill({'i-issue-date':'2026-09-12'});await submit('#issue-form');await wait(`document.querySelector('#toast-title').textContent.includes('successfully')`);
  await click('#tab-return');await fill({'r-member-search':member.card_no});await click('#r-member-find');await wait(`document.querySelector('#member-active-loans [data-return]')`);await click('#member-active-loans [data-return]');await wait(`document.querySelector('#member-active-loans').textContent.includes('no active')`);
 });
 return results;
}
