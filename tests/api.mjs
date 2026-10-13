import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')))sqlite.exec(fs.readFileSync(`drizzle/${f}`,'utf8'));
const DB = {
 prepare(sql) {
  return {
   bind(...values) {
    return {
     async first() { return sqlite.prepare(sql).get(...values) || null; },
     async all() { return {results: sqlite.prepare(sql).all(...values)}; },
     async run() { const r=sqlite.prepare(sql).run(...values); return {meta:{changes:Number(r.changes)}}; }
    };
   }
  };
 }
};
globalThis.__testEnv={DB,ADMIN_KEY:'test-only-admin-credential-123456789'};
const source=fs.readFileSync('app/api/game/route.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env=globalThis.__testEnv;").replace("import {teams} from '../../game-data';","const teams=[{id:'admin'},{id:'dam'},{id:'contractor'},{id:'rescue'},{id:'residents'}];");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function call(body,status=200){const r=await POST(new Request('https://test.local/api/game',{method:'POST',headers:{'Origin':'https://test.local'},body:JSON.stringify(body)}));const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j}
const admin=globalThis.__testEnv.ADMIN_KEY;
await call({action:'create',admin:'incorrect'},403);
const {room}=await call({action:'create',admin});
const a=await call({action:'join',room,name:'Анна',team:'admin'});
const b=await call({action:'join',room,name:'Борис',team:'admin'});
await call({action:'join',room,name:'АННА',team:'rescue'},409);
await call({action:'state',room,token:'wrong'},401);
await call({action:'advance',room,token:a.token,step:0},403);
let state=await call({action:'advance',room,admin,step:0});assert.equal(state.step,1);
await call({action:'advance',room,admin,step:0},409);
await call({action:'join',room,name:'Поздний',team:'dam'},409);
const data={vals:{A:8,B:7,C:6,D:2},arg:'Предлагаю эвакуировать жителей'};
await call({action:'answer',room,token:a.token,step:1,data:{...data,vals:{...data.vals,A:11}}},400);
await call({action:'answer',room,token:a.token,step:1,data});
await call({action:'answer',room,token:b.token,step:1,data});
state=await call({action:'answer',room,token:a.token,step:1,data:{...data,vals:{...data.vals,A:10}}});
assert.equal(state.mine.length,1);assert.equal(state.mine[0].data.vals.A,10);assert.equal(state.export,undefined);assert.equal(state.participants,undefined);assert.equal(state.stats.length,0);
state=await call({action:'state',room,admin});assert.equal(state.export.length,2);assert.equal(state.stats[0].values.A,9);
for(let step=1;step<7;step++){await call({action:'advance',room,admin,step});if(step<6)await call({action:'answer',room,token:a.token,step:step+1,data})}
await call({action:'answer',room,token:b.token,step:1,data},409);
const final={weights:{safety:40,work:30,trust:30},ratings:Object.fromEntries(['P1','P2','P3','P4'].map(p=>[p,{s:5,w:3,t:4}]))};
await call({action:'answer',room,token:a.token,step:7,data:{...final,weights:{safety:90,work:30,trust:30}}},400);
await call({action:'answer',room,token:a.token,step:7,data:final});
await call({action:'advance',room,admin,step:7});
state=await call({action:'state',room,token:a.token});assert.equal(state.scores[0].score,100);assert.equal(state.projects[0].score,4.1);
const second=await call({action:'create',admin});await call({action:'state',room:second.room,token:a.token},401);
for(let i=0;i<50;i++)await call({action:'join',room:second.room,name:`Участник ${i}`,team:'residents'});
await call({action:'join',room:second.room,name:'Лишний участник',team:'residents'},409);
console.log('PASS: two players in one team, resume, upsert, permissions, phase checks, validation, aggregation, final ranking, room isolation, 50-player capacity');
