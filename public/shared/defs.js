'use strict';
/* =========================================================
   Definicje: świat, części, jakości, bronie, kolory banderi
   ========================================================= */
const COLS = 11, ROWS = 15;      // siatka stoczni
const CORE_C = 5, CORE_R = 7;    // kajuta kapitana
const TILE = 8, PAD = 8;         // kafel okrętu i margines sprite'a
const SW = COLS * TILE + PAD * 2, SH = ROWS * TILE + PAD * 2;
const WORLD = 4000, WCX = WORLD / 2, WCY = WORLD / 2;
const TICK_HZ = 30, SNAP_EVERY = 2;
const START_GOLD = 150, MAX_HOLD = 40;
const SAFE_PAD = 110;            // strefa bezpieczna portu = promień wyspy + SAFE_PAD
const AOI = 780;                 // zasięg widzenia serwera wokół gracza
const BALL_G = 16, BALL_Z0 = 3;
const SINK_TIME = 3.4;
const VERSION = '2.0';

const ZONES = [
  { name: 'Spokojne Wody', r: 1000, col: '#63c74d', mult: 1 },
  { name: 'Szerokie Morze', r: 1750, col: '#feae34', mult: 1.8 },
  { name: 'Diabelskie Głębiny', r: 1e9, col: '#e43b44', mult: 3 }
];
function zoneOf(x, y) { const d = Math.hypot(x - WCX, y - WCY); return d < ZONES[0].r ? 0 : d < ZONES[1].r ? 1 : 2; }

// ---------- jakość wyposażenia ----------
const QUAL = [
  { name: 'Zwykła', col: '#c0cbdc', dmg: 1, rl: 1, hp: 1, pow: 1, rng: 1, cost: 1 },
  { name: 'Solidna', col: '#63c74d', dmg: 1.15, rl: 0.92, hp: 1.2, pow: 1.12, rng: 1.05, cost: 2 },
  { name: 'Mistrzowska', col: '#2a9df0', dmg: 1.32, rl: 0.84, hp: 1.45, pow: 1.25, rng: 1.1, cost: 4 },
  { name: 'Legendarna', col: '#feae34', dmg: 1.52, rl: 0.76, hp: 1.75, pow: 1.4, rng: 1.16, cost: 8 },
  { name: 'Upiorna', col: '#7dffc8', dmg: 1.75, rl: 0.68, hp: 2.1, pow: 1.58, rng: 1.22, cost: 14 }
];
const SHOP_MAXQ = 2;   // w porcie kupisz najwyżej jakość mistrzowską

// ---------- bronie ----------
const WEAPONS = {
  cannon: { reload: 2.7, dmg: 22, spd: 170, vz: 5.5, ball: 0, side: true },
  longgun: { reload: 3.6, dmg: 28, spd: 235, vz: 4.6, ball: 1, side: true },
  carro: { reload: 3.2, dmg: 11, spd: 140, vz: 5.5, ball: 2, side: true, pel: 4, spread: 0.2 },
  firegun: { reload: 3.4, dmg: 13, spd: 150, vz: 5.8, ball: 3, side: true, fire: 0.85 },
  chain: { reload: 3.0, dmg: 13, spd: 165, vz: 5.5, ball: 4, side: true, rig: 3 },
  swivel: { reload: 1.3, dmg: 7, spd: 210, vz: 3.6, ball: 5, auto: true, range: 155 },
  mortar: { reload: 7.5, dmg: 45, mortar: true, range: 300 }
};
const RIGGING = new Set(['mast', 'oars', 'rudder', 'nest']);

// ---------- części okrętu ----------
const PARTS = {
  core: { name: 'Kajuta kapitana', cat: 'core', cost: 0, mass: 6, buoy: 8, hp: 90, mat: 'wood', pitch: 1, noShop: true,
    desc: 'Serce okrętu. Gdy zostanie zniszczona, okręt idzie na dno - a z nim całe Twoje życie.' },
  hull: { name: 'Poszycie sosnowe', cat: 'hull', cost: 5, mass: 2, buoy: 6, hp: 20, mat: 'wood', deck: 'pine', pitch: 1.0, tag: 'Tanie i lekkie',
    desc: 'Podstawa każdego okrętu. Tanie, lekkie i świetnie trzyma się wody.' },
  oak: { name: 'Poszycie dębowe', cat: 'hull', cost: 10, mass: 3, buoy: 6, hp: 36, mat: 'wood', deck: 'oak', pitch: 0.9, tag: 'Twarde drewno',
    desc: 'Ciemne, twarde deski. Wytrzymują prawie dwa razy więcej niż sosna.' },
  mahog: { name: 'Poszycie mahoniowe', cat: 'hull', cost: 18, mass: 3, buoy: 7, hp: 50, mat: 'wood', deck: 'mahog', fireRes: 0.5, pitch: 0.85, tag: 'Mocne, słabo płonie',
    desc: 'Szlachetne drewno z południa. Mocne, lekkie i trudniej się zapala.' },
  iron: { name: 'Pancerz żelazny', cat: 'hull', cost: 14, mass: 7, buoy: 1, hp: 70, mat: 'metal', metal: 'iron', pitch: 0.7, tag: '70 wytrzymałości',
    desc: 'Żelazna płyta. Ciężka, ale wytrzyma kilka kul. Nie płonie.' },
  steel: { name: 'Pancerz stalowy', cat: 'hull', cost: 30, mass: 8, buoy: 1, hp: 115, mat: 'metal', metal: 'steel', pitch: 0.6, tag: '115 wytrzymałości',
    desc: 'Hartowana stal. Najtwardsza płyta, jaką sprzeda kowal. Bardzo ciężka.' },
  ghostw: { name: 'Upiorne drewno', cat: 'hull', cost: 45, mass: 1, buoy: 10, hp: 64, mat: 'ghost', deck: 'ghost', noShop: true, pitch: 1.4, tag: 'Lekkie, nie płonie',
    desc: 'Deski ze statku widma. Lżejsze od piórka, twarde jak stal i nie płoną. Tylko z łupów.' },
  cannon: { name: 'Armata', cat: 'weapon', cost: 18, mass: 5, buoy: 2, hp: 28, mat: 'wood', rule: 'edge', q: true, w: 'cannon', pitch: 0.8, tag: 'Salwa burtą',
    desc: 'Klasyczne działo. Lewa burta: Q, prawa: E. Na dziobie i rufie: SPACJA.' },
  longgun: { name: 'Długie działo', cat: 'weapon', cost: 34, mass: 7, buoy: 2, hp: 34, mat: 'wood', rule: 'edge', q: true, w: 'longgun', pitch: 0.75, tag: 'Duży zasięg',
    desc: 'Długa lufa - kula leci dalej i szybciej. Ładuje się wolniej niż armata.' },
  carro: { name: 'Karonada', cat: 'weapon', cost: 26, mass: 6, buoy: 2, hp: 32, mat: 'wood', rule: 'edge', q: true, w: 'carro', pitch: 0.7, tag: 'Śrut z bliska',
    desc: 'Krótka i gruba. Sieje śrutem na małą odległość - morderczo z bliska.' },
  firegun: { name: 'Smocze działo', cat: 'weapon', cost: 32, mass: 5, buoy: 2, hp: 26, mat: 'wood', rule: 'edge', q: true, w: 'firegun', pitch: 0.85, tag: 'Podpala',
    desc: 'Strzela płonącą smołą. Słabe obrażenia, ale niemal zawsze wznieca pożar.' },
  chain: { name: 'Działo łańcuchowe', cat: 'weapon', cost: 28, mass: 5, buoy: 2, hp: 28, mat: 'wood', rule: 'edge', q: true, w: 'chain', pitch: 0.8, tag: 'Tnie maszty',
    desc: 'Kule skute łańcuchem. Potrójne obrażenia masztom, wiosłom i sterom - wróg zwalnia.' },
  swivel: { name: 'Krętlica', cat: 'weapon', cost: 22, mass: 3, buoy: 2, hp: 24, mat: 'wood', rule: 'edge', q: true, w: 'swivel', pitch: 1.1, tag: 'Strzela sama',
    desc: 'Małe obrotowe działko. Samo celuje w najbliższy okręt lub beczkę w zasięgu.' },
  mortar: { name: 'Moździerz', cat: 'weapon', cost: 34, mass: 7, buoy: 2, hp: 34, mat: 'metal', metal: 'iron', q: true, w: 'mortar', pitch: 0.6, tag: 'Sam celuje',
    desc: 'Ciska pocisk łukiem w najbliższego wroga. Długo się ładuje. SPACJA.' },
  ram: { name: 'Taran', cat: 'weapon', cost: 18, mass: 5, buoy: 1, hp: 80, mat: 'metal', metal: 'iron', rule: 'bow', q: true, pitch: 0.5, tag: 'Tylko dziób',
    desc: 'Okuty dziób. Zderzenie taranem zadaje potrójne obrażenia. Tylko na dziobie.' },
  mast: { name: 'Maszt', cat: 'drive', cost: 20, mass: 3, buoy: 2, hp: 26, mat: 'wood', q: true, pitch: 1.2, tag: 'Napęd z wiatrem',
    desc: 'Żagiel daje dużą prędkość, najlepiej z wiatrem. Lepsze żagle są większe, barwniejsze i szybsze.' },
  oars: { name: 'Wiosła', cat: 'drive', cost: 10, mass: 2, buoy: 3, hp: 22, mat: 'wood', rule: 'side', q: true, pitch: 1.1, tag: 'Tylko burta',
    desc: 'Napęd niezależny od wiatru i lepsza zwrotność. Tylko na lewej lub prawej burcie.' },
  rudder: { name: 'Ster', cat: 'drive', cost: 12, mass: 2, buoy: 3, hp: 30, mat: 'wood', rule: 'stern', q: true, pitch: 1.0, tag: 'Tylko rufa',
    desc: 'Mocno poprawia skręcanie w ruchu. Tylko na rufie - za nim musi być woda.' },
  keg: { name: 'Prochownia', cat: 'gear', cost: 12, mass: 3, buoy: 2, hp: 16, mat: 'wood', q: true, pitch: 0.9, tag: 'Szybsze działa',
    desc: 'Sąsiednie działa ładują się o 40% szybciej. Uwaga: wybucha, gdy zostanie trafiona!' },
  carp: { name: 'Cieśla', cat: 'gear', cost: 18, mass: 2, buoy: 3, hp: 28, mat: 'wood', q: true, pitch: 1.3, tag: 'Naprawy',
    desc: 'Naprawia sąsiednie części i gasi pożary na pokładzie.' },
  nest: { name: 'Bocianie gniazdo', cat: 'gear', cost: 24, mass: 2, buoy: 2, hp: 20, mat: 'wood', q: true, pitch: 1.25, tag: '+12% zasięgu',
    desc: 'Obserwator wypatruje celów: każde gniazdo daje +12% zasięgu wszystkich dział (najwyżej dwa).' }
};
const CATS = [
  { id: 'hull', name: 'KADŁUB', parts: ['hull', 'oak', 'mahog', 'iron', 'steel', 'ghostw'] },
  { id: 'weapon', name: 'BROŃ', parts: ['cannon', 'longgun', 'carro', 'firegun', 'chain', 'swivel', 'mortar', 'ram'] },
  { id: 'drive', name: 'NAPĘD', parts: ['mast', 'oars', 'rudder'] },
  { id: 'gear', name: 'SPRZĘT', parts: ['keg', 'carp', 'nest'] }
];
const RULE_MSG = {
  edge: 'Działo potrzebuje otwartej wody obok',
  side: 'Wiosła tylko na lewej lub prawej burcie',
  stern: 'Ster tylko na rufie - z tyłu musi być woda',
  bow: 'Taran tylko na dziobie - z przodu musi być woda'
};
const RULE_TAG = { edge: 'PRZY WODZIE', side: 'BURTA', stern: 'RUFA', bow: 'DZIÓB' };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- przedmioty ----------
const hasQ = p => !!PARTS[p].q;
function itemKey(p, q) { return p + ':' + (q | 0); }
function itemValue(p, q) { return Math.round(PARTS[p].cost * (hasQ(p) ? QUAL[q | 0].cost : 1)); }
function sellValue(p, q) { return Math.max(1, Math.floor(itemValue(p, q) * 0.5)); }
function itemName(p, q) { return PARTS[p].name + (hasQ(p) && q ? ' (' + QUAL[q].name.toLowerCase() + ')' : ''); }
function partHp(p, q) { return Math.round(PARTS[p].hp * (hasQ(p) ? QUAL[q | 0].hp : 1)); }
function cellStr(cl) { return cl ? (cl.q ? cl.p + ':' + cl.q : cl.p) : ''; }
function cellParse(s) {
  if (!s || typeof s !== 'string') return null;
  const i = s.indexOf(':'), p = i < 0 ? s : s.slice(0, i);
  if (!Object.prototype.hasOwnProperty.call(PARTS, p)) return null;
  const q = i < 0 ? 0 : clamp(parseInt(s.slice(i + 1), 10) || 0, 0, QUAL.length - 1);
  return { p, q: hasQ(p) ? q : 0 };
}

// ---------- bandery ----------
const SHIP_COLORS = [
  { name: 'Czerwona', c: '#e43b44', d: '#a22633', l: '#f6757a', dd: '#5c1624' },
  { name: 'Błękitna', c: '#2a9df0', d: '#1a5a9c', l: '#8fd3ff', dd: '#10305a' },
  { name: 'Zielona', c: '#63c74d', d: '#3e8948', l: '#a5f08f', dd: '#265c42' },
  { name: 'Złota', c: '#feae34', d: '#c27a1f', l: '#fee761', dd: '#6b3f12' },
  { name: 'Fioletowa', c: '#b55088', d: '#68386c', l: '#e98bc4', dd: '#3a1d40' },
  { name: 'Pomarańczowa', c: '#f77622', d: '#be4a2f', l: '#ffb37a', dd: '#5c2414' },
  { name: 'Turkusowa', c: '#2ce8f5', d: '#1a8a9c', l: '#a8f6ff', dd: '#10405a' },
  { name: 'Biała', c: '#e8eef8', d: '#8b9bb4', l: '#ffffff', dd: '#3a4466' },
  { name: 'Piracka', c: '#3a3a4a', d: '#1e1e2a', l: '#e43b44', dd: '#0e0e16' },
  { name: 'Upiorna', c: '#7dffc8', d: '#2a9d7c', l: '#d8fff0', dd: '#12463f' },
  { name: 'Kupiecka', c: '#fee761', d: '#c27a1f', l: '#ffffff', dd: '#6b3f12' }
];
const N_PLAYER_COLORS = 8, COL_PIRATE = 8, COL_GHOST = 9, COL_MERCHANT = 10;

// ---------- siła okrętu ----------
const POWER_TIERS = [
  { min: 0, name: 'Płotka', col: '#c0cbdc' },
  { min: 25, name: 'Rekinek', col: '#63c74d' },
  { min: 55, name: 'Barakuda', col: '#2a9df0' },
  { min: 100, name: 'Rekin', col: '#b55088' },
  { min: 170, name: 'Kraken', col: '#f77622' },
  { min: 280, name: 'Lewiatan', col: '#e43b44' }
];
function powerTier(pw) { let t = 0; for (let i = 0; i < POWER_TIERS.length; i++) if (pw >= POWER_TIERS[i].min) t = i; return t; }

// ---------- nazwy ----------
const PORT_NAMES = ['Port Mewa', 'Przystań Dorsza', 'Zatoka Przemytników', 'Fort Rdzawy', 'Wyspa Wisielców', 'Ostatnia Przystań', 'Kamienna Keja', 'Zatoka Kłamców'];
const SHIP_NAMES = (() => {
  const adj = [['Pijany', 'Pijana'], ['Słony', 'Słona'], ['Krwawy', 'Krwawa'], ['Wściekły', 'Wściekła'], ['Zgniły', 'Zgniła'],
    ['Dziurawy', 'Dziurawa'], ['Czarny', 'Czarna'], ['Szalony', 'Szalona'], ['Złoty', 'Złota'], ['Ponury', 'Ponura'],
    ['Rdzawy', 'Rdzawa'], ['Żelazny', 'Żelazna'], ['Mokry', 'Mokra'], ['Chytry', 'Chytra'], ['Wesoły', 'Wesoła'],
    ['Głodny', 'Głodna'], ['Hardy', 'Harda'], ['Łysy', 'Łysa'], ['Dumny', 'Dumna'], ['Sprytny', 'Sprytna']];
  const nounM = ['Śledź', 'Dorsz', 'Rekin', 'Sztorm', 'Kraken', 'Wieloryb', 'Okoń', 'Albatros', 'Krab', 'Pelikan', 'Szkwał', 'Bosman'];
  const nounF = ['Mewa', 'Flądra', 'Syrena', 'Kaczka', 'Łajba', 'Szprotka', 'Ośmiornica', 'Krewetka', 'Burza', 'Kotwica', 'Barakuda', 'Fala'];
  return {
    random(except) {
      for (let k = 0; k < 20; k++) {
        const a = pick(adj), f = chance(0.5);
        const n = (f ? a[1] + ' ' + pick(nounF) : a[0] + ' ' + pick(nounM));
        if (n !== except) return n;
      }
      return 'Pijana Mewa';
    }
  };
})();
// tylko znaki, które umie narysować font pikselowy
function cleanName(s, max) {
  s = String(s || '').replace(/[^0-9A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ .,!?'\-_#*+=()]/g, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, max || 18);
}
