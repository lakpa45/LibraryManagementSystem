import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import bcrypt from 'bcrypt';
import express from 'express';
import { Resend } from 'resend';
// Never let application imports pick the real database from a developer's .env.
const testUrl = process.env.RESET_TEST_DATABASE_URL;
process.env.DATABASE_URL = testUrl || 'postgresql://postgres@127.0.0.1:55439/postgres';
const { createPasswordResetHandlers } = await import('../controllers/auth/password_reset_controller.js');
import { createResetRateLimit } from '../middleware/password_reset_rate_limit.js';
import { readResetConfig } from '../config/password_reset.js';
import { createResetMailer } from '../utils/mailer.js';
import { FORGOT_MESSAGE } from '../utils/password_reset_validation.js';
const { default: applicationPool } = await import('../db/connection.js');
const { signin } = await import('../controllers/auth/sign_in.js');

const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const password = 'NewSecure123!';

test('production configuration rejects missing/unsafe values and trims valid values', () => {
    assert.throws(() => readResetConfig({ NODE_ENV: 'production' }), /RESEND_API_KEY, FRONTEND_URL, EMAIL_FROM/);
    assert.throws(() => readResetConfig({ RAILWAY_ENVIRONMENT_ID: 'test' }), /configuration missing/);
    for (const value of ['http://example.com', 'https://localhost', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com/?x=1']) {
        assert.throws(() => readResetConfig({ NODE_ENV:'production', RESEND_API_KEY:'re_test', EMAIL_FROM:'Library <onboarding@resend.dev>', FRONTEND_URL:value }));
    }
    const config = readResetConfig({ NODE_ENV:'production', RESEND_API_KEY:' re_test ', EMAIL_FROM:' Library <onboarding@resend.dev> ', FRONTEND_URL:' https://example.com/// ' });
    assert.equal(config.baseUrl, 'https://example.com');
    assert.equal(config.emailFrom, 'Library <onboarding@resend.dev>');
    assert.equal(config.apiKey, 're_test');
    assert.equal(config.testingSender, true);
    assert.throws(() => readResetConfig({ EMAIL_FROM:'not-an-address' }), /EMAIL_FROM/);
});

test('password reset with real PostgreSQL and the official Resend SDK against a local HTTP fixture', { skip: !testUrl && 'Set RESET_TEST_DATABASE_URL to an isolated localhost PostgreSQL database' }, async t => {
    const url = new URL(testUrl);
    assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'Tests must never use a remote database');
    const schema = `reset_test_${crypto.randomBytes(6).toString('hex')}`;
    const admin = new pg.Pool({ connectionString: testUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const db = new pg.Pool({ connectionString: testUrl, options: `-c search_path=${schema} -c timezone=UTC` });
    t.after(async () => { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
    await db.query(`CREATE TABLE member (member_id serial PRIMARY KEY, email varchar(255) NOT NULL, password text NOT NULL, status text DEFAULT 'approved');
        CREATE TABLE password_reset (reset_id serial PRIMARY KEY, email varchar(255) NOT NULL, token varchar(255) NOT NULL, expires_at timestamp NOT NULL, used boolean DEFAULT false, created_at timestamp DEFAULT NOW());`);
    const legacyToken = crypto.randomBytes(32).toString('hex');
    await db.query("INSERT INTO password_reset (email,token,expires_at) VALUES ('Legacy@Example.com',$1,NOW()+INTERVAL '20 minutes')", [legacyToken]);
    const migration = await fs.readFile(new URL('../migrations/008_secure_password_reset.sql', import.meta.url), 'utf8');
    await db.query(migration);
    await db.query(migration);
    await t.test('migration is repeatable, preserves hashed history and removes plaintext column', async () => {
        assert.equal((await db.query('SELECT token_hash FROM password_reset')).rows[0].token_hash, hash(legacyToken));
        assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='password_reset' AND column_name='token'", [schema])).rows[0].n, 0);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname=$1 AND indexname='password_reset_token_hash_idx'", [schema])).rows[0].n, 1);
    });
    const emails = [];
    const logs = [];
    let failMail = false;
    const apiKey = 're_test_only_not_a_real_credential';
    const api = http.createServer(async (req,res) => {
        assert.equal(req.url, '/emails');
        assert.equal(req.headers.authorization, `Bearer ${apiKey}`);
        let body='';for await (const chunk of req) body+=chunk;
        const payload=JSON.parse(body);
        res.setHeader('Content-Type','application/json');
        if(failMail) {
            res.statusCode=403;
            res.end(JSON.stringify({name:'validation_error',message:'secret must not leak '+apiKey+payload.text}));
        } else {
            emails.push(payload);
            res.end(JSON.stringify({id:'test-email-id'}));
        }
    });
    await new Promise(resolve => api.listen(0,'127.0.0.1',resolve));
    t.after(() => new Promise(resolve => api.close(resolve)));
    const config = { baseUrl:'https://librarymanagementsystem-production-26df.up.railway.app', apiKey, emailFrom:'Library Management System <onboarding@resend.dev>' };
    const logger={error:message=>logs.push(message),info:message=>logs.push(message)};
    const mailer = createResetMailer(config, new Resend(apiKey,{baseUrl:`http://127.0.0.1:${api.address().port}`}),logger);
    const handlers = createPasswordResetHandlers({ db, config, sendEmail:mailer, logger });
    const app = express(); app.set('trust proxy',1); app.use(express.json());
    app.post('/forgot', createResetRateLimit(db,'forgot'), handlers.forgotPassword);
    app.post('/reset', createResetRateLimit(db,'reset'), handlers.resetPassword);
    // Exercise the existing, unchanged login controller against only the isolated DB.
    const originalQuery = applicationPool.query; applicationPool.query = db.query.bind(db);
    const originalSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    t.after(() => { applicationPool.query = originalQuery; if(originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=originalSecret; });
    app.post('/signin', signin);
    const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const request = async (route, body, ip='192.0.2.1') => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Forwarded-For':ip }, body:JSON.stringify(body) });
        return { status:response.status, body:await response.json(), retry:response.headers.get('retry-after') };
    };
    const oldPassword = 'OldSecure123!';
    await db.query('INSERT INTO member(email,password) VALUES ($1,$2)', ['Mixed@Example.com',await bcrypt.hash(oldPassword,10)]);
    const mint = async (expires="NOW()+INTERVAL '30 minutes'", used=false) => {
        const token=crypto.randomBytes(32).toString('hex');
        await db.query(`INSERT INTO password_reset(email,token_hash,expires_at,used) VALUES ('mixed@example.com',$1,${expires},$2)`,[hash(token),used]);
        return token;
    };
    const waitForMail = async count => { for(let i=0;i<100 && emails.length<count;i++) await new Promise(r=>setTimeout(r,20)); assert.equal(emails.length,count); };
    await t.test('existing/unknown emails have identical responses; Resend SDK submits correct branded email and HTTPS link', async () => {
        const existing = await request('/forgot',{email:'  MIXED@Example.COM '});
        const unknown = await request('/forgot',{email:'unknown@example.com'},'192.0.2.2');
        assert.equal(existing.status,200); assert.deepEqual(existing.body,unknown.body); assert.equal(existing.body.message,FORGOT_MESSAGE);assert.equal(existing.body.success,true);
        await waitForMail(1);
        const row=(await db.query("SELECT * FROM password_reset WHERE email='mixed@example.com' AND NOT used")).rows[0];
        assert.match(row.token_hash,/^[a-f0-9]{64}$/); assert.ok(row.expires_at-Date.now()>29*60*1000);
        const decoded=emails[0].html;
        assert.equal(emails[0].from,config.emailFrom);
        assert.equal(emails[0].to,'mixed@example.com');
        assert.match(decoded,/Reset Your Password/);
        assert.match(decoded,/If the button does not work/);
        assert.match(emails[0].text,/30 minutes/);
        assert.ok(!emails[0].text.includes(password));
        assert.match(decoded,/https:\/\/librarymanagementsystem-production-26df\.up\.railway\.app\/reset_password\.html\?token=[a-f0-9]{64}/);
        assert.ok(!decoded.includes(row.token_hash));
    });
    await t.test('normalized email cooldown cannot be bypassed by another IP; resend revokes previous link', async () => {
        const response=await request('/forgot',{email:'mixed@EXAMPLE.com'},'192.0.2.3');
        assert.equal(response.status,429);assert.equal(response.body.message,FORGOT_MESSAGE);assert.ok(Number(response.retry)>0);
        await db.query('TRUNCATE password_reset_rate_limit');
        const old=(await db.query("SELECT token_hash FROM password_reset WHERE email='mixed@example.com' AND NOT used")).rows[0].token_hash;
        await request('/forgot',{email:'mixed@example.com'});await waitForMail(2);
        assert.equal((await db.query('SELECT used FROM password_reset WHERE token_hash=$1',[old])).rows[0].used,true);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM password_reset WHERE email='mixed@example.com' AND NOT used")).rows[0].n,1);
    });
    await t.test('missing, malformed, invalid, expired and reused tokens fail safely', async () => {
        for(const token of [undefined,{},'bad',crypto.randomBytes(32).toString('hex'),await mint("NOW()-INTERVAL '1 minute'"),await mint(undefined,true)]) {
            const result=await request('/reset',{token,newPassword:password});assert.equal(result.status,400);assert.equal(result.body.code,'INVALID_RESET_LINK');
        }
    });
    await t.test('weak and oversized UTF-8 passwords are rejected', async () => {
        const token=await mint();
        for(const newPassword of ['','short','Ab1'+String.fromCodePoint(0x1f600).repeat(18),{},null]) assert.equal((await request('/reset',{token,newPassword})).body.code,'WEAK_PASSWORD');
    });
    await t.test('valid token succeeds only once under concurrent requests; new login works, old password fails', async () => {
        const token=await mint();
        const results=await Promise.all([request('/reset',{token,newPassword:password}),request('/reset',{token,newPassword:password})]);
        assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
        assert.equal((await request('/signin',{email:'mixed@example.com',password})).status,200);
        assert.equal((await request('/signin',{email:'mixed@example.com',password:oldPassword})).status,401);
    });
    await t.test('token update failure rolls back the password update', async () => {
        const token=await mint();
        await db.query(`CREATE FUNCTION fail_consume() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
            CREATE TRIGGER fail_consume BEFORE UPDATE ON password_reset FOR EACH ROW EXECUTE FUNCTION fail_consume();`);
        const result=await request('/reset',{token,newPassword:'AnotherSecure123!'});
        assert.equal(result.status,500);
        assert.equal((await db.query('SELECT used FROM password_reset WHERE token_hash=$1',[hash(token)])).rows[0].used,false);
        assert.ok(await bcrypt.compare(password,(await db.query("SELECT password FROM member WHERE email='Mixed@Example.com'")).rows[0].password));
        await db.query('DROP TRIGGER fail_consume ON password_reset');
    });
    await t.test('email failures remain generic and logs contain no secrets', async () => {
        await db.query('TRUNCATE password_reset_rate_limit');failMail=true;
        assert.equal((await request('/forgot',{email:'mixed@example.com'})).body.message,FORGOT_MESSAGE);
        await new Promise(r=>setTimeout(r,30));
        assert.ok(logs.some(s=>s.includes('email delivery failed')));
        assert.ok(logs.some(s=>s.includes('Resend API error: validation_error')));
        assert.ok(logs.every(s=>!s.includes('secret must not leak')&&!s.includes(apiKey)&&!s.includes('token=')));
        failMail=false;
    });
    await t.test('IP limits and persistent email hourly limits apply to unknown addresses too', async () => {
        await db.query('TRUNCATE password_reset_rate_limit');
        for(let i=0;i<20;i++) assert.equal((await request('/forgot',{email:`unknown${i}@example.com`},'192.0.2.50')).status,200);
        assert.equal((await request('/forgot',{email:'another@example.com'},'192.0.2.50')).status,429);
        await db.query('TRUNCATE password_reset_rate_limit');
        for(let i=0;i<5;i++) {
            assert.equal((await request('/forgot',{email:'hourly@example.com'},`192.0.2.${60+i}`)).status,200);
            await db.query("UPDATE password_reset_rate_limit SET expires_at=NOW()-INTERVAL '1 second' WHERE expires_at < NOW()+INTERVAL '2 minutes'");
        }
        assert.equal((await request('/forgot',{email:'hourly@example.com'},'192.0.2.70')).status,429);
    });
    await t.test('member update failure leaves token unused and database acquisition failures are safe', async () => {
        const token=await mint();
        await db.query(`CREATE TRIGGER fail_member BEFORE UPDATE ON member FOR EACH ROW EXECUTE FUNCTION fail_consume()`);
        assert.equal((await request('/reset',{token,newPassword:'AnotherSecure123!'})).status,500);
        assert.equal((await db.query('SELECT used FROM password_reset WHERE token_hash=$1',[hash(token)])).rows[0].used,false);
        await db.query('DROP TRIGGER fail_member ON member');
        let status, body;
        const failed = createPasswordResetHandlers({db:{connect:async()=>{throw Error('connection secret')}},logger:{error:message=>logs.push(message)}});
        const res={status(code){status=code;return this},json(value){body=value;return this}};
        await failed.resetPassword({body:{token,newPassword:password}},res);
        assert.equal(status,500);assert.ok(!JSON.stringify(body).includes('secret'));
    });
    await t.test('reset endpoint limits repeated token guessing by IP', async () => {
        await db.query('TRUNCATE password_reset_rate_limit');
        for(let i=0;i<60;i++) assert.equal((await request('/reset',{},'192.0.2.80')).status,400);
        const response=await request('/reset',{},'192.0.2.80');
        assert.equal(response.status,429);assert.ok(Number(response.retry)>0);
    });
    await t.test('request body validation rejects non-string and missing emails', async () => {
        for(const email of [undefined,{},[],42,'bad','a'.repeat(255)+'@example.com']) assert.equal((await request('/forgot',{email},'192.0.2.99')).status,400);
    });
});
