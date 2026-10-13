import {env} from 'cloudflare:workers';
import {teams} from '../../game-data';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const key=()=>crypto.randomUUID().replaceAll('-','');
export async function POST(req:Request){
 try{
 if(req.headers.get('origin') && req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Недопустимый источник запроса'},403);
 const raw=await req.text();if(raw.length>12000)return json({error:'Слишком большой запрос'},413);
 const b=JSON.parse(raw),db=env.DB!;
 const admin=typeof b.admin==='string' && b.admin.length>20 && b.admin===(env as unknown as {ADMIN_KEY:string}).ADMIN_KEY;
 const room=String(b.room||'').trim().toUpperCase();
 if(b.action==='create'){
 if(!admin)return json({error:'Неверный ключ ведущего'},403);
 const id=key().slice(0,8).toUpperCase();await db.prepare('INSERT INTO rooms(id,created) VALUES (?,?)').bind(id,new Date().toISOString()).run();return json({room:id});}
 const game=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(room).first<any>();if(!game)return json({error:'Игра с таким кодом не найдена'},404);
 if(b.action==='join'){
 const name=String(b.name||'').trim();if(name.length<2||name.length>30)return json({error:'Введите имя от 2 до 30 символов'},400);
 if(!teams.some(t=>t.id===b.team))return json({error:'Выберите команду'},400);
 if(game.step!==0)return json({error:'Регистрация закрыта: игра уже началась'},409);
 const token=key(),id=crypto.randomUUID();
 try {const r=await db.prepare('INSERT INTO players(id,room,name,normalized,team,token,created) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM players WHERE room=?)<50 AND (SELECT step FROM rooms WHERE id=?)=0').bind(id,room,name,name.toLocaleLowerCase('ru'),b.team,await hash(token),new Date().toISOString(),room,room).run();if(!r.meta.changes)return json({error:'Регистрация закрыта или достигнут лимит 50 участников'},409);}catch{return json({error:'Имя уже занято. Выберите другое или войдите по личному коду.'},409)}
 return json({token});}
 let player:any=null;
 if(!admin){player=await db.prepare('SELECT id,name,team FROM players WHERE room=? AND token=?').bind(room,await hash(String(b.token||''))).first();if(!player)return json({error:'Введите личный код участника'},401);}
 if(b.action==='advance'){
 if(!admin)return json({error:'Только ведущий может менять этап'},403);
 if(!Number.isInteger(b.step)||b.step<0||b.step>=8)return json({error:'Некорректный этап'},400);
 const r=await db.prepare('UPDATE rooms SET step=step+1 WHERE id=? AND step=?').bind(room,b.step).run();if(!r.meta.changes)return json({error:'Этап уже изменился. Обновите экран.'},409);game.step++;}
 if(b.action==='answer'){
 if(!player)return json({error:'Войдите как участник'},403);
 const step=b.step,d=b.data;
 if(!Number.isInteger(step)||step<1||step>7||step!==game.step)return json({error:'Приём ответов на этот этап закрыт'},409);
 const integer=(v:any,min:number,max:number)=>Number.isInteger(v)&&v>=min&&v<=max;
 if(step<=6){if(!d||!['A','B','C','D'].every(k=>integer(d.vals?.[k],1,10))||typeof d.arg!=='string'||d.arg.trim().length<10||d.arg.length>1200)return json({error:'Оценки: 1–10; аргумент: 10–1200 символов'},400)}
 else {if(!d||!['safety','work','trust'].every(k=>integer(d.weights?.[k],0,100))||Object.values(d.weights).reduce((a:any,v:any)=>a+v,0)!==100||!['P1','P2','P3','P4'].every(p=>['s','w','t'].every(k=>integer(d.ratings?.[p]?.[k],1,5))))return json({error:'Веса должны давать 100, оценки проектов — 1–5'},400)}
 const result=await db.prepare('INSERT INTO answers(id,player,step,data,updated) SELECT ?,?,?,?,? WHERE (SELECT step FROM rooms WHERE id=?)=? ON CONFLICT(player,step) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(`${player.id}:${step}`,player.id,step,JSON.stringify(d),new Date().toISOString(),room,step).run();if(!result.meta.changes)return json({error:'Этап завершён; ответ не сохранён'},409);
 }
 const ps=(await db.prepare('SELECT id,name,team FROM players WHERE room=? ORDER BY created').bind(room).all<any>()).results;
 const aa=(await db.prepare('SELECT a.player,a.step,a.data FROM answers a JOIN players p ON p.id=a.player WHERE p.room=?').bind(room).all<any>()).results.map(a=>({...a,data:JSON.parse(a.data)}));
 const scores=ps.map(p=>{const a=aa.filter(x=>x.player===p.id);return {name:p.name,team:p.team,score:a.reduce((n,x)=>n+(x.step===7?40:10),0),completed:a.length}}).sort((a,b)=>b.score-a.score);
 const stats=Array.from({length:7},(_,i)=>{const rows=aa.filter(a=>a.step===i+1);return {step:i+1,count:rows.length,values:i<6?Object.fromEntries(['A','B','C','D'].map(k=>[k,rows.length?rows.reduce((n,r)=>n+r.data.vals[k],0)/rows.length:0])):null,args:rows.map(r=>r.data.arg).filter(Boolean)}});
 const finals=aa.filter(a=>a.step===7);const projects=['P1','P2','P3','P4'].map(id=>({id,score:finals.length?finals.reduce((n,a)=>{const w=a.data.weights,r=a.data.ratings[id];return n+(w.safety*r.s+w.work*r.w+w.trust*r.t)/100},0)/finals.length:0})).sort((a,b)=>b.score-a.score);
 return json({room,step:game.step,player,admin,count:ps.length,mine:player?aa.filter(a=>a.player===player.id):[],stats:admin?stats:stats.filter(s=>s.step<game.step),scores:game.step===8||admin?scores:[],projects:game.step===8||admin?projects:[],...(admin?{participants:ps,export:aa}: {})});
 }catch(e){console.error('game request failed',e instanceof Error?e.message:'error');return json({error:'Не удалось выполнить запрос. Попробуйте ещё раз.'},500)}
}
