import test from 'node:test';
import assert from 'node:assert/strict';
import {findGreedWitness} from './helpers/greed-reachability.js';
import {Game,STEP} from '../game-model.js';
import {GREED,sectorFamilies} from '../courses.js';
import {Director} from '../director.js';
import {makeObstacle,obstacleAt} from '../obstacles.js';
const start=options=>{const g=new Game({mode:'greed',seed:42,...options});g.press();return g;};
const ballAt=(g,x,y)=>{
 const b=makeObstacle({id:`test:${g.balls.length}`,kind:'heavy',at:g.courseTime-1-(y+50)/270,x});
 Object.assign(b,obstacleAt(b,g.courseTime));g.balls.push(b);return b;
};

test('greed has equal physics, no purchased protection, feather, traits or random powers',()=>{
 const rich=start({profile:{runStyle:'time',lifetimeCookies:999,upgrades:{grip:2,duration:2,start:2}}}),plain=start();
 assert.equal(rich.hasFeather,false);assert.equal(rich.shielded,false);assert.equal(rich.style.id,'greed');
 for(let i=0;i<10;i++){rich.update();plain.update();}assert.deepEqual(rich.bird,plain.bird);
 assert.equal(rich.activate('invincible'),false);assert.equal(rich.startPractice(),false);assert.deepEqual(rich.traitPool(),[]);
 rich.elapsed=120;rich.collected=100;rich.spawnCookie();rich.updateOffer(STEP);assert.equal(rich.cookie.type,0);assert.equal(rich.offer,null);
 rich.energy=4;rich.collectCookie();assert.equal(rich.abilityRemaining,3);assert.equal(rich.slowed,false);
});
test('golden windows use live distance, never move cookies and score three with two charges',()=>{
 const g=start(),cookie=g.cookie,b=ballAt(g,cookie.x+15-23-90,cookie.y+10-22),before={...cookie};
 assert.equal(g.goldenCookie,true);assert.deepEqual(g.cookie,before);g.collectCookie();
 assert.equal(g.score,3);assert.equal(g.energy,2);assert.equal(g.collected,1);assert.equal(g.metrics.goldenCookies,1);
 for(const [distance,expected] of [[69,false],[70,true],[120,true],[121,false]]){b.x=g.cookie.x+15-23+distance;b.y=g.cookie.y+10-22;assert.equal(g.goldenCookie,expected);}
 b.broken=true;assert.equal(g.goldenCookie,false);b.broken=false;b.wait=.1;assert.equal(g.goldenCookie,false);
});
test('four charges wait for the next cookie, frenzy cannot recharge or extend itself and cooldown is four seconds',()=>{
 const sounds=[],g=start({onSound:s=>sounds.push(s)});for(let i=0;i<4;i++)g.collectCookie();
 assert.equal(g.abilityReady,true);assert.equal(g.abilityRemaining,0);g.collectCookie();assert.equal(g.abilityRemaining,3);assert.equal(g.energy,0);
 g.collectCookie();assert.equal(g.abilityRemaining,3);assert.equal(g.energy,0);assert.equal(g.goldenCookie,false);
 for(let i=0;i<180;i++)g.updateAbility(STEP);
 assert.equal(g.abilityRemaining,0);assert.equal(g.abilityCooldown,4);assert.equal(sounds.filter(s=>s==='frenzy-ending').length,1);assert.equal(sounds.filter(s=>s==='frenzy-end').length,1);
 g.collectCookie();assert.equal(g.energy,0);g.paused=true;g.update();assert.equal(g.abilityCooldown,4);
 g.paused=false;for(let i=0;i<240;i++)g.updateAbility(STEP);g.collectCookie();assert.equal(g.energy,1);
});
test('frenzy contact rewards once, refreshes series, preserves flight and never replaces a hazard',()=>{
 const g=start();g.energy=4;g.collectCookie();g.chain=6;g.chainTime=.1;
 const b=ballAt(g,g.bird.x+28-23+6,g.bird.y-8+29-22),schedule=g.director.cursor,score=g.score;
 g.update();assert.equal(g.state,'playing');assert.equal(g.score,score+6);assert.equal(g.chainTime,4);assert.equal(g.energy,0);assert.equal(g.metrics.shatters,1);
 assert.equal(g.bird.x,178);assert.equal(g.bird.y,283);assert.equal(g.director.cursor,schedule);
 assert.equal(g.shatterBall(b),false);assert.equal(g.score,score+6);assert.equal(g.balls.length,0);
 const spike=start();spike.energy=4;spike.collectCookie();spike.bird.y=19;spike.bird.vy=-8;spike.update();assert.equal(spike.state,'dying');
});
test('series expires without losing earned score and dodging without cookies cannot farm score or charge',()=>{
 const g=start();for(let i=0;i<12;i++)g.collectCookie();assert.equal(g.multiplier,4);
 const score=g.score;g.chainTime=STEP/2;g.update();assert.equal(g.chain,0);assert.equal(g.score,score);
 const empty=start(),b=ballAt(empty,60,280);empty.awardNearMiss(b,50);empty.awardNearMiss(b,90);assert.equal(empty.score,0);assert.equal(empty.energy,0);
});
test('endless greed preserves seed and pays physical cookies once without sector or victory rewards',()=>{
 const paid=[],wins=[],g=start({onSettle:s=>paid.push(s),onVictory:s=>wins.push(s)});
 g.courseTime=300;g.updateTimeline();assert.equal(g.level,21);assert.equal(g.state,'playing');assert.equal(g.won,false);
 g.collected=3;g.finish();assert.equal(paid[0].completedSectors,0);assert.equal(paid[0].mode,'greed');assert.equal(paid[0].style,'greed');assert.equal(wins.length,0);
 for(let i=0;i<50;i++)g.update();const seed=g.seed,id=g.runId;g.press();assert.equal(g.seed,seed);assert.notEqual(g.runId,id);assert.equal(paid.length,1);
});
test('greed schedule introduces families in order, caps pressure and keeps at most three hazards',()=>{
 assert.deepEqual(sectorFamilies(GREED,0),['heavy']);assert.deepEqual(sectorFamilies(GREED,1),['ricochet']);assert.deepEqual(sectorFamilies(GREED,2),['pendulum']);
 const director=new Director(GREED,42);director.ensure(600);
 for(let time=0;time<600;time+=.1){const alive=director.events.filter(e=>e.at<=time&&e.at>time-5).map(e=>{const b=makeObstacle(e);return {...b,...obstacleAt(b,time)};}).filter(b=>b.y<686&&b.x>-46&&b.x<400);assert.ok(alive.length<=3,`time ${time}`);}
 const late=director.events.filter(e=>e.at>=100);for(let i=1;i<late.length;i++)assert.ok(late[i].at-late[i-1].at>=2);
});

test('real flap inputs earn a golden cookie, trigger frenzy and break a live scheduled hazard',()=>{
 const inputs=findGreedWitness(42),g=start();
 for(const input of inputs){if(input)g.press();g.update();assert.equal(g.state,'playing');}
 assert.ok(g.metrics.goldenCookies>=1);assert.ok(g.metrics.abilities>=1);assert.ok(g.metrics.shatters>=1);
 assert.ok(g.metrics.firstFrenzyAt<10);assert.ok(g.elapsed<10);assert.ok(g.score>g.collected);
});
