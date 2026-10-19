// Run traits occupy at most three slots; legacy unlock IDs remain stable.
export const CARDS = [
    { id:'battery', name:'Bateria', symbol:'ϟ', description:'Energia do aktywacji: 5 / 4 zamiast 6.', max:2, color:'#ffd78f' },
    { id:'shards', name:'Odłamki', symbol:'✦', description:'Rozbita piłka zbiera ciastko z odległości 90 / 130.', max:2, color:'#ffb17c' },
    { id:'alternator', name:'Naprzemiennik', symbol:'↔', description:'Ciastka z przeciwnych stron: dodatkowe +1 / +2 energii.', max:2, color:'#87e4c4' },
    { id:'precision', name:'Precyzja', symbol:'◎', description:'Bliski unik: dodatkowe +1 / +2 energii.', max:2, color:'#8ecbff' },
    { id:'dynamo', name:'Dynamo', symbol:'⚙', description:'Rozbicie poza zdolnością: dodatkowe +1 / +2 energii.', max:2, color:'#d4adff' },
    { id:'streak', name:'Dogrywka', symbol:'◷', description:'Zdolność trwa dłużej o 0,5 / 1 sekundę.', max:2, color:'#ff94b5', unlock:true },
];
export const LOOKS = [
    {id:'classic', name:'Klasyczny', color:null},
    {id:'gold', name:'Złoty', color:'#ffd78f'},
    {id:'mint', name:'Miętowy', color:'#87e4c4'},
];
export function unlockedLooks(profile) { return ['classic', ...(profile.wins > 0 ? ['gold'] : []), ...(profile.bestChain >= 20 ? ['mint'] : [])]; }
export const NEST_UPGRADES = [
    { id: 'grip', name: 'Pewniejszy chwyt', description: '+3 / +6 do zasięgu zwykłych ciastek.', costs: [20, 50] },
    { id: 'duration', name: 'Dłuższa moc', description: '+5% / +10% czasu bonusów.', costs: [20, 50] },
    { id: 'start', name: 'Dobry start', description: '1 / 1,5 s tarczy na początku rundy.', costs: [30, 60] },
];
export const PROFILE_KEY = 'ciastkobranie.profile.v1';
export const STYLES = [
    { id:'guard', name:'Rozbijacz', symbol:'✦', color:'#d4adff', description:'Pełna energia: przez 4 s rozbijasz piłki. Kolce są groźne.' },
    { id:'collector', name:'Łakomczuch', symbol:'×2', color:'#87e4c4', description:'Pełna energia: przez 4 s zdobywasz podwójne punkty.' },
    { id:'time', name:'Władca czasu', symbol:'◷', color:'#8ecbff', description:'Pełna energia: przez 4 s piłki lecą o połowę wolniej.' },
];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
function cleanMetrics(value = {}) {
    const number = key => Number.isFinite(value?.[key]) && value[key] >= 0 ? value[key] : 0;
    return {shieldSeconds:number('shieldSeconds'),twoPowerSeconds:number('twoPowerSeconds'),nearMisses:Math.floor(number('nearMisses')),
        abilities:Math.floor(number('abilities')),rescues:Math.floor(number('rescues')),cause:['ball','floor','ceiling'].includes(value?.cause) ? value.cause : 'ball'};
}
export function cleanProfile(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return {
        wins: count(value.wins), bestChain: count(value.bestChain),
        look: unlockedLooks({wins:count(value.wins),bestChain:count(value.bestChain)}).includes(value.look) ? value.look : 'classic',
        victoryRuns: Array.isArray(value.victoryRuns) ? value.victoryRuns.filter(id => typeof id === 'string').slice(-128) : [],
        lastBuild: Array.isArray(value.lastBuild) ? value.lastBuild.filter(item => CARDS.some(card => card.id === item?.id)).slice(0,3).map(item => ({id:item.id,rank:Math.min(2,count(item.rank))})) : [],
        version: 1, crumbs: count(value.crumbs), lifetimeCookies: count(value.lifetimeCookies),
        runStyle: STYLES.some(style => style.id === value.runStyle) ? value.runStyle : 'guard',
        lifetimeBonuses: count(value.lifetimeBonuses), runs: count(value.runs), bestSector: count(value.bestSector),
        upgrades: Object.fromEntries(NEST_UPGRADES.map(item => [item.id, Math.min(2, count(value.upgrades?.[item.id]))])),
        settledRuns: Array.isArray(value.settledRuns) ? value.settledRuns.filter(id => typeof id === 'string').slice(-128) : [],
        lastRun: value.lastRun ? { seed: count(value.lastRun.seed), score: count(value.lastRun.score), level: count(value.lastRun.level), elapsed:Number.isFinite(value.lastRun.elapsed) && value.lastRun.elapsed >= 0 ? value.lastRun.elapsed : 0, metrics:cleanMetrics(value.lastRun.metrics) } : null,
    };
}
export function unlockedCards(profile) {
    return [ ...(profile.lifetimeCookies >= 40 ? ['feather'] : []), ...(profile.lifetimeBonuses >= 10 ? ['streak'] : []) ];
}
export function nextUnlock(profile) {
    if (profile.lifetimeCookies < 40) return { name: 'Ostatnie pióro', current: profile.lifetimeCookies, target: 40, unit: 'ciastek' };
    if (profile.lifetimeBonuses < 10) return { name: 'Dogrywka', current: profile.lifetimeBonuses, target: 10, unit: 'bonusów' };
    return null;
}
export class ProfileStore {
    constructor(storage) {
        this.storage = storage;
        this.value = cleanProfile();
        this.reload();
    }
    reload() {
        if (this.memoryOnly) return this.value;
        try {
            const text = this.storage?.getItem(PROFILE_KEY);
            if (text) {
                const data = JSON.parse(text);
                if (data?.version === 1) this.value = cleanProfile(data);
            }
        } catch { this.memoryOnly = true; }
        return this.value;
    }
    save() {
        try { this.storage?.setItem(PROFILE_KEY, JSON.stringify(this.value)); } catch { this.memoryOnly = true; }
    }
    settle(run) {
        this.reload();
        if (!run?.id || this.value.settledRuns.includes(run.id)) return { awarded: false, crumbs: 0, unlocked: [] };
        const before = unlockedCards(this.value);
        const collected = count(run.collected);
        const sectors = count(run.completedSectors);
        const crumbs = collected + sectors * 3;
        this.value.crumbs += crumbs;
        this.value.lifetimeCookies += collected;
        this.value.lifetimeBonuses += count(run.bonuses);
        this.value.runs++;
        this.value.bestChain = Math.max(this.value.bestChain, count(run.bestChain));
        this.value.lastBuild = cleanProfile({lastBuild:run.build}).lastBuild;
        this.value.bestSector = Math.max(this.value.bestSector, count(run.level));
        this.value.lastRun = { seed: count(run.seed), score: count(run.score), level: count(run.level), elapsed:Number.isFinite(run.elapsed) && run.elapsed >= 0 ? run.elapsed : 0, metrics:cleanMetrics(run.metrics) };
        this.value.settledRuns = [...this.value.settledRuns, run.id].slice(-128);
        this.save();
        return { awarded: true, crumbs, unlocked: unlockedCards(this.value).filter(id => !before.includes(id)) };
    }
    recordVictory(id) {
        this.reload();
        if (typeof id !== 'string' || !id || this.value.victoryRuns.includes(id)) return false;
        this.value.victoryRuns = [...this.value.victoryRuns, id].slice(-128);
        this.value.wins++; this.save(); return true;
    }
    setLook(id) {
        this.reload();
        if (!unlockedLooks(this.value).includes(id)) return false;
        this.value.look = id; this.save(); return true;
    }
    purchase(id) {
        this.reload();
        const item = NEST_UPGRADES.find(upgrade => upgrade.id === id);
        if (!item) return false;
        const level = this.value.upgrades[id];
        const cost = item.costs[level];
        if (cost === undefined || this.value.crumbs < cost) return false;
        this.value.crumbs -= cost;
        this.value.upgrades[id]++;
        this.save();
        return true;
    }
    setStyle(id) {
        if (!STYLES.some(style => style.id === id)) return false;
        this.reload(); this.value.runStyle = id; this.save(); return true;
    }
}
