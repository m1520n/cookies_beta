import {GREED,cookiePosition,sectorEvents} from '../../courses.js';
import {makeObstacle,obstacleAt} from '../../obstacles.js';
// Find inputs with a small kinematic model; replay in the real Game is the acceptance gate.
// No position changes, synthetic pickups or inserted/deleted hazards are used on replay.
export function findGreedWitness(seed=42,{beam=2500,seconds=30}={}){
 const events=Array.from({length:Math.ceil(seconds/15)},(_,i)=>sectorEvents(GREED,i,seed)).flat().map((e,index)=>({...makeObstacle(e),index}));
 const parents=[],actions=[];let states=[{y:291,vy:-8,collected:0,energy:0,active:0,cooldown:0,broken:0,gold:0,frenzies:0}],x=172,vx=6;
 for(let frame=0;frame<seconds*60;frame++){
  const time=(frame+1)/60;x+=vx;if(x<0||x+56>400){x=Math.max(0,Math.min(344,x));vx*=-1;}
  const hazards=events.filter(e=>time>=e.spawnAt+1&&time<e.spawnAt+5).map(b=>({...b,...obstacleAt(b,time)})).filter(b=>b.y>=-44&&b.y<686&&b.x>-46&&b.x<400);
  const nodes=new Map();let success;
  for(let parent=0;parent<states.length;parent++)for(let flap=0;flap<2;flap++){
   const old=states[parent],speed=flap?-8:old.vy,y=old.y+speed,vy=speed+.5;
   if(y<18||y>564)continue;
   const n={...old,y,vy,parent,flap};
   if(n.active>0){n.active--;if(!n.active)n.cooldown=240;}else n.cooldown=Math.max(0,n.cooldown-1);
   let hit=false;
   for(const b of hazards){if(n.broken&(1<<b.index))continue;if(Math.hypot(x+28-b.x-23,y+29-b.y-22)<22+b.radius){if(n.active>0)n.broken|=1<<b.index;else{hit=true;break;}}}
   if(hit)continue;
   const c=cookiePosition(n.collected),cx=c.side===0?50:315,cy=c.baseY+12*Math.sin(time*6);
   if(x<cx+30&&x+56>cx&&y<cy+20&&y+58>cy){
    const golden=!n.active&&hazards.some(b=>{if(n.broken&(1<<b.index)||b.y>=640)return false;const d=Math.hypot(cx+15-b.x-23,cy+10-b.y-22);return d>=70&&d<=120;});
    if(n.energy===4&&!n.active&&!n.cooldown){n.active=180;n.energy=0;n.frenzies++;}
    n.collected++;if(golden)n.gold++;
    if(!n.active&&!n.cooldown)n.energy=Math.min(4,n.energy+(golden?2:1));
   }
   if(n.gold&&n.frenzies&&n.broken){success=n;break;}
   const target=cookiePosition(n.collected),targetY=target.baseY+12*Math.sin(time*6);
   n.rank=n.collected*90+n.gold*150+n.frenzies*100-Math.abs(y+29-targetY)*.35-Math.abs(vy)*.4;
   const key=[Math.round(y/4),vy,n.collected,n.energy,Math.ceil(n.active/6),Math.ceil(n.cooldown/6),n.broken,Math.min(1,n.gold)].join(':');
   if(!nodes.has(key)||nodes.get(key).rank<n.rank)nodes.set(key,n);
  }
  if(success){states=[success];}else states=[...nodes.values()].sort((a,b)=>b.rank-a.rank).slice(0,beam);
  if(!states.length)throw Error(`No greedy trajectory at ${time}s`);
  parents.push(Int16Array.from(states.map(n=>n.parent)));actions.push(Uint8Array.from(states.map(n=>n.flap)));
  if(success){const result=new Uint8Array(frame+1);let index=0;for(let i=frame;i>=0;i--){result[i]=actions[i][index];index=parents[i][index];}return result;}
 }
 throw Error('No golden-cookie + frenzy + shatter witness found');
}
