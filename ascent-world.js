// Fixed world coordinates: up is negative Y, 20 units = 1 metre.
export const ASCENT={id:'ascent',name:'Fabryka',duration:Infinity,endless:true,sectorSeconds:15,offers:[],sectors:[['heavy']],gaps:[2.5]};
export const ROOM_HEIGHT=480,FLOOR_STEP=1920,GATE_HEIGHT=1800,GATE_Y=320-GATE_HEIGHT,VENT_START=FLOOR_STEP;
export const heightAt=y=>Math.max(0,320-y);
export const floorName=floor=>['Tłocznia','Wentylatornia','Kotłownia'][floor-1]||'Nadbudowa';
export const ascentRecordKey=floor=>`ascent-rooms:${Math.min(3,Math.max(1,floor))}`;
export const floorBase=floor=>(floor-1)*FLOOR_STEP;
export const gateHeight=floor=>floorBase(floor)+GATE_HEIGHT;
export const gateY=floor=>320-gateHeight(floor);
const patterns=[['piston','pair','pendulum'],['shutter','swing-door','ball-door'],['steam','steam-piston','steam-door']];
export function makeRoom(floor,index,cycle=0){
 const start=cycle?5760+(cycle-1)*1440+index*480:floorBase(floor)+index*480;
 const kind=patterns[(floor-1)%3][index];
 return {id:`${cycle?'loop'+cycle:floor}:${index}`,floor,index,start,end:start+480,kind,mirror:Boolean(cycle%2),activatedAt:null,shot:false};
}
export function makeBossRoom(floor){return {id:`boss:${floor}`,floor,index:3,start:floorBase(floor)+1440,end:gateHeight(floor),kind:['piston','shutter','steam'][floor-1],activatedAt:null,shot:false,boss:true};}
export function roomCookies(room){
 if(room.boss)return [];
 const side=room.index%2?1:0;
 return [{id:`${room.id}:plain`,x:side?300:70,baseY:320-room.start-155-10,golden:false},
 {id:`${room.id}:gold`,x:side?65:305,baseY:320-room.start-410-10,golden:true}].map(c=>({...c,x:room.mirror?370-c.x:c.x,y:c.baseY,type:0,remaining:0,roomId:room.id}));
}
// All drawing, warnings and collision sampling consume this same analytic geometry.
export function roomGeometry(room,time){
 const age=room.activatedAt===null?0:Math.max(0,time-room.activatedAt),warning=room.activatedAt!==null&&age<1;
 const active=room.activatedAt!==null&&age>=1;
 const t=Math.max(0,age-1),period=3.8,phase=t%period;
 // Retract smoothly; never change a lethal shape instantaneously.
 const pulse=(offset=0)=>{if(!active)return 0;const p=(t+offset)%period;return p<.35?p/.35:p<1.5?1:p<1.85?1-(p-1.5)/.35:0;};
 const shapes=[],markers=[];
 const rect=(side,h,width,kind,offset=0)=>{if(room.mirror)side=side==='left'?'right':'left';const y=320-room.start-h,p=(t+offset)%period;markers.push({x:side==='left'?20:380,y,kind,warning:warning||active&&(p>3.25||p<.35)});if(width>0)shapes.push({type:'rect',x:side==='left'?0:400-width,y:y-13,w:width,h:26,kind,hot:kind==='steam'});};
 const piston=(side,h,offset=0)=>rect(side,h,260*pulse(offset),'piston',offset);
 const door=h=>{const gap=active?280*(1-pulse()):280;rect('left',h,(400-gap)/2,'shutter');rect('right',h,(400-gap)/2,'shutter');};
 const swing=h=>{const y=320-room.start-h,x=200+(room.mirror?-1:1)*116*Math.sin((active?t:0)*2.05);markers.push({x:200,y:y-90,kind:'pendulum',warning});shapes.push({type:'circle',x,y,r:29,kind:'pendulum',anchorY:y-90});};
 const steam=h=>{rect('left',h,active?240*pulse():0,'steam');rect('right',h,active?240*pulse(1.9):0,'steam',1.9);};
 switch(room.kind){
  case'piston':piston('left',340);break;
  case'pair':piston('left',285);piston('right',410,.85);break;
  case'pendulum':swing(340);break;
  case'shutter':door(340);break;
  case'swing-door':door(300);swing(420);break;
  case'ball-door':door(340);break;
  case'steam':steam(340);break;
  case'steam-piston':steam(280);piston('right',420,.9);break;
  case'steam-door':steam(270);door(420);break;
 }
 // Boss devices guard the approach, leaving the core chamber clear for charging.
 if(room.boss)for(const s of shapes)s.y+=160;
 if(room.boss)for(const m of markers)m.y+=160;
 return {shapes,markers,warning,age,phase};
}
function circleHits(x,y,r,s){
 if(s.type==='circle')return Math.hypot(x-s.x,y-s.y)<r+s.r;
 const dx=x-Math.max(s.x,Math.min(x,s.x+s.w)),dy=y-Math.max(s.y,Math.min(y,s.y+s.h));return dx*dx+dy*dy<r*r;
}
export function hitsRoom(room,from,to,time,dt){
 const low=320-room.start-(room.boss?70:230),high=320-room.start-(room.boss?310:470);
 if(Math.min(from.y,to.y)-22>low||Math.max(from.y,to.y)+22<high)return null;
 // Sample relative motion of bird AND machinery; <= 1 px of bird motion per sample.
 const steps=Math.max(8,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)));
 for(let i=0;i<=steps;i++){const f=i/steps;for(const s of roomGeometry(room,time-dt+dt*f).shapes)if(circleHits(from.x+(to.x-from.x)*f,from.y+(to.y-from.y)*f,22,s))return s;}
 return null;
}
export class AscentDirector{
 constructor(startFloor=1){this.cursor=0;this.rooms=[];for(let f=startFloor;f<=3;f++){for(let i=0;i<3;i++)this.rooms.push(makeRoom(f,i));this.rooms.push(makeBossRoom(f));}this.loop=0;}
 configure(){return {name:'Fabryka'};}
 ensure(game){
  while(game.maxHeight>=5700+this.loop*1440){this.loop++;for(let i=0;i<3;i++)this.rooms.push(makeRoom((this.loop-1)%3+1,i,this.loop));}
  for(const r of this.rooms)if(r.floor<=game.floor&&r.activatedAt===null&&game.maxHeight>=Math.max(floorBase(Math.min(3,game.startFloor)),r.start-240)){r.activatedAt=game.courseTime;this.cursor++;}
  // Bounded memory for the endless section; visible entities are never removed here.
  this.rooms=this.rooms.filter(r=>r.end>=-game.cameraTop-520);
 }
 nearby(game){return this.rooms.filter(r=>320-r.start>=game.cameraTop-100&&320-r.end<=game.cameraTop+740);}
 due(game){
  this.ensure(game);const events=[];
  for(const r of this.nearby(game))if(r.kind==='ball-door'&&!r.shot&&r.activatedAt!==null&&game.courseTime-r.activatedAt>=1){
   if(game.balls.length+events.length>=3)continue;r.shot=true;
   events.push({id:`${r.id}:ball`,kind:'ricochet',x:r.mirror?70:284,at:game.courseTime,y:320-r.end-100,world:true,wind:0});
  }
  return events;
 }
}
