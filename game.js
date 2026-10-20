import { Game, WIDTH, HEIGHT, STEP, cookieWord, POWERUPS } from './game-model.js';
import { ProfileStore, NEST_UPGRADES, CARDS, STYLES, LOOKS, unlockedLooks, unlockedCourses, nextUnlock } from './progression.js';

import {COURSES,sectorDuration} from './courses.js';
import {OBSTACLES,obstacleAt} from './obstacles.js';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const result = document.querySelector('#result');
const pausePanel = document.querySelector('#pause');
const status = document.querySelector('#status');
const muteButton = document.querySelector('#mute');
const restartButton = document.querySelector('#restart');
const resumeButton = document.querySelector('#resume');
const announcement = document.querySelector('#announcement');
const nestPanel = document.querySelector('#nest');
const skipButton = document.querySelector('#skip-death');
const coursesPanel=document.querySelector('#courses');
const practiceButton=document.querySelector('#practice');
const nextCourseButton=document.querySelector('#next-course');
const uiValues=new Map(),birdCache=new Map(),obstacleCache=new Map();
function uiText(id,value){if(uiValues.get(id)!==value){document.querySelector(id).textContent=value;uiValues.set(id,value);}}
let storage;
try { storage = localStorage; } catch { /* Session profile remains available. */ }
const profileStore = new ProfileStore(storage);
let settlement = null;
let resultSince = -Infinity;
let lastPanelState = '';
let audioContext;
let deathTone;
const debugCollisions = window.location?.search?.includes('debug=1') || false;
const seedMatch = window.location?.search?.match(/[?&]seed=(\d+)/);
const perfEnabled = window.location?.search?.includes('perf=1');
let perfStart = 0, perfFrames = 0, perfCost = 0, perfGap = 0, perfLast = 0;
let rasterRatio = 1, backgroundCache, previousBackgroundCache, edgeCache, backgroundKey = -1;
const glowCache = new Map();
const typeface = '"Avenir Next", "Trebuchet MS", sans-serif';
const paths = {
    bird: 'ball.m4a', pop: 'pop.mp3', dead: 'bird.mp3',
    eatCookie: 'eat.mp3', boost: 'boost.mp3', gravity: 'gravity.mp3',
};
const sounds = Object.fromEntries(Object.entries(paths).map(([name, file]) => [name, new Audio(`resources/${file}`)]));

// Storage may be disabled in private or embedded browsers; the game still works.
function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* Keep the session playable. */ }
}
function storedScore(key) {
    const value = Number(read(key));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
const best = Math.max(storedScore('bestScore'), storedScore('best'));
write('bestScore', best);
profileStore.adoptLegacyBest(best);
let muted = read('muted') === 'true';
let loaded = false;
let previousTime = null;
let accumulator = 0;
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const feedback = { particles: [], labels: [], rings: [], trail: [], jump: 0, impact: null, banner: null, shake: 0, strength: 0, flash: 0, flashColor: '#fff' };

function resetFeedback() {
    feedback.particles.length = 0;
    feedback.labels.length = 0;
    feedback.jump = 0;
    feedback.impact = null;
    feedback.rings.length = 0;
    feedback.trail.length = 0;
    feedback.banner = null;
    feedback.shake = 0;
    feedback.flash = 0;
}
motionPreference?.addEventListener('change', resetFeedback);

function addFeedback(event) {
    if (event.type === 'offer') { announcement.textContent = 'Wybierz jedną z dwóch cech, przelatując przez jej symbol.'; return; }
    if (event.type === 'finalPhase') return;
    if(event.type==='points'){feedback.labels.push({x:event.x,y:event.y,points:event.points,remaining:.6});return;}
    if(event.type==='pocket'){announcement.textContent='Kieszeń podtrzymuje serię.';return;}
    if (event.type === 'ready') {announcement.textContent='Szał gotowy. Zbierz kolejne ciastko.';return;}
    if (event.type === 'near' || event.type === 'ability') {
        if (!motionPreference?.matches) {
            feedback.rings.push({x:event.x ?? game.bird.x+28,y:event.y ?? game.bird.y+29,remaining:.5,color:event.color,large:event.type==='ability'});
            if (event.type === 'ability') arcadeImpact(4,event.color);
        }
        if (event.type === 'ability') {
            announcement.textContent = `Zdolność: ${event.title}`;
            if(game.isGreed)feedback.banner={title:'SZAŁ!',color:game.style.color,remaining:.65,notice:true};
        }
        return;
    }
    if (event.type === 'victory' || event.type === 'finale') {
        feedback.banner = {title:event.type === 'victory' ? (game.practice ? 'FRAGMENT OPANOWANY' : game.course.id==='marathon' ? 'UDAŁO SIĘ! · LEĆ DALEJ' : 'TRASA UKOŃCZONA') : 'FINAŁ',color:'#ffd78f',remaining:1.2,notice:true,priority:2};
        announcement.textContent = event.type === 'victory' ? (game.practice ? 'Fragment opanowany. Trening bez nagród.' : game.course.id === 'marathon' ? 'Finał ukończony. Leć dalej po rekord.' : 'Trasa ukończona. Następna trasa odblokowana.') : 'Finał. Przetrwaj trzy sekwencje.';
        if (!motionPreference?.matches) arcadeImpact(4,'#ffd78f');
        return;
    }
    if (event.type === 'card' || event.type === 'rescue') {
        announcement.textContent = event.title ? `Wybrano: ${event.title}` : 'Ostatnie pióro uratowało lot.';
        if (event.type === 'rescue' && !motionPreference?.matches) {
            feedback.rings.push({ x: event.x, y: event.y, remaining: .5, color: '#ffd78f', large: true });
            arcadeImpact(12, '#ffd78f');
        }
        if (!feedback.banner?.priority || event.type === 'rescue') feedback.banner = { title: event.title ? `${event.symbol || ''} ${event.title}` : 'OSTATNIE PIÓRO — URATOWANY!', color: event.color || '#ffd78f', remaining: .7, notice:true };
        return;
    }
    if (event.type === 'expire') return;
    if (event.type === 'combo') {
        if (!motionPreference?.matches) arcadeImpact(3 + event.multiplier, '#ffd78f');
        return;
    }
    if (event.type === 'shatter') {
        if (motionPreference?.matches) return;
        arcadeImpact(5, event.color, .12);
        feedback.rings.push({x: event.x, y: event.y, remaining: .5, color: event.color, large: true});
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI * 2 / 10;
            feedback.particles.push({x:event.x + Math.cos(angle) * 8, y:event.y + Math.sin(angle) * 8,
                vx:Math.cos(angle) * (150 + Math.random() * 100), vy:Math.sin(angle) * 200 - 70,
                size: 7 + Math.random() * 5, angle, spin:(Math.random() - .5) * 15,
                remaining:.65 + Math.random() * .2, color:i % 2 ? (OBSTACLES[event.kind]?.color || '#ec994c') : '#e6eef7', fragment:true});
        }
        feedback.particles = feedback.particles.slice(-100);
        return;
    }
    if (event.type === 'block' || event.type === 'wave') {
        if (!motionPreference?.matches) {
            feedback.rings.push({ x: event.x, y: event.y, remaining: .5, color: event.color || '#bda4ff', large: true });
            for (let i = 0; i < 6; i++) feedback.particles.push({ x:event.x, y:event.y, vx:Math.cos(i)*110, vy:Math.sin(i)*110, size:3, angle:i, spin:3, remaining:.3, color:event.color || '#bda4ff' });
        }
        return;
    }
    if (event.type === 'stage') {
        feedback.banner = { title: `SEKTOR ${event.level}`, remaining: .8, color: '#ffd78f', notice:true };
        announcement.textContent = `Sektor ${event.level}`;
        return;
    }
    if (event.type === 'jump') {
        feedback.jump = motionPreference?.matches ? 0 : .24;
        return;
    }
    if (event.type === 'collect') {
        feedback.labels.push({ x: Math.max(30, Math.min(WIDTH - 30, event.x)), y: event.y, remaining: .75, points: event.points || 1 });
        if (event.magnetic && !motionPreference?.matches) {
            feedback.trail.push({pickup: true, x:event.x, y:event.y, targetX:event.targetX, targetY:event.targetY, remaining:.25});
        }
        if(event.golden && !motionPreference?.matches)arcadeImpact(3,'#ffd34f',.1);
        const powerup = POWERUPS[event.cookieType];
        if (powerup && !feedback.banner?.notice) {
            feedback.banner = { title: `${powerup.label.toUpperCase()} · ${powerup.duration} s`, detail: '', remaining: .75, color: powerup.color };
            if (!motionPreference?.matches) arcadeImpact(2.5, powerup.color);
        }
    }
    if (motionPreference?.matches) return;
    if (event.type === 'hit') {
        feedback.labels.length = 0;
        feedback.jump = 0;
        feedback.impact = { x: event.x, y: event.y, remaining: .3 };
        feedback.banner = null;
        arcadeImpact(14, '#ff9a86');
    }
    const colors = event.type === 'hit' ? ['#fff', '#fce5d8', '#f5bda1']
        : POWERUPS[event.cookieType] ? [POWERUPS[event.cookieType].color, '#fff', '#ffd78f']
        : ['#f7d18c', '#ce8e47', '#80512e'];
    feedback.rings.push({ x: event.x, y: event.y, remaining: .5, color: colors[0], large: Boolean(event.cookieType) || event.type === 'hit' });
    for (let i = 0; i < (event.type === 'hit' ? 20 : event.cookieType ? 16 : 8); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 65 + Math.random() * (event.cookieType ? 190 : 115);
        feedback.particles.push({
            x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40,
            size: 3 + Math.random() * 3, angle, spin: (Math.random() - .5) * 9,
            remaining: event.type === 'hit' ? 1.05 : .45 + Math.random() * .2, color: colors[i % colors.length],
            feather: event.type === 'hit' && i % 3 === 0,
        });
    }
    feedback.particles = feedback.particles.slice(-100);
}

function arcadeImpact(strength, color, duration=.22) {
    feedback.strength = Math.min(16, Math.max(feedback.strength * feedback.shake / (feedback.shakeMax || .22), strength));
    feedback.shake = duration;
    feedback.shakeMax=duration;
    feedback.flash = .16;
    feedback.flashColor = color;
}

function updateFeedback() {
    feedback.jump = Math.max(0, feedback.jump - STEP);
    feedback.shake = Math.max(0, feedback.shake - STEP);
    feedback.flash = Math.max(0, feedback.flash - STEP);
    if (feedback.banner) {
        feedback.banner.remaining -= STEP;
        if (feedback.banner.remaining <= 0) feedback.banner = null;
    }
    if (!motionPreference?.matches && ((game.state === 'playing' && (game.shielded || game.effects.double > 0 || game.abilityRemaining > 0 || (game.isGreed && game.multiplier>=2))) || game.state === 'dying') && game.ticks % 4 === 0) {
        feedback.trail.push({ x: game.bird.x, y: game.bird.y, frame: game.bird.frame, remaining: game.isGreed ? .12+.03*game.multiplier : .12 });
    }
    for (const trail of feedback.trail) trail.remaining -= STEP;
    feedback.trail = feedback.trail.filter(trail => trail.remaining > 0);
    for (const ring of feedback.rings) ring.remaining -= STEP;
    feedback.rings = feedback.rings.filter(ring => ring.remaining > 0);
    if (feedback.impact) {
        feedback.impact.remaining -= STEP;
        if (feedback.impact.remaining <= 0) feedback.impact = null;
    }
    for (const particle of feedback.particles) {
        particle.remaining -= STEP;
        particle.x += particle.vx * STEP;
        particle.y += particle.vy * STEP;
        particle.vy += 260 * STEP;
        particle.angle += particle.spin * STEP;
    }
    feedback.particles = feedback.particles.filter(particle => particle.remaining > 0);
    for (const label of feedback.labels) label.remaining -= STEP;
    feedback.labels = feedback.labels.filter(label => label.remaining > 0).slice(-10);
    feedback.rings = feedback.rings.slice(-12);
}

function syncMute() {
    for (const sound of Object.values(sounds)) sound.muted = muted;
    muteButton.textContent = muted ? 'Włącz dźwięk' : 'Wycisz';
    muteButton.setAttribute('aria-pressed', String(muted));
    if (muted) stopArcade();
    if (muted && deathTone) { try { deathTone.stop(); } catch {} deathTone = null; }
}
function play(name) {
    if (muted) return;
    const sound = sounds[name];
    if (!sound) { try { playArcade(name); } catch { /* Unsupported audio must not stop flight. */ } return; }
    if (name === 'dead') {
        stopArcade();
        for (const [key, other] of Object.entries(sounds)) if (key !== 'dead') other.pause();
        sound.preservesPitch = false;
        sound.playbackRate = .45;
        if (audioContext?.state === 'running') {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const now = audioContext.currentTime;
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(190, now);
            oscillator.frequency.exponentialRampToValueAtTime(45, now + .7);
            gain.gain.setValueAtTime(.035, now);
            gain.gain.exponentialRampToValueAtTime(.0001, now + .75);
            oscillator.connect(gain); gain.connect(audioContext.destination);
            deathTone = oscillator;
            oscillator.start(); oscillator.stop(now + .8);
        }
    }
    sound.currentTime = 0;
    const playback = sound.play();
    if (playback) playback.catch(() => {});
}
// Short, bounded synthesized voices: no downloads or per-frame audio allocation.
const arcadeVoices = new Set();
const musicVoices=new Set();let nextMusicBeat=null,lastMusicScale=1;
let shieldHum = null;
function tone(frequency, endFrequency, duration, volume = .06, type = 'triangle', delay = 0) {
    if (muted || audioContext?.state !== 'running') return;
    if (arcadeVoices.size >= 16) { const oldest = arcadeVoices.values().next().value; oldest.stop(); }
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    const now = audioContext.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    const voice = { stop() { try { oscillator.stop(); } catch {} arcadeVoices.delete(voice); musicVoices.delete(voice); oscillator.disconnect(); gain.disconnect(); } };
    oscillator.onended = () => voice.stop(); arcadeVoices.add(voice);
    oscillator.start(now); oscillator.stop(now + duration + .02);
    return voice;
}
function playArcade(name) {
    if (name.startsWith('shatter')) {
        const base=name.endsWith('ricochet')?380:name.endsWith('pendulum')?620:150;
        tone(base, name.endsWith('heavy')?42:base/2, .20, .08, 'triangle');
        tone(1100, 110, .10, .025, 'sawtooth');
        tone(1800, 350, .07, .018, 'square', .025);
    } else if (name.startsWith('warning-')) {
        const note={heavy:180,ricochet:440,pendulum:660}[name.slice(8)];if(note)tone(note,note,.12,.018,'sine');
    } else if (name === 'golden') {
        tone(880,1320,.12,.04,'triangle');tone(1760,1760,.16,.025,'sine',.07);
    } else if (name === 'frenzy-ready') {
        tone(660,880,.1,.025,'sine');tone(1320,1320,.15,.025,'sine',.1);
    } else if (name === 'frenzy') {
        [220,440,660,880].forEach((n,i)=>tone(n,n*1.1,.22,.04,'triangle',i*.045));
    } else if (name === 'frenzy-ending') {
        tone(660,440,.12,.035,'square');tone(440,330,.12,.03,'triangle',.17);
    } else if (name === 'frenzy-end') {
        tone(330,110,.25,.035,'triangle');
    } else if (name === 'feather') {
        tone(220, 880, .45, .07);
        for (let i = 0; i < 3; i++) tone(660 * 2 ** (i / 3), 880 * 2 ** (i / 3), .24, .035, 'sine', i * .09);
    } else if (['stage','offer','trait','near','ability','finale','victory'].includes(name)) {
        const notes = {stage:[330,440], offer:[660,880], trait:[440,660,880], near:[1100], ability:[220,440,660], finale:[220,261,330], victory:[523,659,784,1046]}[name];
        notes.forEach((note,i)=>tone(note,note,name==='near' ? .07 : .23,name==='near' ? .018 : .035,'sine',i*.085));
    } else if (name === 'wave') tone(100, 30, .4, .07, 'sine');
    else if (name.startsWith('combo')) {
        const rank = Number(name.slice(5)) || 2;
        for (let i = 0; i < 3; i++) tone(220 * rank * 2 ** (i / 4), 220 * rank * 2 ** (i / 4), .16, .035, 'triangle', i * .065);
    }
}
function syncMusic(){
    if(muted||game.paused||game.state!=='playing'||audioContext?.state!=='running'){nextMusicBeat=null;return;}
    const scale=game.slowed ? .5 : 1;
    if(scale!==lastMusicScale){for(const voice of [...musicVoices])voice.stop();nextMusicBeat=null;lastMusicScale=scale;}
    nextMusicBeat??=Math.ceil(game.courseTime*2);
    while(nextMusicBeat/2<=game.courseTime+.12*scale){
        const beat=nextMusicBeat++,delay=Math.max(0,(beat/2-game.courseTime)/scale);
        const note=(frequency,end,duration,volume,type)=>{const voice=tone(frequency,end,duration,volume,type,delay);if(voice)musicVoices.add(voice);};
        if(beat%2===0)note(75,35,.12,.018,'sine');
        if(beat%4===0){const bass=[110,110,146.83,130.81][Math.floor(beat/8)%4];note(bass,bass,.3,.012,'triangle');}
        if(beat%2===1)note(2400,500,.035,.004,'sine');
        if(game.isGreed && game.multiplier>=2 && beat%2===1)note(330*game.multiplier,330*game.multiplier,.08,.008,'triangle');
        if(game.isGreed && game.abilityRemaining>0)note(880,440,.06,.012,'triangle');
    }
}
function syncShieldHum() {
    const active = !muted && !game.paused && game.state === 'playing' && game.shielded && audioContext?.state === 'running';
    if (!active && shieldHum) { shieldHum.stop(); shieldHum = null; }
    if (active && !shieldHum) {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = 82;
        gain.gain.value = .009; oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start();
        shieldHum = { stop() { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); } };
    }
}
function stopArcade() {
    nextMusicBeat=null;
    for (const voice of [...arcadeVoices]) voice.stop();
    if (shieldHum) { shieldHum.stop(); shieldHum = null; }
}
function stopSounds() {
    stopArcade();
    for (const sound of Object.values(sounds)) sound.pause();
    if (deathTone) { try { deathTone.stop(); } catch {} deathTone = null; }
}
const game = new Game({
    best,
    seed: seedMatch ? Number(seedMatch[1]) >>> 0 : undefined,
    profile: profileStore.value,
    onSound: play,
    onFeedback: addFeedback,
    onVictory(id,mode) { profileStore.recordVictory(id,mode); },
    onSettle(snapshot) {
        settlement = profileStore.settle(snapshot);
        if(!game.isGreed)write('bestScore', game.best);
    },
    onFinish(score, record) {
        resultSince = performance.now();
        if(!game.isGreed)write('bestScore', record);
        const recordNow=currentRecord();
        const marathon=game.course.id==='marathon',pointsMode=game.isGreed||marathon;
        document.querySelector('#result-title').textContent=game.practice ? (game.won?'Fragment opanowany':'Trening') : game.won?'Trasa ukończona!':'Jeszcze jedna próba?';
        const progress=runProgress();
        document.querySelector('#score').textContent=game.practice ? `${Math.floor(progress*100+1e-5)}% fragmentu` : pointsMode ? `${score} pkt` : `${Math.floor(progress*100+1e-5)}% trasy`;
        document.querySelector('#best').textContent=game.practice ? 'Trening bez nagród' : pointsMode ? `Rekord: ${game.isGreed?recordNow.score:Math.max(recordNow.score,profileStore.value.legacyBest)} pkt` : `Rekord: ${Math.floor(recordNow.progress*100+1e-5)}%`;
        document.querySelector('#run-detail').textContent=game.course.name;
        document.querySelector('#earned').textContent=game.practice?'':`+${settlement?.crumbs||0} okruchów`;
        practiceButton.disabled=!game.checkpoint;practiceButton.hidden=game.isGreed||game.won&&!game.practice;
        document.querySelector('#run-detail').hidden=game.isGreed;document.querySelector('#earned').hidden=game.isGreed;
        practiceButton.textContent=game.practice?'Powtórz fragment':'Trening fragmentu';
        restartButton.textContent=game.practice?'Normalna próba':'Jeszcze raz';
        const next=COURSES[COURSES.findIndex(course=>course.id===game.course.id)+1];
        nextCourseButton.hidden=game.practice||!game.won||marathon||!next||!unlockedCourses(profileStore.value).includes(next.id);
        restartButton.setAttribute('class',nextCourseButton.hidden?'':'secondary');
        for(const id of ['#next-goal','#highlight','#unlock-progress','#result-nest'])document.querySelector(id).hidden=true;
        announcement.textContent=game.isGreed?`Koniec rundy. Wynik ${score}. Rekord ${recordNow.score}.`:`${game.practice?'Trening.':game.won?'Zwycięstwo.':'Koniec rundy.'} Postęp ${Math.floor(progress*100)} procent.`;
        syncPanels();
        restartButton.focus({ preventScroll: true });
    },
});

function syncPanels(){
    const panelKey=`${game.state}:${game.paused}:${game.deathElapsed>=.12}`;
    if(lastPanelState===panelKey)return;lastPanelState=panelKey;
    skipButton.hidden=!['dying','celebrating'].includes(game.state)||game.paused||game.deathElapsed<.12;
    skipButton.disabled=game.deathElapsed<.12;
    document.querySelector('#open-nest').disabled=!['ready','over'].includes(game.state);
    document.querySelector('#open-courses').disabled=!['ready','over'].includes(game.state);
    document.querySelector('#play-greed').disabled=!['ready','over'].includes(game.state);
    document.querySelector('#play-greed').setAttribute('aria-pressed',String(game.isGreed));
    document.querySelector('#hud').setAttribute('data-mode',game.course.id);
    document.querySelector('#hud-charges').hidden=!game.isGreed;
    if(!game.isGreed)document.querySelector('#hud').setAttribute('data-frenzy','');
    result.hidden=game.state!=='over'||!nestPanel.hidden||!coursesPanel.hidden;pausePanel.hidden=!game.paused;
    const hudVisible=['playing','dying','celebrating'].includes(game.state);document.querySelector('#hud').style.setProperty('visibility',hudVisible?'visible':'hidden');document.querySelector('#hud').setAttribute('aria-hidden',String(!hudVisible));
}
function clearRunView(){
    settlement=null;backgroundCache=null;previousBackgroundCache=null;backgroundKey=-1;
    stopSounds();accumulator=0;previousTime=null;announcement.textContent='';resetFeedback();uiValues.clear();
}
function jump(){
    if(!loaded||game.paused||!nestPanel.hidden||!coursesPanel.hidden)return;
    if(['dying','celebrating'].includes(game.state)&&game.deathElapsed<.12)return;
    try{const AudioContext=window.AudioContext||window.webkitAudioContext;if(AudioContext&&!audioContext)audioContext=new AudioContext();audioContext?.resume()?.catch(()=>{});}catch{}
    if(game.state!=='playing'){
        if(game.state!=='ready'&&!game.practice)profileStore.recordRetry(game.state==='over'?(performance.now()-resultSince)/1000:game.deathElapsed);
        if(!game.practice)game.profile=profileStore.reload();clearRunView();
    }
    game.press();syncPanels();
}
function setPaused(paused) {
    if (!loaded || !['playing', 'dying','celebrating'].includes(game.state)) return;
    game.paused = paused;
    accumulator = 0;
    previousTime = null;
    if (paused) stopSounds();
    syncPanels();
    if (paused) resumeButton.focus({ preventScroll: true });
    else canvas.focus({ preventScroll: true });
}

muteButton.addEventListener('click', () => {
    muted = !muted;
    syncMute();
    write('muted', muted);
});
restartButton.addEventListener('click', () => {
    if(game.practice){game.leavePractice();game.profile=profileStore.reload();}
    jump();
    canvas.focus({ preventScroll: true });
});
resumeButton.addEventListener('click', () => setPaused(false));
skipButton.addEventListener('click',jump);
practiceButton.addEventListener('click',()=>{clearRunView();game.startPractice();lastPanelState='';syncPanels();canvas.focus();});
nextCourseButton.addEventListener('click',()=>{const next=COURSES[COURSES.findIndex(course=>course.id===game.course.id)+1];if(next)selectCourse(next.id);});
document.querySelector('#play-greed').addEventListener('click',()=>selectCourse('greed'));
 document.querySelector('#open-courses').addEventListener('click',openCourses);
document.querySelector('#close-courses').addEventListener('click',closeCourses);
document.querySelector('#new-marathon').addEventListener('click',()=>{game.fixedSeed=undefined;game.retrySeed=undefined;selectCourse('marathon');});
document.querySelector('#open-nest').addEventListener('click', openNest);
document.querySelector('#result-nest').addEventListener('click', openNest);
document.querySelector('#close-nest').addEventListener('click', () => {
    nestPanel.hidden = true;
    lastPanelState = ''; syncPanels();
    if (game.state === 'over') restartButton.focus(); else canvas.focus();
});
canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    jump();
});
document.addEventListener('keydown', event => {
    const activePanel = !coursesPanel.hidden ? coursesPanel : !nestPanel.hidden ? nestPanel : game.paused ? pausePanel : game.state === 'over' ? result : null;
    if (event.code === 'Tab' && activePanel) {
        const buttons = [...activePanel.querySelectorAll('button:not([disabled]), summary')].filter(button=>!button.hidden&&!button.closest('[hidden]'));
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
    }
    if(event.code==='Escape'&&!coursesPanel.hidden){closeCourses();return;}
    if (event.code === 'Escape' && !nestPanel.hidden) { document.querySelector('#close-nest').click(); return; }
    if (event.code === 'Escape' && loaded && ['playing', 'dying','celebrating'].includes(game.state)) {
        event.preventDefault();
        if (!event.repeat) setPaused(!game.paused);
    }
    if (event.code !== 'Space') return;
    const button = event.target.closest('button');
    if (button && !['restart', 'resume', 'skip-death'].includes(button.id)) return;
    if (event.target.closest('input, textarea, select, a, summary')) return;
    event.preventDefault();
    if (event.repeat) return;
    if (game.paused) setPaused(false);
    else jump();
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
});

function selectCourse(id){
    if(!profileStore.setCourse(id))return;
    game.practice=false;game.practiceOrigin=null;game.profile=profileStore.value;game.modeOverride=undefined;game.retrySeed=undefined;game.reset();
    clearRunView();coursesPanel.hidden=true;nestPanel.hidden=true;lastPanelState='';syncPanels();canvas.focus();
}
function closeCourses(){coursesPanel.hidden=true;lastPanelState='';syncPanels();if(game.state==='over')restartButton.focus();else canvas.focus();}
function openCourses(){
    if(!['ready','over'].includes(game.state))return;profileStore.reload();nestPanel.hidden=true;result.hidden=true;
    const list=document.querySelector('#course-items');list.replaceChildren();
    for(const course of COURSES){
        const b=document.createElement('button');b.type='button';b.className='choice';b.disabled=!unlockedCourses(profileStore.value).includes(course.id);
        const title=document.createElement('strong');title.textContent=`${course.name} · ${course.duration}s`;
        const detail=document.createElement('span'),record=profileStore.value.records[`${course.id}:${profileStore.value.runStyle}`];
        detail.textContent=b.disabled?`Ukończ ${course.id==='ricochet'?'Tłocznię':'Rykoszet'}`:course.id==='marathon'?`Finał i dalszy lot · rekord ${Math.max(record.score,profileStore.value.legacyBest)} pkt`:`Rekord ${Math.floor(record.progress*100)}%`;
        b.setAttribute('aria-pressed',String(game.course.id===course.id));b.append(title,detail);b.addEventListener('click',()=>selectCourse(course.id));list.append(b);
    }
    document.querySelector('#new-marathon').hidden=game.course.id!=='marathon';coursesPanel.hidden=false;document.querySelector('#close-courses').focus();
}
function openNest() {
    if (!['ready', 'over'].includes(game.state)) return;
    coursesPanel.hidden=true;profileStore.reload();
    result.hidden = true;
    for(const id of ['#challenge-options','#challenge-upgrades','#challenge-guide'])document.querySelector(id).hidden=game.isGreed;
    document.querySelector('#nest-intro').textContent=game.isGreed?'Łasuch: równy start. Ulepszenia i pióro działają w Wyzwaniach.':'Ulepszenia na kolejne próby. Każde ma dwa poziomy.';
    document.querySelector('#crumb-balance').textContent = `${profileStore.value.crumbs} okruchów`;
    const styles = document.querySelector('#run-styles'); styles.replaceChildren();
    for (const style of STYLES) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = style.name; button.title = style.description;
        button.setAttribute('aria-pressed', String(profileStore.value.runStyle === style.id));
        button.addEventListener('click', () => { profileStore.setStyle(style.id); openNest(); }); styles.append(button);
    }
    document.querySelector('#style-description').textContent = STYLES.find(style=>style.id===profileStore.value.runStyle).description;
    const looks = document.querySelector('#bird-looks'); looks.replaceChildren();
    for (const look of LOOKS) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = look.name;
        const owned=unlockedLooks(profileStore.value).includes(look.id);
        if(look.cost&&!owned)button.textContent+=` · ${look.cost}`;
        button.disabled=!owned&&(!look.cost||!profileStore.value.courseClears.includes(look.course)||profileStore.value.crumbs<look.cost);
        button.title = look.cost ? `Ukończ ${COURSES.find(course=>course.id===look.course).name} · ${look.cost} okruchów` : look.id === 'gold' ? 'Pierwsze zwycięstwo' : look.id === 'mint' ? 'Seria 20 ciastek' : 'Podstawowy wygląd';
        button.setAttribute('aria-pressed', String(profileStore.value.look===look.id));
        button.addEventListener('click',()=>{if(!owned)profileStore.purchaseLook(look.id);profileStore.setLook(look.id);birdCache.clear();openNest();});looks.append(button);
    }
    const guide = document.querySelector('#trait-guide'); guide.replaceChildren();
    for (const card of CARDS) {
        const line = document.createElement('p');
        const locked = card.unlock && profileStore.value.lifetimeBonuses < 10;
        line.textContent = `${card.symbol} ${card.name}${locked ? ' · 10 bonusów do odkrycia' : ''} — ${card.description}`;guide.append(line);
    }
    const build = profileStore.value.lastBuild.map(item=>`${CARDS.find(card=>card.id===item.id)?.name} ${item.rank}`).join(' · ');
    document.querySelector('#last-build').textContent = build ? `Ostatni zestaw: ${build}` : 'Zestaw: wybierz symbole torem lotu. Maksymalnie 3 cechy, każda do poziomu 2.';
    const last = profileStore.value.lastRun;
    document.querySelector('#last-build').hidden=last?.mode==='greed';
    document.querySelector('#last-metrics').textContent = last?.mode==='greed' ? `${Math.floor(last.elapsed)} s lotu · złote ciastka: ${last.metrics.goldenCookies} · Szały: ${last.metrics.abilities} · rozbicia: ${last.metrics.shatters} · pierwszy Szał: ${last.metrics.firstFrenzyAt?last.metrics.firstFrenzyAt.toFixed(1)+' s':'—'} · rewanż: ${last.metrics.retrySeconds.toFixed(1)} s` : last ? `${Math.floor(last.elapsed)} s lotu · ${last.metrics.nearMisses} uników · ${last.metrics.abilities} zdolności · ${Math.round(last.metrics.shieldSeconds)} s ochrony · ${Math.round(last.metrics.twoPowerSeconds)} s z dwiema mocami · ${last.metrics.rescues} ratunków · cechy ${last.metrics.offersTaken}/${last.metrics.offersSeen} · pierwsza cecha ${last.metrics.firstTraitAt?Math.round(last.metrics.firstTraitAt)+'s':'—'} · rewanż ${last.metrics.retrySeconds.toFixed(1)}s · koniec: ${{ball:'piłka',floor:'dolne kolce',ceiling:'górne kolce',complete:'ukończenie'}[last.metrics.cause]}` : 'Rozegraj pierwszą rundę.';
    const list = document.querySelector('#nest-items'); list.replaceChildren();
    for (const item of NEST_UPGRADES) {
        const rank = profileStore.value.upgrades[item.id];
        const button = document.createElement('button'); button.type = 'button'; button.className = 'choice';
        const title = document.createElement('strong'); title.textContent = `${item.name} · ${rank}/2`;
        const description = document.createElement('span'); description.textContent = item.description;
        const price = document.createElement('small'); price.textContent = rank === 2 ? 'Ulepszenie maksymalne' : `${item.costs[rank]} okruchów`;
        button.disabled = rank === 2 || profileStore.value.crumbs < item.costs[rank];
        button.append(title, description, price);
        button.addEventListener('click', () => {
            if (profileStore.purchase(item.id)) { announcement.textContent = `Kupiono: ${item.name}`; openNest(); }
        });
        list.append(button);
    }
    const unlock = nextUnlock(profileStore.value);
    document.querySelector('#nest-unlocks').textContent = unlock ? `Nowa cecha: ${unlock.name} — ${unlock.current}/${unlock.target} ${unlock.unit}` : `Wygrane: ${profileStore.value.wins} · najlepsza seria: ${profileStore.value.bestChain}`;
    nestPanel.hidden = false; document.querySelector('#close-nest').focus({ preventScroll: true });
}

function resize() {
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    rasterRatio = ratio; backgroundCache = null; previousBackgroundCache = null; edgeCache = null; glowCache.clear();birdCache.clear();obstacleCache.clear();
    canvas.width = Math.round(WIDTH * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
}
window.addEventListener('resize', resize);

function text(value, x, y, size = 26, color = '#f7f1df', weight = 600) {
    ctx.font = `${weight} ${size}px ${typeface}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, WIDTH - 32);
}
function rotatedSprite(sprite, x, y, rotation, stretch = 0) {
    ctx.save();
    ctx.translate(x + sprite.width / 2, y + sprite.height / 2);
    ctx.rotate(rotation);
    ctx.scale(1 - stretch, 1 + stretch);
    sprite.draw(ctx, -sprite.width / 2, -sprite.height / 2);
    ctx.restore();
}
function drawFeedback() {
    ctx.save();
    for (const ring of feedback.rings) {
        const progress = 1 - ring.remaining / .5;
        ctx.globalAlpha = (1 - progress) * .65;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, 12 + progress * (ring.large ? 85 : 35), 0, Math.PI * 2);
        ctx.stroke();
    }
    for (const particle of feedback.particles) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, particle.remaining / .2);
        ctx.fillStyle = particle.color;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.angle);
        if (particle.fragment) {
            ctx.beginPath(); ctx.moveTo(-particle.size, -particle.size * .6);
            ctx.lineTo(particle.size, -particle.size * .25); ctx.lineTo(particle.size * .4, particle.size);
            ctx.lineTo(-particle.size * .7, particle.size * .6); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#513522'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-particle.size, 0); ctx.lineTo(particle.size, particle.size * .3); ctx.stroke();
        } else if (particle.feather) {
            ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -7, 9, 0); ctx.quadraticCurveTo(0, 5, -9, 0); ctx.fill();
            ctx.strokeStyle = '#8b9cb4'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(7, 0); ctx.stroke();
        } else if (particle.size > 4.5) {
            ctx.beginPath();
            ctx.moveTo(0, -particle.size * 1.4);
            ctx.lineTo(particle.size / 3, -particle.size / 3);
            ctx.lineTo(particle.size * 1.4, 0);
            ctx.lineTo(particle.size / 3, particle.size / 3);
            ctx.lineTo(0, particle.size * 1.4);
            ctx.lineTo(-particle.size / 3, particle.size / 3);
            ctx.lineTo(-particle.size * 1.4, 0);
            ctx.lineTo(-particle.size / 3, -particle.size / 3);
            ctx.closePath();
            ctx.fill();
        } else ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        ctx.restore();
    }
    for (const label of feedback.labels) {
        const progress = 1 - label.remaining / .75;
        ctx.globalAlpha = Math.min(1, label.remaining / .2);
        ctx.font = `800 28px ${typeface}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#14213b';
        ctx.fillStyle = '#fff';
        const y = label.y - 22 - (motionPreference?.matches ? 0 : progress * 36);
        ctx.strokeText(label.text || `+${label.points}`, label.x, y);
        ctx.fillText(label.text || `+${label.points}`, label.x, y);
    }
    if (feedback.impact) {
        const impact = feedback.impact;
        const progress = 1 - impact.remaining / .3;
        ctx.globalAlpha = (1 - progress) * .8;
        ctx.strokeStyle = '#fff3df';
        ctx.lineWidth = 4 * (1 - progress) + 1;
        ctx.beginPath();
        ctx.arc(impact.x, impact.y, 24 + progress * 48, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}
function layer(width, height) {
    const image = document.createElement('canvas');
    image.width = Math.round(width * rasterRatio); image.height = Math.round(height * rasterRatio);
    const context = image.getContext('2d');
    context.setTransform(rasterRatio, 0, 0, rasterRatio, 0, 0);
    return { image, context };
}
function drawBackground() {
    if (!backgroundCache || backgroundKey !== game.stageIndex) {
        previousBackgroundCache = backgroundCache;
        backgroundCache = layer(WIDTH, HEIGHT); backgroundKey = game.stageIndex;
        paintBackground(backgroundCache.context, game.stageIndex);
    }
    const progress = Math.min(1, Math.max(0, (game.courseTime - game.stageIndex * sectorDuration(game.course)) / 1.2));
    if (previousBackgroundCache && progress < 1 && !motionPreference?.matches) {
        ctx.drawImage(previousBackgroundCache.image, 0, 0, WIDTH, HEIGHT);
        ctx.save(); ctx.globalAlpha = progress; ctx.drawImage(backgroundCache.image,0,0,WIDTH,HEIGHT);ctx.restore();
    } else { ctx.drawImage(backgroundCache.image, 0, 0, WIDTH, HEIGHT); previousBackgroundCache = null; }
}
function paintBackground(h, sector) {
    sector+=game.course.id==='press'?0:game.course.id==='ricochet'?1:game.course.id==='mechanism'?2:0;
    const gradient = h.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, ['#1e3555', '#26375e', '#343053', '#3b2e4a', '#403444'][Math.min(4, sector)]);
    gradient.addColorStop(.5, '#172640');
    gradient.addColorStop(1, '#101b32');
    h.fillStyle = gradient;
    h.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = h.createRadialGradient(300, 210, 0, 300, 210, 300);
    glow.addColorStop(0, '#7497bd16');
    glow.addColorStop(1, '#7497bd00');
    h.fillStyle = glow;
    h.fillRect(0, 0, WIDTH, HEIGHT);
    h.strokeStyle = ['#78a6cb12', '#8fa4e918', '#c69be718', '#f4b87c18'][sector % 4];
    h.lineWidth = 2;
    const theme = sector % 4;
    for (let i = 0; i < 7; i++) {
        h.beginPath();
        if (theme === 0) { h.arc(200, 320, 70 + i * 45, 0, Math.PI * 2); }
        else if (theme === 1) { h.moveTo(i * 90 - 200, 0); h.lineTo(i * 90 + 200, HEIGHT); }
        else if (theme === 2) { h.moveTo(0, 90 * i); h.lineTo(200, 90 * i - 90); h.lineTo(400, 90 * i); }
        else { h.roundRect(35 + i * 17, 120 + i * 17, 330 - i * 34, 400 - i * 34, 30); }
        h.stroke();
    }

}

function drawEdges() {
    if (!edgeCache) {
        edgeCache = layer(WIDTH, 32);
        const h = edgeCache.context;
        h.fillStyle = '#0c1628'; h.fillRect(0, 0, WIDTH, 9);
        for (let x = 0; x < WIDTH; x += 25) {
            const metal = h.createLinearGradient(x, 8, x + 25, 24);
            metal.addColorStop(0, '#617b98'); metal.addColorStop(.45, '#3d5572'); metal.addColorStop(1, '#1d304c');
            h.fillStyle = metal; h.beginPath(); h.moveTo(x, 8); h.lineTo(x + 10, 27);
            h.quadraticCurveTo(x + 12.5, 31, x + 15, 27); h.lineTo(x + 25, 8); h.closePath(); h.fill();
            h.strokeStyle = '#ebbb7066'; h.lineWidth = 1.5;
            h.beginPath(); h.moveTo(x + 9, 22); h.lineTo(x + 12.5, 28); h.lineTo(x + 16, 22); h.stroke();
        }
        h.fillStyle = '#839bb42e'; h.fillRect(0, 8, WIDTH, 1);
    }
    ctx.drawImage(edgeCache.image, 0, 0, WIDTH, 32);
    ctx.save(); ctx.translate(0, HEIGHT); ctx.scale(1, -1); ctx.drawImage(edgeCache.image, 0, 0, WIDTH, 32); ctx.restore();
}

function drawGlow(x, y, color, size = 80) {
    if (!glowCache.has(color)) {
        const cache = layer(96, 96); const h = cache.context;
        const glow = h.createRadialGradient(48, 48, 12, 48, 48, 47);
        glow.addColorStop(0, color + '55'); glow.addColorStop(.5, color + '22'); glow.addColorStop(1, color + '00');
        h.fillStyle = glow; h.fillRect(0, 0, 96, 96); glowCache.set(color, cache.image);
    }
    ctx.drawImage(glowCache.get(color), x - size / 2, y - size / 2, size, size);
}

function currentRecord(){return profileStore.value.records[game.isGreed?'greed':`${game.course.id}:${game.profile.runStyle}`];}
function runProgress(){return game.practice?Math.max(0,Math.min(1,(game.courseTime-(game.practiceEnd-sectorDuration(game.course)))/sectorDuration(game.course))):game.progress;}
function drawHud(){
    const progress=runProgress();
    document.querySelector('#hud-best').hidden=false;document.querySelector('.progress-track').setAttribute('aria-label','Postęp trasy');
    const record=currentRecord();
    if(game.isGreed){drawGreedHud();return;}
    uiText('#hud-score',String(game.score));uiText('#hud-course',`${game.practice?'Trening · ':''}${game.course.name} · ${game.level}`);uiText('#hud-percent',`${Math.floor(progress*100+1e-5)}%`);
    document.querySelector('#hud-progress').style.setProperty('transform',`scaleX(${progress})`);
    document.querySelector('#hud-best').style.setProperty('--best',`${(game.practice?0:record.progress)*100}%`);
    const active=game.abilityRemaining>0,cooling=game.abilityCooldown>0;
    const fraction=active?game.abilityRemaining/game.abilityMax:cooling?game.abilityCooldown/8:game.energy/game.energyNeeded;
    uiText('#hud-energy-label',active?`${game.style.symbol} ${Math.ceil(game.abilityRemaining)}s`:cooling?`◷ ${Math.ceil(game.abilityCooldown)}s`:game.abilityReady?'Zbierz ciastko':`${game.style.symbol} ${game.energy}/${game.energyNeeded}`);
    document.querySelector('#hud-energy-label').style.setProperty('--tone',cooling?'#718aaa':game.style.color);
    const energy=document.querySelector('#hud-energy');energy.style.setProperty('transform',`scaleX(${fraction})`);energy.style.setProperty('--tone',cooling?'#718aaa':game.style.color);
    uiText('#hud-combo',game.chain>=3?`×${game.multiplier}`:'');
    const traitKey=JSON.stringify(game.cards)+game.pocketReady;
    if(uiValues.get('traits')!==traitKey){
        const list=document.querySelector('#hud-traits');list.replaceChildren();
        for(const [id,rank] of Object.entries(game.cards)){const card=CARDS.find(card=>card.id===id),span=document.createElement('span');span.textContent=`${card.symbol}${rank===2?'••':'•'}`;span.title=`${card.name} ${rank}/2${id==='pocket'?game.pocketReady?' · gotowa':' · odnawianie':''}`;span.style.setProperty('--tone',card.color);list.append(span);}
        uiValues.set('traits',traitKey);
    }
    const feather=document.querySelector('#hud-feather');feather.hidden=!game.hasFeather;feather.setAttribute('data-used',String(game.featherUsed));feather.setAttribute('aria-label',game.featherUsed?'Pióro zużyte':'Ostatnie pióro dostępne');
    const powerKey=Object.values(game.effects).map(Math.ceil).join(':');
    if(uiValues.get('powers')!==powerKey){const powers=document.querySelector('#hud-powers');powers.replaceChildren();for(const p of Object.values(POWERUPS)){const remaining=game.effects[p.effect];if(remaining>0){const span=document.createElement('span');span.textContent=`${p.symbol}${Math.ceil(remaining)}s`;span.title=p.label;span.style.setProperty('--tone',remaining<=2?'#ffd18a':p.color);powers.append(span);}}uiValues.set('powers',powerKey);}
}

function drawGreedHud(){
    uiText('#hud-score',String(game.score));uiText('#hud-course','Łasuch');uiText('#hud-percent','');
    const series=document.querySelector('.progress-track');series.setAttribute('aria-label','Pozostały czas serii');
    document.querySelector('#hud-progress').style.setProperty('transform',`scaleX(${game.chainTime/4})`);
    document.querySelector('#hud-best').hidden=true;
    uiText('#hud-combo',`×${game.multiplier}`);
    const active=game.abilityRemaining>0,cooling=game.abilityCooldown>0;
    const state=active?'active':cooling?'cooling':game.abilityReady?'ready':'charging';
    const hud=document.querySelector('#hud');hud.setAttribute('data-frenzy',state);
    uiText('#hud-energy-label',active?`SZAŁ · ${Math.ceil(game.abilityRemaining)}s`:cooling?`↻ ${Math.ceil(game.abilityCooldown)}s`:game.abilityReady?'✦ Zbierz ciastko':'SZAŁ');
    const key=`${state}:${game.energy}`;
    if(uiValues.get('charges')!==key){
        const charges=document.querySelector('#hud-charges');
        charges.setAttribute('aria-label',active?'Szał aktywny':cooling?'Przerwa przed ładowaniem':`${game.energy} z 4 ładunków Szału`);
        for(const [i,segment] of [...charges.querySelectorAll('i')].entries())segment.setAttribute('data-filled',String(active||i<game.energy));
        uiValues.set('charges',key);
    }
}

function drawCookie() {
    const cookie = game.cookie;
    if(game.isGreed && game.goldenCookie){
        ctx.save();drawGlow(cookie.x+15,cookie.y+10,'#ffd34f',motionPreference?.matches?56:64);
        ctx.strokeStyle='#ffe28a';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cookie.x+15,cookie.y+10,21,17,0,0,Math.PI*2);ctx.stroke();
        spriteCookie[0].draw(ctx,cookie.x,cookie.y);ctx.fillStyle='#ffd34f66';ctx.beginPath();ctx.ellipse(cookie.x+15,cookie.y+10,15,10,0,0,Math.PI*2);ctx.fill();
        text('×3',cookie.x+15,cookie.y-12,12,'#ffe28a',800);ctx.restore();return;
    }
    const powerup = POWERUPS[cookie.type];
    if(game.abilityReady){ctx.save();ctx.strokeStyle=game.style.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(cookie.x+15,cookie.y+10,25,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if (!powerup) { spriteCookie[0].draw(ctx, cookie.x, cookie.y); return; }
    ctx.save();
    ctx.fillStyle = '#111e34';
    ctx.strokeStyle = powerup.color;
    ctx.lineWidth = 2;
    if (!motionPreference?.matches) drawGlow(cookie.x + 15, cookie.y + 10, powerup.color, 76);
    ctx.beginPath(); ctx.arc(cookie.x + 15, cookie.y + 10, 23, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    text(powerup.symbol, cookie.x + 15, cookie.y + 11, 24, powerup.color, 800);
    ctx.globalAlpha = .7;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cookie.x + 15, cookie.y + 10, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cookie.remaining / 8); ctx.stroke();
    ctx.globalAlpha = 1;
    text(['', 'TARCZA', 'WOLNIEJ', 'MAGNES', '×2'][cookie.type], cookie.x + 15, cookie.y + 49, 10, powerup.color, 800);
    ctx.restore();
}

function drawOffers() {
    if (!game.offer || game.state !== 'playing') return;
    const ready = game.offer.age >= .9;
    for (const option of game.offer.options) {
        const card = CARDS.find(card=>card.id===option.id);
        ctx.save(); ctx.globalAlpha = ready ? 1 : .45;
        ctx.strokeStyle = card.color; ctx.fillStyle = '#0b1429';ctx.lineWidth = 2;
        ctx.beginPath();ctx.moveTo(option.x,option.y-25);ctx.lineTo(option.x+25,option.y);
        ctx.lineTo(option.x,option.y+25);ctx.lineTo(option.x-25,option.y);ctx.closePath();ctx.fill();ctx.stroke();
        text(card.symbol,option.x,option.y,23,card.color,800);
        ctx.lineWidth=2;ctx.beginPath();ctx.arc(option.x,option.y,29,-Math.PI/2,-Math.PI/2+Math.PI*2*(ready ? (8.9-game.offer.age)/8 : game.offer.age/.9));ctx.stroke();
        ctx.restore();
    }
}

function drawBanner() {
    if (!feedback.banner || !['playing','celebrating'].includes(game.state)) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, feedback.banner.remaining / .25);
    text(feedback.banner.title, 200, 59, 12, feedback.banner.color, 800);
    ctx.restore();
}

function birdSprite(frame){
    const source=spriteBird[frame];const look=LOOKS.find(look=>look.id===(game.state==='ready'?profileStore.value.look:game.profile.look));
    if(!look?.color)return source;const key=`${look.id}:${frame}`;
    if(!birdCache.has(key)){
        const cache=layer(source.width,source.height),h=cache.context;source.draw(h,0,0);
        h.globalCompositeOperation='source-atop';h.globalAlpha=.43;h.fillStyle=look.color;h.fillRect(0,0,source.width,source.height);h.globalAlpha=1;h.globalCompositeOperation='source-over';
        birdCache.set(key,{width:source.width,height:source.height,draw(c,x,y){c.drawImage(cache.image,x,y,source.width,source.height);}});
    }return birdCache.get(key);
}
function machineSprite(kind){
    if(!obstacleCache.has(kind)){
        const cache=layer(46,44),h=cache.context,spec=OBSTACLES[kind];h.translate(23,22);
        const gradient=h.createLinearGradient(-20,-20,20,20);gradient.addColorStop(0,'#f5e5cf');gradient.addColorStop(.35,spec.color);gradient.addColorStop(1,'#35465c');
        h.fillStyle=gradient;h.strokeStyle='#111c2d';h.lineWidth=2;h.beginPath();
        if(kind==='heavy')h.arc(0,0,21,0,Math.PI*2);
        else if(kind==='ricochet'){h.moveTo(-12,-18);h.lineTo(12,-18);h.lineTo(18,-12);h.lineTo(18,12);h.lineTo(12,18);h.lineTo(-12,18);h.lineTo(-18,12);h.lineTo(-18,-12);h.closePath();}
        else {for(let i=0;i<48;i++){const angle=i*Math.PI/24,r=i%4<2?22:19;const x=Math.cos(angle)*r,y=Math.sin(angle)*r;if(i===0)h.moveTo(x,y);else h.lineTo(x,y);}h.closePath();}
        h.fill();h.stroke();h.strokeStyle='#1c2b40';h.lineWidth=2;
        if(kind==='ricochet'){h.strokeRect(-8,-8,16,16);h.fillStyle='#fff3cf';h.fillRect(-4,-4,8,8);}
        else {h.beginPath();h.arc(0,0,kind==='heavy'?14:12,0,Math.PI*2);h.stroke();h.fillStyle='#26364d';h.beginPath();h.arc(0,0,4,0,Math.PI*2);h.fill();}
        obstacleCache.set(kind,{width:46,height:44,draw(c,x,y){c.drawImage(cache.image,x,y,46,44);}});
    }return obstacleCache.get(kind);
}
function drawObstacle(ball){
    if(game.slowed&&!motionPreference?.matches)drawGlow(ball.x+23,ball.y+22,'#8ecbff',66);
    rotatedSprite(machineSprite(ball.kind),ball.x,ball.y,ball.rotation);
    if(ball.weak){ctx.save();ctx.translate(ball.x+23,ball.y+22);ctx.rotate(ball.rotation);ctx.strokeStyle='#d0ffe3';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(-9,-15);ctx.lineTo(2,-5);ctx.lineTo(-4,3);ctx.lineTo(10,15);ctx.stroke();ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if(debugCollisions){ctx.save();ctx.strokeStyle='#ff77ce';ctx.beginPath();ctx.arc(ball.x+23,ball.y+22,ball.radius,0,Math.PI*2);ctx.stroke();ctx.restore();}
}
function drawWarning(ball){
    ctx.save();ctx.strokeStyle=ball.color;ctx.fillStyle=ball.color;ctx.lineWidth=1.5;ctx.globalAlpha=.5;ctx.setLineDash([3,5]);ctx.beginPath();
    for(let i=0;i<=12;i++){const p=obstacleAt(ball,ball.spawnAt+ball.warningDuration+i*.05);const y=Math.max(34,p.y+22);if(i===0)ctx.moveTo(p.x+23,y);else ctx.lineTo(p.x+23,y);}ctx.stroke();ctx.setLineDash([]);
    const entry=obstacleAt(ball,ball.spawnAt+ball.warningDuration+.05);ctx.globalAlpha=.9;
    ctx.translate(entry.x+23,40);ctx.rotate(ball.kind==='ricochet'?(ball.vx>0?-.55:.55):0);ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(5,-4);ctx.lineTo(0,4);ctx.closePath();ctx.fill();ctx.restore();
}

function drawShield(x, y) {
    const abilityShield = (game.isGreed || game.profile.runStyle === 'guard') && game.abilityRemaining > 0;
    const remaining = Math.max(game.effects.invincible, abilityShield ? game.abilityRemaining : 0);
    if (remaining <= 0) return;
    const ending = remaining <= (game.isGreed?1:2);
    const color = ending ? '#ffd18a' : abilityShield ? game.style.color : '#bda4ff';
    const pulse = ending && !motionPreference?.matches ? .78 + .22 * Math.sin(game.ticks / 6) : 1;
    ctx.save();
    ctx.fillStyle = ending ? '#ffd18a10' : '#bda4ff12';
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c6c9ff30';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, remaining / (abilityShield && game.abilityRemaining >= game.effects.invincible ? game.abilityMax : game.effectMax.invincible || 5)));
    ctx.stroke();
    if (ending && !game.isGreed) text(`${Math.ceil(remaining)} s`, Math.max(26, Math.min(WIDTH - 26, x)), Math.max(42, y - 46), 13, color, 800);
    ctx.restore();
}

function draw() {
    drawBackground();
    ctx.save();
    if (game.state === 'dying' && !motionPreference?.matches) {
        const origin = game.deathOrigin;
        const zoom = 1 + .06 * Math.sin(Math.min(1, game.deathElapsed / (game.deathDuration || .7)) * Math.PI);
        ctx.translate(origin.x, origin.y); ctx.scale(zoom, zoom); ctx.translate(-origin.x, -origin.y);
    }
    if (feedback.shake > 0 && !motionPreference?.matches) {
        const decay = (feedback.shake / (feedback.shakeMax || .22)) ** 2;
        const amount = feedback.strength * decay;
        ctx.translate(Math.sin(game.ticks * 2.399) * amount, Math.cos(game.ticks * 3.731) * amount * .75);
        if (game.state === 'dying') {
            ctx.translate(WIDTH / 2, HEIGHT / 2); ctx.rotate(Math.sin(game.ticks * 1.7) * amount * .0009);
            ctx.translate(-WIDTH / 2, -HEIGHT / 2);
        }
    }

    if (['playing', 'dying','celebrating'].includes(game.state)) {
        drawCookie(); drawOffers();
    }
    syncShieldHum();syncMusic();
    const bird = game.bird;
    const birdY = game.state === 'ready' && !motionPreference?.matches ? bird.y + 6 * Math.sin(game.ticks / 15) : bird.y;
    drawShield(bird.x + 28, birdY + 29);
    if (game.magnetic) {
        ctx.save();
        ctx.strokeStyle = '#87e4c444'; ctx.lineWidth = 1; ctx.setLineDash([3, 8]);
        ctx.beginPath(); ctx.arc(bird.x + 28, birdY + 29, game.magnetRange - 4, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
    for (const trail of feedback.trail) {
        if (trail.pickup) {
            const progress = Math.min(1, 1 - trail.remaining / .25);
            ctx.save(); ctx.globalAlpha = Math.min(1, trail.remaining / .08);
            ctx.strokeStyle = '#87e4c4'; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(trail.x, trail.y); ctx.lineTo(trail.targetX, trail.targetY); ctx.stroke();
            spriteCookie[0].draw(ctx, trail.x + (trail.targetX - trail.x) * progress - 15, trail.y + (trail.targetY - trail.y) * progress - 10);
            ctx.restore(); continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.min(.4,trail.remaining / .12 * (game.isGreed?.25:.2));
        if(game.isGreed){ctx.strokeStyle=game.abilityRemaining>0?'#ffb74f':'#ffd78f';ctx.lineWidth=game.abilityRemaining>0?4:game.multiplier;ctx.beginPath();ctx.moveTo(trail.x+28,trail.y+29);ctx.lineTo(bird.x+28,birdY+29);ctx.stroke();}
        birdSprite(trail.frame).draw(ctx, trail.x, trail.y);
        ctx.restore();
    }
    const dead = game.state==='dying'||(game.state==='over'&&game.cause!=='complete');
    const frame = game.state === 'ready' && !motionPreference?.matches ? (Math.floor(game.ticks / 12) % 2) * 2 : bird.frame + (dead ? 4 : 0);
    const jumpProgress = 1 - feedback.jump / .24;
    const stretch = feedback.jump > 0 ? Math.cos(jumpProgress * Math.PI * 2) * .12 * (1 - jumpProgress) : 0;
    rotatedSprite(birdSprite(frame), bird.x, birdY, dead ? bird.rotation : 0, stretch);
    if (game.grace > 0) {
        ctx.save(); ctx.strokeStyle = '#d4f8ff'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(bird.x + 28, birdY + 29, 36, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (debugCollisions) {
        ctx.save(); ctx.strokeStyle = '#ff77ce'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(bird.x + 28, birdY + 29, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (game.state !== 'ready') {
        ctx.save();
        for (const ball of game.balls) {
            if (ball.broken) continue;
            if(ball.wait>0)drawWarning(ball);else drawObstacle(ball);

        }
        ctx.restore();
    }

    drawEdges();
    if (game.state === 'ready') {
        text('ZŁAP APETYT NA REKORD', WIDTH / 2, 142, 11, '#97acc8', 800);
        text('Ciastkobranie', WIDTH / 2, 184, 41, '#ffd78f', 800);
        text(game.isGreed?'Łasuch · leć po rekord':`${game.course.name} · ${game.course.duration}s`, WIDTH / 2, 227, 18, '#a4b5ce');
        const unlock = nextUnlock(profileStore.value);
        if(game.isGreed)text('4 ładunki + ciastko → Szał', WIDTH / 2, 258, 13, '#ffcd85');
        if (unlock && !game.isGreed) text(`${unlock.name}: ${unlock.current}/${unlock.target}`, WIDTH / 2, 258, 12, '#c9b3ff');
        text('Jeszcze jedno ciastko?', WIDTH / 2, 390, 24, '#f7f1df', 800);
        text('Dotknij lub naciśnij spację, żeby zacząć.', WIDTH / 2, 429, 15, '#a4b5ce');
        text(game.isGreed?'W Szale rozbijasz. Kolce nadal groźne.':'Skacz, zbieraj, opanuj rytm.', WIDTH / 2, 454, 14, '#a4b5ce');
    }
    drawFeedback();
    ctx.restore();
    if (game.state === 'dying') {
        ctx.save(); ctx.fillStyle = '#060c18'; ctx.globalAlpha = Math.min(.2, game.deathElapsed / (game.deathDuration || .7) * .2);
        ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore();
    }
    if (feedback.flash > 0 && !motionPreference?.matches) {
        ctx.save();
        ctx.globalAlpha = feedback.flash / .16 * .1;
        ctx.fillStyle = feedback.flashColor;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
    }
    if(['playing','dying','celebrating'].includes(game.state))drawHud();
    if(feedback.banner?.notice)drawBanner();

}
function loop(timestamp) {
    if (previousTime === null) previousTime = timestamp;
    accumulator += Math.min((timestamp - previousTime) / 1000, .1);
    previousTime = timestamp;
    if (game.paused) accumulator = 0;
    while (accumulator >= STEP) {
        game.update();
        updateFeedback();
        accumulator -= STEP;
    }
    syncPanels();
    const renderStart = perfEnabled ? performance.now() : 0;
    draw();
    if (perfEnabled) {
        if (!perfStart) perfStart = timestamp;
        if (perfLast) perfGap = Math.max(perfGap, timestamp - perfLast);
        perfLast = timestamp; perfFrames++; perfCost += performance.now() - renderStart;
        if (timestamp - perfStart >= 1000) {
            const label = document.querySelector('#perf'); label.hidden = false;
            label.textContent = `${Math.round(perfFrames * 1000 / (timestamp - perfStart))} fps · rysowanie ${(perfCost / perfFrames).toFixed(1)} ms · przerwa ${Math.round(perfGap)} ms`;
            perfStart = timestamp; perfFrames = 0; perfCost = 0; perfGap = 0;
        }
    }
    requestAnimationFrame(loop);
}

syncMute();
if (!ctx) {
    status.textContent = 'Ta przeglądarka nie obsługuje gry. Otwórz ją w nowszej przeglądarce.';
} else {
    const image = new Image();
    image.onload = () => {
        initSprites(image);
        loaded = true;
        status.hidden = true;
        resize();
        requestAnimationFrame(loop);
    };
    image.onerror = () => {
        status.textContent = 'Nie udało się wczytać grafiki. Odśwież stronę, aby spróbować ponownie.';
    };
    image.src = 'resources/sprites_sm.png';
}
