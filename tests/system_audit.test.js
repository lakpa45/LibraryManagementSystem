import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcrypt';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {auditBrowser} from './system_browser.mjs';

const connection=process.env.AUDIT_DATABASE_URL;
test('full HTTP integration against inspected PostgreSQL schema', {skip:!connection&&'Set AUDIT_DATABASE_URL to an isolated localhost PostgreSQL cluster'}, async t=>{
 const uri=new URL(connection);assert.ok(['localhost','127.0.0.1'].includes(uri.hostname));
 const database='library_audit_'+crypto.randomBytes(6).toString('hex');
 const admin=new pg.Pool({connectionString:connection});await admin.query(`CREATE DATABASE ${database}`);
 uri.pathname='/'+database;uri.searchParams.set('sslmode','disable');
 const db=new pg.Pool({connectionString:uri.toString()});
 let child;
 t.after(async()=>{if(child&&!child.killed){child.kill();await new Promise(r=>child.once('exit',r));}await db.end();await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end();});
 await db.query(await fs.readFile(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8'));
 await db.query(await fs.readFile(new URL('../migrations/008_secure_password_reset.sql',import.meta.url),'utf8'));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 child=spawn(process.execPath,['tests/audit-server.mjs'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,LIBRARY_AUDIT:'1',DATABASE_URL:uri.toString(),PORT:String(port),NODE_ENV:'test',RESEND_API_KEY:'re_local_test_only',EMAIL_FROM:'Library <onboarding@resend.dev>',FRONTEND_URL:`http://localhost:${port}`,JWT_SECRET:crypto.randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe','ipc']});
 let ready=false;const errors=[];child.stdout.on('data',data=>{if(String(data).includes('Server running'))ready=true;});child.stderr.on('data',data=>errors.push(String(data)));
 for(let i=0;i<100&&!ready;i++)await new Promise(r=>setTimeout(r,50));assert.ok(ready,'server starts');
 const base=`http://127.0.0.1:${port}`;
 const request=async(route,{method='GET',body,token,cookie,form,raw}={})=>{
  const headers={};if(token)headers.Authorization='Bearer '+token;if(cookie)headers.Cookie=cookie;if(body!==undefined||raw!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(base+route,{method,headers,body:form||raw||(body!==undefined?JSON.stringify(body):undefined),redirect:'manual'});
  const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}
  return {status:r.status,body:value,headers:r.headers};
 };
 const pass='AuditPassword123!';const hashed=await bcrypt.hash(pass,10);
 await db.query('INSERT INTO admins(name,email,password) VALUES ($1,$2,$3)',['Audit Admin','admin@example.test',hashed]);
 await db.query('INSERT INTO librarian(name,email,password) VALUES ($1,$2,$3)',['Audit Librarian','librarian@example.test',hashed]);
 let adminToken,staffToken,memberToken,memberId,otherToken,bookId,digitalId,categoryId,loanId;
 const signup=async(email)=>request('/api/auth/signup',{method:'POST',body:{first_name:'Audit',last_name:'Member',email,phone:'9876543210',password:pass,member_type:'Student',department:'Testing'}});
 await t.test('registration, all three login roles, cookies and logout',async()=>{
  assert.equal((await signup('member@example.test')).status,201);
  memberId=(await db.query("SELECT member_id FROM member WHERE email='member@example.test'")).rows[0].member_id;
  const pending=await request('/api/auth/signin',{method:'POST',body:{email:'member@example.test',password:pass}});assert.equal(pending.status,403);
  const a=await request('/api/auth/librarian/signin',{method:'POST',body:{email:'ADMIN@example.test',password:pass,role:'admin'}});assert.equal(a.status,200);adminToken=a.body.token;assert.match(a.headers.get('set-cookie'),/HttpOnly/);
  const l=await request('/api/auth/librarian-staff/signin',{method:'POST',body:{email:'librarian@example.test',password:pass,role:'librarian'}});assert.equal(l.status,200);staffToken=l.body.token;
  assert.equal((await request(`/api/members/${memberId}/approve`,{method:'PUT',token:staffToken})).status,200);
  const m=await request('/api/auth/signin',{method:'POST',body:{email:'MEMBER@example.test',password:pass}});assert.equal(m.status,200);memberToken=m.body.token;
  assert.equal((await request('/api/auth/signin',{method:'POST',body:{email:'member@example.test',password:'wrong'}})).status,401);
  const out=await request('/api/auth/logout',{method:'POST'});assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Expires=Thu, 01 Jan 1970/);
 });
 await t.test('authorization and protected page routes',async()=>{
  for(const route of ['/api/members','/api/dashboard/stats','/api/loans/active','/api/librarians']){
   assert.equal((await request(route)).status,401);assert.equal((await request(route,{token:memberToken})).status,403);
  }
  assert.equal((await request('/api/librarians',{token:staffToken})).status,403);
  assert.equal((await request('/librarian/dashboard')).status,302);
  assert.equal((await request('/librarian/dashboard',{cookie:'adminSession='+staffToken})).status,200);
  assert.equal((await request('/librarian/librarian_dashboard.html')).status,404);
  assert.equal((await request('/api/wishlist',{token:staffToken})).status,403);
 });
 await t.test('category CRUD and validation',async()=>{
  const c=await request('/api/categories',{method:'POST',token:staffToken,body:{category_name:'Audit Category',description:'Test category',color:'#123456'}});assert.equal(c.status,201);categoryId=c.body.category_id;
  assert.equal((await request('/api/categories/'+categoryId)).status,200);
  assert.equal((await request('/api/categories',{method:'POST',token:staffToken,body:{category_name:'audit category'}})).status,409);
  assert.equal((await request('/api/categories/'+categoryId,{method:'PUT',token:staffToken,body:{category_name:'Audit Updated',color:'#654321'}})).status,200);
 });
 const createBook=async(title,type='physical',copies=2,files={})=>{
  const form=new FormData();for(const [key,value] of Object.entries({title,isbn:'',description:'Audit description',category_id:categoryId,copies,book_type:type}))form.set(key,String(value));
  for(const [field,file]of Object.entries(files))form.set(field,file.blob,file.name);
  return request('/api/books',{method:'POST',token:staffToken,form});
 };
 await t.test('book CRUD, search, copies, physical/digital listings',async()=>{
  const book=await createBook('Audit Physical');assert.equal(book.status,201);bookId=book.body.book_id;
  const digital=await createBook('Audit Digital','digital');assert.equal(digital.status,201);digitalId=digital.body.book_id;
  assert.equal((await request('/api/books/'+bookId)).body.available_copies,'2');
  assert.ok((await request('/api/books/search?q=Audit')).body.length>=2);
  assert.equal((await request('/api/books?public=1&type=digital')).body.books[0].book_id,digitalId);
  const form=new FormData();for(const [k,v]of Object.entries({title:'Audit Physical Updated',category_id:categoryId,book_type:'physical'}))form.set(k,String(v));
  assert.equal((await request('/api/books/'+bookId,{method:'PUT',token:staffToken,form})).status,200);
  assert.equal((await request('/api/categories/'+categoryId,{method:'DELETE',token:staffToken})).status,409);
 });
 await t.test('wishlist association, duplicates, removal and old-cart isolation',async()=>{
  assert.equal((await request('/api/wishlist/'+bookId,{method:'POST',token:memberToken})).status,201);
  assert.equal((await request('/api/wishlist/'+bookId,{method:'POST',token:memberToken})).status,409);
  assert.equal((await request('/api/wishlist',{token:memberToken})).body.length,1);
  await signup('other@example.test');const otherId=(await db.query("SELECT member_id FROM member WHERE email='other@example.test'")).rows[0].member_id;
  await request(`/api/members/${otherId}/approve`,{method:'PUT',token:staffToken});otherToken=(await request('/api/auth/signin',{method:'POST',body:{email:'other@example.test',password:pass}})).body.token;
  assert.equal((await request('/api/wishlist',{token:otherToken})).body.length,0);
  assert.equal((await request('/api/wishlist/'+bookId,{method:'DELETE',token:memberToken})).status,200);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cart_items')).rows[0].n,0);
 });
 await t.test('staff borrowing, exact card lookup, concurrency, return and fine',async()=>{
  const card=(await db.query('SELECT card_no FROM member WHERE member_id=$1',[memberId])).rows[0].card_no;
  assert.equal((await request('/api/loans/members/search?q='+card,{token:staffToken})).body.valid,true);
  assert.equal((await request('/api/loans/members/search?q=STU',{token:staffToken})).status,404);
  const body={member_id:memberId,book_id:bookId,issue_date:'2026-01-01',due_date:'2026-01-15'};
  const results=await Promise.all([request('/api/loans/issue',{method:'POST',body,token:staffToken}),request('/api/loans/issue',{method:'POST',body,token:staffToken})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);loanId=results.find(r=>r.status===201).body.borrowing.issue_id;
  assert.equal((await request('/api/loans/my-loans',{token:memberToken})).body.length,1);
  assert.equal((await request('/api/books/'+bookId,{method:'DELETE',token:staffToken})).status,409);
  const returned=await request('/api/loans/return/'+loanId,{method:'PUT',token:staffToken,body:{return_date:'2026-01-18'}});assert.equal(returned.status,200);assert.equal(returned.body.fine,15);
  assert.equal((await request('/api/loans/return/'+loanId,{method:'PUT',token:staffToken,body:{}})).status,404);
  assert.equal((await request('/api/books/'+bookId)).body.available_copies,'2');
 });
 await t.test('self-service cannot borrow digital books or duplicate an active book',async()=>{
  assert.equal((await request('/api/loans/borrow',{method:'POST',token:memberToken,body:{book_id:digitalId}})).status,409);
  const results=await Promise.all([request('/api/loans/borrow',{method:'POST',token:memberToken,body:{book_id:bookId}}),request('/api/loans/borrow',{method:'POST',token:memberToken,body:{book_id:bookId}})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 });
 await t.test('invalid input returns client errors, not database errors',async()=>{
  assert.equal((await request('/api/auth/signin',{method:'POST',body:{email:'member@example.test',password:{}}})).status,400);
  assert.equal((await request('/api/categories/not-an-id')).status,400);
  assert.equal((await request('/api/loans/issue',{method:'POST',token:staffToken,body:{member_id:memberId,book_id:bookId,issue_date:'2026-02-31',due_date:'2026-03-04'}})).status,400);
  assert.equal((await request('/api/members/me',{method:'PUT',token:memberToken,body:{first_name:'Audit',last_name:'Member',email:'invalid'}})).status,400);
 });
 await t.test('pending/reject/member details and dashboard queries',async()=>{
  await signup('pending@example.test');const pending=(await request('/api/members/pending',{token:staffToken})).body;
  assert.ok(pending.length);assert.equal((await request(`/api/members/${pending[0].member_id}/reject`,{method:'PUT',token:staffToken})).status,200);
  assert.equal((await request('/api/members/me',{token:memberToken})).status,200);
  for(const route of ['/api/members','/api/dashboard/stats','/api/dashboard/activity','/api/dashboard/due-soon','/api/loans/active','/api/loans/books/search?q=Audit','/api/loans/my-activity']) assert.equal((await request(route,{token:route.includes('my-activity')?memberToken:staffToken})).status,200);
 });
 await t.test('password reset through actual routes, SDK, database and unchanged login',async()=>{
  assert.equal((await request('/api/auth/forgot-password',{method:'POST',body:{email:'MEMBER@example.test'}})).status,200);
  const token=await new Promise(resolve=>{child.once('message',m=>resolve(m.token));child.send({type:'getResetToken'});});assert.ok(token);
  assert.equal((await request('/api/auth/reset-password',{method:'POST',body:{token,newPassword:'Changed123!'}})).status,200);
  assert.equal((await request('/api/auth/reset-password',{method:'POST',body:{token,newPassword:'ChangedAgain123!'}})).status,400);
  assert.equal((await request('/api/auth/signin',{method:'POST',body:{email:'member@example.test',password:'Changed123!'}})).status,200);
  assert.equal((await request('/api/auth/signin',{method:'POST',body:{email:'member@example.test',password:pass}})).status,401);
 });
 await t.test('uploads enforce type, signature, exact 35 MB boundary and cleanup',async()=>{
  const before=new Set(await fs.readdir('public/pdfs/books'));
  const coversBefore=new Set(await fs.readdir('public/images/books'));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=','base64');
  const cover=await createBook('Cover upload','physical',1,{cover_image:{blob:new Blob([png],{type:'image/png'}),name:'audit-cover.png'}});assert.equal(cover.status,201);assert.match(cover.body.cover_image,/audit-cover\.png$/);
  assert.equal((await request(cover.body.cover_image)).status,200);
  assert.equal((await request('/api/books/'+cover.body.book_id,{method:'DELETE',token:staffToken})).status,200);
  for(const name of await fs.readdir('public/images/books'))if(!coversBefore.has(name)){assert.ok(name.includes('audit-'));await fs.unlink('public/images/books/'+name);}

  const invalid=await createBook('Invalid upload','digital',1,{book_pdf:{blob:new Blob(['not pdf'],{type:'application/pdf'}),name:'audit-invalid.pdf'}});assert.equal(invalid.status,400);
  const size=35*1024*1024,bytes=Buffer.alloc(size);bytes.write('%PDF-1.7');
  const pdf=await createBook('PDF upload','digital',1,{book_pdf:{blob:new Blob([bytes],{type:'application/pdf'}),name:'audit-valid.pdf'}});assert.equal(pdf.status,201);assert.equal(pdf.body.book_type,'digital');
  const tooBig=await createBook('Large upload','digital',1,{book_pdf:{blob:new Blob([bytes,'x'],{type:'application/pdf'}),name:'audit-large.pdf'}});assert.equal(tooBig.status,413);
  assert.equal((await request('/api/books/'+pdf.body.book_id,{method:'DELETE',token:staffToken})).status,200);
  for(const name of await fs.readdir('public/pdfs/books'))if(!before.has(name)){assert.ok(name.includes('audit-'));await fs.unlink('public/pdfs/books/'+name);}
 });
 await t.test('missing/stale frontend links and assets',async()=>{
  for(const route of ['/','/books','/categories','/e-books','/my-books','/register','/forgot_password.html','/reset_password.html','/output.css','/js/forget_password.js']) assert.equal((await request(route)).status,200);
  assert.equal((await request('/api/unknown')).status,404);
  assert.equal((await request('/api/auth/reset-password',{method:'POST',raw:'{broken'})).status,400);
 });
 await t.test('random temporary passwords and strict registration dates',async()=>{
  const body={first_name:'Temp',last_name:'Member',email:'temp@example.test',phone:'9876543210',dob:'2000-02-31'};
  assert.equal((await request('/api/auth/signup',{method:'POST',body})).status,400);
  body.dob='2000-02-29';const created=await request('/api/auth/signup',{method:'POST',body});assert.equal(created.status,201);assert.match(created.body.temp_password,/^[A-Za-z0-9_-]{24}$/);
 });

 await t.test('password/profile changes revoke resets; approval card numbers survive gaps',async()=>{
  const hash=crypto.randomBytes(32).toString('hex');
  await db.query("INSERT INTO password_reset(email,token_hash,expires_at,used) VALUES ('other@example.test',$1,NOW()+interval '30 minutes',false)",[hash]);
  assert.equal((await request('/api/auth/change-password',{method:'POST',token:otherToken,body:{currentPassword:pass,newPassword:'AnotherPassword123!'}})).status,200);
  assert.equal((await db.query('SELECT used FROM password_reset WHERE token_hash=$1',[hash])).rows[0].used,true);
  await db.query('UPDATE password_reset SET used=false WHERE token_hash=$1',[hash]);
  assert.equal((await request('/api/members/me',{method:'PUT',token:otherToken,body:{first_name:'Other',last_name:'Member',email:'changed@example.test',phone:'9876543210'}})).status,200);
  assert.equal((await db.query('SELECT used FROM password_reset WHERE token_hash=$1',[hash])).rows[0].used,true);
  const temp=(await db.query("SELECT member_id FROM member WHERE email='temp@example.test'")).rows[0].member_id;
  await db.query("UPDATE member SET card_no=NULL WHERE member_id=$1",[temp]);
  await db.query("UPDATE member SET card_no=$1 WHERE email='changed@example.test'",[`STU-${new Date().getFullYear()}-9999`]);
  assert.equal((await request(`/api/members/${temp}/approve`,{method:'PUT',token:staffToken})).status,200);
  assert.equal((await db.query('SELECT card_no FROM member WHERE member_id=$1',[temp])).rows[0].card_no,`STU-${new Date().getFullYear()}-10000`);
  assert.equal((await request('/api/librarians',{method:'POST',token:adminToken,body:{name:'Added Staff',email:'added@example.test',password:pass}})).status,201);
  assert.equal((await request('/api/auth/change-password',{method:'POST',token:adminToken})).status,400);
  assert.equal((await request('/css/output.css')).body,(await request('/output.css')).body);
 });
 await t.test('browser pages, real APIs, stored XSS and responsive layouts',{skip:!process.env.AUDIT_BROWSER},async()=>{
  await db.query("UPDATE member SET first_name=$1 WHERE member_id=$2",['<img src=x onerror="window.__auditXss=true">',memberId]);
  await auditBrowser(base,{admin:adminToken,staff:staffToken,member:memberToken},bookId,(await db.query('SELECT card_no FROM member WHERE member_id=$1',[memberId])).rows[0].card_no);
 });

});
