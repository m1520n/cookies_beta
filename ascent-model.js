import {Game,STEP} from './game-model.js?v=rooms3';
import {makeObstacle,moveObstacle,obstacleAlive} from './obstacles.js?v=rooms3';
import {AscentDirector,floorBase,gateHeight,gateY,heightAt,floorName,roomCookies,hitsRoom} from './ascent-world.js?v=rooms3';
const FRENZY={id:'ascent',name:'Szał',symbol:'✦',color:'#ffb74f'};
export class FactoryGame extends Game{
 constructor(options={}){super(options);this.onDiscover=options.onDiscover||(()=>{});}
 get isAscent(){return this.course?.id==='ascent';}
 get isGreed(){return this.isAscent||super.isGreed;}
 get style(){return this.isAscent?FRENZY:super.style;}
 get level(){return this.isAscent?this.floor:super.level;}
 get runDetails(){return this.isAscent?{routeVersion:2,startFloor:this.startFloor,height:this.maxHeight,floor:this.floor,pressBroken:this.machines[0]?.broken||false}:{};}
 get goldenCookie(){return this.isAscent?Boolean(this.cookie?.golden):super.goldenCookie;}
 get currentRoom(){return this.isAscent?this.director.rooms.find(r=>this.maxHeight>=r.start&&this.maxHeight<r.end):null;}
 reset(){
  super.reset();if(!this.isAscent)return;
  this.startFloor=this.profile.ascentUnlocked.includes(this.profile.ascentStart)?this.profile.ascentStart:1;
  this.floor=this.startFloor;this.maxHeight=floorBase(this.startFloor);this.cameraTop=-this.maxHeight;this.bird.y=291-this.maxHeight;
  this.machines=[1,2,3].map(floor=>({floor,awake:true,broken:floor<this.startFloor,brokenAt:null,bumpAt:-Infinity,cookies:0}));this.machine=this.machines[this.floor-1];
  this.director=new AscentDirector(this.startFloor);this.stage={name:floorName(this.floor)};
  this.cookies=[];this.cookieSerial=0;this.pickupRooms=new Set();this.feedSerial=0;this.hitstop=0;
 }
 spawnCookie(){
  if(!this.isAscent){super.spawnCookie();return;}
  for(const r of this.director.rooms)if(!this.pickupRooms.has(r.id)){this.pickupRooms.add(r.id);this.cookies.push(...roomCookies(r));}
  const m=this.machine;
  if(m&&!m.broken&&this.maxHeight>=floorBase(m.floor)+1440&&!this.cookies.some(c=>c.feeder===m.floor)){
   const side=this.feedSerial++%2;const h=gateHeight(m.floor)-(side?130:240);
   this.cookies.push({id:`feed:${++this.cookieSerial}`,feeder:m.floor,x:side?300:70,baseY:320-h-10,y:320-h-10,type:0,golden:false,remaining:0});
  }
  this.cookie=this.cookies.find(c=>c.y>=this.cameraTop-40&&c.y<this.cameraTop+700)||this.cookies[0]||null;
 }
 collectCookie(source='touch',root=null){
  if(!this.isAscent){super.collectCookie(source,root);return;}
  if(this.state!=='playing'||!this.cookie)return;
  const c=this.cookie;if(!this.cookies.includes(c))return;
  this.cookies=this.cookies.filter(p=>p!==c);
  super.collectGreedCookie(c);
 }
 breakMachine(){
  const m=this.machine;if(!this.isAscent||!m||m.broken||this.abilityRemaining<=0||this.state!=='playing'||!this.coreExposed)return false;
  m.broken=true;m.brokenAt=this.elapsed;this.metrics.pressBrokenAt||=this.elapsed;
  if(m.floor<3)this.onDiscover(m.floor+1);
  this.hitstop=.075;this.onSound('machine-break');this.onFeedback({type:'machine-break',x:200,y:gateY(m.floor),nextFloor:m.floor+1});return true;
 }
 get coreExposed(){
  if(!this.isAscent||!this.machine)return false;
  const r=this.director.rooms.find(r=>r.boss&&r.floor===this.machine.floor);
  return !r||r.activatedAt===null||((this.courseTime-r.activatedAt)%3.8)>=1.3;
 }
 shatterBall(ball,source='shield',color=this.style.color){
  if(!this.isAscent)return super.shatterBall(ball,source,color);
  if(this.state!=='playing'||ball.broken||ball.wait>0||!obstacleAlive(ball,this.cameraTop))return false;
  ball.broken=true;this.metrics.shatters++;
  if(this.abilityRemaining>0){const points=2*this.multiplier;this.score+=points;this.chainTime=4;this.onFeedback({type:'points',x:ball.x+23,y:ball.y+22,points});}
  this.onSound(`shatter-${ball.kind}`);this.onFeedback({type:'shatter',x:ball.x+23,y:ball.y+22,color,source,kind:ball.kind});return true;
 }
 updateDeath(dt){
  if(!this.isAscent){super.updateDeath(dt);return;}
  this.deathElapsed+=dt;if(this.state==='dying'){const frames=dt*60*this.dyingScale;this.bird.x=Math.max(0,Math.min(344,this.bird.x+this.bird.vx*frames));this.bird.y+=this.bird.vy*frames;this.bird.vy+=.5*frames;this.bird.rotation+=.12*frames*Math.sign(this.bird.vx||1);}
  if(this.deathElapsed>=this.deathDuration)this.showResults();
 }
 update(dt=STEP){
  if(!this.isAscent){super.update(dt);return;}
  if(this.paused||this.state==='over')return;this.ticks++;if(this.state==='ready')return;
  if(this.state==='dying'||this.state==='celebrating'){this.updateDeath(dt);return;}
  if(this.hitstop>0){this.hitstop=Math.max(0,this.hitstop-dt);return;}
  this.elapsed+=dt;this.courseTime+=dt;this.updateAbility(dt);if(this.shielded)this.metrics.shieldSeconds+=dt;this.chainTime=Math.max(0,this.chainTime-dt);if(!this.chainTime)this.chain=0;
  const b=this.bird,from={x:b.x+28,y:b.y+29};b.x+=b.vx;b.y+=b.vy;b.vy+=.5;b.frame=b.vx<0?(b.vy<0?1:3):(b.vy>0?0:2);
  if(b.x<0||b.x+56>400){b.x=Math.max(0,Math.min(344,b.x));b.vx*=-1;this.onSound('bird');}
  const m=this.machine;
  if(m&&!m.broken){
   const y=gateY(m.floor);
   if(Math.hypot(b.x+28-200,b.y+29-y)<=50)this.breakMachine();
   if(!m.broken&&b.y+29-22<y+10){b.y=y+32-29;b.vy=Math.max(0,b.vy);if(this.elapsed-m.bumpAt>.5){m.bumpAt=this.elapsed;this.onSound('gate-bump');}}
  }
  this.maxHeight=Math.max(this.maxHeight,heightAt(b.y+29));this.cameraTop=Math.min(this.cameraTop,b.y+29-256);
  if(b.y+29-22>this.cameraTop+680){this.finish('fall');return;}
  const events=this.director.due(this);
  for(const r of this.director.nearby(this)){
   const hit=hitsRoom(r,from,{x:b.x+28,y:b.y+29},this.courseTime,dt);
   if(hit){this.finish('structure',{x:hit.x,y:hit.y});return;}
  }
  if(m?.broken&&this.maxHeight>=gateHeight(m.floor)+80){
   this.floor=m.floor+1;this.machine=this.machines[this.floor-1]||null;this.stage={name:floorName(this.floor)};
   this.onFeedback({type:'floor',title:floorName(this.floor).toUpperCase()});this.onSound('stage');
  }
  for(const ball of this.balls){moveObstacle(ball,this.courseTime,this.cameraTop);if(ball.wait>0||!obstacleAlive(ball,this.cameraTop))continue;
   const d=Math.hypot(b.x+28-ball.x-23,b.y+29-ball.y-22);
   if(d<22+ball.radius){if(this.shielded)this.shatterBall(ball);else{this.finish('ball',ball);return;}}else this.awardNearMiss(ball,d);
  }
  this.balls=this.balls.filter(ball=>obstacleAlive(ball,this.cameraTop));for(const e of events){this.balls.push(makeObstacle(e));this.onSound(`warning-${e.kind}`);}
  this.cookies=this.cookies.filter(c=>c.baseY<=this.cameraTop+736);this.pickupRooms=new Set([...this.pickupRooms].filter(id=>this.director.rooms.some(r=>r.id===id)));this.spawnCookie();
  for(const c of [...this.cookies]){c.y=c.baseY+5*Math.sin(this.courseTime*4);if(b.x<c.x+30&&b.x+56>c.x&&b.y<c.y+20&&b.y+58>c.y){this.cookie=c;this.collectCookie();}}
  this.cookie=this.cookies.find(c=>c.y>=this.cameraTop-40&&c.y<this.cameraTop+700)||this.cookies[0]||null;
 }
}
