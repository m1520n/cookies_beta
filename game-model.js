import { CARDS, STYLES, cleanProfile, unlockedCards } from './progression.js';
import { Director, seededRandom, projected } from './director.js';
export const WIDTH = 400;
export const HEIGHT = 640;
export const STEP = 1 / 60;
const RADIUS = 22;
let serial = 0;
const emptyEffects = () => ({ invincible: 0, slow: 0, magnet: 0, double: 0 });
const freshSeed = () => globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() ^ ++serial) >>> 0;
export const POWERUPS = {
    1: { effect: 'invincible', label: 'Tarcza', duration: 5, color: '#bda4ff', symbol: '◇', description: 'Ochrona przed piłkami. Uważaj na kolce!' },
    2: { effect: 'slow', label: 'Spowolnienie', duration: 6, color: '#8ecbff', symbol: '◷', description: 'Piłki zwalniają. Twój skok działa jak zwykle.' },
    3: { effect: 'magnet', label: 'Magnes', duration: 6, color: '#87e4c4', symbol: 'U', description: 'Zbierasz ciastka z większej odległości.' },
    4: { effect: 'double', label: 'Podwójne punkty', duration: 8, color: '#ffd78f', symbol: '×2', description: 'Każde ciastko daje dwa punkty.' },
};
export function cookieWord(count) {
    if (count === 1) return 'ciastko';
    const lastTwo = count % 100;
    return count % 10 >= 2 && count % 10 <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'ciastka' : 'ciastek';
}
export class Game {
    constructor({ seed, random, profile, best = 0, onSound = () => {}, onFinish = () => {}, onSettle = () => {}, onVictory = () => {}, onFeedback = () => {} } = {}) {
        Object.assign(this, { fixedSeed: seed, randomOverride: random, profile: cleanProfile(profile), best, onSound, onFinish, onSettle, onVictory, onFeedback });
        this.reset();
    }
    get level() { return this.stageIndex + 1; }
    get nextStage() { return { atSeconds: (this.stageIndex + 1) * 30 }; }
    get ball() { return this.balls[0]; }
    get multiplier() { return Math.min(4, 1 + Math.floor(this.chain / 3)); }
    get magnetic() { return this.effects.magnet > 0; }
    get hasFeather() { return unlockedCards(this.profile).includes('feather'); }
    get style() { return STYLES.find(style => style.id === this.profile.runStyle); }
    get energyNeeded() { return 6 - (this.cards.battery || 0); }
    get abilityDuration() { return 4 + (this.cards.streak || 0) * .5; }
    get shielded() { return this.effects.invincible > 0 || (this.profile.runStyle === 'guard' && this.abilityRemaining > 0); }
    get slowed() { return this.effects.slow > 0 || (this.profile.runStyle === 'time' && this.abilityRemaining > 0); }
    get magnetRange() { return 90; }
    get dyingScale() { return this.deathElapsed < .08 ? 0 : this.deathElapsed < .7 ? .18 : .4; }
    durationFor(effect) {
        const base = Object.values(POWERUPS).find(powerup => powerup.effect === effect).duration;
        return base * (1 + this.profile.upgrades.duration * .05);
    }
    reset() {
        this.state = 'ready'; this.paused = false; this.score = 0; this.collected = 0; this.stageIndex = 0;
        this.ticks = 0; this.elapsed = 0; this.grace = 0; this.deathElapsed = 0; this.bonuses = 0;
        this.effects = emptyEffects(); this.effectMax = emptyEffects();
        this.cards = {}; this.featherUsed = false; this.snapshot = null; this.resultSent = false;
        this.chain = 0; this.chainTime = 0; this.bestChain = 0;
        this.highlight = 'Pierwszy lot'; this.maxSimultaneous = 0;
        this.seed = this.fixedSeed ?? freshSeed();
        this.random = this.randomOverride || seededRandom(this.seed);
        this.cardRandom = seededRandom(this.seed ^ 0xC4A2D51);
        this.director = new Director(this.seed ^ 0x57A6E);
        this.stage = this.director.configure(0);
        this.bird = { x: 172, y: 291, vx: 6, vy: -7, frame: 0, rotation: 0 };
        this.energy = 0; this.abilityRemaining = 0; this.abilityMax = 4; this.abilityCooldown = 0;
        this.offer = null; this.offerIndex = 0; this.ballSerial = 0; this.previousCookieSide = null;
        this.finalPhase = -1; this.won = false;
        this.metrics = {shieldSeconds:0, twoPowerSeconds:0, nearMisses:0, abilities:0, rescues:0};
        this.nextBonusCookie = 4; this.nextBonusTime = 8;
        this.balls = []; this.cookie = null; this.bonusBag = []; this.bonusCount = 0; this.lastBonus = 0; this.lastBonusAt = -1;
    }
    press() {
        if (this.paused || !['ready', 'playing', 'over'].includes(this.state)) return false;
        if (this.state !== 'playing') {
            this.reset(); this.runId = `${Date.now().toString(36)}-${this.seed.toString(36)}-${++serial}`;
            this.state = 'playing'; this.spawnBall(); this.spawnCookie();
            if (this.profile.upgrades.start) this.activate('invincible', this.profile.upgrades.start === 1 ? 1 : 1.5);
        }
        this.bird.vy = -8; this.onSound('pop'); this.onFeedback({ type: 'jump' });
        return true;
    }
    spawnBall(index = 0, stagger = 0) {
        const others = this.balls.filter((ball, i) => i !== index && !ball.broken);
        this.balls[index] = { ...this.director.create(index, others, this.bird, stagger), id:++this.ballSerial, nearDistance:Infinity, nearAwarded:false, contacted:false };
    }
    bonusType() {
        if (this.lastBonusAt === this.collected) return this.lastBonus;
        if (this.bonusCount === 0) this.lastBonus = 1;
        else {
            if (!this.bonusBag.length) {
                this.bonusBag = this.bonusCount === 1 ? [2, 3, 4] : [1, 2, 3, 4];
                for (let i = this.bonusBag.length - 1; i > 0; i--) {
                    const j = Math.floor(this.random() * (i + 1));
                    [this.bonusBag[i], this.bonusBag[j]] = [this.bonusBag[j], this.bonusBag[i]];
                }
                if (this.bonusBag.at(-1) === this.lastBonus) [this.bonusBag[0], this.bonusBag[this.bonusBag.length - 1]] = [this.bonusBag.at(-1), this.bonusBag[0]];
            }
            this.lastBonus = this.bonusBag.pop();
        }
        this.lastBonusAt = this.collected; this.bonusCount++;
        return this.lastBonus;
    }
    spawnCookie() {
        const previous = this.cookie;
        let side = this.random() > .5 ? 0 : 1;
        const reachable = [128, 256, 384, 512].filter(y => Math.abs(y + 10 - (this.bird.y + 29)) <= 160);
        let positions = reachable.filter(y => !previous || previous.side !== side || previous.baseY !== y);
        if (!positions.length) { side = 1 - side; positions = reachable; }
        const baseY = positions[Math.floor(this.random() * positions.length)];
        const eligible = this.collected >= this.nextBonusCookie - 1 && this.elapsed >= this.nextBonusTime
            && Object.values(this.effects).filter(time => time > 0).length < 2;
        let type = 0;
        if (eligible) {
            type = this.bonusType();
            for (let attempt = 0; this.effects[POWERUPS[type].effect] > 0 && attempt < 12; attempt++) {
                this.lastBonusAt = -1; type = this.bonusType();
            }
            this.nextBonusCookie = this.collected + 8;
            this.nextBonusTime = this.elapsed + 12;
        }
        this.cookie = { side, x: side === 0 ? 50 : 315, baseY, y: baseY, type, remaining: type ? 8 : 0 };
    }
    activate(effect, override) {
        if (!this.effects[effect] && Object.values(this.effects).filter(time => time > 0).length >= 2) return false;
        const duration = override ?? this.durationFor(effect);
        if (override !== undefined && this.effects[effect] >= duration) return;
        this.effects[effect] = duration; this.effectMax[effect] = duration;
    }
    advanceStage() {
        while (this.elapsed + 1e-7 >= this.nextStage.atSeconds) {
            this.stageIndex++;
            this.stage = this.director.configure(this.stageIndex);
            // Never move existing hazards, cookies, or grant protection at a boundary.
            for (let i = this.balls.length; i < this.stage.balls; i++) this.spawnBall(i, i * .8);
            this.onSound('stage');
            this.onFeedback({type:'stage', level:this.level, stage:this.stage});
        }
    }
    updateTimeline() {
        this.advanceStage();
        if (this.elapsed + 1e-7 >= 210 && this.elapsed < 240 - 1e-7) {
            const phase = Math.min(2, Math.floor((this.elapsed - 210 + 1e-7) / 10));
            if (phase !== this.finalPhase) {
                this.finalPhase = phase;
                this.stage = this.director.configure(this.stageIndex, {pattern:['rain','diagonal','pairs'][phase], alternating:phase === 0});
                this.onFeedback({type:phase === 0 ? 'finale' : 'finalPhase', phase});
                this.onSound(phase === 0 ? 'finale' : 'stage');
            }
        }
        if (!this.won && this.elapsed + 1e-7 >= 240) {
            this.won = true; this.onVictory(this.runId);
            this.onFeedback({type:'victory'}); this.onSound('victory');
        }
    }
    gainEnergy(amount) {
        if (this.state !== 'playing' || this.abilityRemaining > 0 || this.abilityCooldown > 0) return;
        this.energy = Math.min(this.energyNeeded, this.energy + amount);
        if (this.energy >= this.energyNeeded) {
            this.energy = 0; this.abilityMax = this.abilityDuration; this.abilityRemaining = this.abilityMax;
            this.metrics.abilities++;
            this.onSound('ability');
            this.onFeedback({type:'ability', color:this.style.color, symbol:this.style.symbol, title:this.style.name});
        }
    }
    updateAbility(dt) {
        if (this.abilityRemaining > 0) {
            this.abilityRemaining = Math.max(0, this.abilityRemaining - dt);
            if (this.abilityRemaining < 1e-8) { this.abilityRemaining = 0; this.abilityCooldown = 8; }
        } else this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    }
    awardNearMiss(ball, distance) {
        if (ball.contacted || ball.broken || ball.nearAwarded) return;
        ball.nearDistance = Math.min(ball.nearDistance, distance);
        if (distance > 84 && ball.nearDistance >= 45 && ball.nearDistance <= 69) {
            ball.nearAwarded = true; this.metrics.nearMisses++;
            this.onSound('near');
            this.onFeedback({type:'near', x:ball.x+23, y:ball.y+22, color:this.style.color});
            this.gainEnergy(2 + (this.cards.precision || 0));
        }
    }
    traitPool() {
        const full = Object.keys(this.cards).length >= 3;
        return CARDS.filter(card => (!card.unlock || unlockedCards(this.profile).includes(card.id))
            && (!full || this.cards[card.id]) && (this.cards[card.id] || 0) < card.max);
    }
    createOffer() {
        const pool = this.traitPool();
        if (!pool.length) return true;
        const ys = [128,256,384,512].filter(y => Math.abs(y - this.bird.y - 29) <= 160)
            .sort((a,b)=>Math.abs(a-this.bird.y-29)-Math.abs(b-this.bird.y-29));
        const y = ys.find(y => [74,326].every(x =>
            (!this.cookie || Math.hypot(x-this.cookie.x-15, y-this.cookie.y-10) >= 65)
            && this.balls.filter(ball=>!ball.broken).every(ball => { const p=projected(ball,.9); return Math.hypot(x-p.x-23,y-p.y-22)>=120; })));
        if (y === undefined) return false;
        const choices = [...pool];
        for (let i=choices.length-1;i>0;i--) { const j=Math.floor(this.cardRandom()*(i+1)); [choices[i],choices[j]]=[choices[j],choices[i]]; }
        this.offer = {age:0, options:choices.slice(0,2).map((card,i)=>({id:card.id,x:i ? 326 : 74,y}))};
        this.onFeedback({type:'offer'}); this.onSound('offer'); return true;
    }
    updateOffer(dt) {
        if (!this.offer && this.offerIndex < 6) {
            const due = 25 + this.offerIndex * 35;
            if (this.elapsed + 1e-7 >= due) {
                if (this.elapsed > due + 3 || this.createOffer()) this.offerIndex++;
            }
        }
        if (!this.offer) return;
        this.offer.age += dt;
        if (this.offer.age >= 8.9) { this.offer = null; return; }
        if (this.offer.age < .9) return;
        const option = this.offer.options.find(option=>Math.hypot(this.bird.x+28-option.x,this.bird.y+29-option.y)<40);
        if (option) this.chooseTrait(option.id);
    }
    chooseTrait(id) {
        if (this.state !== 'playing' || this.paused || !this.offer || this.offer.age < .9 || !this.offer.options.some(option=>option.id===id)) return false;
        const card = this.traitPool().find(card=>card.id===id);
        if (!card) return false;
        this.cards[id] = (this.cards[id] || 0) + 1; this.offer = null;
        this.onSound('trait');
        this.onFeedback({type:'card', title:card.name, color:card.color, symbol:card.symbol});
        // A smaller battery may complete an already earned charge.
        if (id === 'battery') this.gainEnergy(0);
        return true;
    }
    rescue(cause, hit) {
        this.featherUsed = true; this.metrics.rescues++;
        this.grace = 1.2;
        if (hit) {
            this.shatterBall(hit, 'feather', '#ffd78f');
        } else if (cause === 'floor') this.bird.vy = -Math.min(8, Math.abs(this.bird.vy));
        else if (cause === 'ceiling') this.bird.vy = Math.min(8, Math.abs(this.bird.vy));
        this.onSound('feather');
        this.onFeedback({ type: 'rescue', x: this.bird.x + 28, y: this.bird.y + 29 });
    }
    shatterBall(ball, source = 'shield', color = '#bda4ff') {
        if (ball.broken || ball.wait > 0 || ball.y < -44 || ball.y > HEIGHT) return false;
        ball.broken = true; ball.contacted = true; ball.respawnIn = .65;
        const abilityWasActive = this.abilityRemaining > 0;
        if (!abilityWasActive) this.gainEnergy(1 + (this.cards.dynamo || 0));
        // A smash sustains an earned chain; it cannot generate points by itself.
        if (this.chainTime > 0) this.chainTime = 4;
        this.onSound('shatter');
        this.onFeedback({ type: 'shatter', x: ball.x + 23, y: ball.y + 22, color, source });
        if (this.cards.shards && this.cookie && Math.hypot(ball.x+23-this.cookie.x-15, ball.y+22-this.cookie.y-10) <= (this.cards.shards === 1 ? 90 : 130)) this.collectCookie('shards');
        return true;
    }
    finish(cause = 'ball', hit = null) {
        if (this.state !== 'playing') return false;
        if (this.hasFeather && !this.featherUsed) { this.rescue(cause, hit); return false; }
        this.state = 'dying'; this.deathElapsed = 0; this.cause = cause;
        const bird = this.bird;
        this.deathOrigin = { x: bird.x + 28, y: bird.y + 29 };
        bird.vx = hit ? (bird.x + 28 < hit.x + 23 ? -2.5 : 2.5) : Math.sign(bird.vx) * 2;
        bird.vy = cause === 'floor' ? -5.5 : cause === 'ceiling' ? 3 : -3;
        this.best = Math.max(this.best, this.score);
        this.effects = emptyEffects(); this.abilityRemaining = 0; this.offer = null;
        this.snapshot = Object.freeze({
            id: this.runId, seed: this.seed, score: this.score, collected: this.collected, bonuses: this.bonuses,
            won:this.won, bestChain:this.bestChain, build:Object.freeze(Object.entries(this.cards).map(([id,rank])=>Object.freeze({id,rank}))), metrics:Object.freeze({...this.metrics,cause}),
            completedSectors: this.stageIndex, level: this.level, highlight: this.highlight, elapsed: this.elapsed,
        });
        this.onSettle(this.snapshot);
        this.onSound('dead');
        this.onFeedback({ type: 'hit', x: bird.x + 28, y: bird.y + 29 });
        return true;
    }
    showResults() {
        if (this.state !== 'dying' || this.resultSent) return false;
        this.resultSent = true; this.state = 'over'; this.onFinish(this.score, this.best, this.snapshot);
        return true;
    }
    skipDeath() { return this.state === 'dying' && this.deathElapsed >= .35 ? this.showResults() : false; }
    updateDeath(dt) {
        this.deathElapsed += dt;
        const scale = this.dyingScale;
        const frames = dt * 60 * scale;
        this.bird.x = Math.max(0, Math.min(344, this.bird.x + this.bird.vx * frames));
        this.bird.y += this.bird.vy * frames;
        this.bird.vy += .5 * frames;
        this.bird.rotation += .12 * frames * Math.sign(this.bird.vx || 1);
        if (this.bird.y > 567) { this.bird.y = 567; this.bird.vy = 0; }
        for (const ball of this.balls) this.moveBall(ball, dt * scale);
        if (this.deathElapsed >= 1.2) this.showResults();
    }
    moveBall(ball, dt) {
        if (ball.broken) return;
        if (ball.wait > 0) { ball.wait = Math.max(0, ball.wait - dt); return; }
        const next = projected(ball, dt);
        const oldX = ball.x;
        ball.x = next.x; ball.y = next.y; ball.age += dt; ball.rotation += .1 * dt * 60;
        if (ball.pattern !== 'pendulum') {
            if (oldX + ball.vx * dt * 60 < 0 || oldX + ball.vx * dt * 60 > 354) ball.vx *= -1;
        }
    }
    update(dt = STEP) {
        if (this.paused || this.state === 'over') return;
        this.ticks++;
        if (this.state === 'ready') return;
        if (this.state === 'dying') { this.updateDeath(dt); return; }
        this.chainTime = Math.max(0, this.chainTime - dt);
        if (!this.chainTime) this.chain = 0;
        this.elapsed += dt; this.grace = Math.max(0, this.grace - dt);
        this.updateTimeline(); this.updateAbility(dt);
        for (const effect of Object.keys(this.effects)) {
            this.effects[effect] = Math.max(0, this.effects[effect] - dt);
            if (this.effects[effect] < 1e-8) this.effects[effect] = 0;
        }
        if (this.shielded) this.metrics.shieldSeconds += dt;
        if (Object.values(this.effects).filter(time=>time>0).length === 2) this.metrics.twoPowerSeconds += dt;
        const bird = this.bird;
        bird.x += bird.vx; bird.y += bird.vy; bird.vy += .5;
        bird.frame = bird.vx < 0 ? (bird.vy < 0 ? 1 : 3) : (bird.vy > 0 ? 0 : 2);
        if (bird.x < 0 || bird.x + 56 > WIDTH) {
            bird.x = Math.max(0, Math.min(344, bird.x)); bird.vx *= -1; this.onSound('bird');
        }
        const top = bird.y + 29 - RADIUS;
        const bottom = bird.y + 29 + RADIUS;
        if (top < 25 || bottom > HEIGHT - 25) {
            const cause = top < 25 ? 'ceiling' : 'floor';
            bird.y = Math.max(25 + RADIUS - 29, Math.min(HEIGHT - 25 - RADIUS - 29, bird.y));
            if (this.grace > 0) bird.vy = cause === 'ceiling' ? Math.abs(bird.vy) : -Math.abs(bird.vy);
            else { this.finish(cause); return; }
        }
        const timeScale = this.slowed ? .5 : 1;
        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i];
            if (ball.broken) {
                ball.respawnIn -= dt;
                if (ball.respawnIn <= 0) this.spawnBall(i);
                continue;
            }
            this.moveBall(ball, dt * timeScale);
            if (ball.y > HEIGHT + 46) { this.spawnBall(i); continue; }
            if (ball.wait > 0 || ball.y < -44) continue;
            const distance = Math.hypot(bird.x + 28 - ball.x - 23, bird.y + 29 - ball.y - 22);
            if (distance < RADIUS + 23) {
                ball.contacted = true;
                if (this.shielded || this.grace > 0) this.shatterBall(ball, this.shielded ? 'shield' : 'grace', this.shielded ? this.style.color : '#d4f8ff');
                else { this.finish('ball', ball); return; }
            } else this.awardNearMiss(ball, distance);
        }
        this.updateOffer(dt);
        const cookie = this.cookie;
        if (cookie.type) { cookie.remaining = Math.max(0, cookie.remaining - dt); if (!cookie.remaining) { cookie.type = 0; this.onFeedback({type: 'expire', x: cookie.x + 15, y: cookie.y + 10}); } }
        cookie.y = cookie.baseY + 12 * Math.sin(this.ticks / 10);
        const cx = cookie.x + 15, cy = cookie.y + 10;
        const closestX = Math.max(bird.x, Math.min(bird.x + 56, cx));
        const closestY = Math.max(bird.y, Math.min(bird.y + 58, cy));
        const padding = this.profile.upgrades.grip * 3;
        const overlaps = cookie.type ? Math.hypot(cx - closestX, cy - closestY) <= 23
            : bird.x - padding < cookie.x + 30 && bird.x + 56 + padding > cookie.x && bird.y - padding < cookie.y + 20 && bird.y + 58 + padding > cookie.y;
        if (overlaps || (this.magnetic && Math.hypot(bird.x + 28 - cx, bird.y + 29 - cy) < this.magnetRange)) this.collectCookie();
    }
    collectCookie(source = 'touch') {
        if (this.state !== 'playing') return;
        const cookie = this.cookie;
        const before = this.multiplier;
        this.chain++; this.chainTime = 4; this.bestChain = Math.max(this.bestChain, this.chain);
        const points = (this.effects.double > 0 ? 2 : 1) * this.multiplier * (this.profile.runStyle === 'collector' && this.abilityRemaining > 0 ? 2 : 1);
        if (this.multiplier > before) {
            this.onSound(`combo${this.multiplier}`);
            this.onFeedback({type: 'combo', multiplier: this.multiplier, x: cookie.x + 15, y: cookie.y + 10});
            this.highlight = `Seria ${this.chain} · mnożnik ×${this.multiplier}`;
        }
        this.score += points; this.collected++;
        const alternate = this.previousCookieSide !== null && this.previousCookieSide !== cookie.side;
        this.previousCookieSide = cookie.side;
        this.gainEnergy(1 + (alternate ? (this.cards.alternator || 0) : 0));
        const powerup = POWERUPS[cookie.type];
        if (powerup) { this.bonuses++; this.activate(powerup.effect); this.onSound(cookie.type === 1 ? 'boost' : 'gravity'); }
        const active = Object.values(this.effects).filter(time => time > 0).length;
        if (active > this.maxSimultaneous) { this.maxSimultaneous = active; if (active > 1) this.highlight = `Połączono ${active} moce naraz`; }
        this.onSound('eatCookie');
        this.onFeedback({ type: 'collect', x: cookie.x + 15, y: cookie.y + 10, cookieType: cookie.type, points, source, magnetic: Boolean(this.magnetic || source === 'shards'), targetX: this.bird.x + 28, targetY: this.bird.y + 29 });
        this.spawnCookie();
    }
}
