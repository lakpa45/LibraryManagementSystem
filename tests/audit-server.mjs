// Only launched by the local audit against a dedicated localhost database.
if (process.env.LIBRARY_AUDIT !== '1' || !['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Local audit environment required');
let lastResetToken;
const realFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
    if(String(url)==='https://api.resend.com/emails') {
        const payload=JSON.parse(options.body);
        lastResetToken=payload.text.match(/token=([a-f0-9]{64})/)?.[1];
        return Response.json({id:'local-audit-message'});
    }
    if(String(url).startsWith('https://gutendex.com/')) return Response.json({count:0,next:null,previous:null,results:[]});
    return realFetch(url,options);
};
process.on('message',message=>{if(message.type==='getResetToken')process.send({type:'resetToken',token:lastResetToken});});
await import('../server.js');
