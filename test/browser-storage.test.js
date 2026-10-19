import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game, WIDTH, HEIGHT, STEP, cookieWord, POWERUPS } from '../game-model.js';
import { ProfileStore, NEST_UPGRADES, CARDS, STYLES, LOOKS, unlockedLooks, nextUnlock, PROFILE_KEY } from '../progression.js';
const source = readFileSync(new URL('../game.js', import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
function storageWith(values={}) { const data=new Map(Object.entries(values)); return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; }
function browser(storage, options={}) {
    const elements=new Map(); const documentHandlers={}; let time=1000; let raf;
    const ctx=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
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
            const node=new Element(['#mute','#restart','#resume','#skip-death','#open-nest','#result-nest','#close-nest'].includes(selector)?'button':'div');
            node.id=selector.slice(1);node.hidden=['#result','#pause','#upgrade','#nest','#skip-death'].includes(selector);elements.set(selector,node);
        } return elements.get(selector);
    };
    const document={querySelector:getElement,createElement:tag=>new Element(tag),addEventListener:(name,callback)=>documentHandlers[name]=callback};
    const sandbox=vm.createContext({
        Game,WIDTH,HEIGHT,STEP,cookieWord,POWERUPS,ProfileStore,NEST_UPGRADES,CARDS,STYLES,LOOKS,unlockedLooks,nextUnlock,localStorage:storage,
        document,window:{AudioContext:options.AudioContext,addEventListener(){},devicePixelRatio:2,matchMedia:()=>({matches:options.reducedMotion||false,addEventListener(){}})},
        performance:{now:()=>time},Audio:class{play(){return Promise.resolve();}pause(){}},
        Image:class{set src(value){this.onload();}},initSprites(){},requestAnimationFrame:callback=>raf=callback,
    });
    vm.runInContext(source,sandbox);
    return {elements,document,handlers:documentHandlers,run:code=>vm.runInContext(code,sandbox),advance:ms=>time+=ms,frame:stamp=>raf(stamp)};
}

test('legacy best scores migrate and rewards settle before cinematic results',()=>{
    const storage=storageWith({best:'22',bestScore:'12'}),page=browser(storage);
    assert.equal(page.run('game.best'),22);
    page.run('jump(); game.score=24; game.collected=5; game.finish()');
    assert.equal(storage.data.get('bestScore'),'24');assert.equal(page.elements.get('#result').hidden,true);
    assert.equal(JSON.parse(storage.data.get(PROFILE_KEY)).crumbs,5);
    page.run('for(let i=0;i<73;i++)game.update()');
    assert.equal(page.elements.get('#score').textContent,'Wynik: 24 pkt');assert.equal(page.elements.get('#result').hidden,false);
    assert.equal(browser(storage).run('game.best'),24);
});
test('blocked storage still supports a complete run and session rewards',()=>{
    const page=browser({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
    page.run('jump(); game.collected=2; game.finish(); for(let i=0;i<73;i++)game.update()');
    assert.equal(page.run('profileStore.value.crumbs'),2);
});
test('mute preference survives reload and never starts a run',()=>{
    const storage=storageWith(),page=browser(storage);page.elements.get('#mute').click();
    assert.equal(page.run('game.state'),'ready');assert.equal(storage.data.get('muted'),'true');
    assert.equal(browser(storage).elements.get('#mute').attributes['aria-pressed'],'true');
});
test('crossing a sector never interrupts the run or opens a choice panel',()=>{
    const page=browser(storageWith());page.run('jump();game.elapsed=30;game.advanceStage()');
    assert.equal(page.run('game.state'),'playing');assert.equal(page.run('game.level'),2);assert.equal(page.run('Object.keys(game.cards).length'),0);
    assert.equal(page.elements.has('#upgrade'),false);assert.equal(page.elements.get('#result').hidden,true);
});
test('a skip action cannot restart the run and results enforce a new input',()=>{
    const page=browser(storageWith());page.run('jump();game.finish();for(let i=0;i<22;i++)game.update();jump()');
    assert.equal(page.run('game.state'),'over');page.run('jump()');assert.equal(page.run('game.state'),'over');
    page.advance(210);page.run('jump()');assert.equal(page.run('game.state'),'playing');
});
test('reduced motion suppresses shake, flashes and particles but keeps card information',()=>{
    const page=browser(storageWith(),{reducedMotion:true});
    page.run('jump();game.cookie.type=1;game.collectCookie()');
    assert.equal(page.run('feedback.particles.length'),0);assert.equal(page.run('feedback.flash'),0);assert.equal(page.run('feedback.shake'),0);
    assert.ok(page.run('feedback.banner.title.includes("TARCZA")'));
});
test('the fixed-step scheduler produces equal gameplay at 60 and 120 Hz',()=>{
    const run=hz=>{
        const page=browser(storageWith());
        page.run('game.fixedSeed=42;jump();game.grace=100;game.balls=[]');
        page.run('draw=()=>{}');
        for(let i=0;i<=hz;i++)page.frame(i*1000/hz);
        return page.run('({x:game.bird.x,y:game.bird.y,ticks:game.ticks})');
    };
    const a=run(60),b=run(120);
    assert.ok(Math.abs(a.ticks-b.ticks)<=1);assert.ok(Math.abs(a.x-b.x)<=6);
});

test('style can be changed before a run, with no in-flight choice screens',()=>{
    const page=browser(storageWith());page.elements.get('#open-nest').click();
    page.elements.get('#run-styles').children[1].click();
    assert.equal(page.run('profileStore.value.runStyle'),'collector');
    page.elements.get('#close-nest').click();page.run('jump();game.elapsed=30;game.advanceStage()');
    assert.equal(page.run('game.style.id'),'collector');assert.equal(page.run('Object.keys(game.cards).length'),0);assert.equal(page.run('game.state'),'playing');
});


test('unknown sound events and combo/shatter/feather events never stop a run without Web Audio',()=>{
    const page=browser(storageWith());
    page.run("jump();play('shatter');play('feather');play('combo4');play('unknown');for(let i=0;i<12;i++)game.collectCookie()");
    assert.equal(page.run('game.state'),'playing');assert.equal(page.run('game.collected'),12);
});
test('arcade audio is bounded and mute and pause stop every voice and the shield hum',()=>{
    const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
    const nodes=[];
    class AudioContext {
        state='running';currentTime=0;destination={};
        resume(){return Promise.resolve();}
        createOscillator(){const node={frequency:param(),connect(){},disconnect(){},start(){},stop(time){if(time===undefined)this.stopped=true;}};nodes.push(node);return node;}
        createGain(){return {gain:param(),connect(){},disconnect(){}};}
    }
    const page=browser(storageWith(),{AudioContext});
    page.run("jump();game.activate('invincible');syncShieldHum();for(let i=0;i<40;i++)play('shatter')");
    assert.equal(page.run('arcadeVoices.size'),16);assert.equal(page.run('Boolean(shieldHum)'),true);
    page.elements.get('#mute').click();assert.equal(page.run('arcadeVoices.size'),0);assert.equal(page.run('shieldHum'),null);
    page.elements.get('#mute').click();page.run("play('feather');syncShieldHum();setPaused(true)");
    assert.equal(page.run('arcadeVoices.size'),0);assert.equal(page.run('shieldHum'),null);
    assert.ok(nodes.every(node=>node.stopped));
});


test('victory saves before death and a continued run gets a concise victory result',()=>{
    const storage=storageWith(),page=browser(storage);
    page.run('jump();game.elapsed=240;game.updateTimeline()');
    assert.equal(page.run('game.state'),'playing');assert.equal(page.elements.get('#result').hidden,true);
    assert.equal(new ProfileStore(storage).value.wins,1);assert.equal(new ProfileStore(storage).value.runs,0);
    page.run('game.finish();for(let i=0;i<73;i++)game.update()');
    assert.equal(page.elements.get('#result-title').textContent,'Zwycięstwo!');assert.equal(new ProfileStore(storage).value.wins,1);
    page.elements.get('#open-nest').click();assert.equal(page.elements.get('#result').hidden,true);
    page.elements.get('#close-nest').click();assert.equal(page.elements.get('#result').hidden,false);
});
test('reduced motion retains sector, trait and victory information while suppressing effects',()=>{
    const page=browser(storageWith(),{reducedMotion:true});page.run("jump();game.elapsed=30;game.updateTimeline();addFeedback({type:'card',title:'Bateria',symbol:'ϟ'});game.gainEnergy(6)");
    assert.ok(page.run('feedback.banner.title.includes("Bateria")'));assert.equal(page.run('feedback.particles.length'),0);assert.equal(page.run('feedback.shake'),0);
    page.run('game.elapsed=240;game.updateTimeline()');assert.ok(page.run('feedback.banner.title.includes("UDAŁO")'));assert.equal(page.run('feedback.flash'),0);
});
