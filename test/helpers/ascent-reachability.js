import {FactoryGame} from '../../ascent-model.js';
import {AscentDirector,GATE_Y} from '../../ascent-world.js';
function branch(g){
 const c=Object.assign(Object.create(FactoryGame.prototype),g);
 c.bird={...g.bird};c.machine={...g.machine};c.cookie={...g.cookie};c.metrics={...g.metrics};c.balls=g.balls.map(b=>({...b}));
 c.director=Object.assign(Object.create(AscentDirector.prototype),g.director);
 // Search rejects deaths without paying or allocating a result; real replay uses normal finish().
 c.finish=()=>{c.state='dead';return true;};return c;
}
export function findAscentWitness(seed=42,{beam=700,seconds=30}={}){
 const start=new FactoryGame({mode:'ascent',seed});start.press();
 let states=[start];const parents=[],actions=[];
 for(let frame=0;frame<seconds*60;frame++){
  const candidates=new Map();let goal;
  for(let parent=0;parent<states.length;parent++)for(let flap=0;flap<2;flap++){
   const g=branch(states[parent]);if(flap)g.press();g.update();if(g.state!=='playing')continue;
   const y=g.bird.y+29,target=g.machine.awake&&g.abilityRemaining>0?GATE_Y:g.cookie.y+10;
   const rank=g.machine.cookies*500+g.maxHeight*.15-Math.abs(y-target)*.45+g.energy*16+(g.machine.broken?5000:0);
   const key=[Math.round(g.bird.y/8),g.bird.vy,Math.round(g.cameraTop/16),g.collected,g.energy,Math.ceil(g.abilityRemaining*5),Math.ceil(g.abilityCooldown*5),g.director.cursor,g.director.shots,g.balls.map(b=>b.id+':'+Math.round(b.spawnAt*2)).join(',')].join('|');
   const n={g,parent,flap,rank};if(!candidates.has(key)||candidates.get(key).rank<rank)candidates.set(key,n);
   if(g.machine.broken&&g.floor===2&&g.maxHeight>=1350){goal=n;break;}
  }
  const nodes=goal?[goal]:[...candidates.values()].sort((a,b)=>b.rank-a.rank).slice(0,beam);
  if(!nodes.length)throw Error(`No ascent trajectory at frame ${frame}`);
  parents.push(Int16Array.from(nodes.map(n=>n.parent)));actions.push(Uint8Array.from(nodes.map(n=>n.flap)));states=nodes.map(n=>n.g);
  if(goal){const result=new Uint8Array(frame+1);let index=0;for(let i=frame;i>=0;i--){result[i]=actions[i][index];index=parents[i][index];}return result;}
 }
 throw Error('No machine-to-ventilation witness found');
}
