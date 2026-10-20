import {FactoryGame} from '../../ascent-model.js';
import {AscentDirector,gateHeight,gateY,floorBase} from '../../ascent-world.js';
function branch(g){
 const c=Object.assign(Object.create(FactoryGame.prototype),g);
 c.bird={...g.bird};c.machines=g.machines.map(m=>({...m}));c.machine=c.machines[g.floor-1]||null;
 c.cookies=g.cookies.map(p=>({...p}));c.cookie=c.cookies.find(p=>p.id===g.cookie?.id)||null;c.pickupRooms=new Set(g.pickupRooms);c.metrics={...g.metrics};c.balls=g.balls.map(b=>({...b}));
 c.director=Object.assign(Object.create(AscentDirector.prototype),g.director);c.director.rooms=g.director.rooms.map(r=>({...r}));
 c.finish=()=>{c.state='dead';return true;};return c;
}
export function findAscentWitness(floor=1,{beam=450,seconds=45,goal='machine',withoutFrenzy=false,goldRoom=null}={}){
 const start=new FactoryGame({mode:'ascent',seed:42,profile:{ascentUnlocked:[1,2,3],ascentStart:floor}});start.press();
 let states=[start];const parents=[],actions=[];const base=floorBase(floor);
 for(let frame=0;frame<seconds*60;frame++){
  const candidates=new Map();let winner;
  for(let parent=0;parent<states.length;parent++)for(let flap=0;flap<2;flap++){
   const g=branch(states[parent]);if(flap)g.press();g.update();if(g.state!=='playing'||withoutFrenzy&&g.abilityRemaining>0)continue;
   const core=g.machine?.floor===floor&&g.abilityRemaining>0;
   const targets=g.cookies.filter(c=>c.baseY+10<g.cameraTop+580&&c.baseY+10>g.cameraTop-80);
   const goldId=goldRoom===null?null:`${floor}:${goldRoom}:gold`;
   const target=goldId?g.cookies.find(c=>c.id===goldId):core?{x:200,y:gateY(floor)}:targets.sort((a,b)=>Math.abs(g.bird.y+29-a.y-10)-Math.abs(g.bird.y+29-b.y-10))[0];
   const distance=target?Math.hypot(g.bird.x+28-(target.x+(core?0:15)),g.bird.y+29-(target.y+(core?0:10))):180;
   const broken=g.machines[floor-1].broken;
   const rank=(goldId?Math.min(g.maxHeight-base,goldRoom*480+460):g.maxHeight-base)*.55+g.collected*35+g.energy*22+(g.abilityRemaining>0?100:0)-distance*(goldId?.7:core?.55:.15)+(broken?4000:0);
   const key=[Math.round(g.bird.y/6),g.bird.vy,Math.round(g.cameraTop/16),g.cookies.map(c=>c.id).join(','),g.energy,Math.ceil(g.abilityRemaining*5),Math.ceil(g.abilityCooldown*5),broken,g.director.rooms.filter(r=>r.activatedAt!==null).map(r=>r.id+':'+Math.round(r.activatedAt*5)).join(','),g.feedSerial].join('|');
   const n={g,parent,flap,rank};if(!candidates.has(key)||candidates.get(key).rank<rank)candidates.set(key,n);
   if(goldId?(!g.cookies.some(c=>c.id===goldId)&&g.metrics.goldenCookies>0&&g.maxHeight<base+goldRoom*480+910):goal==='rooms'?g.maxHeight>=base+1440:broken&&g.maxHeight>=gateHeight(floor)+90){winner=n;break;}
  }
  const nodes=winner?[winner]:[...candidates.values()].sort((a,b)=>b.rank-a.rank).slice(0,beam);
  if(!nodes.length)throw Error(`No ascent trajectory: floor ${floor}, frame ${frame}`);
  parents.push(Int16Array.from(nodes.map(n=>n.parent)));actions.push(Uint8Array.from(nodes.map(n=>n.flap)));states=nodes.map(n=>n.g);
  if(winner){const result=new Uint8Array(frame+1);let index=0;for(let i=frame;i>=0;i--){result[i]=actions[i][index];index=parents[i][index];}return result;}
 }
 const g=states[0];throw Error(`No floor ${floor} witness: height ${g.maxHeight-base}, cookies ${g.collected}, energy ${g.energy}`);
}
