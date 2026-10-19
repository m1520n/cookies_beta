export function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6D2B79F5) >>> 0;
        let t = Math.imul(value ^ (value >>> 15), 1 | value);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export const PATTERNS = {
    rain: { name: 'Pionowy deszcz', description: 'Spokojny początek. Złap rytm.' },
    diagonal: { name: 'Skośny lot', description: 'Piłki odbijają się od ścian.' },
    pendulum: { name: 'Wahadło', description: 'Śledź rytm falującego lotu.' },
    pairs: { name: 'Podwójny rytm', description: 'Piłki wchodzą parami, z odstępem.' },
};
function reflect(x) {
    const period = 354 * 2;
    const positive = ((x % period) + period) % period;
    return positive > 354 ? period - positive : positive;
}
export function projected(ball, seconds) {
    const active = Math.max(0, seconds - ball.wait);
    const age = ball.age + active;
    return {
        x: ball.pattern === 'pendulum' ? ball.originX + Math.sin(age * 3.3 + ball.phase) * 36 : reflect(ball.x + ball.vx * active * 60),
        y: ball.y + ball.vy * active * 60,
    };
}
export function largestVerticalGap(balls, seconds = 0) {
    const bands = balls.map(ball => projected(ball, seconds)).filter(point => point.y < 610 && point.y + 44 > 30)
        .map(point => [Math.max(30, point.y), Math.min(610, point.y + 44)]).sort((a, b) => a[0] - b[0]);
    let end = 30, largest = 0;
    for (const [top, bottom] of bands) { largest = Math.max(largest, top - end); end = Math.max(end, bottom); }
    return Math.max(largest, 610 - end);
}
export class Director {
    constructor(seed) { this.random = seededRandom(seed); this.seen = new Set(); this.pattern = null; }
    configure(sector, { pattern, alternating = false } = {}) {
        const types = ['rain', 'diagonal', 'pendulum', 'pairs'];
        const choices = types.filter(type => type !== this.pattern);
        this.pattern = pattern || (sector < 4 ? types[sector] : choices[Math.floor(this.random() * choices.length)]);
        this.alternating = alternating; this.sequence = 0;
        this.sector = sector;
        this.speed = 5 * Math.min(1.25, 1 + sector * .05);
        this.count = sector < 2 ? 1 : sector < 4 ? 2 : 3;
        this.intro = !this.seen.has(this.pattern);
        this.introRemaining = this.intro ? this.count : 0;
        this.seen.add(this.pattern);
        return { ...PATTERNS[this.pattern], atSeconds: sector * 30, balls: this.count, pattern: this.pattern };
    }
    create(index, existing, bird, stagger = 0) {
        const warning = this.introRemaining > 0 ? .9 : .6;
        this.introRemaining = Math.max(0, this.introRemaining - 1);
        const forcedLeft = this.alternating ? this.sequence++ % 2 === 0 : null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const left = forcedLeft ?? this.random() > .5;
            const x = left ? 40 + this.random() * 35 : 280 + this.random() * 35;
            const candidate = this.make(x, left, warning + stagger + attempt * .4);
            const clearStart = Math.hypot(x + 23 - (bird.x + 28), -25 - (bird.y + 29)) >= 120;
            const group = [...existing, candidate];
            const safe = Array.from({ length: 61 }, (_, i) => i * .1).every(t => largestVerticalGap(group, t) >= 160);
            if (clearStart && safe) return candidate;
        }
        // Delay a plain vertical drop until the current wave has cleared.
        const untilClear = Math.max(0, ...existing.map(ball => ball.wait + Math.max(0, (650 - ball.y) / (ball.vy * 60))));
        return this.make(bird.x < 172 ? 310 : 40, bird.x >= 172, untilClear + warning, 'rain');
    }
    make(x, left, wait, pattern = this.pattern) {
        const phase = this.random() * Math.PI * 2;
        const originX = Math.max(36, Math.min(318, x - (pattern === 'pendulum' ? Math.sin(phase) * 36 : 0)));
        return {
            pattern, x: pattern === 'pendulum' ? originX + Math.sin(phase) * 36 : x, originX, phase,
            y: -50, vx: pattern === 'diagonal' ? (left ? 1.4 : -1.4) : pattern === 'pairs' ? (left ? .45 : -.45) : 0,
            vy: this.speed, wait, warningDuration: wait, age: 0, rotation: 0,
        };
    }
}
