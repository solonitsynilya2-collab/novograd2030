const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto'), {URL}=require('url');
const PORT=process.env.PORT||3000;
const ROOT=path.join(__dirname,'public');
const sessions=new Map();
const teams=[
 {id:'admin',name:'Администрация',goal:'Сохранить управляемость города и избежать личной ответственности.'},
 {id:'dam',name:'Руководство дамбы',goal:'Сохранить объект и избежать обвинений в халатности.'},
 {id:'contractor',name:'Подрядчик',goal:'Получить контракт на срочные работы и сохранить репутацию.'},
 {id:'rescue',name:'Спасатели',goal:'Минимизировать потери людей и получить ресурсы для реагирования.'},
 {id:'residents',name:'Жители',goal:'Защитить свой район, жильё и влияние на решение.'}
];
const moves=[
 {day:'День ЧС',intro:'Дамба дала трещину. Вода быстро прибывает. Ресурсов хватает только на одно действие.',choices:[
  ['Эвакуировать низину','Быстро снизить риск для людей, но парализовать район и бизнес.'],['Укрепить дамбу','Сохранить инфраструктуру, но эвакуация задерживается.'],['Открыть аварийный сброс','Снизить давление на дамбу, но затопить часть промышленной зоны.'],['Ждать дополнительных данных','Сохранить ресурсы, но потерять критическое время.']]},
 {day:'+1 день',intro:'Прошли сутки. Город частично работает, но последствия первого решения уже проявились.',choices:[
  ['Расширить эвакуацию','Повысить безопасность, усилив социальные и экономические потери.'],['Закрыть повреждённый мост','Защитить транспортный узел, ухудшив доступ к районам.'],['Передать срочный контракт подрядчику','Ускорить ремонт, но взять на себя репутационный риск.'],['Сосредоточиться на возвращении бизнеса','Поддержать экономику, оставив часть рисков нерешёнными.']]},
 {day:'+3 дня',intro:'Третий день. Внешние эксперты спорят о стратегии. Доверие жителей заметно меняется.',choices:[
  ['Полностью остановить рискованные объекты','Максимальная безопасность, высокая цена для экономики.'],['Запустить временную схему движения','Сохранить мобильность города, но оставить уязвимость.'],['Ускорить капитальный ремонт','Большие затраты сейчас ради устойчивости позже.'],['Публично признать ошибки и раскрыть данные','Укрепить доверие, но усилить риск политической ответственности.']]}
];
function code(){return crypto.randomBytes(3).toString('hex').toUpperCase()}
function makeSession(){let id=code(), admin=code(); while(sessions.has(id))id=code(); const codes={}; teams.forEach(t=>codes[`${t.id}`]=code()); const s={id,admin,created:Date.now(),phase:'lobby',move:0,round:1,decision:null,consequences:null,ratings:{},final:null,clients:new Set(),codes}; sessions.set(id,s); return s}
function pub(s){return {id:s.id,phase:s.phase,move:s.move,round:s.round,decision:s.decision,consequences:s.consequences,teams:teams.map(t=>({id:t.id,name:t.name})),participants:Object.fromEntries(teams.map(t=>[t.id,Object.keys(s.ratings).filter(k=>s.ratings[k].team===t.id).length])),summary:summary(s),final:s.final,codes:s.codes}}
function summary(s){const out={}; for(let m=0;m<3;m++){out[m]=[]; for(let c=0;c<4;c++){const vals=Object.values(s.ratings).filter(r=>r.move===m&&r.round===1).map(r=>r.scores[c]).filter(Number.isFinite); const vals2=Object.values(s.ratings).filter(r=>r.move===m&&r.round===2).map(r=>r.scores[c]).filter(Number.isFinite); const arr=vals2.length?vals2:vals; const avg=arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null; out[m].push({avg,count:arr.length,arguments:Object.values(s.ratings).filter(r=>r.move===m&&r.round===r.round).map(r=>r.arg).filter(Boolean).slice(-20)}); }} return out}
function broadcast(s){const data='data:'+JSON.stringify(pub(s))+'\n\n'; for(const res of s.clients){try{res.write(data)}catch{}}}
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}})})}
function findSession(id){return sessions.get(String(id||'').toUpperCase())}
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(index)}
  if(req.method==='GET'&&u.pathname==='/events'){
   const s=findSession(u.searchParams.get('session')); if(!s)return json(res,{error:'Сессия не найдена'},404);
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write('retry: 1000\n\n');s.clients.add(res);res.write('data:'+JSON.stringify(pub(s))+'\n\n');req.on('close',()=>s.clients.delete(res));return;
  }
  if(req.method==='POST'){
   const b=await body(req), s=findSession(b.session);
   if(u.pathname==='/api/session'){const ns=makeSession();return json(res,{session:ns.id,admin:ns.admin,codes:ns.codes})}
   if(!s)return json(res,{error:'Сессия не найдена'},404);
   if(u.pathname==='/api/join'){const c=String(b.code||'').toUpperCase(); const team=teams.find(t=>s.codes[t.id]===c); if(!team&&c!==s.admin)return json(res,{error:'Неверный код'},403); return json(res,{ok:true,role:c===s.admin?'admin':'participant',team:team?.id||null,goal:team?.goal||null})}
   if(u.pathname==='/api/control'){
    if(b.admin!==s.admin)return json(res,{error:'Нет доступа'},403); if(b.action==='start'){s.phase='round1'}
    if(b.action==='round2'){s.round=2;s.phase='round2'}
    if(b.action==='move'){s.move=Math.min(2,s.move+1);s.round=1;s.phase='round1';s.decision=null;s.consequences=null}
    if(b.action==='final'){s.phase='final'}
    if(b.action==='reset'){s.phase='lobby';s.move=0;s.round=1;s.decision=null;s.consequences=null;s.ratings={};s.final=null}
    if(b.action==='decide'){s.decision=Number(b.choice);s.consequences=b.consequences||{security:0,city:0,trust:0,text:''};s.phase='decision'}
    if(b.action==='finalize'){s.final=b.final;s.phase='results'}
    broadcast(s);return json(res,{ok:true})
   }
   if(u.pathname==='/api/rating'){
    const c=String(b.code||'').toUpperCase(); const team=teams.find(t=>s.codes[t.id]===c); if(!team)return json(res,{error:'Неверный код'},403); if(![0,1,2].includes(Number(b.move)))return json(res,{error:'Раунд недоступен'},400);
    const key=c+'_'+b.move+'_'+b.round;s.ratings[key]={team:team.id,move:Number(b.move),round:Number(b.round),scores:(b.scores||[]).map(Number),arg:String(b.arg||'').slice(0,500),at:Date.now()};broadcast(s);return json(res,{ok:true})
   }
   if(u.pathname==='/api/final'){
    const c=String(b.code||'').toUpperCase(),team=teams.find(t=>s.codes[t.id]===c);if(!team)return json(res,{error:'Неверный код'},403); if(!s.final)s.final={teams:{}}; s.final.teams[team.id]={weights:b.weights,ratings:b.ratings};broadcast(s);return json(res,{ok:true})
   }
  }
  res.writeHead(404);res.end('Not found');
 }catch(e){json(res,{error:e.message},500)}
});
server.listen(PORT,()=>console.log(`Новоград 2030: http://localhost:${PORT}`));
