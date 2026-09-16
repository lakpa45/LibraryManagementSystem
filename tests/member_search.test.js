import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:1/test';

const { default: pool } = await import('../db/connection.js');
const { searchMembers } = await import('../controllers/loans/loan_controller.js');

const member = (overrides = {}) => ({
    member_id: 1,
    first_name: 'Lakpa',
    last_name: 'Sherpa',
    unique_id: 'STU-2026-0001',
    roll_id: '12',
    member_type: 'Student',
    department: 'BCA',
    status: 'Approved',
    valid_till: '2027-09-01',
    active_borrowings: 2,
    ...overrides
});

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('member lookup supports exact IDs and normalized partial/full names safely', async () => {
    const originalQuery = pool.query;
    const calls = [];
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [member()] };
    };

    try {
        for (const query of [
            'STU-2026-0001',
            'Lakpa',
            'Sherpa',
            'Lakpa Sherpa',
            'Lak',
            'LAKPA',
            '   Lakpa   Sherpa   ',
            '12'
        ]) {
            const res = response();
            await searchMembers({ query: { q: query } }, res);
            assert.equal(res.statusCode, 200, query);
            assert.equal(res.body.member.display_name, 'Lakpa Sherpa');
            assert.equal(res.body.member.unique_id, 'STU-2026-0001');
            assert.equal('email' in res.body.member, false);
        }

        const { sql, params } = calls.at(-2);
        assert.match(sql, /card_no[\s\S]*= LOWER\(\$1\)/i);
        assert.match(sql, /roll_id[\s\S]*= LOWER\(\$1\)/i);
        assert.match(sql, /first_name ILIKE \$2/i);
        assert.match(sql, /last_name ILIKE \$2/i);
        assert.match(sql, /CONCAT_WS\(' ', m\.first_name, m\.last_name\) ILIKE \$2/i);
        assert.match(sql, /LIMIT 8/i);
        assert.deepEqual(params, ['Lakpa Sherpa', '%Lakpa Sherpa%']);
        assert.equal(calls.every(call => call.params.length === 2), true);
    } finally {
        pool.query = originalQuery;
    }
});

test('multiple matches require selection and unknown members return the requested message', async () => {
    const originalQuery = pool.query;
    pool.query = async () => ({ rows: [member(), member({ member_id: 2, unique_id: 'STU-2026-0002' })] });
    const multiple = response();
    await searchMembers({ query: { q: 'Lakpa' } }, multiple);
    assert.equal(multiple.body.count, 2);
    assert.equal(multiple.body.member, null);
    assert.equal(multiple.body.members[1].unique_id, 'STU-2026-0002');

    pool.query = async () => ({ rows: [] });
    const missing = response();
    await searchMembers({ query: { q: 'Unknown member' } }, missing);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.body.message, 'No member found with that name or Card ID.');

    pool.query = originalQuery;
});
