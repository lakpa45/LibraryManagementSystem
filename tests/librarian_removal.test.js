import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { testLibrarianRemovalBrowser } from './librarian_removal_browser.mjs';

const connection=process.env.LIBRARIAN_TEST_DATABASE_URL;
// Application imports must never pick production credentials from .env.
process.env.DATABASE_URL=connection || 'postgresql://postgres@127.0.0.1:55441/postgres?sslmode=disable';
process.env.JWT_SECRET='isolated-librarian-removal-tests';
const {default:pool}=await import('../db/connection.js');
const {default:routes}=await import('../routes/librarianRoutes.js');
const {librarianStaffSignin}=await import('../controllers/auth/librarian_staff_signin.js');

test('administrator add/remove with real PostgreSQL constraints and browser UI', {skip:!connection&&'Set LIBRARIAN_TEST_DATABASE_URL to an isolated local database'}, async t=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(connection).hostname));
 const schema='removal_'+Date.now();
 const db=new pg.Client({connectionString:connection});await db.connect();
 await db.query(`CREATE SCHEMA ${schema}`);
 // Recreate the inspected production tables and foreign keys in a private schema.
 const sql=(await fs.readFile(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8')).replaceAll('public.',schema+'.');
 await db.query(sql);await db.query(`SET search_path TO ${schema},public`);
 const realConnect=pool.connect.bind(pool);
 pool.connect=async()=>{const c=await realConnect();await c.query(`SET search_path TO ${schema},public`);return c;};
 // pg Pool.query's callback-based connect is not compatible with this wrapper.
 pool.query=async(...args)=>{const c=await pool.connect();try{return await c.query(...args);}finally{c.release();}};
 const app=express();app.use(express.json());app.use('/api/admin/librarians',routes);app.use('/api/librarians',routes);
 app.post('/api/auth/librarian-staff/signin',librarianStaffSignin);
 app.get('/admin/librarians',(req,res)=>res.sendFile('views/admin/admin_librarians.html',{root:process.cwd()}));
 app.use(express.static('public'));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 t.after(async()=>{await new Promise(r=>server.close(r));await pool.end();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();});
 const base='http://127.0.0.1:'+server.address().port;
 const admin=jwt.sign({id:1,role:'admin'},process.env.JWT_SECRET);
 const staff=jwt.sign({id:1,role:'librarian'},process.env.JWT_SECRET);
 const member=jwt.sign({id:1,role:'member'},process.env.JWT_SECRET);
 async function request(url,{method='GET',token=admin,body}={}){const r=await fetch(base+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
 const details={name:'Removable Librarian',email:'remove@example.test',password:'TestPass123!',phone:'12345678'};
 let id;
 await t.test('add, list, remove unreferenced account and reject deleted login',async()=>{
  const added=await request('/api/admin/librarians',{method:'POST',body:details});assert.equal(added.status,201);id=added.body.librarian.librarian_id;
  assert.equal((await request('/api/admin/librarians')).body.length,1);
  assert.equal((await request('/api/auth/librarian-staff/signin',{method:'POST',token:null,body:details})).status,200);
  assert.equal((await request('/api/admin/librarians/'+id,{method:'DELETE'})).status,200);
  assert.equal((await request('/api/admin/librarians')).body.length,0);
  assert.equal((await request('/api/auth/librarian-staff/signin',{method:'POST',token:null,body:details})).status,401);
 });
 await t.test('unknown/repeated/malformed IDs and backend administrator authorization',async()=>{
  assert.equal((await request('/api/admin/librarians/'+id,{method:'DELETE'})).status,404);
  assert.equal((await request('/api/admin/librarians/2147483647',{method:'DELETE'})).status,404);
  assert.equal((await request('/api/admin/librarians/1%20OR%201=1',{method:'DELETE'})).status,404);
  for(const token of [null,'invalid',staff,member])for(const [method,url]of [['DELETE','/api/admin/librarians/1'],['POST','/api/admin/librarians']]){
   assert.equal((await request(url,{method,token,body:method==='POST'?details:undefined})).status,token===staff||token===member?403:401);
  }
 });
 const hashed=await bcrypt.hash(details.password,4);
 const linked=(await db.query('INSERT INTO librarian(name,email,password) VALUES($1,$2,$3) RETURNING librarian_id',['Historical Librarian','history@example.test',hashed])).rows[0].librarian_id;
 const library=(await db.query('INSERT INTO library(library_name,librarian_id) VALUES($1,$2) RETURNING library_id',['Historical Library',linked])).rows[0].library_id;
 const category=(await db.query("INSERT INTO category(category_name) VALUES('Test category') RETURNING category_id")).rows[0].category_id;
 const book=(await db.query("INSERT INTO book(title,category_id) VALUES('Historical book',$1) RETURNING book_id",[category])).rows[0].book_id;
 const copy=(await db.query("INSERT INTO book_copy(book_id,barcode,status) VALUES($1,'TEST-COPY','available') RETURNING copy_id",[book])).rows[0].copy_id;
 await db.query("INSERT INTO issue(issue_date,due_date,return_date,member_id,copy_id,library_id) VALUES('2026-01-01','2026-01-14','2026-01-10',1,$1,$2),('2026-02-01','2026-02-14',NULL,1,$1,$2)",[copy,library]);
 const snapshot=async()=>JSON.stringify((await db.query('SELECT * FROM issue ORDER BY issue_id')).rows);
 const before=await snapshot();
 await t.test('historical loan/return records block removal and remain unchanged',async()=>{
  const result=await request('/api/admin/librarians/'+linked,{method:'DELETE'});assert.equal(result.status,409);
  assert.equal(result.body.message,'This librarian cannot be removed because the account is connected to existing library records.');
  assert.equal(await snapshot(),before);assert.equal((await db.query('SELECT * FROM library WHERE library_id=$1',[library])).rows.length,1);
  assert.equal((await db.query('SELECT * FROM librarian WHERE librarian_id=$1',[linked])).rows.length,1);
 });
 await t.test('foreign-key violations roll back and return the same clear conflict',async()=>{
  const added=await request('/api/admin/librarians',{method:'POST',body:{...details,email:'other@example.test'}});const other=added.body.librarian.librarian_id;
  await db.query('CREATE TABLE other_reference(librarian_id int REFERENCES librarian(librarian_id))');await db.query('INSERT INTO other_reference VALUES($1)',[other]);
  assert.equal((await request('/api/admin/librarians/'+other,{method:'DELETE'})).status,409);
  assert.equal((await db.query('SELECT * FROM librarian WHERE librarian_id=$1',[other])).rows.length,1);
 });
 await t.test('administrator interface: add, cancel, remove, errors and mobile',async()=>{
  await testLibrarianRemovalBrowser(base,admin,linked);
  assert.equal(await snapshot(),before);
 });
});
