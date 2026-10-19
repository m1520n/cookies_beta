import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,STEP,cookieWord} from '../game-model.js';
import {makeObstacle} from '../obstacles.js';
import {COURSES} from '../courses.js';
import {findWitness} from './helpers/reachability.js';
const start=options=>{const g=new Game({mode:'press',...options});g.press();return g;};
const hazard=(g,x=190,y=280,kind='heavy')=>{const b=makeObstacle({id:`test:${g.balls.length}`,at:g.courseTime-1,kind,x});b.x=x;b.y=y;b.wait=0;g.balls.push(b);return b;};
const choose=(g,id)=>{g.offer={age:1,options:[{id}]};return g.chooseTrait(id);};

test('flap physics, pause and forgiving collider remain stable',()=>{
 const g=start();g.update();assert.equal(g.bird.x,178);assert.equal(g.bird.vy,-7.5);g.press();assert.equal(g.bird.vy,-8);
 const before=structuredClone(g.bird);g.activate('slow');g.paused=true;g.update();assert.deepEqual(g.bird,before);assert.equal(g.effects.slow,6);assert.equal(g.courseTime,STEP);
 for(const [n,w] of [[1,'ciastko'],[2,'ciastka'],[12,'ciastek'],[22,'ciastka']])assert.equal(cookieWord(n),w);
});
test('retries use the same course and a new run id, including direct canvas-style input after death lock',()=>{
 const g=start();const id=g.runId;g.finish();assert.equal(g.press(),false);
 for(let i=0;i<8;i++)g.update();assert.equal(g.press(),true);assert.notEqual(g.runId,id);assert.equal(g.course.id,'press');assert.equal(g.courseTime,0);assert.equal(g.state,'playing');
});
test('death settles immediately once, has a short animation and cannot pay again',()=>{
 const paid=[],results=[];const g=start({onSettle:s=>paid.push(s),onFinish:(...s)=>results.push(s)});g.collected=3;g.finish();g.finish();
 assert.equal(paid.length,1);assert.equal(paid[0].collected,3);assert.equal(results.length,0);for(let i=0;i<30;i++)g.update();
 assert.equal(g.state,'over');assert.equal(results.length,1);g.showResults();assert.equal(results.length,1);assert.ok(Object.isFrozen(g.snapshot));
 const long=start();long.elapsed=20;long.finish();assert.equal(long.deathDuration,.7);
});
test('sector boundaries preserve objects and timers and give no protection',()=>{
 const g=start();g.courseTime=14.99;g.updateTimeline();const balls=g.balls.slice(),cookie=g.cookie,bird={...g.bird};g.activate('magnet');
 const states=balls.map(b=>({...b}));g.courseTime=15;g.updateTimeline();assert.equal(g.level,2);assert.equal(g.cookie,cookie);assert.deepEqual(g.bird,bird);assert.equal(g.effects.magnet,6);assert.equal(g.grace,0);
 for(let i=0;i<balls.length;i++){assert.equal(g.balls[i],balls[i]);assert.deepEqual(g.balls[i],states[i]);}
});
test('destruction never advances the schedule or replaces a ball',()=>{
 const a=start(),b=start();for(const g of [a,b]){g.courseTime=4;g.updateTimeline();for(const ball of g.balls)ball.wait=0;}
 a.balls[0].y=100;a.shatterBall(a.balls[0]);const cursor=a.director.cursor;
 assert.equal(a.director.cursor,cursor);for(const g of [a,b]){g.courseTime=5;g.updateTimeline();}
 assert.deepEqual(a.balls.map(b=>b.id),b.balls.map(b=>b.id));assert.equal(a.balls[0].broken,true);
});
test('world and schedule slow together while input, power limits and cooldown use real time',()=>{
 const a=start(),b=start({profile:{runStyle:'time'}});b.gainEnergy(6);assert.equal(b.abilityRemaining,0);b.collectCookie();
 a.update();b.update();assert.deepEqual(b.bird,a.bird);assert.equal(b.courseTime,STEP/2);assert.equal(b.elapsed,STEP);
 assert.equal(b.activate('slow'),true);b.activate('invincible');assert.equal(b.activate('magnet'),false);
 const before=b.courseTime;b.update();assert.equal(b.courseTime-before,STEP/2);
});
test('full energy waits for the next direct cookie and cannot activate through shards',()=>{
 const g=start();g.gainEnergy(6);assert.equal(g.abilityReady,true);assert.equal(g.abilityRemaining,0);
 g.collectCookie('shards');assert.equal(g.abilityRemaining,0);g.collectCookie();assert.equal(g.abilityRemaining,4);assert.equal(g.energy,0);
 g.gainEnergy(100);assert.equal(g.energy,0);for(let i=0;i<240;i++)g.updateAbility(STEP);assert.equal(g.abilityCooldown,8);g.gainEnergy(6);assert.equal(g.energy,0);
 for(let i=0;i<481;i++)g.updateAbility(STEP);g.gainEnergy(6);assert.equal(g.abilityReady,true);
});
test('near misses reward score and chain during cooldown, once per hazard, without false contact rewards',()=>{
 const g=start();g.abilityCooldown=8;g.chain=3;g.chainTime=1;const b=hazard(g);g.awardNearMiss(b,50);g.awardNearMiss(b,90);g.awardNearMiss(b,50);g.awardNearMiss(b,90);
 assert.equal(g.metrics.nearMisses,1);assert.equal(g.score,1);assert.equal(g.energy,0);assert.equal(g.chainTime,4);
 for(const flags of [{contacted:true},{broken:true}]){const other={...hazard(g),...flags};g.awardNearMiss(other,50);g.awardNearMiss(other,90);}assert.equal(g.score,1);
});
test('crack weakens the passed hazard and rank two one neighbour',()=>{
 const g=start();g.cards.crack=2;const a=hazard(g,190,280),b=hazard(g,210,280),c=hazard(g,0,100);
 g.awardNearMiss(a,50);g.awardNearMiss(a,90);assert.equal(a.weak,true);assert.equal(b.weak,true);assert.equal(c.weak,false);
});
test('echo and shards are bounded to two hazards and one existing cookie per root',()=>{
 const g=start();g.cards={shards:2,echo:2};Object.assign(g.cookie,{x:190,y:280});const oldCookie=g.cookie;
 const a=hazard(g,190,280),b=hazard(g,220,280),c=hazard(g,240,280);g.shatterBall(a);
 assert.equal(g.collected,1);assert.notEqual(g.cookie,oldCookie);assert.equal([a,b,c].filter(b=>b.broken).length,2);assert.equal(g.shatterBall(a),false);assert.equal(g.collected,1);
});
test('collector gives a controlled impulse and multiplies score without increasing physical rewards',()=>{
 const g=start({profile:{runStyle:'collector'}});g.chain=9;g.activate('double');g.gainEnergy(6);Object.assign(g.cookie,{x:190,y:280});const b=hazard(g,190,280);
 g.collectCookie();assert.equal(g.score,16);assert.equal(g.collected,1);assert.equal(b.broken,true);assert.equal(g.energy,0);
});
test('pocket saves one gap and needs six real cookies to recharge',()=>{
 const g=start();choose(g,'pocket');g.chain=6;g.chainTime=STEP/2;g.update();assert.equal(g.chain,6);assert.equal(g.chainTime,2);assert.equal(g.pocketReady,false);
 for(let i=0;i<6;i++)g.collectCookie();assert.equal(g.pocketReady,true);
 g.pocketReady=false;g.chainTime=STEP/2;g.update();assert.equal(g.chain,0);
});
test('three trait slots, two ranks, unlocks and delayed choices are enforced',()=>{
 const g=start();assert.equal(choose(g,'streak'),false);for(const id of ['battery','shards','echo'])assert.equal(choose(g,id),true);
 assert.equal(choose(g,'pocket'),false);assert.equal(choose(g,'battery'),true);assert.equal(choose(g,'battery'),false);choose(g,'shards');choose(g,'echo');g.offer=null;assert.equal(g.traitPool().length,0);g.createOffer();assert.equal(g.offer,null);
 const early=start();early.offer={age:.5,options:[{id:'crack'}]};assert.equal(early.chooseTrait('crack'),false);early.offer.age=1;assert.equal(early.chooseTrait('crack'),true);assert.equal(early.grace,0);
});
test('offers are deterministic, preserve cookies, expire and skip unsafe positions',()=>{
 const a=start(),b=start();for(const g of [a,b]){g.courseTime=6;g.offerIndex=0;g.createOffer();}assert.deepEqual(a.offer,b.offer);assert.ok(a.offer);
 const cookie=a.cookie;a.offer.age=8.9;a.updateOffer(0);assert.equal(a.offer,null);assert.equal(a.cookie,cookie);
 const g=start();g.createOffer=()=>false;g.courseTime=6;g.updateOffer(STEP);assert.equal(g.offerIndex,0);g.elapsed=3.1;g.updateOffer(STEP);assert.equal(g.offerIndex,1);
});
test('feather preserves position and flight, consumes once, and never belongs to the build',()=>{
 const g=start({profile:{lifetimeCookies:40}});const before={...g.bird},b=hazard(g);g.finish('ball',b);
 assert.deepEqual(g.bird,before);assert.equal(b.broken,true);assert.equal(g.featherUsed,true);assert.equal(g.state,'playing');assert.deepEqual(g.cards,{});
 g.finish('ball');assert.equal(g.state,'dying');g.deathElapsed=.2;g.press();assert.equal(g.featherUsed,false);
});
test('bonus caps, conversion in place, permanent duration and normal point accounting remain',()=>{
 const g=start({profile:{upgrades:{duration:2,start:2}}});assert.equal(g.effects.invincible,1.5);g.activate('invincible');assert.equal(g.effects.invincible,5.5);g.activate('slow');assert.equal(g.activate('magnet'),false);
 const cookie=g.cookie;g.cookie.type=4;g.cookie.remaining=STEP;g.update();assert.equal(g.cookie,cookie);assert.equal(g.cookie.type,0);
 g.effects.double=8;g.collectCookie();assert.equal(g.collected,1);assert.equal(g.score,2);
});
test('training restores an exact checkpoint and pays nothing on death, success or retry',()=>{
 let payments=0,wins=0;const g=start({onSettle:()=>payments++,onVictory:()=>wins++});g.courseTime=16;g.updateTimeline();g.checkpoint=g.captureState();
 const checkpoint=structuredClone(g.checkpoint);g.finish();assert.equal(payments,1);assert.equal(g.startPractice(),true);
 for(const key of ['bird','balls','cookie','cards','effects','metrics'])assert.deepEqual(g[key],checkpoint.data[key]);
 assert.equal(g.practice,true);assert.equal(g.courseTime,16);g.finish();assert.equal(payments,1);g.startPractice();g.complete();assert.equal(wins,0);assert.equal(payments,1);assert.equal(g.snapshot.practice,true);
 g.leavePractice();assert.equal(g.practice,false);assert.equal(g.state,'ready');
});
test('marathon records victory once and continues, with the same seed on retry',()=>{
 const wins=[];const g=start({mode:'marathon',seed:123,onVictory:(...args)=>wins.push(args)});g.courseTime=240;g.updateTimeline();g.complete();g.complete();assert.equal(g.state,'playing');assert.equal(wins.length,1);
 g.finish();g.deathElapsed=.2;g.press();assert.equal(g.seed,123);assert.equal(g.courseTime,0);
});
for(const course of COURSES.slice(0,3))test(`actual flap witness completes ${course.name} for every style without moving the world`,()=>{
 const witness=findWitness(course);
 for(const runStyle of ['guard','collector','time']){
    let paid=0,wins=0;const g=start({mode:course.id,profile:{runStyle},onSettle:()=>paid++,onVictory:()=>wins++});
    for(const flap of witness){if(flap)g.press();g.update();assert.notEqual(g.state,'dying',`${course.id} ${runStyle} ${g.courseTime}`);}
    assert.equal(g.won,true);assert.equal(g.state,'celebrating');assert.equal(g.collected,0);assert.equal(g.metrics.offersTaken,0);assert.equal(wins,1);assert.equal(paid,1);
    for(let i=0;i<40;i++)g.update();assert.equal(g.state,'over');assert.equal(g.cause,'complete');assert.equal(paid,1);
 }
});
