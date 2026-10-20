import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore, PROFILE_KEY, cleanProfile, unlockedCards, unlockedLooks, unlockedCourses } from '../progression.js';
const memory = () => { const data = new Map(); return { data, getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value) }; };
const run = (id, collected=8, completedSectors=1, bonuses=2) => ({id,collected,completedSectors,bonuses,level:completedSectors+1});

test('settlement persists once across skip, reload and repeated callbacks',()=>{
    const storage=memory(), store=new ProfileStore(storage);
    assert.equal(store.settle(run('a')).crumbs,11);
    assert.equal(store.settle(run('a')).awarded,false);
    const reload=new ProfileStore(storage);
    assert.equal(reload.value.crumbs,11); assert.equal(reload.settle(run('a')).awarded,false);
    assert.equal(reload.value.runs,1);
});
test('achievements unlock both cards and report them only once',()=>{
    const store=new ProfileStore(memory());
    for(let i=0;i<5;i++)store.settle(run(`r${i}`));
    assert.deepEqual(unlockedCards(store.value),['feather','streak']);
    assert.deepEqual(store.settle(run('last')).unlocked,[]);
});
test('purchases require funds and respect two-level caps',()=>{
    const storage=memory(), store=new ProfileStore(storage);
    assert.equal(store.purchase('grip'),false); assert.equal(store.purchase('wrong'),false);
    store.settle(run('a',200,0));
    assert.equal(store.purchase('grip'),true); assert.equal(store.purchase('grip'),true); assert.equal(store.purchase('grip'),false);
    assert.equal(store.value.crumbs,130); assert.equal(new ProfileStore(storage).value.upgrades.grip,2);
});
test('another tab cannot buy using a stale balance',()=>{
    const storage=memory(), a=new ProfileStore(storage), b=new ProfileStore(storage);
    a.settle(run('a',20,0)); assert.equal(a.purchase('grip'),true);
    assert.equal(b.purchase('duration'),false); assert.equal(b.value.crumbs,0);
});
test('blocked or write-only-disabled storage keeps session progress',()=>{
    for(const storage of [{getItem(){throw Error();},setItem(){throw Error();}}, {getItem(){return JSON.stringify(cleanProfile());},setItem(){throw Error();}}]){
        const store=new ProfileStore(storage); store.settle(run('a')); store.settle(run('b'));
        assert.equal(store.value.crumbs,22); assert.equal(store.purchase('grip'),true); assert.equal(store.value.crumbs,2);
    }
});
test('malformed profiles, invalid ranks and negative rewards are sanitized',()=>{
    const storage=memory(); storage.data.set(PROFILE_KEY,'{broken'); assert.equal(new ProfileStore(storage).value.crumbs,0);
    assert.equal(cleanProfile({crumbs:-10,upgrades:{grip:999}}).upgrades.grip,2);
    assert.equal(cleanProfile(null).crumbs,0);
    const store=new ProfileStore(memory()); store.settle(run('negative',-5,-1,-1)); assert.equal(store.value.crumbs,0);
});

test('pre-run style persists without spending any currency',()=>{
    const storage=memory(),store=new ProfileStore(storage);
    assert.equal(store.setStyle('collector'),true);assert.equal(store.value.crumbs,0);
    assert.equal(new ProfileStore(storage).value.runStyle,'collector');
    assert.equal(store.setStyle('bad'),false);assert.equal(store.value.runStyle,'collector');
});


test('old version-one profiles keep funds, styles, upgrades and unlocks after additive migration',()=>{
    const storage=memory();storage.data.set(PROFILE_KEY,JSON.stringify({version:1,crumbs:453,lifetimeCookies:100,lifetimeBonuses:15,runStyle:'time',upgrades:{grip:2,duration:2,start:2},lastRun:{score:115,seed:7,level:5}}));
    const store=new ProfileStore(storage);assert.equal(store.value.crumbs,453);assert.equal(store.value.runStyle,'time');assert.equal(store.value.upgrades.start,2);
    assert.deepEqual(unlockedCards(store.value),['feather','streak']);assert.equal(store.value.wins,0);assert.equal(store.value.lastRun.score,115);assert.equal(store.value.look,'classic');
});
test('victory persists immediately and idempotently without settling or multiplying run rewards',()=>{
    const storage=memory(),store=new ProfileStore(storage);assert.equal(store.recordVictory('win'),true);
    const reload=new ProfileStore(storage);assert.equal(reload.value.wins,1);assert.equal(reload.value.runs,0);assert.equal(reload.value.crumbs,0);
    assert.equal(reload.recordVictory('win'),false);assert.equal(reload.setLook('gold'),true);assert.equal(reload.setLook('mint'),false);
    reload.settle({...run('win'),bestChain:20,build:[{id:'battery',rank:2}],metrics:{shieldSeconds:2.5,nearMisses:3,cause:'floor'}});
    assert.equal(reload.value.crumbs,11);assert.equal(reload.value.wins,1);assert.equal(reload.setLook('mint'),true);
    const saved=new ProfileStore(storage);assert.deepEqual(unlockedLooks(saved.value),['classic','gold','mint']);assert.equal(saved.value.look,'mint');assert.equal(saved.value.lastRun.metrics.shieldSeconds,2.5);
    assert.deepEqual(saved.value.lastBuild,[{id:'battery',rank:2}]);assert.equal(saved.settle(run('win')).awarded,false);
});
test('blocked storage retains a victory and cosmetics during the session',()=>{
    const store=new ProfileStore({getItem(){throw Error();},setItem(){throw Error();}});
    store.recordVictory('a');assert.equal(store.setLook('gold'),true);assert.equal(store.recordVictory('a'),false);assert.equal(store.value.wins,1);
    assert.equal(cleanProfile({wins:'yes',look:'gold'}).look,'classic');
});


test('course unlocks distinguish legacy winners from new wins and persist records per style',()=>{
    assert.deepEqual(unlockedCourses(cleanProfile({wins:1})),['ascent','greed','press','ricochet','mechanism','marathon']);
    const storage=memory(),store=new ProfileStore(storage);
    assert.equal(store.setCourse('mechanism'),false);
    store.recordVictory('first','press');
    assert.deepEqual(unlockedCourses(new ProfileStore(storage).value),['ascent','greed','press','ricochet','marathon']);
    assert.equal(store.setCourse('ricochet'),true);
    store.settle({...run('a'),mode:'press',style:'time',progress:.8,score:15});
    store.settle({...run('b'),mode:'press',style:'time',progress:.3,score:20});
    store.settle({...run('practice'),practice:true,mode:'press',style:'guard',progress:1});
    const saved=new ProfileStore(storage).value;
    assert.deepEqual(saved.records['press:time'],{progress:.8,score:20});
    assert.deepEqual(saved.records['press:guard'],{progress:0,score:0});
    assert.equal(saved.runs,2);assert.equal(saved.selectedCourse,'ricochet');
});
test('course cosmetics require a real clear, funds and one purchase without affecting upgrades',()=>{
    const storage=memory(),store=new ProfileStore(storage);
    store.settle(run('funds',500,0));assert.equal(store.purchaseLook('copper'),false);
    store.recordVictory('win','press');assert.equal(store.purchaseLook('cobalt'),false);
    assert.equal(store.purchaseLook('copper'),true);assert.equal(store.purchaseLook('copper'),false);
    assert.equal(store.value.crumbs,400);assert.equal(store.setLook('copper'),true);
    const saved=new ProfileStore(storage).value;
    assert.equal(saved.look,'copper');assert.deepEqual(saved.upgrades,{grip:0,duration:0,start:0});
});

test('legacy high score imports once and later short-course scores cannot inflate marathon history',()=>{
    const storage=memory(),store=new ProfileStore(storage);store.adoptLegacyBest(237);
    const reload=new ProfileStore(storage);reload.adoptLegacyBest(999);
    assert.equal(reload.value.legacyBest,237);
});

test('greed migrates once, pays only physical cookies and keeps a style-independent record',()=>{
 const storage=memory();storage.data.set(PROFILE_KEY,JSON.stringify({version:1,crumbs:10,selectedCourse:'ricochet',wins:1,upgrades:{start:2},records:{'press:time':{progress:.8,score:200}}}));
 const store=new ProfileStore(storage);assert.equal(store.value.selectedCourse,'ascent');assert.equal(store.value.records['press:time'].score,200);
 assert.equal(store.settle({...run('greed',3,100),mode:'greed',style:'greed',score:48}).crumbs,3);
 assert.equal(store.value.crumbs,13);assert.equal(store.value.records.greed.score,48);assert.equal(store.value.courseClears.length,0);
 assert.equal(store.recordVictory('no-win','greed'),false);store.setCourse('press');assert.equal(new ProfileStore(storage).value.selectedCourse,'press');
 assert.equal(store.settle({...run('greed',999),mode:'greed'}).awarded,false);
});

test('ascent discoveries survive death and records are separate by starting floor without touching old scores',()=>{
 const storage=memory(),store=new ProfileStore(storage);assert.equal(store.setStartFloor(2),false);
 store.settle({...run('legacy'),mode:'greed',score:237});assert.equal(store.discoverFloor(2),true);assert.equal(store.discoverFloor(2),false);
 assert.equal(store.setStartFloor(2),true);store.settle({...run('factory',6,30),mode:'ascent',startFloor:2,height:1800,score:30,metrics:{cause:'fall'}});
 const reload=new ProfileStore(storage);assert.deepEqual(reload.value.ascentUnlocked,[1,2]);assert.equal(reload.value.ascentStart,2);
 assert.equal(reload.value.records['ascent:2'].height,1800);assert.equal(reload.value.records['ascent:1'].height,0);assert.equal(reload.value.records.greed.score,237);
 assert.equal(reload.value.lastRun.mode,'ascent');assert.equal(reload.value.lastRun.metrics.cause,'fall');assert.equal(reload.settle({...run('factory'),mode:'ascent'}).awarded,false);
});
