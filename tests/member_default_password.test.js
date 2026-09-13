import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { memberDefaultPassword } from '../utils/member_default_password.js';
process.env.DATABASE_URL ||= 'postgres://localhost/test';
process.env.JWT_SECRET = 'test-only-secret';
const { default: pool } = await import('../db/connection.js');
const { signup } = await import('../controllers/auth/sign_up.js');
const { signin } = await import('../controllers/auth/sign_in.js');
const { changePassword } = await import('../controllers/auth/change_password_controller.js');
const { requireMemberPage } = await import('../middleware/member_page_guard.js');
const { verifyToken, optionalMemberAuth } = await import('../middleware/auth.js');
const response = () => ({ code: 200, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; }, cookie() {} });

test('default password preserves case, trims names and validates dates', () => {
  assert.equal(memberDefaultPassword('  Lakpa Sherpa  ', '2002-05-18'), 'Lakp2002');
  assert.equal(memberDefaultPassword('Li', '2000-02-29'), 'Li2000');
  assert.equal(memberDefaultPassword('aLiCe', '1999-01-01'), 'aLiC1999');
  for (const [name,dob] of [['','2002-05-18'],['Lakpa',''],['Lakpa','2001-02-29'],['Lakpa','invalid']]) assert.throws(() => memberDefaultPassword(name,dob));
});

test('librarian creation hashes default; login allows direct dashboard access', async () => {
  const originalConnect=pool.connect, originalQuery=pool.query;
  let storedHash, required=false;
  const client={ release() {}, async query(sql, args=[]) {
    if (sql.includes('SELECT member_id FROM member')) return {rows:[]};
    if (sql.includes('AS last_number')) return {rows:[{last_number:0}]};
    if (sql.includes('INSERT INTO member')) { storedHash=args[3]; return {rows:[{member_id:1,first_name:'Lakpa',email:'member@example.test'}]}; }
    if (sql.includes('must_change_password = TRUE')) required=true;
    if (sql.includes('SELECT password, email')) return {rowCount:1,rows:[{password:storedHash,email:'member@example.test'}]};
    if (sql.includes('SET password =')) {storedHash=args[0];required=false;}
    return {rows:[],rowCount:1};
  }};
  pool.connect=async()=>client;
  pool.query=async()=>({rows:[{member_id:1,email:'member@example.test',status:'Approved',password:storedHash,must_change_password:required}]});
  try {
    const body={first_name:'Lakpa',last_name:'Sherpa',email:'member@example.test',phone:'9876543210',dob:'2002-05-18'};
    const invalid=response(); await signup({user:{role:'librarian'},body:{...body,dob:''}},invalid);assert.equal(invalid.code,400);
    const created=response(); await signup({user:{role:'librarian'},body},created);
    assert.equal(created.code,201);assert.equal(created.body.temp_password,undefined);assert.ok(await bcrypt.compare('Lakp2002',storedHash));assert.equal(required,false);
    const login=response();await signin({body:{email:body.email,password:'Lakp2002'}},login);
    assert.equal(login.body.mustChangePassword,undefined);
    const req={headers:{authorization:'Bearer '+login.body.token},method:'GET',originalUrl:'/api/members/me'};
    let apiAllowed=false;verifyToken(req,response(),()=>{apiAllowed=true;});assert.equal(apiAllowed,true);
    let pageAllowed=false;requireMemberPage({cookies:{userSession:login.body.token}},response(),()=>{pageAllowed=true;});assert.equal(pageAllowed,true);
    const optional={...req};optionalMemberAuth(optional,response(),()=>{});assert.equal(optional.user.id,1);
    const allowed={...req,method:'POST',originalUrl:'/api/auth/change-password'};let passed=false;verifyToken(allowed,response(),()=>{passed=true;});assert.equal(passed,true);
    const same=response();await changePassword({user:allowed.user,body:{currentPassword:'Lakp2002',newPassword:'Lakp2002'}},same);assert.equal(same.code,400);assert.equal(required,false);
    const wrong=response();await changePassword({user:allowed.user,body:{currentPassword:'wrong',newPassword:'NewPassword123!'}},wrong);assert.equal(wrong.code,400);assert.equal(required,false);
    const changed=response();await changePassword({user:allowed.user,body:{currentPassword:'Lakp2002',newPassword:'NewPassword123!'}},changed);assert.equal(changed.code,200);assert.equal(required,false);
    const old=response();await signin({body:{email:body.email,password:'Lakp2002'}},old);assert.equal(old.code,401);
    const fresh=response();await signin({body:{email:body.email,password:'NewPassword123!'}},fresh);assert.equal(fresh.body.mustChangePassword,undefined);
    assert.equal(jwt.verify(fresh.body.token,process.env.JWT_SECRET).mustChangePassword,undefined);
    const short=response();await signup({user:{role:'librarian'},body:{...body,first_name:'L'}},short);assert.equal(short.code,201);assert.ok(await bcrypt.compare('L2002',storedHash));
    const publicSignup=response();await signup({body:{...body,password:'PublicPassword123!'}},publicSignup);assert.equal(publicSignup.code,201);assert.equal(required,false);assert.ok(await bcrypt.compare('PublicPassword123!',storedHash));
  } finally {pool.connect=originalConnect;pool.query=originalQuery;}
});


test('form preview updates with names and dates and clears on reset', async () => {
  const elements=new Map();
  const element=(id)=>{
    if (!elements.has(id)) elements.set(id,{value:'',textContent:'',handlers:{},classList:{remove(){},toggle(){}},closest(){return this;},addEventListener(type,handler){this.handlers[type]=handler;}});
    return elements.get(id);
  };
  const timers=[];
  vm.runInNewContext(await fs.readFile(new URL('../public/js/librarian_register_member.js',import.meta.url),'utf8'), {
    document:{getElementById:element,querySelectorAll:()=>[]}, window:{setTimeout:fn=>timers.push(fn)}
  });
  const update=(name,date)=>{element('firstName').value=name;element('dateOfBirth').value=date;element('firstName').handlers.input();return element('memberPassword').value;};
  assert.equal(update('  Lakpa   Sherpa  ','2002-05-18'),'Lakp2002');
  assert.equal(update('Li','2000-02-29'),'Li2000');
  assert.equal(update('L','2000-02-29'),'L2000');
  assert.equal(update('aLiCe','1999-01-01'),'aLiC1999');
  assert.equal(update('Lakpa','2001-02-29'),'');
  assert.equal(update('','2002-05-18'),'');
  update('Lakpa','2002-05-18');element('dateOfBirth').value='2003-05-18';element('dateOfBirth').handlers.input();assert.equal(element('memberPassword').value,'Lakp2003');
  element('memberForm').handlers.reset();element('firstName').value='';element('dateOfBirth').value='';timers.forEach(fn=>fn());assert.equal(element('memberPassword').value,'');
});
