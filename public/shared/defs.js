'use strict';
/* =========================================================
   Definicje: świat, części, jakości, bronie, kolory banderi

   Okręt to siatka kafli. Każdy kafel ma KADŁUB (poszycie z jakiegoś
   materiału) i - opcjonalnie - ELEMENT postawiony na kadłubie
   (działo, maszt, sprzęt, relikwia). Element nie jest podłogą:
   bez kadłuba pod spodem nie da się go postawić.
   ========================================================= */
const COLS = 15, ROWS = 27;      // siatka stoczni (dziób u góry)
const CORE_C = 7, CORE_R = 17;   // kajuta kapitana (rufowa część okrętu)
const TILE = 8, PAD = 8;         // kafel okrętu i margines sprite'a
const SW = COLS * TILE + PAD * 2, SH = ROWS * TILE + PAD * 2;
const WORLD = 6400, WCX = WORLD / 2, WCY = WORLD / 2;
const TICK_HZ = 30, SNAP_EVERY = 2;
const START_GOLD = 200, MAX_HOLD = 40;
const SAFE_PAD = 110;            // strefa bezpieczna portu = promień wyspy + SAFE_PAD
const AOI = 820;                 // zasięg widzenia serwera wokół gracza
const BALL_G = 16, BALL_Z0 = 3;
const SINK_TIME = 3.4;
const VERSION = '2.2';
const CRANE_HOLD = 12;           // dodatkowe miejsca w ładowni za każdy żuraw (najwyżej dwa)
const MAX_MINES = 5;             // ile min naraz może mieć jeden okręt

// Kształt kadłuba: połowa szerokości (od osi okrętu) w kolejnych rzędach, dziób u góry.
// Poza tym obrysem nie da się budować - dzięki temu każdy okręt ma kształt statku.
const HULL_HW = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 5];
const HULL_OK = (() => {
  const a = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (Math.abs(c - CORE_C) <= HULL_HW[r]) a[r * COLS + c] = 1;
  return a;
})();

const ZONES = [
  { name: 'Spokojne Wody', r: 1600, col: '#63c74d', mult: 1 },
  { name: 'Szerokie Morze', r: 2800, col: '#feae34', mult: 1.8 },
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
  mortar: { reload: 7.5, dmg: 45, mortar: true, range: 300 },
  rocket: { reload: 4.2, dmg: 9, spd: 250, vz: 3.2, ball: 6, side: true, pel: 3, spread: 0.12, fire: 0.45 },
  flame: { reload: 2.4, dmg: 4, spd: 95, vz: 2.2, ball: 7, side: true, pel: 6, spread: 0.3, fire: 0.5 },
  bombard: { reload: 6.8, dmg: 58, spd: 150, vz: 6, ball: 8, side: true, blast: 14 },
  harpoon: { reload: 7, dmg: 8, spd: 200, vz: 4.2, ball: 9, side: true, tether: 6 },
  mine: { reload: 5, dmg: 46, mine: true },
  ballista: { reload: 3.8, dmg: 26, spd: 300, vz: 3, ball: 10, side: true, pierce: 4 },
  turret: { reload: 3, dmg: 17, spd: 215, vz: 4.4, ball: 0, auto: true, range: 210 },
  tesla: { reload: 2.2, dmg: 15, auto: true, arc: true, range: 115 }
};
const RIGGING = new Set(['mast', 'oars', 'rudder', 'nest', 'jib', 'lateen', 'paddle']);

// ---------- części okrętu ----------
// cat: 'hull' = kadłub (materiał kafla), pozostałe = elementy stawiane NA kadłubie
const PARTS = {
  core: { name: 'Kajuta kapitana', cat: 'core', cost: 0, mass: 6, buoy: 8, hp: 90, mat: 'wood', pitch: 1, noShop: true,
    desc: 'Serce okrętu. Gdy zostanie zniszczona, okręt idzie na dno - a z nim całe Twoje życie.' },
  // ---------- kadłub ----------
  hull: { name: 'Poszycie sosnowe', cat: 'hull', cost: 5, mass: 2, buoy: 6, hp: 20, mat: 'wood', deck: 'pine', pitch: 1.0, tag: 'Tanie i lekkie',
    desc: 'Podstawa każdego okrętu. Tanie, lekkie i świetnie trzyma się wody. Na nim stawiasz wszystko inne.' },
  bamboo: { name: 'Poszycie bambusowe', cat: 'hull', cost: 4, mass: 1, buoy: 8, hp: 12, mat: 'wood', deck: 'bamboo', fireRes: -0.6, pitch: 1.5, tag: 'Najlżejsze, kruche',
    desc: 'Lekkie jak piórko i bardzo wyporne - okręt mknie. Ale łatwo się łamie i pali jak pochodnia.' },
  oak: { name: 'Poszycie dębowe', cat: 'hull', cost: 10, mass: 3, buoy: 6, hp: 36, mat: 'wood', deck: 'oak', pitch: 0.9, tag: 'Twarde drewno',
    desc: 'Ciemne, twarde deski. Wytrzymują prawie dwa razy więcej niż sosna.' },
  mahog: { name: 'Poszycie mahoniowe', cat: 'hull', cost: 18, mass: 3, buoy: 7, hp: 50, mat: 'wood', deck: 'mahog', fireRes: 0.5, pitch: 0.85, tag: 'Mocne, słabo płonie',
    desc: 'Szlachetne drewno z południa. Mocne, lekkie i trudniej się zapala.' },
  iron: { name: 'Pancerz żelazny', cat: 'hull', cost: 14, mass: 7, buoy: 1, hp: 70, mat: 'metal', metal: 'iron', pitch: 0.7, tag: '70 wytrzymałości',
    desc: 'Żelazna płyta. Ciężka, ale wytrzyma kilka kul. Nie płonie. Działa i sprzęt stawiasz na niej tak samo jak na drewnie.' },
  thorn: { name: 'Pancerz kolczasty', cat: 'hull', cost: 26, mass: 8, buoy: 1, hp: 85, mat: 'metal', metal: 'thorn', pitch: 0.65, tag: 'Rani taranujących',
    desc: 'Płyta najeżona kolcami. Kto w nią uderzy kadłubem lub taranem, sam dostaje o połowę mocniej. Nie płonie.' },
  steel: { name: 'Pancerz stalowy', cat: 'hull', cost: 30, mass: 8, buoy: 1, hp: 115, mat: 'metal', metal: 'steel', pitch: 0.6, tag: '115 wytrzymałości',
    desc: 'Hartowana stal. Najtwardsza płyta, jaką sprzeda kowal. Bardzo ciężka.' },
  ghostw: { name: 'Upiorne drewno', cat: 'hull', cost: 45, mass: 1, buoy: 10, hp: 64, mat: 'ghost', deck: 'ghost', noShop: true, pitch: 1.4, tag: 'Lekkie, nie płonie',
    desc: 'Deski ze statku widma. Lżejsze od piórka, twarde jak stal i nie płoną. Tylko z łupów.' },
  // ---------- działa burtowe ----------
  cannon: { name: 'Armata', cat: 'weapon', cost: 18, mass: 4, buoy: 0, hp: 16, rule: 'edge', q: true, w: 'cannon', pitch: 0.8, tag: 'Salwa burtą',
    desc: 'Klasyczne działo. Stawiasz je na kadłubie przy krawędzi. Lewa burta: Q, prawa: E. Na dziobie i rufie: SPACJA.' },
  longgun: { name: 'Długie działo', cat: 'weapon', cost: 34, mass: 6, buoy: 0, hp: 20, rule: 'edge', q: true, w: 'longgun', pitch: 0.75, tag: 'Duży zasięg',
    desc: 'Długa lufa - kula leci dalej i szybciej. Ładuje się wolniej niż armata.' },
  carro: { name: 'Karonada', cat: 'weapon', cost: 26, mass: 5, buoy: 0, hp: 18, rule: 'edge', q: true, w: 'carro', pitch: 0.7, tag: 'Śrut z bliska',
    desc: 'Krótka i gruba. Sieje śrutem na małą odległość - morderczo z bliska.' },
  firegun: { name: 'Smocze działo', cat: 'weapon', cost: 32, mass: 4, buoy: 0, hp: 14, rule: 'edge', q: true, w: 'firegun', pitch: 0.85, tag: 'Podpala',
    desc: 'Strzela płonącą smołą. Słabe obrażenia, ale niemal zawsze wznieca pożar.' },
  chain: { name: 'Działo łańcuchowe', cat: 'weapon', cost: 28, mass: 4, buoy: 0, hp: 16, rule: 'edge', q: true, w: 'chain', pitch: 0.8, tag: 'Tnie maszty',
    desc: 'Kule skute łańcuchem. Potrójne obrażenia masztom, wiosłom i sterom - wróg zwalnia.' },
  bombard: { name: 'Bombarda', cat: 'weapon', cost: 48, mass: 8, buoy: 0, hp: 24, rule: 'edge', q: true, w: 'bombard', pitch: 0.55, tag: 'Wybuchowa kula',
    desc: 'Ogromne działo oblężnicze. Kula wybucha przy trafieniu i rozrywa sąsiednie części. Ładuje się bardzo długo.' },
  ballista: { name: 'Balista', cat: 'weapon', cost: 40, mass: 5, buoy: 0, hp: 18, rule: 'edge', q: true, w: 'ballista', pitch: 0.65, tag: 'Przebija kadłub',
    desc: 'Wielki bełt przebija kilka części jednym strzałem. Najlepsza na pancerze i długie okręty.' },
  // ---------- machiny ----------
  swivel: { name: 'Krętlica', cat: 'special', cost: 22, mass: 2, buoy: 0, hp: 12, rule: 'edge', q: true, w: 'swivel', pitch: 1.1, tag: 'Strzela sama',
    desc: 'Małe obrotowe działko. Samo celuje w najbliższy okręt lub beczkę w zasięgu.' },
  turret: { name: 'Wieża artyleryjska', cat: 'special', cost: 56, mass: 6, buoy: 0, hp: 26, q: true, w: 'turret', pitch: 0.6, tag: 'Strzela sama, gdziekolwiek',
    desc: 'Obrotowa wieża z armatą. Stoi gdziekolwiek na kadłubie - także w środku okrętu - i sama celuje we wrogów w zasięgu.' },
  tesla: { name: 'Cewka Tesli', cat: 'special', cost: 60, mass: 4, buoy: 0, hp: 18, q: true, w: 'tesla', pitch: 1.2, tag: 'Piorun z bliska',
    desc: 'Razi pobliskich wrogów piorunem, który przeskakuje na sąsiednie części. Strzela sama, nie potrzebuje wody obok.' },
  rocket: { name: 'Wyrzutnia rakiet', cat: 'special', cost: 38, mass: 3, buoy: 0, hp: 14, rule: 'edge', q: true, w: 'rocket', pitch: 1.0, tag: 'Salwa 3 rakiet',
    desc: 'Odpala trzy rakiety naraz. Lecą daleko, ale niecelnie - i często wzniecają pożar.' },
  flame: { name: 'Grecki ogień', cat: 'special', cost: 30, mass: 3, buoy: 0, hp: 16, rule: 'edge', q: true, w: 'flame', pitch: 0.9, tag: 'Miotacz ognia',
    desc: 'Pluje strugą płonącej smoły na krótki dystans. Z bliska podpala wszystko, co drewniane.' },
  harpoon: { name: 'Harpun', cat: 'special', cost: 32, mass: 3, buoy: 0, hp: 16, rule: 'edge', q: true, w: 'harpoon', pitch: 1.05, tag: 'Przyciąga wroga',
    desc: 'Wbija się w kadłub i przywiązuje wroga liną na kilka sekund. Nikt Ci nie ucieknie.' },
  mortar: { name: 'Moździerz', cat: 'special', cost: 34, mass: 6, buoy: 0, hp: 20, q: true, w: 'mortar', pitch: 0.6, tag: 'Sam celuje',
    desc: 'Ciska pocisk łukiem w najbliższego wroga. Długo się ładuje. SPACJA.' },
  mines: { name: 'Stawiacz min', cat: 'special', cost: 36, mass: 4, buoy: 0, hp: 16, rule: 'stern', q: true, w: 'mine', pitch: 0.7, tag: 'Tylko rufa',
    desc: 'Zrzuca za rufę miny morskie (SPACJA). Wybuchają, gdy dotknie ich wróg. Najwyżej 5 naraz.' },
  ram: { name: 'Taran', cat: 'special', cost: 18, mass: 4, buoy: 0, hp: 50, rule: 'bow', q: true, pitch: 0.5, tag: 'Tylko dziób',
    desc: 'Okuty dziób. Zderzenie taranem zadaje potrójne obrażenia. Tylko na dziobie.' },
  // ---------- napęd ----------
  mast: { name: 'Maszt', cat: 'drive', cost: 20, mass: 3, buoy: 0, hp: 14, q: true, pitch: 1.2, tag: 'Napęd z wiatrem',
    desc: 'Żagiel daje dużą prędkość, najlepiej z wiatrem. Lepsze żagle są większe, barwniejsze i szybsze.' },
  jib: { name: 'Bukszpryt z fokiem', cat: 'drive', cost: 16, mass: 2, buoy: 0, hp: 12, rule: 'bow', q: true, pitch: 1.3, tag: 'Tylko dziób',
    desc: 'Trójkątny żagiel na dziobie. Trochę szybciej z wiatrem i wyraźnie lepsze skręcanie.' },
  lateen: { name: 'Żagiel łaciński', cat: 'drive', cost: 24, mass: 3, buoy: 0, hp: 14, q: true, pitch: 1.25, tag: 'Dobry pod wiatr',
    desc: 'Trójkątny żagiel na ukośnym rejach. Słabszy od masztu z wiatrem, ale prawie nie traci mocy pod wiatr.' },
  oars: { name: 'Wiosła', cat: 'drive', cost: 10, mass: 1, buoy: 1, hp: 12, rule: 'side', q: true, pitch: 1.1, tag: 'Tylko burta',
    desc: 'Napęd niezależny od wiatru i lepsza zwrotność. Tylko na lewej lub prawej burcie.' },
  paddle: { name: 'Koło łopatkowe', cat: 'drive', cost: 30, mass: 4, buoy: 0, hp: 18, rule: 'side', q: true, pitch: 0.8, tag: 'Mocny napęd, burta',
    desc: 'Wielkie koło z łopatami. Pcha okręt niezależnie od wiatru i pomaga w skręcie. Tylko na burcie.' },
  rudder: { name: 'Ster', cat: 'drive', cost: 12, mass: 2, buoy: 0, hp: 18, rule: 'stern', q: true, pitch: 1.0, tag: 'Tylko rufa',
    desc: 'Mocno poprawia skręcanie w ruchu. Tylko na rufie - za nim musi być woda.' },
  steam: { name: 'Kocioł parowy', cat: 'drive', cost: 44, mass: 6, buoy: 0, hp: 24, q: true, pitch: 0.6, tag: 'Napęd bez wiatru',
    desc: 'Para pcha okręt niezależnie od wiatru. Ciężki - i wybucha, gdy zostanie zniszczony!' },
  // ---------- sprzęt ----------
  keg: { name: 'Prochownia', cat: 'gear', cost: 12, mass: 2, buoy: 0, hp: 10, q: true, pitch: 0.9, tag: 'Szybsze działa',
    desc: 'Sąsiednie działa ładują się o 40% szybciej. Uwaga: wybucha, gdy zostanie trafiona!' },
  armory: { name: 'Zbrojownia', cat: 'gear', cost: 26, mass: 2, buoy: 0, hp: 14, q: true, pitch: 0.95, tag: '+25% obrażeń',
    desc: 'Lepsze kule i proch: sąsiednie działa zadają o 25% więcej obrażeń (więcej przy lepszej jakości).' },
  drum: { name: 'Bęben bojowy', cat: 'gear', cost: 22, mass: 2, buoy: 0, hp: 12, q: true, pitch: 0.75, tag: 'Szybsze ładowanie',
    desc: 'Wybija rytm dla załóg dział w promieniu dwóch kafli: ładują się szybciej, a to się kumuluje z prochownią.' },
  carp: { name: 'Cieśla', cat: 'gear', cost: 18, mass: 2, buoy: 0, hp: 16, q: true, pitch: 1.3, tag: 'Naprawy',
    desc: 'Naprawia sąsiednie części i gasi pożary na pokładzie.' },
  pump: { name: 'Pompa pożarnicza', cat: 'gear', cost: 18, mass: 2, buoy: 0, hp: 14, q: true, pitch: 1.15, tag: 'Chroni przed ogniem',
    desc: 'Zraszacz: części w promieniu dwóch kafli nie zapalają się, a płonące gasną od razu.' },
  shield: { name: 'Tarcza burtowa', cat: 'gear', cost: 28, mass: 3, buoy: 0, hp: 30, q: true, pitch: 0.7, tag: '-20% obrażeń obok',
    desc: 'Pancerna płyta osłaniająca sąsiednie części: otrzymują o 20% mniej obrażeń (więcej przy lepszej jakości).' },
  nest: { name: 'Bocianie gniazdo', cat: 'gear', cost: 24, mass: 1, buoy: 0, hp: 12, q: true, pitch: 1.25, tag: '+12% zasięgu',
    desc: 'Obserwator wypatruje celów: każde gniazdo daje +12% zasięgu wszystkich dział (najwyżej dwa).' },
  crane: { name: 'Żuraw ładunkowy', cat: 'gear', cost: 20, mass: 3, buoy: 1, hp: 14, pitch: 1.15, tag: '+12 ładowni',
    desc: 'Większa ładownia (+12 miejsc, najwyżej dwa żurawie), a łupy wyławiasz z dalszej odległości.' },
  magnet: { name: 'Magnes łupów', cat: 'gear', cost: 32, mass: 3, buoy: 0, hp: 16, q: true, pitch: 0.85, tag: 'Przyciąga łupy',
    desc: 'Potężny magnes wyławia dryfujące złoto i skrzynie z odległości kilkudziesięciu kroków.' },
  // ---------- relikwie: tylko ze zdarzeń specjalnych ----------
  kraken: { name: 'Ząb Krakena', cat: 'relic', cost: 160, mass: 2, buoy: 1, hp: 50, relic: true, noShop: true, pitch: 0.5, tag: 'Relikwia',
    desc: 'Trofeum z potwora. Taran i zderzenia ranią o 60% mocniej, a Ty dostajesz o 30% mniej. Fioletowy kadłub.' },
  lantern: { name: 'Latarnia Widma', cat: 'relic', cost: 160, mass: 0, buoy: 1, hp: 40, relic: true, noShop: true, pitch: 1.4, tag: 'Relikwia',
    desc: 'Okręt nie płonie, a co siódma kula wroga przelatuje przez niego jak przez mgłę. Upiorne żagle.' },
  figure: { name: 'Złota Syrena', cat: 'relic', cost: 160, mass: 1, buoy: 1, hp: 44, rule: 'bow', relic: true, noShop: true, pitch: 1.2, tag: 'Relikwia',
    desc: 'Figura dziobowa zwycięzcy regat: +12% prędkości i +25% złota z morza. Złote relingi.' },
  dread: { name: 'Czarna Bandera', cat: 'relic', cost: 160, mass: 0, buoy: 1, hp: 40, relic: true, noShop: true, pitch: 0.8, tag: 'Relikwia',
    desc: 'Bandera pirackiego admirała: +20% obrażeń, a piraci nie atakują Cię pierwsi. Czarne żagle.' },
  storm: { name: 'Butelka Burzy', cat: 'relic', cost: 160, mass: 0, buoy: 1, hp: 40, relic: true, noShop: true, pitch: 1.1, tag: 'Relikwia',
    desc: 'Uwięziony sztorm. Żagle zawsze łapią wiatr, a pioruny Cię omijają. Burzowe żagle.' },
  pearl: { name: 'Perła Głębin', cat: 'relic', cost: 160, mass: 0, buoy: 2, hp: 40, relic: true, noShop: true, pitch: 1.3, tag: 'Relikwia',
    desc: 'Skarb z oka wiru. Okręt sam się naprawia - szybko poza walką, powoli w boju. Perłowy blask.' }
};
// zakładki stoczni (sklep) - kolejność taka jak w YTABS; zakładka ładowni dochodzi z klienta
const CATS = [
  { id: 'hull', name: 'KADŁUB', parts: ['hull', 'bamboo', 'oak', 'mahog', 'iron', 'thorn', 'steel', 'ghostw'] },
  { id: 'weapon', name: 'DZIAŁA', parts: ['cannon', 'longgun', 'carro', 'firegun', 'chain', 'bombard', 'ballista'] },
  { id: 'special', name: 'MACHINY', parts: ['swivel', 'turret', 'tesla', 'rocket', 'flame', 'harpoon', 'mortar', 'mines', 'ram'] },
  { id: 'drive', name: 'NAPĘD', parts: ['mast', 'jib', 'lateen', 'oars', 'paddle', 'rudder', 'steam'] },
  { id: 'gear', name: 'SPRZĘT', parts: ['keg', 'armory', 'drum', 'carp', 'pump', 'shield', 'nest', 'crane', 'magnet'] }
];
const RELICS = ['kraken', 'lantern', 'figure', 'dread', 'storm', 'pearl'];
const isRelic = p => !!(PARTS[p] && PARTS[p].relic);
// element stawiany na kadłubie (wszystko poza materiałami kadłuba i kajutą)
const isMount = p => !!PARTS[p] && PARTS[p].cat !== 'hull' && PARTS[p].cat !== 'core';
const RULE_MSG = {
  edge: 'Działo potrzebuje otwartej wody obok',
  side: 'Tylko na lewej lub prawej burcie',
  stern: 'Tylko na rufie - z tyłu musi być woda',
  bow: 'Tylko na dziobie - z przodu musi być woda'
};
const NEED_HULL_MSG = 'Najpierw postaw kadłub - działa i sprzęt stawia się na nim';
const RULE_TAG = { edge: 'PRZY WODZIE', side: 'BURTA', stern: 'RUFA', bow: 'DZIÓB' };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- przedmioty ----------
const hasQ = p => !!PARTS[p].q;
function itemKey(p, q) { return p + ':' + (q | 0); }
function itemValue(p, q) { return Math.round(PARTS[p].cost * (hasQ(p) ? QUAL[q | 0].cost : 1)); }
function sellValue(p, q) { return Math.max(1, Math.floor(itemValue(p, q) * 0.5)); }
function itemName(p, q) { return PARTS[p].name + (hasQ(p) && q ? ' (' + QUAL[q].name.toLowerCase() + ')' : ''); }
function partHp(p, q) { return Math.round(PARTS[p].hp * (hasQ(p) ? QUAL[q | 0].hp : 1)); }
// kafel = { p, q } (sam kadłub albo kajuta) albo { p, q, h } (element p na kadłubie h)
const baseOf = cl => cl.h || cl.p;
const mounted = cl => !!(cl && cl.h && cl.h !== cl.p);
function cellValue(cl) { return itemValue(cl.p, cl.q) + (mounted(cl) ? itemValue(cl.h, 0) : 0); }
function cellHp(cl) { return partHp(cl.p, cl.q) + (mounted(cl) ? partHp(cl.h, 0) : 0); }
function cellStr(cl) {
  let s = cl.q ? cl.p + ':' + cl.q : cl.p;
  if (mounted(cl)) s += '@' + cl.h;
  return s;
}
function cellParse(s) {
  if (!s || typeof s !== 'string') return null;
  const at = s.indexOf('@'), top = at < 0 ? s : s.slice(0, at), i = top.indexOf(':'), p = i < 0 ? top : top.slice(0, i);
  if (!Object.prototype.hasOwnProperty.call(PARTS, p)) return null;
  const q = i < 0 ? 0 : clamp(parseInt(top.slice(i + 1), 10) || 0, 0, QUAL.length - 1);
  if (!isMount(p)) return { p, q: 0 };
  const h = at < 0 ? 'hull' : s.slice(at + 1);
  return { p, q: hasQ(p) ? q : 0, h: PARTS[h] && PARTS[h].cat === 'hull' ? h : 'hull' };
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

// ---------- zlecenia portowe ----------
const CT_TYPES = ['npc', 'bar', 'gold', 'port'];

// ---------- siła okrętu ----------
const POWER_TIERS = [
  { min: 0, name: 'Płotka', col: '#c0cbdc' },
  { min: 25, name: 'Rekinek', col: '#63c74d' },
  { min: 55, name: 'Barakuda', col: '#2a9df0' },
  { min: 100, name: 'Rekin', col: '#b55088' },
  { min: 170, name: 'Kraken', col: '#f77622' },
  { min: 280, name: 'Lewiatan', col: '#e43b44' },
  { min: 450, name: 'Władca Mórz', col: '#fee761' }
];
function powerTier(pw) { let t = 0; for (let i = 0; i < POWER_TIERS.length; i++) if (pw >= POWER_TIERS[i].min) t = i; return t; }

// ---------- nazwy ----------
const PORT_NAMES = ['Port Mewa', 'Przystań Dorsza', 'Zatoka Przemytników', 'Fort Rdzawy', 'Wyspa Wisielców', 'Ostatnia Przystań', 'Kamienna Keja', 'Zatoka Kłamców',
  'Zatoka Szkwału', 'Latarnia Wdów', 'Port Złamanych Masztów', 'Przylądek Mgieł'];
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
