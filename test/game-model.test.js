import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP, POWERUPS, cookieWord } from '../game-model.js';
import { CARDS } from '../progression.js';
const start = options => { const game = new Game({ seed: 12345, ...options }); game.press(); return game; };
function safeTick(game) {
    Object.assign(game.bird, { x: 172, y: 291, vy: 0 });
    for (const ball of game.balls) { ball.wait = 10; ball.y = -50; }
    Object.assign(game.cookie, { x: 315, baseY: 512, type: 0 });
    game.update();
}
function collect(game, type = 0) { game.cookie.type = type; game.collectCookie(); }
function nextSector(game) {
    game.elapsed = game.nextStage.atSeconds;
    game.advanceStage();
}
function finish(game) { game.finish(); for (let i = 0; i < 73; i++) game.update(); }

test('Polish cookie names', () => {
    for (const [n, word] of [[0,'ciastek'],[1,'ciastko'],[2,'ciastka'],[12,'ciastek'],[22,'ciastka'],[112,'ciastek']]) assert.equal(cookieWord(n),word);
});
test('opening controls retain flap rhythm with a slower horizontal speed', () => {
    const game = start(); game.update();
    assert.equal(game.bird.x,178); assert.equal(game.bird.vy,-7.5);
    game.press(); assert.equal(game.bird.vy,-8);
});
test('death has hit-stop, slow motion, delayed result and one settlement', () => {
    const settled = [], results = [];
    const game = start({onSettle: run => settled.push(run), onFinish: (...args) => results.push(args)});
    game.score = 10; game.finish(); const y = game.bird.y;
    assert.equal(game.state,'dying'); assert.equal(settled.length,1); assert.equal(results.length,0);
    for(let i=0;i<4;i++) game.update();
    assert.equal(game.bird.y,y); assert.equal(game.skipDeath(),false);
    for(let i=0;i<8;i++) game.update();
    assert.notEqual(game.bird.y,y); assert.equal(results.length,0);
    for(let i=0;i<65;i++) game.update();
    assert.equal(game.state,'over'); assert.equal(results.length,1);
    game.showResults(); game.finish(); assert.equal(settled.length,1); assert.equal(results.length,1);
});
test('skip requires a fresh action after the initial lock and cannot restart the same run', () => {
    const game = start(); game.finish(); const id=game.runId;
    assert.equal(game.press(),false);
    for(let i=0;i<22;i++) game.update();
    assert.equal(game.skipDeath(),true); assert.equal(game.state,'over'); assert.equal(game.runId,id);
    assert.equal(game.skipDeath(),false);
    game.press(); assert.equal(game.state,'playing'); assert.notEqual(game.runId,id);
});
test('pause freezes both death and active bonus clocks', () => {
    const game=start(); game.activate('invincible'); game.paused=true;
    for(let i=0;i<120;i++) game.update();
    assert.equal(game.effects.invincible,5);
    game.paused=false; game.finish(); game.paused=true;
    for(let i=0;i<120;i++) game.update();
    assert.equal(game.deathElapsed,0);
});
test('last feather rescues once, protects edges briefly, then permits a dramatic death', () => {
    const game=start({profile:{lifetimeCookies:40}});
    assert.equal(game.finish('floor'),false); assert.equal(game.state,'playing'); assert.equal(game.featherUsed,true); assert.equal(game.grace,1.2);
    assert.equal(game.finish('ball'),true); assert.equal(game.state,'dying');
    for(let i=0;i<73;i++) game.update(); game.press(); assert.equal(game.featherUsed,false); assert.deepEqual(game.cards,{});
});
test('double points do not accelerate sector progress or reward currency', () => {
    const game=start(); game.effects.double=8; collect(game);
    assert.equal(game.score,2); assert.equal(game.collected,1); game.finish(); assert.equal(game.snapshot.collected,1);
});
test('all four bonus types appear early, with no consecutive repeated bonuses', () => {
    const game=start(); const types=[];
    for(let slot=0;slot<20;slot++) {
        game.collected=game.nextBonusCookie-1; game.elapsed=game.nextBonusTime; game.spawnCookie(); types.push(game.cookie.type);
        if(slot)assert.notEqual(types[slot],types[slot-1]);
    }
    assert.equal(types[0],1); assert.equal(new Set(types.slice(0,4)).size,4);
});
test('bonuses expire into normal cookies and all timers reset between runs', () => {
    const game=start(); game.cookie.type=1; game.cookie.remaining=STEP; game.update(); assert.equal(game.cookie.type,0);
    for(const powerup of Object.values(POWERUPS))game.activate(powerup.effect);
    finish(game); game.press(); assert.deepEqual(game.effects,{invincible:0,slow:0,magnet:0,double:0}); assert.equal(game.balls.length,1); assert.equal(game.level,1);
});
test('magnet collects at range while slow motion preserves flight controls', () => {
    const normal=start(), slow=start(); slow.activate('slow');
    for(const game of [normal,slow])Object.assign(game.ball,{wait:0,x:0,y:100,vx:0,vy:5});
    normal.update(); slow.update(); assert.deepEqual(slow.bird,normal.bird); assert.equal(slow.ball.y-100,(normal.ball.y-100)/2);
    const game=start(); game.activate('magnet'); Object.assign(game.cookie,{x:260,baseY:300}); game.update(); assert.equal(game.collected,1);
});
test('permanent upgrades are capped, apply to each new run and preserve the flap physics', () => {
    const game=start({profile:{upgrades:{grip:2,duration:2,start:2}}});
    assert.equal(game.effects.invincible,1.5); game.activate('invincible'); assert.equal(game.effects.invincible,5.5);
    assert.equal(game.bird.vx,6); assert.equal(game.bird.vy,-8);
});
test('cookie spawns remain within reach and avoid repeating the preceding place', () => {
    const game=start();
    for(const y of [18,55,150,300,420,564]) {
        game.bird.y=y;
        for(let i=0;i<40;i++) {
            const previous=game.cookie; game.spawnCookie();
            assert.ok(Math.abs(game.cookie.y+10-y-29)<=160);
            assert.ok(previous.side!==game.cookie.side || previous.baseY!==game.cookie.baseY);
        }
    }
});
test('seeded gameplay is unaffected by decorative Math.random calls', () => {
    const a=start({seed:42}), b=start({seed:42});
    for(let i=0;i<15;i++) {
        a.spawnCookie(); for(let j=0;j<31;j++) Math.random(); b.spawnCookie();
        assert.deepEqual(a.cookie,b.cookie);
    }
});
test('forgiving bird radius permits a near miss that the old radius would kill', () => {
    const game=start(); game.bird.vy=0;
    Object.assign(game.ball,{wait:0,x:game.bird.x+28+6+48-23,y:game.bird.y+29-22-5,vx:0,vy:5});
    game.update(); assert.equal(game.state,'playing');
});

test('last feather shatters the contacting ball without teleporting or altering flight',()=>{
    const game=start({profile:{lifetimeCookies:40}});
    Object.assign(game.bird,{x:60,y:200,vx:6,vy:2});
    const ball=game.ball;Object.assign(ball,{x:100,y:210,wait:0});
    const bird={...game.bird};game.finish('ball',ball);
    assert.deepEqual(game.bird,bird);assert.equal(game.ball,ball);assert.equal(ball.broken,true);assert.equal(game.featherUsed,true);
    assert.ok(ball.respawnIn>0);
});
test('shield shatters the contacting ball and delays its announced replacement',()=>{
    const game=start();game.activate('invincible');game.bird.vy=0;
    const ball=game.ball;Object.assign(ball,{x:game.bird.x+30,y:game.bird.y,wait:0,vx:0,vy:5});
    game.update();assert.equal(game.ball,ball);assert.equal(ball.broken,true);assert.equal(ball.wait,0);assert.equal(game.state,'playing');
    assert.ok(ball.respawnIn>0);assert.ok(game.effects.invincible>0);
});
test('edge rescue bounces at the edge and never centers the bird',()=>{
    const game=start({profile:{lifetimeCookies:40}});Object.assign(game.bird,{x:70,y:560,vy:8});
    game.finish('floor');assert.equal(game.bird.x,70);assert.equal(game.bird.y,560);assert.equal(game.bird.vy,-8);
});


test('sector changes preserve flying hazards and only append newly unlocked slots',()=>{
    const game=start(); Object.assign(game.ball,{x:130,y:200,wait:0});
    const ball=game.ball, before={...ball}; nextSector(game);
    assert.equal(game.ball,ball); assert.deepEqual(ball,before);
    nextSector(game);assert.equal(game.ball,ball); assert.equal(game.balls.length,2); assert.ok(game.balls[1].wait>=.6);
});
test('one shatter produces one sound/event, no score farming, then a warning',()=>{
    const events=[],sounds=[];const game=start({onFeedback:e=>events.push(e),onSound:s=>sounds.push(s)});
    Object.assign(game.ball,{x:50,y:200,wait:0}); const ball=game.ball;
    assert.equal(game.shatterBall(ball),true);assert.equal(game.shatterBall(ball),false);
    assert.equal(events.filter(e=>e.type==='shatter').length,1);assert.equal(sounds.filter(s=>s==='shatter').length,1);
    assert.equal(game.score,0); assert.equal(game.chain,0);
    for(let i=0;i<41;i++)safeTick(game);
    assert.notEqual(game.ball,ball);assert.ok(game.ball.wait>0);
});
test('chains reward fast pickups, expire, freeze on pause, and do not multiply currency',()=>{
    const game=start();for(let i=0;i<12;i++)collect(game);
    assert.equal(game.multiplier,4);assert.equal(game.bestChain,12);assert.equal(game.collected,12);
    const score=game.score; game.paused=true;for(let i=0;i<300;i++)game.update();assert.equal(game.chain,12);
    game.paused=false;for(let i=0;i<241;i++)safeTick(game);
    assert.equal(game.chain,0);assert.equal(game.multiplier,1);
    collect(game);assert.equal(game.score,score+1);game.finish();assert.equal(game.snapshot.collected,13);
});
test('bonus director enforces time and pickup spacing, active cap and no active refresh',()=>{
    const game=start();game.collected=3;game.elapsed=7;game.spawnCookie();assert.equal(game.cookie.type,0);
    game.elapsed=8;game.spawnCookie();assert.equal(game.cookie.type,1);
    game.collected=100;game.elapsed=19;game.spawnCookie();assert.equal(game.cookie.type,0);
    game.activate('invincible');game.activate('slow');game.elapsed=20;game.spawnCookie();assert.equal(game.cookie.type,0);
    assert.equal(game.activate('magnet'),false);assert.equal(game.effects.magnet,0);
    game.effects.slow=0;game.spawnCookie();assert.notEqual(game.cookie.type,0);assert.notEqual(game.cookie.type,1);
    const cookie=game.cookie;game.activate('slow');game.advanceStage();assert.equal(game.cookie,cookie);
});


test('timed sector transition preserves every existing object and timer, with no grace or build grant',()=>{
    const events=[];const game=start({onFeedback:e=>events.push(e)});
    Object.assign(game.ball,{x:150,y:300,wait:0});game.activate('slow');
    const bird={...game.bird},ball=game.ball,cookie=game.cookie,oldBall={...ball};
    game.elapsed=30;game.advanceStage();
    assert.deepEqual(game.bird,bird);assert.equal(game.ball,ball);assert.deepEqual(ball,oldBall);assert.equal(game.cookie,cookie);
    assert.equal(game.effects.slow,6);assert.equal(game.grace,0);assert.deepEqual(game.cards,{});
    assert.equal(game.level,2);assert.equal(events.filter(e=>e.type==='stage').length,1);
    game.advanceStage();assert.equal(events.filter(e=>e.type==='stage').length,1);
});
test('cookie collection on the transition frame spawns exactly one successor',()=>{
    const game=start();let spawns=0;const spawn=game.spawnCookie.bind(game);game.spawnCookie=()=>{spawns++;spawn();};
    game.elapsed=30-STEP;game.bird.vy=0;
    Object.assign(game.cookie,{x:game.bird.x+6,baseY:game.bird.y+20,type:0});game.update();
    assert.equal(game.level,2);assert.equal(game.collected,1);assert.equal(spawns,1);
});
test('each style has a different burst, no charging during burst/cooldown, and pause freezes clocks',()=>{
    for(const style of ['guard','collector','time']) {
        const game=start({profile:{runStyle:style}});game.gainEnergy(6);
        assert.equal(game.abilityRemaining,4);assert.equal(game.shielded,style==='guard');assert.equal(game.slowed,style==='time');
        game.gainEnergy(100);assert.equal(game.energy,0);game.paused=true;game.update();assert.equal(game.abilityRemaining,4);game.paused=false;
        for(let i=0;i<240;i++)safeTick(game);
        assert.equal(game.abilityRemaining,0);assert.equal(game.abilityCooldown,8);
        game.gainEnergy(6);assert.equal(game.energy,0);
        for(let i=0;i<481;i++)safeTick(game);
        game.gainEnergy(6);assert.equal(game.metrics.abilities,2);
    }
});
test('collector burst stacks score with chain and double without multiplying physical cookies or currency',()=>{
    const game=start({profile:{runStyle:'collector'}});game.chain=9;game.activate('double');game.gainEnergy(6);collect(game);
    assert.equal(game.score,16);assert.equal(game.collected,1);assert.equal(game.energy,0);
    game.finish();assert.equal(game.snapshot.collected,1);
});
test('time burst and slow pickup never quarter ball speed or affect the bird',()=>{
    const a=start(),b=start({profile:{runStyle:'time'}});b.gainEnergy(6);b.activate('slow');
    for(const game of [a,b])Object.assign(game.ball,{wait:0,x:0,y:100,vx:0,vy:5});
    a.update();b.update();assert.deepEqual(a.bird,b.bird);assert.equal(b.ball.y-100,(a.ball.y-100)/2);
});
test('near misses are awarded once after separation, never for contact, breaking, or wide passes',()=>{
    const game=start();const ball=game.ball;
    game.awardNearMiss(ball,55);assert.equal(game.energy,0);game.awardNearMiss(ball,85);assert.equal(game.energy,2);
    game.awardNearMiss(ball,55);game.awardNearMiss(ball,100);assert.equal(game.energy,2);
    for(const flags of [{contacted:true},{broken:true},{}]){
        const b={nearDistance:Infinity,...flags};game.awardNearMiss(b,flags.contacted||flags.broken ? 55 : 75);game.awardNearMiss(b,100);
    }
    assert.equal(game.metrics.nearMisses,1);
});
test('precision and dynamo modify energy, while burst shatters cannot recharge it',()=>{
    const game=start();game.cards={precision:2,dynamo:2};game.awardNearMiss(game.ball,55);game.awardNearMiss(game.ball,90);assert.equal(game.energy,4);
    Object.assign(game.ball,{wait:0,x:80,y:200});game.shatterBall(game.ball);assert.ok(game.abilityRemaining>0);assert.equal(game.energy,0);
    game.spawnBall();Object.assign(game.ball,{wait:0,y:200});game.shatterBall(game.ball);assert.equal(game.energy,0);
});
test('alternator rewards only opposite sides; dogrywka extends only the burst',()=>{
    const game=start();game.cards={alternator:1,streak:2};game.activate('slow');
    game.cookie.side=0;collect(game);assert.equal(game.energy,1);
    game.cookie.side=0;collect(game);assert.equal(game.energy,2);
    game.cookie.side=1;collect(game);assert.equal(game.energy,4);
    game.cookie.side=0;collect(game);assert.equal(game.abilityRemaining,5);assert.equal(game.effects.slow,6);
});
test('shards collect one real cookie once and do not recursively spawn or shatter hazards',()=>{
    const events=[];const game=start({onFeedback:e=>events.push(e)});game.cards={shards:2};
    const ball=game.ball;Object.assign(ball,{x:game.cookie.x,y:game.cookie.y,wait:0});
    const cookie=game.cookie;game.shatterBall(ball);game.shatterBall(ball);
    assert.equal(game.collected,1);assert.notEqual(game.cookie,cookie);assert.equal(game.balls.length,1);
    assert.equal(events.filter(e=>e.type==='collect'&&e.source==='shards').length,1);
});
test('offers use a separate seeded stream, preserve cookies and require a fresh collision after warning',()=>{
    const a=start(),b=start();
    for(const game of [a,b]){Object.assign(game.cookie,{x:315,y:512,baseY:512});game.elapsed=25;}
    const cookie=a.cookie,ball=a.ball;const bird={...a.bird};
    a.createOffer();for(let i=0;i<100;i++)Math.random();b.createOffer();assert.deepEqual(a.offer,b.offer);
    assert.equal(a.cookie,cookie);assert.equal(a.ball,ball);assert.deepEqual(a.bird,bird);
    const option=a.offer.options[0];assert.equal(a.chooseTrait(option.id),false);
    a.offer.age=.9;Object.assign(a.bird,{x:option.x-28,y:option.y-29});a.updateOffer(0);
    assert.equal(a.cards[option.id],1);assert.equal(a.offer,null);assert.equal(a.state,'playing');assert.equal(a.grace,0);
});
test('trait choices enforce three slots, two ranks, unlocks and exhausted pools',()=>{
    const game=start();const choose=id=>{game.offer={age:1,options:[{id}]};return game.chooseTrait(id);};
    assert.equal(choose('streak'),false);for(const id of ['battery','shards','precision'])assert.equal(choose(id),true);
    assert.equal(choose('dynamo'),false);assert.equal(choose('battery'),true);assert.equal(choose('battery'),false);
    choose('shards');choose('precision');game.offer=null;assert.equal(game.traitPool().length,0);assert.equal(game.createOffer(),true);assert.equal(game.offer,null);
    const unlocked=start({profile:{lifetimeBonuses:10}});assert.ok(unlocked.traitPool().some(card=>card.id==='streak'));
});
test('offers expire, skip unsafe placements after three seconds, and do not get pulled by magnets',()=>{
    const game=start();game.elapsed=25;game.createOffer=()=>false;game.updateOffer(STEP);assert.equal(game.offerIndex,0);
    game.elapsed=28.1;game.updateOffer(STEP);assert.equal(game.offerIndex,1);
    game.offer={age:8.89,options:[]};game.updateOffer(STEP);assert.equal(game.offer,null);
    game.activate('magnet');game.offer={age:1,options:[{id:'battery',x:game.bird.x+100,y:game.bird.y+29}]};game.updateOffer(STEP);assert.deepEqual(game.cards,{});
});
test('finale preserves the field, sequences future hazards and records victory once before endless play',()=>{
    const wins=[],events=[];const game=start({onVictory:id=>wins.push(id),onFeedback:e=>events.push(e)});
    game.elapsed=209;game.updateTimeline();const ball=game.ball,cookie=game.cookie;
    for(const [time,pattern] of [[210,'rain'],[220,'diagonal'],[230,'pairs']]) {
        game.elapsed=time;game.updateTimeline();assert.equal(game.stage.pattern,pattern);assert.equal(game.ball,ball);assert.equal(game.cookie,cookie);
    }
    game.elapsed=240;game.updateTimeline();game.updateTimeline();assert.equal(game.won,true);assert.equal(game.state,'playing');assert.equal(wins.length,1);
    game.elapsed=270;game.updateTimeline();assert.equal(game.level,10);assert.equal(events.filter(e=>e.type==='victory').length,1);
});
test('a complete four-minute timeline pauses correctly, has six offers and continues for every style',()=>{
    for(const style of ['guard','collector','time']) {
        const game=start({profile:{runStyle:style,lifetimeCookies:40}});let offers=0;
        game.createOffer=()=>{offers++;return true;};
        for(let i=0;i<14401;i++) {if(i%240===0)game.gainEnergy(6);safeTick(game);}
        assert.equal(game.state,'playing');assert.equal(game.won,true);assert.equal(offers,6);assert.equal(game.balls.length,3);
        assert.ok(game.metrics.abilities>0);game.paused=true;const elapsed=game.elapsed;game.update();assert.equal(game.elapsed,elapsed);
        game.featherUsed=true;game.finish();assert.equal(game.snapshot.won,true);assert.equal(game.snapshot.bestChain,game.bestChain);
    }
});

test('physical pass earns a near miss once and contacts cannot earn it',()=>{
    const game=start();game.bird.vy=0;
    // Bird moves six right and the ball five down on the first tick.
    Object.assign(game.ball,{wait:0,x:game.bird.x+28+6+55-23,y:game.bird.y+29-22-5,vx:0,vy:5});
    game.update();assert.equal(game.state,'playing');assert.equal(game.energy,0);
    const ball=game.ball;Object.assign(ball,{x:0,y:50});game.bird.vy=0;game.update();
    assert.equal(game.metrics.nearMisses,1);assert.equal(game.energy,2);
    const other=start();other.activate('invincible');other.bird.vy=0;
    Object.assign(other.ball,{wait:0,x:other.bird.x+28,y:other.bird.y,vx:0,vy:5});other.update();assert.equal(other.metrics.nearMisses,0);
});
test('a thousand offer seeds respect reach, cookie separation, warning and trait limits',()=>{
    for(let seed=0;seed<1000;seed++) {
        const game=start({seed});game.elapsed=25;const cookie=game.cookie,ball=game.ball;
        if(!game.createOffer())continue;
        assert.equal(game.offer.age,0);assert.ok(game.offer.options.length<=2);
        for(const option of game.offer.options) {
            assert.ok(Math.abs(option.y-game.bird.y-29)<=160);
            assert.ok(Math.hypot(option.x-cookie.x-15,option.y-cookie.y-10)>=65);
        }
        assert.equal(game.ball,ball);assert.equal(game.cookie,cookie);
    }
});
