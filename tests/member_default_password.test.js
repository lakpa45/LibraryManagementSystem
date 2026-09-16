import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { memberDefaultPassword } from '../utils/member_default_password.js';
import {
  DUPLICATE_EMAIL_MESSAGE,
  INVALID_EMAIL_MESSAGE,
  isValidEmail,
  normalizeEmail
} from '../utils/email_validation.js';
process.env.DATABASE_URL ||= 'postgres://localhost/test';
process.env.JWT_SECRET = 'test-only-secret';
const { default: pool } = await import('../db/connection.js');
const { signup } = await import('../controllers/auth/sign_up.js');
const { signin } = await import('../controllers/auth/sign_in.js');
const { changePassword } = await import('../controllers/auth/change_password_controller.js');
const { requireMemberPage } = await import('../middleware/member_page_guard.js');
const { verifyToken, optionalMemberAuth } = await import('../middleware/auth.js');
const response = () => ({ code: 200, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; }, cookie() {}, set() { return this; } });

test('default password uses lowercase letters, trims names and validates dates', () => {
  assert.equal(memberDefaultPassword('  Lakpa Sherpa  ', '2002-05-18'), 'lakp2002');
  assert.equal(memberDefaultPassword('Li', '2000-02-29'), 'li2000');
  assert.equal(memberDefaultPassword('aLiCe', '1999-01-01'), 'alic1999');
  assert.equal(memberDefaultPassword(" L@a-k!pa " , '2002-05-10'), 'lakp2002');
  for (const [name,dob] of [['','2002-05-18'],['Lakpa',''],['Lakpa','2001-02-29'],['Lakpa','invalid'],['123!','2002-05-10'],['Lakpa','0000-01-01'],['Lakpa','02-05-10']]) assert.throws(() => memberDefaultPassword(name,dob));
});

test('member registration email validation accepts and rejects required examples', async () => {
  for (const email of ['lakpa@example.com', 'student@college.edu.in']) assert.equal(isValidEmail(email), true, email);
  for (const email of ['missing-at-sign.com', 'name@', '@example.com', 'name@example', 'name example@gmail.com', '']) {
    assert.equal(isValidEmail(email), false, email || 'empty input');
    const res=response();
    await signup({body:{first_name:'Lakpa',last_name:'Sherpa',email,phone:'9876543210',password:'PublicPassword123!'}},res);
    assert.equal(res.code,400,email || 'empty input');
    assert.equal(res.body.message,INVALID_EMAIL_MESSAGE);
  }
  assert.equal(normalizeEmail('  Student@College.EDU.IN  '),'student@college.edu.in');
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
    assert.equal(created.code,201);assert.equal(created.body.temp_password,'lakp2002');assert.ok(await bcrypt.compare('lakp2002',storedHash));assert.equal(required,false);
    const login=response();await signin({body:{email:body.email,password:'lakp2002'}},login);
    assert.equal(login.body.mustChangePassword,undefined);
    const req={headers:{authorization:'Bearer '+login.body.token},method:'GET',originalUrl:'/api/members/me'};
    let apiAllowed=false;verifyToken(req,response(),()=>{apiAllowed=true;});assert.equal(apiAllowed,true);
    let pageAllowed=false;requireMemberPage({cookies:{userSession:login.body.token}},response(),()=>{pageAllowed=true;});assert.equal(pageAllowed,true);
    const optional={...req};optionalMemberAuth(optional,response(),()=>{});assert.equal(optional.user.id,1);
    const allowed={...req,method:'POST',originalUrl:'/api/auth/change-password'};let passed=false;verifyToken(allowed,response(),()=>{passed=true;});assert.equal(passed,true);
    const same=response();await changePassword({user:allowed.user,body:{currentPassword:'lakp2002',newPassword:'lakp2002'}},same);assert.equal(same.code,400);assert.equal(required,false);
    const wrong=response();await changePassword({user:allowed.user,body:{currentPassword:'wrong',newPassword:'NewPassword123!'}},wrong);assert.equal(wrong.code,400);assert.equal(required,false);
    const changed=response();await changePassword({user:allowed.user,body:{currentPassword:'lakp2002',newPassword:'NewPassword123!'}},changed);assert.equal(changed.code,200);assert.equal(required,false);
    const old=response();await signin({body:{email:body.email,password:'lakp2002'}},old);assert.equal(old.code,401);
    const fresh=response();await signin({body:{email:body.email,password:'NewPassword123!'}},fresh);assert.equal(fresh.body.mustChangePassword,undefined);
    assert.equal(jwt.verify(fresh.body.token,process.env.JWT_SECRET).mustChangePassword,undefined);
    const short=response();await signup({user:{role:'librarian'},body:{...body,first_name:'L'}},short);assert.equal(short.code,201);assert.ok(await bcrypt.compare('l2002',storedHash));
    for (const [first_name,dob,expected] of [['Li','2000-02-29','li2000'],[' L@a-k!pa ','2002-05-10','lakp2002'],['L','1999-12-31','l1999']]) {
      const registered=response();await signup({user:{role:'librarian'},body:{...body,first_name,dob}},registered);
      assert.equal(registered.code,201);assert.equal(registered.body.temp_password,expected);
      const signedIn=response();await signin({body:{email:body.email,password:expected}},signedIn);assert.equal(signedIn.code,200);assert.ok(signedIn.body.token);
    }
    const publicSignup=response();await signup({body:{...body,password:'PublicPassword123!'}},publicSignup);assert.equal(publicSignup.code,201);assert.equal(required,false);assert.ok(await bcrypt.compare('PublicPassword123!',storedHash));
  } finally {pool.connect=originalConnect;pool.query=originalQuery;}
});


test('registration shows backend password, supports copy, and clears it', async () => {
  const elements=new Map();
  const element=(id)=>{
    if (!elements.has(id)) elements.set(id,{value:'',textContent:'',handlers:{},attributes:{},classList:{remove(){},toggle(){},add(){}},closest(){return this;},setAttribute(name,value){this.attributes[name]=value;},addEventListener(type,handler){this.handlers[type]=handler;}});
    return elements.get(id);
  };
  const timers=[], windowHandlers={};let copied, submitted;
  vm.runInNewContext(await fs.readFile(new URL('../public/js/librarian_register_member.js',import.meta.url),'utf8'), {
    document:{getElementById:element,querySelectorAll:()=>[]},
    window:{setTimeout:fn=>timers.push(fn),addEventListener:(type,fn)=>windowHandlers[type]=fn},
    navigator:{clipboard:{writeText:async value=>{copied=value;}}},
    LibraryAPI:{staffFetch:async(url,options)=>{submitted=JSON.parse(options.body);return {ok:true};},read:async()=>({member:{card_no:'STU-2026-0001'},temp_password:'lakp2002'})}
  });
  for (const [id,value] of Object.entries({firstName:'Lakpa',lastName:'Sherpa',dateOfBirth:'2002-05-10',email:'  MEMBER@Example.Test  ',phone:'9876543210',department:'BCA',rollId:'123'})) element(id).value=value;
  assert.equal(element('temporaryPassword').textContent,'');
  await element('memberForm').handlers.submit({preventDefault(){}});
  assert.equal(submitted.password,undefined);
  assert.equal(submitted.email,'member@example.test');
  assert.equal(element('temporaryPassword').textContent,'lakp2002');
  assert.equal(element('temporaryPasswordPanel').hidden,false);
  await element('copyTemporaryPassword').handlers.click();assert.equal(copied,'lakp2002');
  windowHandlers.pagehide();assert.equal(element('temporaryPassword').textContent,'');assert.equal(element('temporaryPasswordPanel').hidden,true);
});

test('temporary password change gate blocks members but preserves staff access', async () => {
  const {pauseMemberPasswordChange,passwordChangeUnavailable}=await import('../middleware/member_password_change_pause.js');
  for (const role of ['member','user']) {
    const res=response();pauseMemberPasswordChange({user:{role}},res,()=>assert.fail('member passed gate'));
    assert.equal(res.code,403);assert.equal(res.body.message,passwordChangeUnavailable);
  }
  for (const role of ['admin','librarian']) {let passed=false;pauseMemberPasswordChange({user:{role}},response(),()=>passed=true);assert.equal(passed,true);}
});

test('duplicate email and database uniqueness conflicts do not expose passwords', async () => {
  const original=pool.connect;
  try {
    for (const conflict of [false,true]) {
      pool.connect=async()=>({release(){},query:async sql=>{
        if(sql.includes('SELECT member_id')) {if(conflict) throw Object.assign(new Error('duplicate'),{code:'23505',constraint:'member_email_lower_unique'});return {rows:[{member_id:1}]};}
        return {rows:[]};
      }});
      const res=response();await signup({user:{role:'librarian'},body:{first_name:'Lakpa',last_name:'Sherpa',email:'MEMBER@example.test',phone:'9876543210',dob:'2002-05-10'}},res);
      assert.equal(res.code,409);assert.equal(res.body.message,DUPLICATE_EMAIL_MESSAGE);assert.equal(res.body.temp_password,undefined);
    }
  } finally {pool.connect=original;}
});
