import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {FactoryGame as Game} from '../ascent-model.js';
import {GATE_Y,GATE_HEIGHT,floorName,ascentRecordKey} from '../ascent-world.js';
import { WIDTH, HEIGHT, STEP, cookieWord, POWERUPS } from '../game-model.js';
import { ProfileStore, NEST_UPGRADES, CARDS, STYLES, LOOKS, unlockedLooks, unlockedCourses, nextUnlock, PROFILE_KEY } from '../progression.js';
import {COURSES,GREED,sectorDuration} from '../courses.js';
import {OBSTACLES,obstacleAt} from '../obstacles.js';
const source = readFileSync(new URL('../game.js', import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
function storageWith(values={}) { const data=new Map(Object.entries(values)); return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; }
function browser(storage, options={}) {
    const elements=new Map(); const documentHandlers={}; let time=1000; let raf;
    const ctx=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
    ctx.arc=(x,y,radius)=>assert.ok(Number.isFinite(radius)&&radius>=0,'Canvas circle must have a finite nonnegative radius');
    class Element {
        constructor(tag='div') { this.tag=tag;this.hidden=false;this.disabled=false;this.textContent='';this.attributes={};this.handlers={};this.children=[];this.style={setProperty(){}}; }
        setAttribute(key,value){this.attributes[key]=value;}
        addEventListener(name,callback){this.handlers[name]=callback;}
        focus(){ document.activeElement=this; }
        getContext(){return ctx;}
        append(...children){this.children.push(...children);}
        replaceChildren(...children){this.children=children;}
        querySelector(){return this.children.find(child=>child.tag==='button')||null;}
        querySelectorAll(){return this.children.filter(child=>child.tag==='button'&&!child.disabled);}
        closest(selector){return this.tag==='button'&&selector.includes('button')?this:null;}
        click(){if(!this.disabled)this.handlers.click?.();}
    }
    const getElement=selector=>{
        if(!elements.has(selector)){
            const node=new Element(['#start-press','#start-vent','#return-map','#play-greed','#mute','#restart','#resume','#skip-death','#open-nest','#result-nest','#close-nest','#open-courses','#close-courses','#practice','#next-course','#new-marathon'].includes(selector)?'button':'div');
            node.id=selector.slice(1);node.hidden=['#floor-picker','#result','#pause','#upgrade','#nest','#courses','#next-course','#new-marathon','#skip-death'].includes(selector);elements.set(selector,node);
        } return elements.get(selector);
    };
    const document={querySelector:getElement,createElement:tag=>new Element(tag),addEventListener:(name,callback)=>documentHandlers[name]=callback};
    const sandbox=vm.createContext({
        Game,WIDTH,HEIGHT,STEP,cookieWord,POWERUPS,ProfileStore,NEST_UPGRADES,CARDS,STYLES,LOOKS,unlockedLooks,unlockedCourses,nextUnlock,COURSES,GREED,sectorDuration,GATE_Y,GATE_HEIGHT,floorName,ascentRecordKey,OBSTACLES,obstacleAt,localStorage:storage,
        document,window:{AudioContext:options.AudioContext,addEventListener(){},devicePixelRatio:2,matchMedia:()=>({matches:options.reducedMotion||false,addEventListener(){}})},
        performance:{now:()=>time},Audio:class{play(){return Promise.resolve();}pause(){}},
        Image:class{set src(value){this.onload();}},initSprites(){},requestAnimationFrame:callback=>raf=callback,
    });
    vm.runInContext(source,sandbox);
    return {elements,document,handlers:documentHandlers,run:code=>vm.runInContext(code,sandbox),advance:ms=>time+=ms,frame:stamp=>raf(stamp)};
}

test('legacy points and existing profile survive reload; new results report course progress',()=>{
 const storage=storageWith({best:'22',bestScore:'12'}),page=browser(storage);
 assert.equal(page.run('profileStore.value.legacyBest'),22);page.run("selectCourse('press');jump();game.score=24;game.collected=5;game.finish()");
 assert.equal(storage.data.get('bestScore'),'24');assert.equal(page.elements.get('#result').hidden,true);
 page.run('for(let i=0;i<30;i++)game.update()');assert.equal(page.elements.get('#score').textContent,'0% trasy');assert.equal(JSON.parse(storage.data.get(PROFILE_KEY)).crumbs,5);
});
test('blocked storage still permits a complete death and session rewards',()=>{
 const page=browser({getItem(){throw Error();},setItem(){throw Error();}});page.run('jump();game.collected=2;game.finish();for(let i=0;i<30;i++)game.update()');assert.equal(page.run('profileStore.value.crumbs'),2);
});
test('mute persists and unknown sounds do not stop flight',()=>{
 const storage=storageWith(),page=browser(storage);page.elements.get('#mute').click();assert.equal(page.run('game.state'),'ready');assert.equal(storage.data.get('muted'),'true');
 assert.equal(browser(storage).elements.get('#mute').attributes['aria-pressed'],'true');page.run("jump();play('unknown');play('shatter-heavy');play('warning-pendulum')");assert.equal(page.run('game.state'),'playing');
});
test('a fresh input after the death lock restarts directly while the first lock is respected',()=>{
 const page=browser(storageWith());page.run('jump();game.finish();jump()');assert.equal(page.run('game.state'),'dying');
 page.run('for(let i=0;i<8;i++)game.update();jump()');assert.equal(page.run('game.state'),'playing');assert.equal(page.elements.get('#result').hidden,true);
});
test('pre-run course selection respects unlocks and style selection persists',()=>{
 const page=browser(storageWith());page.elements.get('#open-courses').click();const choices=page.elements.get('#course-items').children;
 assert.equal(choices[1].disabled,true);assert.equal(choices[3].disabled,false);choices[3].click();assert.equal(page.run('game.course.id'),'marathon');
 page.elements.get('#open-nest').click();page.elements.get('#run-styles').children[1].click();page.elements.get('#close-nest').click();page.run('jump()');assert.equal(page.run('game.style.id'),'collector');
});
test('training result hides normal results behind nest and does not overwrite saved rewards',()=>{
 const storage=storageWith(),page=browser(storage);page.run("selectCourse('press');jump();game.finish();for(let i=0;i<30;i++)game.update()");
 page.elements.get('#open-nest').click();assert.equal(page.elements.get('#result').hidden,true);page.elements.get('#close-nest').click();assert.equal(page.elements.get('#result').hidden,false);
 const coins=page.run('profileStore.value.crumbs');page.elements.get('#practice').click();page.run('game.finish();for(let i=0;i<30;i++)game.update()');assert.equal(page.run('profileStore.value.crumbs'),coins);assert.equal(page.elements.get('#result-title').textContent,'Trening');
 page.elements.get('#restart').click();assert.equal(page.run('game.practice'),false);assert.equal(page.run('game.state'),'playing');
});
test('reduced motion retains important notices without shake or particles',()=>{
 const page=browser(storageWith(),{reducedMotion:true});page.run("jump();addFeedback({type:'card',title:'Pęknięcie',symbol:'◎'});addFeedback({type:'shatter',x:20,y:20,kind:'heavy'})");
 assert.ok(page.run('feedback.banner.title.includes("Pęknięcie")'));assert.equal(page.run('feedback.particles.length'),0);assert.equal(page.run('feedback.shake'),0);
});
test('60 and 120 Hz callbacks retain the same physical timeline',()=>{
 const run=hz=>{const p=browser(storageWith());p.run('jump();draw=()=>{}');for(let i=0;i<=hz/2;i++)p.frame(i*1000/hz);return p.run('({x:game.bird.x,y:game.bird.y,ticks:game.ticks})');};
 const a=run(60),b=run(120);assert.ok(Math.abs(a.x-b.x)<=6);assert.ok(Math.abs(a.ticks-b.ticks)<=1);
});
test('audio voices including music are bounded and pause and mute stop them',()=>{
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});const nodes=[];
 class AudioContext{state='running';currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){const n={frequency:param(),connect(){},disconnect(){},start(){},stop(t){if(t===undefined)this.stopped=true;}};nodes.push(n);return n;}createGain(){return{gain:param(),connect(){},disconnect(){}};}}
 const p=browser(storageWith(),{AudioContext});p.run("jump();game.activate('invincible');syncShieldHum();syncMusic();for(let i=0;i<40;i++)play('shatter-heavy')");assert.ok(p.run('arcadeVoices.size')<=16);
 p.elements.get('#mute').click();assert.equal(p.run('arcadeVoices.size'),0);assert.equal(p.run('shieldHum'),null);
 p.elements.get('#mute').click();p.run("play('feather');setPaused(true)");assert.equal(p.run('arcadeVoices.size'),0);assert.ok(nodes.every(n=>n.stopped));
});

test('legacy greed still has a compact score result and keeps challenge settings out of its nest',()=>{
 const storage=storageWith({bestScore:'237',[PROFILE_KEY]:JSON.stringify({version:1,selectedCourse:'press',crumbs:500})}),p=browser(storage);
 assert.equal(p.run('game.isAscent'),true);assert.equal(p.run('profileStore.value.crumbs'),500);p.run("selectCourse('greed')");
 p.elements.get('#open-nest').click();assert.equal(p.elements.get('#challenge-options').hidden,true);p.elements.get('#close-nest').click();
 p.run('jump();game.collectCookie();game.finish();for(let i=0;i<30;i++)game.update()');
 assert.equal(p.elements.get('#score').textContent,'1 pkt');assert.equal(p.elements.get('#best').textContent,'Rekord: 1 pkt');
 assert.equal(p.elements.get('#practice').hidden,true);assert.equal(p.elements.get('#earned').hidden,true);assert.equal(storage.data.get('bestScore'),'237');
 p.elements.get('#open-courses').click();p.elements.get('#course-items').children[0].click();p.elements.get('#open-nest').click();assert.equal(p.elements.get('#challenge-options').hidden,false);
 p.elements.get('#close-nest').click();p.elements.get('#play-greed').click();assert.equal(p.run('game.isAscent'),true);
});

test('factory map unlocks immediately and starts ventilation with separate record and empty energy',()=>{
 const storage=storageWith(),p=browser(storage);assert.equal(p.run('game.isAscent'),true);
 assert.equal(p.elements.get('#floor-picker').hidden,false);assert.equal(p.elements.get('#start-vent').disabled,true);
 p.run('jump();game.machine.awake=true;game.abilityRemaining=1;game.breakMachine();game.finish();for(let i=0;i<50;i++)game.update()');
 assert.equal(p.elements.get('#return-map').hidden,false);assert.deepEqual(JSON.parse(storage.data.get(PROFILE_KEY)).ascentUnlocked,[1,2]);
 p.elements.get('#return-map').click();assert.equal(p.elements.get('#start-vent').disabled,false);p.elements.get('#start-vent').click();
 assert.equal(p.run('game.startFloor'),2);p.run('jump()');assert.equal(p.run('game.energy'),0);assert.equal(p.run('game.maxHeight'),1320);
 const reloaded=browser(storage);assert.equal(reloaded.run('game.startFloor'),2);
});

test('the extended machine explosion renders valid rings for its entire lifetime',()=>{
 const p=browser(storageWith());p.run("jump();addFeedback({type:'machine-break',x:200,y:-880});drawFeedback();for(let i=0;i<60;i++){updateFeedback();drawFeedback();}");
 assert.equal(p.run('feedback.rings.length'),0);
});
