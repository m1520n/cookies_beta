import { Game, WIDTH, HEIGHT, STEP, cookieWord, POWERUPS } from './game-model.js';
import { ProfileStore, NEST_UPGRADES, CARDS, STYLES, LOOKS, unlockedLooks, nextUnlock } from './progression.js';

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
let rasterRatio = 1, backgroundCache, previousBackgroundCache, edgeCache, hudCache, backgroundKey = -1, hudKey = null;
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
    if (event.type === 'near' || event.type === 'ability') {
        if (!motionPreference?.matches) {
            feedback.rings.push({x:event.x ?? game.bird.x+28,y:event.y ?? game.bird.y+29,remaining:.5,color:event.color,large:event.type==='ability'});
            if (event.type === 'ability') arcadeImpact(4,event.color);
        }
        if (event.type === 'ability') announcement.textContent = `Zdolność: ${event.title}`;
        return;
    }
    if (event.type === 'victory' || event.type === 'finale') {
        feedback.banner = {title:event.type === 'victory' ? 'UDAŁO SIĘ! · LEĆ DALEJ' : 'FINAŁ',color:'#ffd78f',remaining:1.2,notice:true,priority:2};
        announcement.textContent = event.type === 'victory' ? 'Zwycięstwo! Złoty wygląd odblokowany. Możesz lecieć dalej.' : 'Finał. Przetrwaj trzy sekwencje.';
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
        arcadeImpact(9, event.color);
        feedback.rings.push({x: event.x, y: event.y, remaining: .5, color: event.color, large: true});
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI * 2 / 10;
            feedback.particles.push({x:event.x + Math.cos(angle) * 8, y:event.y + Math.sin(angle) * 8,
                vx:Math.cos(angle) * (150 + Math.random() * 100), vy:Math.sin(angle) * 200 - 70,
                size: 7 + Math.random() * 5, angle, spin:(Math.random() - .5) * 15,
                remaining:.65 + Math.random() * .2, color:i % 2 ? '#ec994c' : '#ffbd75', fragment:true});
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

function arcadeImpact(strength, color) {
    feedback.strength = Math.min(16, Math.max(feedback.strength * feedback.shake / .42, strength));
    feedback.shake = .42;
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
    if (!motionPreference?.matches && ((game.state === 'playing' && (game.shielded || game.effects.double > 0 || game.abilityRemaining > 0)) || game.state === 'dying') && game.ticks % 4 === 0) {
        feedback.trail.push({ x: game.bird.x, y: game.bird.y, frame: game.bird.frame, remaining: .12 });
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
    const voice = { stop() { try { oscillator.stop(); } catch {} arcadeVoices.delete(voice); oscillator.disconnect(); gain.disconnect(); } };
    oscillator.onended = () => voice.stop(); arcadeVoices.add(voice);
    oscillator.start(now); oscillator.stop(now + duration + .02);
}
function playArcade(name) {
    if (name === 'shatter') {
        tone(150, 42, .24, .10, 'triangle');
        tone(1100, 110, .10, .025, 'sawtooth');
        tone(1800, 350, .07, .018, 'square', .025);
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
    onVictory(id) { profileStore.recordVictory(id); },
    onSettle(snapshot) {
        settlement = profileStore.settle(snapshot);
        write('bestScore', game.best);
    },
    onFinish(score, record) {
        resultSince = performance.now();
        write('bestScore', record);
        document.querySelector('#result-title').textContent = game.won ? 'Zwycięstwo!' : 'Koniec rundy!';
        document.querySelector('#score').textContent = `Wynik: ${score} pkt`;
        document.querySelector('#best').textContent = `Rekord: ${record} pkt`;
        document.querySelector('#run-detail').textContent = `Sektor ${game.level}`;
        document.querySelector('#earned').textContent = `+${settlement?.crumbs || 0} okruchów`;
        for (const id of ['#next-goal', '#highlight', '#unlock-progress']) document.querySelector(id).hidden = true;
        announcement.textContent = `${game.won ? 'Zwycięstwo.' : 'Koniec rundy.'} Wynik: ${score}. Rekord: ${record}.`;
        syncPanels();
        restartButton.focus({ preventScroll: true });
    },
});

function syncPanels() {
    const panelKey = `${game.state}:${game.paused}:${game.deathElapsed >= .35}`;
    if (lastPanelState === panelKey) return;
    lastPanelState = panelKey;
    skipButton.hidden = game.state !== 'dying' || game.paused || game.deathElapsed < .35;
    skipButton.disabled = game.deathElapsed < .35;
    document.querySelector('#open-nest').disabled = !['ready', 'over'].includes(game.state);
    result.hidden = game.state !== 'over';
    pausePanel.hidden = !game.paused;
}
function jump() {
    if (!loaded || game.paused || !nestPanel.hidden) return;
    if (game.state === 'dying') { game.skipDeath(); syncPanels(); return; }
    if (game.state === 'over' && performance.now() - resultSince < 200) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !audioContext) audioContext = new AudioContext();
        audioContext?.resume()?.catch(() => {});
    } catch { /* HTML audio and silent play remain available. */ }
    if (game.state !== 'playing') {
        game.profile = profileStore.reload();
        settlement = null;
        backgroundCache = null; previousBackgroundCache = null; backgroundKey = -1; hudKey = null;
        stopSounds();
        accumulator = 0;
        previousTime = null;
        announcement.textContent = '';
        resetFeedback();
    }
    game.press();
    syncPanels();
}
function setPaused(paused) {
    if (!loaded || !['playing', 'dying'].includes(game.state)) return;
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
    jump();
    canvas.focus({ preventScroll: true });
});
resumeButton.addEventListener('click', () => setPaused(false));
skipButton.addEventListener('click', () => { game.skipDeath(); syncPanels(); });
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
    if (game.state !== 'over') jump();
});
document.addEventListener('keydown', event => {
    const activePanel = !nestPanel.hidden ? nestPanel : game.paused ? pausePanel : game.state === 'over' ? result : null;
    if (event.code === 'Tab' && activePanel) {
        const buttons = [...activePanel.querySelectorAll('button:not([disabled])')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.code === 'Escape' && !nestPanel.hidden) { document.querySelector('#close-nest').click(); return; }
    if (event.code === 'Escape' && loaded && ['playing', 'dying'].includes(game.state)) {
        event.preventDefault();
        if (!event.repeat) setPaused(!game.paused);
    }
    if (event.code !== 'Space') return;
    const button = event.target.closest('button');
    if (button && !['restart', 'resume', 'skip-death'].includes(button.id)) return;
    if (event.target.closest('input, textarea, select, a')) return;
    event.preventDefault();
    if (event.repeat) return;
    if (game.paused) setPaused(false);
    else jump();
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
});

function openNest() {
    if (!['ready', 'over'].includes(game.state)) return;
    profileStore.reload();
    result.hidden = true;
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
        button.disabled = !unlockedLooks(profileStore.value).includes(look.id);
        button.title = look.id === 'gold' ? 'Pierwsze zwycięstwo' : look.id === 'mint' ? 'Seria 20 ciastek' : 'Podstawowy wygląd';
        button.setAttribute('aria-pressed', String(profileStore.value.look===look.id));
        button.addEventListener('click',()=>{profileStore.setLook(look.id);openNest();});looks.append(button);
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
    document.querySelector('#last-metrics').textContent = last ? `${Math.floor(last.elapsed)} s lotu · ${last.metrics.nearMisses} uników · ${last.metrics.abilities} zdolności · ${Math.round(last.metrics.shieldSeconds)} s ochrony · ${Math.round(last.metrics.twoPowerSeconds)} s z dwiema mocami · ${last.metrics.rescues} ratunków · koniec: ${{ball:'piłka',floor:'dolne kolce',ceiling:'górne kolce'}[last.metrics.cause]}` : 'Rozegraj pierwszą rundę.';
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
    rasterRatio = ratio; backgroundCache = null; previousBackgroundCache = null; edgeCache = null; hudCache = null; hudKey = null; glowCache.clear();
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
    const progress = Math.min(1, Math.max(0, (game.elapsed - game.stageIndex * 30) / 1.2));
    if (previousBackgroundCache && progress < 1 && !motionPreference?.matches) {
        ctx.drawImage(previousBackgroundCache.image, 0, 0, WIDTH, HEIGHT);
        ctx.save(); ctx.globalAlpha = progress; ctx.drawImage(backgroundCache.image,0,0,WIDTH,HEIGHT);ctx.restore();
    } else { ctx.drawImage(backgroundCache.image, 0, 0, WIDTH, HEIGHT); previousBackgroundCache = null; }
}
function paintBackground(h, sector) {
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

function drawScore() {
    const key = `${game.score}:${game.stageIndex}:${game.won}:${JSON.stringify(game.cards)}:${game.profile.runStyle}`;
    if (!hudCache || key !== hudKey) {
        hudCache = layer(WIDTH, 140); hudKey = key; paintScore(hudCache.context);
    }
    ctx.drawImage(hudCache.image, 0, 0, WIDTH, 140);
    ctx.fillStyle = '#ffd78f'; ctx.fillRect(126, 82, 244 * Math.min(1,(game.elapsed-game.stageIndex*30)/30), 3);
    const active = game.abilityRemaining > 0;
    const fraction = active ? game.abilityRemaining / game.abilityMax : game.abilityCooldown > 0 ? 1-game.abilityCooldown/8 : game.energy/game.energyNeeded;
    ctx.fillStyle = active ? game.style.color : game.abilityCooldown > 0 ? '#718aaa' : game.style.color;
    ctx.fillRect(126, 101, 244 * Math.max(0, Math.min(1, fraction)), 5);
    text(game.style.symbol, 347, 66, 19, active ? game.style.color : '#718aaa', 800);
}
function paintScore(h) {
    const label = (value, x, y, size, color, weight = 600) => {
        h.font = `${weight} ${size}px ${typeface}`; h.textAlign = 'center'; h.textBaseline = 'middle';
        h.fillStyle = color; h.fillText(value, x, y, WIDTH - 32);
    };
    h.save();
    h.fillStyle = '#0b1429b3';
    h.strokeStyle = '#a9c5e324';
    h.lineWidth = 1;
    h.beginPath();
    h.roundRect(18, 46, 88, 72, 18);
    h.fill();
    h.stroke();
    label('PUNKTY', 62, 63, 9, '#a4b5ce', 800);
    label(String(game.score), 62, 92, game.score > 999 ? 27 : 34, '#ffd78f', 800);
    label(game.elapsed >= 210 && !game.won ? 'FINAŁ' : `SEKTOR ${game.level}`, 224, 64, 12, '#f7f1df', 800);
    h.fillStyle = '#a9c5e320'; h.fillRect(126,82,244,3);h.fillRect(126,101,244,5);
    const entries = Object.entries(game.cards);
    for (let i=0;i<3;i++) {
        const x = 239 + i * 39;
        h.strokeStyle = '#a9c5e330'; h.beginPath();h.roundRect(x-14,114,30,26,7);h.stroke();
        if (entries[i]) {
            const [id,rank] = entries[i], card = CARDS.find(card=>card.id===id);
            label(card.symbol,x,125,16,card.color,800);label(rank===2 ? '••' : '•',x,136,8,card.color);
        }
    }
    h.restore();
}

function drawCookie() {
    const cookie = game.cookie;
    const powerup = POWERUPS[cookie.type];
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

function drawActiveBonuses() {
    const active = Object.values(POWERUPS).filter(powerup => game.effects[powerup.effect] > 0);
    const width = 88;
    const start = (WIDTH - (active.length * (width + 6) - 6)) / 2;
    active.forEach((powerup, index) => {
        const remaining = game.effects[powerup.effect];
        const duration = game.effectMax[powerup.effect];
        const x = start + index * (width + 6);
        const ending = remaining <= 2;
        const color = ending ? '#ffd18a' : powerup.color;
        ctx.save();
        ctx.fillStyle = '#0b1429dd';
        ctx.strokeStyle = color + '77';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x, 566, width, 33, 10); ctx.fill(); ctx.stroke();
        const label = powerup.effect === 'invincible' ? (ending ? 'Tarcza znika' : 'Tarcza')
            : powerup.effect === 'slow' ? 'Wolniej' : powerup.effect === 'magnet' ? 'Magnes' : '×2';
        text(`${label} ${Math.ceil(remaining)}s`, x + width / 2, 579, ending && powerup.effect === 'invincible' ? 9 : 11, color, 800);
        ctx.fillStyle = color;
        ctx.fillRect(x + 8, 591, (width - 16) * Math.min(1, remaining / (duration || powerup.duration)), 2);
        ctx.restore();
    });
}

function drawBanner() {
    if (!feedback.banner || game.state !== 'playing') return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, feedback.banner.remaining / .25);
    text(feedback.banner.title, 200, 166, 12, feedback.banner.color, 800);
    ctx.restore();
}

function drawShield(x, y) {
    const abilityShield = game.profile.runStyle === 'guard' && game.abilityRemaining > 0;
    const remaining = Math.max(game.effects.invincible, abilityShield ? game.abilityRemaining : 0);
    if (remaining <= 0) return;
    const ending = remaining <= 2;
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
    if (ending) text(`${Math.ceil(remaining)} s`, Math.max(26, Math.min(WIDTH - 26, x)), Math.max(42, y - 46), 13, color, 800);
    ctx.restore();
}

function draw() {
    drawBackground();
    ctx.save();
    if (game.state === 'dying' && !motionPreference?.matches) {
        const origin = game.deathOrigin;
        const zoom = 1 + .06 * Math.sin(Math.min(1, game.deathElapsed / 1.2) * Math.PI);
        ctx.translate(origin.x, origin.y); ctx.scale(zoom, zoom); ctx.translate(-origin.x, -origin.y);
    }
    if (feedback.shake > 0 && !motionPreference?.matches) {
        const decay = (feedback.shake / .42) ** 2;
        const amount = feedback.strength * decay;
        ctx.translate(Math.sin(game.ticks * 2.399) * amount, Math.cos(game.ticks * 3.731) * amount * .75);
        ctx.translate(WIDTH / 2, HEIGHT / 2); ctx.rotate(Math.sin(game.ticks * 1.7) * amount * .0009);
        ctx.translate(-WIDTH / 2, -HEIGHT / 2);
    }

    if (['playing', 'dying'].includes(game.state)) {
        drawCookie(); drawOffers();
    }
    syncShieldHum();
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
        ctx.globalAlpha = trail.remaining / .12 * .2;
        spriteBird[trail.frame].draw(ctx, trail.x, trail.y);
        ctx.restore();
    }
    const dead = ['dying', 'over'].includes(game.state);
    const frame = game.state === 'ready' && !motionPreference?.matches ? (Math.floor(game.ticks / 12) % 2) * 2 : bird.frame + (dead ? 4 : 0);
    const jumpProgress = 1 - feedback.jump / .24;
    const stretch = feedback.jump > 0 ? Math.cos(jumpProgress * Math.PI * 2) * .12 * (1 - jumpProgress) : 0;
    rotatedSprite(spriteBird[frame], bird.x, birdY, dead ? bird.rotation : 0, stretch);
    const look = LOOKS.find(look=>look.id===(game.state === 'ready' ? profileStore.value.look : game.profile.look));
    if (look?.color) {
        ctx.save(); ctx.strokeStyle=look.color;ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(bird.x+28,birdY+29,29,31,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
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
            if (ball.wait > 0) {
                ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = '#ffbc8b'; ctx.fillStyle = '#ffbc8b';
                ctx.globalAlpha = motionPreference?.matches ? .8 : .6 + .25 * Math.sin(game.ticks / 7);
                const x = ball.x + 23;
                ctx.beginPath(); ctx.moveTo(x - 6, 36); ctx.lineTo(x + 6, 36); ctx.lineTo(x, 44); ctx.closePath(); ctx.fill();
                ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(x, 48); ctx.lineTo(x, 108); ctx.stroke();
                ctx.restore();
            } else {
                if (game.slowed) drawGlow(ball.x + 23, ball.y + 22, '#8ecbff', 76);
                rotatedSprite(spriteBall, ball.x, ball.y, ball.rotation);
            }
        }
        ctx.restore();
    }

    drawEdges();
    if (game.state === 'ready') {
        text('ZŁAP APETYT NA REKORD', WIDTH / 2, 142, 11, '#97acc8', 800);
        text('Ciastkobranie', WIDTH / 2, 184, 41, '#ffd78f', 800);
        text(`Twój rekord: ${game.best} pkt`, WIDTH / 2, 227, 15, '#a4b5ce');
        const unlock = nextUnlock(profileStore.value);
        if (unlock) text(`${unlock.name}: ${unlock.current}/${unlock.target}`, WIDTH / 2, 258, 12, '#c9b3ff');
        text('Jeszcze jedno ciastko?', WIDTH / 2, 390, 24, '#f7f1df', 800);
        text('Dotknij lub naciśnij spację, żeby zacząć.', WIDTH / 2, 429, 15, '#a4b5ce');
        text('Przetrwaj 4 minuty. Wybieraj ulepszenia lotem.', WIDTH / 2, 454, 12, '#a4b5ce');
    }
    drawFeedback();
    ctx.restore();
    if (game.state === 'dying') {
        ctx.save(); ctx.fillStyle = '#060c18'; ctx.globalAlpha = Math.min(.2, game.deathElapsed / 1.2 * .2);
        ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore();
    }
    if (feedback.flash > 0 && !motionPreference?.matches) {
        ctx.save();
        ctx.globalAlpha = feedback.flash / .16 * .1;
        ctx.fillStyle = feedback.flashColor;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
    }
    if (game.state === 'playing') {
        drawScore(); drawActiveBonuses();
        if (game.chain >= 3) {
            text(`×${game.multiplier}`, 156, 125, 22, '#ffd78f', 800);
            ctx.fillStyle = '#ffd78f'; ctx.fillRect(130, 141, 50 * game.chainTime / 4, 2);
        }
        if (game.hasFeather) {
            ctx.save(); ctx.translate(366, 126); ctx.rotate(-.5);
            ctx.globalAlpha = game.featherUsed ? .2 : 1;
            ctx.fillStyle = game.featherUsed ? '#a4b5ce' : '#ffd78f';
            ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#172640'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 14); ctx.stroke();
            ctx.restore();
        }
        // Only a newly earned trait or a rescue needs a brief textual notice.
        if (feedback.banner?.notice) drawBanner();
    }
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
