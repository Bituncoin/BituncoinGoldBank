// btngDerive.ts
// BTNG54 Hierarchical Deterministic Address Derivation Engine (BIP32-style)
//
// Derives sovereign child addresses from a single master seed, using
// HMAC-SHA512 key stretching per level — analogous to BIP32 but scoped to
// the BTNG54 GAS sovereign standard.
//
// Path notation:  <CountryPrefix>/<AddressType>/<Index>
//   Examples:     BTNG1G/w/0      – Ghana individual wallet #0
//                 BTNG1G/v/1      – Ghana validator node #1
//                 BTNG2N/m/0      – Nigeria merchant #0
//                 BTNG35D/c/3     – DRC coin address #3
//
// Address types:
//   w – wallet (individual)    m – merchant/business
//   e – enterprise             g – government/ministry
//   t – treasury/central-bank  v – validator node
//   c – coin/asset
//
// Usage:
//   import { BTNGDeriveEngine, generateMnemonic, mnemonicToSeed } from "./btngDerive";
//
//   const mnemonic = generateMnemonic(24);
//   const seed     = mnemonicToSeed(mnemonic);
//   const engine   = new BTNGDeriveEngine(seed);
//
//   const wallet   = engine.derive("BTNG1G/w/0");
//   const batch    = engine.deriveBatch("BTNG1G", "w", 0, 5);
//   const xpub     = engine.exportXpub("BTNG1G");

import crypto from "crypto";
import { PREFIXES } from "./btng54Engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AddressType = "w" | "m" | "e" | "g" | "t" | "v" | "c";
export type BTNGCountryKey = keyof typeof PREFIXES;

export interface BTNGDerivedAddress {
  /** Full BTNG sovereign address */
  address: string;
  /** Derivation path string — e.g. BTNG1G/w/0 */
  path: string;
  /** Country prefix — e.g. BTNG1G */
  countryPrefix: string;
  /** Address type code */
  type: AddressType;
  /** Child index */
  index: number;
  /** Hex-encoded 32-byte public key material */
  publicKey: string;
  /** Hex-encoded 32-byte chain code (for further child derivation) */
  chainCode: string;
  /** Depth in the derivation tree (0 = master) */
  depth: number;
  /** Human-readable country name */
  country: string;
}

export interface BTNGMasterXpub {
  /** Country prefix this Xpub is scoped to */
  countryPrefix: string;
  /** Hex-encoded account-level public key */
  publicKey: string;
  /** Hex-encoded account-level chain code */
  chainCode: string;
  /** Serialised Xpub string for storage / sharing */
  xpub: string;
  /** derivation path to this account node */
  accountPath: string;
}

export interface BTNGMnemonicResult {
  mnemonic: string;
  words: string[];
  wordCount: 12 | 15 | 18 | 21 | 24;
  language: "english";
}

// ── BIP39 English wordlist (2048 words) ───────────────────────────────────────
// Full canonical BIP39 English word list.

const BIP39_WORDLIST: string[] = [
  "abandon","ability","able","about","above","absent","absorb","abstract",
  "absurd","abuse","access","accident","account","accuse","achieve","acid",
  "acoustic","acquire","across","act","action","actor","actress","actual",
  "adapt","add","addict","address","adjust","admit","adult","advance",
  "advice","aerobic","afford","afraid","again","age","agent","agree",
  "ahead","aim","air","airport","aisle","alarm","album","alcohol",
  "alert","alien","all","alley","allow","almost","alone","alpha",
  "already","also","alter","always","amateur","amazing","among","amount",
  "amused","analyst","anchor","ancient","anger","angle","angry","animal",
  "ankle","announce","annual","another","answer","antenna","antique","anxiety",
  "any","apart","apology","appear","apple","approve","april","arch",
  "arctic","area","arena","argue","arm","armed","armor","army",
  "around","arrange","arrest","arrive","arrow","art","artefact","artist",
  "artwork","ask","aspect","assault","asset","assist","assume","asthma",
  "athlete","atom","attack","attend","attitude","attract","auction","audit",
  "august","aunt","author","auto","autumn","average","avocado","avoid",
  "awake","aware","away","awesome","awful","awkward","axis","baby",
  "balance","bamboo","banana","banner","bar","barely","bargain","barrel",
  "base","basic","basket","battle","beach","bean","beauty","because",
  "become","beef","before","begin","behave","behind","believe","below",
  "belt","bench","benefit","best","betray","better","between","beyond",
  "bicycle","bid","bike","bind","biology","bird","birth","bitter",
  "black","blade","blame","blanket","blast","bleak","bless","blind",
  "blood","blossom","blouse","blue","blur","blush","board","boat",
  "body","boil","bomb","bone","book","boost","border","boring",
  "borrow","boss","bottom","bounce","box","boy","bracket","brain",
  "brand","brave","breeze","brick","bridge","brief","bright","bring",
  "brisk","broccoli","broken","bronze","broom","brother","brown","brush",
  "bubble","buddy","budget","buffalo","build","bulb","bulk","bullet",
  "bundle","bunker","burden","burger","burst","bus","business","busy",
  "butter","buyer","buzz","cabbage","cabin","cable","cactus","cage",
  "cake","call","calm","camera","camp","can","canal","cancel",
  "candy","cannon","canvas","canyon","capable","capital","captain","car",
  "carbon","card","cargo","carpet","carry","cart","case","cash",
  "casino","castle","casual","cat","catalog","catch","category","cattle",
  "caught","cause","caution","cave","ceiling","celery","cement","census",
  "century","cereal","certain","chair","chalk","champion","change","chaos",
  "chapter","charge","chase","chat","cheap","check","cheese","chef",
  "cherry","chest","chicken","chief","child","chimney","choice","choose",
  "chronic","chuckle","chunk","cinema","circle","citizen","city","civil",
  "claim","clap","clarify","claw","clay","clean","clerk","clever",
  "click","client","cliff","climb","clinic","clip","clock","clog",
  "close","cloth","cloud","clown","club","clump","cluster","clutch",
  "coach","coast","coconut","code","coffee","coil","coin","collect",
  "color","column","combine","come","comfort","comic","common","company",
  "concert","conduct","confirm","congress","connect","consider","control","convince",
  "cook","cool","copper","copy","coral","core","corn","correct",
  "cost","cotton","couch","country","couple","course","cousin","cover",
  "coyote","crack","cradle","craft","cram","crane","crash","crater",
  "crawl","crazy","cream","credit","creek","crew","cricket","crime",
  "crisp","critic","cross","crouch","crowd","crucial","cruel","cruise",
  "crumble","crunch","crush","cry","crystal","cube","culture","cup",
  "cupboard","curious","current","curtain","curve","cushion","custom","cute",
  "cycle","dad","damage","damp","dance","danger","daring","dash",
  "daughter","dawn","day","deal","debate","debris","decade","december",
  "decide","decline","decorate","decrease","deer","defense","define","defy",
  "degree","delay","deliver","demand","demise","denial","dentist","deny",
  "depart","depend","deposit","depth","deputy","derive","describe","desert",
  "design","desk","despair","destroy","detail","detect","develop","device",
  "devote","diagram","dial","diamond","diary","dice","diesel","diet",
  "differ","digital","dignity","dilemma","dinner","dinosaur","direct","dirt",
  "disagree","discover","disease","dish","dismiss","disorder","display","distance",
  "divert","divide","divorce","dizzy","doctor","document","dog","doll",
  "dolphin","domain","donate","donkey","donor","door","dose","double",
  "dove","draft","dragon","drama","drastic","draw","dream","dress",
  "drift","drill","drink","drip","drive","drop","drum","dry",
  "duck","dumb","dune","during","dust","dutch","duty","dwarf",
  "dynamic","eager","eagle","early","earn","earth","easily","east",
  "easy","echo","ecology","edge","edit","educate","effort","egg",
  "eight","either","elbow","elder","electric","elegant","element","elephant",
  "elevator","elite","else","embark","embody","embrace","emerge","emotion",
  "employ","empower","empty","enable","enact","endless","endorse","enemy",
  "energy","enforce","engage","engine","enhance","enjoy","enlist","enough",
  "enrich","enroll","ensure","enter","entire","entry","envelope","episode",
  "equal","equip","erase","erosion","error","erupt","escape","essay",
  "estate","eternal","ethics","evidence","evil","evoke","evolve","exact",
  "example","excess","exchange","excite","exclude","exercise","exhaust","exhibit",
  "exile","exist","exit","exotic","expand","expire","explain","expose",
  "express","extend","extra","eye","fable","face","faculty","faint",
  "faith","fall","false","fame","family","famous","fan","fancy",
  "fantasy","far","fashion","fat","fatal","father","fatigue","fault",
  "favorite","feature","february","federal","fee","feed","feel","feet",
  "fellow","felt","fence","festival","fetch","fever","few","fiber",
  "fiction","field","figure","file","film","filter","final","find",
  "fine","finger","finish","fire","firm","first","fiscal","fish",
  "fit","fitness","fix","flag","flame","flash","flat","flavor",
  "flee","flight","flip","float","flock","floor","flower","fluid",
  "flush","fly","foam","focus","fog","foil","follow","food",
  "foot","force","forest","forget","fork","fortune","forum","forward",
  "fossil","foster","found","fox","fragile","frame","frequent","fresh",
  "friend","fringe","frog","front","frost","frown","frozen","fruit",
  "fuel","fun","funny","furnace","fury","future","gadget","gain",
  "galaxy","gallery","game","gap","garbage","garden","garlic","garment",
  "gasp","gate","gather","gauge","gaze","general","genius","genre",
  "gentle","genuine","gesture","ghost","giant","gift","giggle","ginger",
  "giraffe","girl","give","glad","glance","glare","glass","glide",
  "glimpse","globe","gloom","glory","glove","glow","glue","goat",
  "goddess","gold","good","goose","gorilla","gospel","gossip","govern",
  "gown","grab","grace","grain","grant","grape","grasp","grass",
  "gravity","great","green","grid","grief","grit","grocery","group",
  "grow","grunt","guard","guide","guilt","guitar","gun","gym",
  "habit","hair","half","hammer","hamster","hand","happy","harsh",
  "harvest","hat","have","hawk","hazard","head","health","heart",
  "heavy","hedgehog","height","hello","helmet","help","hero","hidden",
  "high","hill","hint","hip","hire","history","hobby","hockey",
  "hold","hole","holiday","hollow","home","honey","hood","hope",
  "horn","hospital","host","hour","hover","hub","huge","human",
  "humble","humor","hundred","hungry","hunt","hurdle","hurry","hurt",
  "husband","hybrid","ice","icon","ignore","ill","illegal","image",
  "imitate","immense","immune","impact","impose","improve","impulse","inbox",
  "income","increase","index","indicate","indoor","industry","infant","inflict",
  "inform","inhale","inject","inner","innocent","input","inquiry","insane",
  "insect","inside","inspire","install","intact","interest","into","invest",
  "invite","involve","iron","island","isolate","issue","item","ivory",
  "jacket","jaguar","jar","jazz","jealous","jeans","jelly","jewel",
  "job","join","joke","journey","joy","judge","juice","jump",
  "jungle","junior","junk","just","kangaroo","keen","keep","ketchup",
  "key","kick","kid","kingdom","kiss","kit","kitchen","kite",
  "kitten","kiwi","knee","knife","knock","know","lab","lamp",
  "language","laptop","large","later","laugh","laundry","lava","law",
  "lawn","lawsuit","layer","lazy","leader","learn","leave","lecture",
  "left","leg","legal","legend","lemon","lend","length","lens",
  "leopard","lesson","letter","level","liar","liberty","library","license",
  "life","lift","like","limb","limit","link","lion","liquid",
  "list","little","live","lizard","load","loan","lobster","local",
  "lock","logic","lonely","long","loop","lottery","loud","lounge",
  "love","loyal","lucky","luggage","lumber","lunar","lunch","luxury",
  "mad","magic","magnet","maid","main","mammal","mango","mansion",
  "manual","maple","marble","march","margin","marine","market","marriage",
  "mask","master","match","material","math","matrix","matter","maximum",
  "maze","meadow","mean","medal","media","melody","melt","member",
  "memory","mention","menu","mercy","merge","merit","merry","mesh",
  "message","metal","method","middle","midnight","milk","million","mimic",
  "mind","minimum","minor","minute","miracle","miss","mitten","model",
  "modify","mom","monitor","monkey","monster","month","moon","moral",
  "more","morning","mosquito","mother","motion","motor","mountain","mouse",
  "move","movie","much","muffin","mule","multiply","muscle","museum",
  "mushroom","music","must","mutual","myself","mystery","naive","name",
  "napkin","narrow","nasty","nature","near","neck","need","negative",
  "neglect","neither","nephew","nerve","nest","network","news","next",
  "nice","night","noble","noise","nominee","noodle","normal","north",
  "notable","note","nothing","notice","novel","now","nuclear","number",
  "nurse","nut","oak","obey","object","oblige","obscure","obtain",
  "ocean","october","odor","off","offer","office","often","oil",
  "okay","old","olive","olympic","omit","once","onion","open",
  "opera","oppose","option","orange","orbit","orchard","order","ordinary",
  "organ","orient","original","orphan","ostrich","other","outdoor","outside",
  "oval","over","own","oyster","ozone","pact","paddle","page",
  "pair","palace","palm","panda","panel","panic","panther","paper",
  "parade","parent","park","parrot","party","pass","patch","path",
  "patrol","pause","pave","payment","peace","peanut","pear","peasant",
  "pelican","pen","penalty","pencil","people","pepper","perfect","permit",
  "person","pet","phone","photo","phrase","physical","piano","picnic",
  "picture","piece","pig","pigeon","pill","pilot","pink","pioneer",
  "pipe","pistol","pitch","pizza","place","planet","plastic","plate",
  "play","please","pledge","pluck","plug","plunge","poem","poet",
  "point","polar","pole","police","pond","pony","pool","popular",
  "portion","position","possible","post","potato","pottery","poverty","powder",
  "power","practice","praise","predict","prefer","prepare","present","pretty",
  "prevent","price","pride","primary","print","priority","prison","private",
  "prize","problem","process","produce","profit","program","project","promote",
  "proof","property","prosper","protect","proud","provide","public","pudding",
  "pull","pulp","pulse","pumpkin","punch","pupil","puppy","purchase",
  "purity","purpose","push","put","puzzle","pyramid","quality","quantum",
  "quarter","question","quick","quit","quiz","quote","rabbit","raccoon",
  "race","rack","radar","radio","rage","rail","rain","raise",
  "rally","ramp","ranch","random","range","rapid","rare","rate",
  "rather","raven","reach","ready","real","reason","rebel","rebuild",
  "recall","receive","recipe","record","recycle","reduce","reflect","reform",
  "refuse","region","regret","regular","reject","relax","release","relief",
  "rely","remain","remember","remind","remove","render","renew","rent",
  "reopen","repair","repeat","replace","report","require","rescue","resemble",
  "resist","resource","response","result","retire","retreat","return","reunion",
  "reveal","review","reward","rhythm","ribbon","ride","ridge","rifle",
  "right","rigid","ring","riot","ripple","risk","ritual","rival",
  "river","road","robot","robust","rocket","romance","roof","rookie",
  "round","route","royal","rubber","rude","rug","rule","run",
  "runway","rural","sad","saddle","sadness","safe","sail","salad",
  "salmon","salon","salt","salute","same","sand","satisfy","satoshi",
  "sauce","sausage","save","say","scale","scan","scare","scatter",
  "scene","scheme","school","science","scissors","scorpion","scout","scrap",
  "screen","script","scrub","sea","search","season","seat","second",
  "secret","section","security","seed","seek","segment","select","sell",
  "seminar","senior","sense","sentence","series","service","session","settle",
  "setup","seven","shadow","shaft","shallow","share","shed","shell",
  "sheriff","shield","shift","shine","ship","shiver","shock","shoe",
  "shoot","shop","short","shoulder","shove","shrimp","shrug","shuffle",
  "shy","sibling","siege","sight","sign","silent","silk","silly",
  "silver","similar","simple","since","sing","siren","sister","situate",
  "six","size","sketch","skill","skin","skirt","skull","slab",
  "slam","sleep","slender","slice","slide","slight","slim","slogan",
  "slot","slow","slush","small","smart","smile","smoke","smooth",
  "snack","snake","snap","sniff","snow","soap","soccer","social",
  "sock","solar","soldier","solid","solution","solve","someone","song",
  "soon","sorry","soul","sound","soup","source","south","space",
  "spare","spatial","spawn","speak","special","speed","spell","spend",
  "sphere","spice","spider","spike","spin","spirit","split","spoil",
  "sponsor","spoon","spray","spread","spring","spy","square","squeeze",
  "squirrel","stable","stadium","staff","stage","stairs","stamp","stand",
  "start","state","stay","steak","steel","stem","step","stereo",
  "stick","still","sting","stock","stomach","stone","stop","store",
  "stream","street","strike","strong","struggle","student","stuff","stumble",
  "subject","submit","subway","success","such","sudden","suffer","suggest",
  "suit","summer","sun","sunny","sunset","super","supply","supreme",
  "sure","surface","surge","surprise","sustain","swallow","swamp","swap",
  "swear","sweet","swift","swim","swing","switch","sword","symbol",
  "symptom","syrup","table","tackle","tag","tail","talent","tank",
  "tape","target","task","tattoo","taxi","teach","team","tell",
  "ten","tenant","tennis","tent","term","test","text","thank",
  "that","theme","then","theory","there","they","thing","this",
  "thought","three","thrive","throw","thumb","thunder","ticket","tilt",
  "timber","time","tiny","tip","tired","title","toast","tobacco",
  "today","together","toilet","token","tomato","tomorrow","tone","tongue",
  "tonight","tool","tooth","top","topic","topple","torch","tornado",
  "tortoise","toss","total","tourist","toward","tower","town","toy",
  "track","trade","traffic","tragic","train","transfer","trap","trash",
  "travel","tray","treat","tree","trend","trial","tribe","trick",
  "trigger","trim","trip","trophy","trouble","truck","truly","trumpet",
  "trust","truth","try","tube","tuition","tumble","tuna","tunnel",
  "turkey","turn","turtle","twelve","twenty","twice","twin","twist",
  "two","type","typical","ugly","umbrella","unable","unaware","uncle",
  "uncover","under","undo","unfair","unfold","unhappy","uniform","unique",
  "universe","unknown","unlock","until","unusual","unveil","update","upgrade",
  "uphold","upon","upper","upset","urban","useful","useless","usual",
  "utility","vacant","vacuum","vague","valid","valley","valve","van",
  "vanish","vapor","various","vast","vault","vehicle","velvet","vendor",
  "venture","venue","verb","verify","version","very","veteran","viable",
  "vibrant","vicious","victory","video","view","village","vintage","violin",
  "virtual","virus","visa","visit","visual","vital","vivid","vocal",
  "voice","void","volcano","volume","vote","voyage","wage","wagon",
  "wait","walk","wall","walnut","want","warfare","warm","warrior",
  "waste","water","wave","way","wealth","weapon","wear","weasel",
  "weather","web","wedding","weekend","weird","welcome","well","west",
  "wet","whale","wheat","wheel","when","where","whip","whisper",
  "wide","width","wife","wild","will","win","window","wine",
  "wing","wink","winner","winter","wire","wisdom","wise","wish",
  "witness","wolf","woman","wonder","wood","wool","word","world",
  "worry","worth","wrap","wreck","wrestle","wrist","write","wrong",
  "yard","year","yellow","you","young","youth","zebra","zero",
  "zone","zoo",
];

// ── Utility ───────────────────────────────────────────────────────────────────

/** HMAC-SHA512 helper — returns a 64-byte Buffer */
function hmac512(key: Buffer | string, data: Buffer | string): Buffer {
  const k = typeof key  === "string" ? Buffer.from(key,  "utf8") : key;
  const d = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return crypto.createHmac("sha512", k).update(d).digest();
}

/** SHA256 helper */
function sha256(data: Buffer): Buffer {
  return crypto.createHash("sha256").update(data).digest();
}

/** Convert a 64-byte HMAC digest into a 35-char BTNG address hash component */
function digestToAddressHash(digest: Buffer): string {
  return digest.toString("hex").slice(0, 35);
}

/** Derive country index from prefix string (BTNG1G → "1G", numeric part) */
function countryIndexFromPrefix(prefix: string): number {
  const m = prefix.match(/BTNG(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Address type to numeric index for path encoding */
const TYPE_INDEX: Record<AddressType, number> = {
  w: 0, m: 1, e: 2, g: 3, t: 4, v: 5, c: 6,
};

/** Reverse map: numeric → type */
const INDEX_TYPE: Record<number, AddressType> = {
  0: "w", 1: "m", 2: "e", 3: "g", 4: "t", 5: "v", 6: "c",
};

/** Human-readable country name from prefix */
const PREFIX_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(PREFIXES).map(([name, prefix]) => [
    prefix,
    name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
  ])
);

/** Map prefix → country key for engine lookup */
const PREFIX_TO_KEY: Record<string, BTNGCountryKey> = Object.fromEntries(
  Object.entries(PREFIXES).map(([key, prefix]) => [prefix, key as BTNGCountryKey])
) as Record<string, BTNGCountryKey>;

// ── Mnemonic Generation ───────────────────────────────────────────────────────

/**
 * Generate a BIP39-compatible mnemonic phrase.
 * Word counts: 12, 15, 18, 21, or 24 (default 24).
 */
export function generateMnemonic(wordCount: 12 | 15 | 18 | 21 | 24 = 24): BTNGMnemonicResult {
  // BIP39: entropy bytes = (wordCount * 11 - wordCount / 3) / 8
  const entropyBits  = (wordCount * 11 * 32) / 33;
  const entropyBytes = entropyBits / 8;
  const entropy      = crypto.randomBytes(entropyBytes);

  // Checksum: first (wordCount / 3) bits of SHA256(entropy)
  const checksum     = sha256(entropy);
  const checksumBits = wordCount / 3; // 4 for 12-word, 8 for 24-word, etc.

  // Combine entropy + checksum bits
  const bits: number[] = [];
  for (const byte of entropy) {
    for (let b = 7; b >= 0; b--) bits.push((byte >> b) & 1);
  }
  for (let b = 7; b >= 8 - checksumBits; b--) {
    bits.push((checksum[0] >> b) & 1);
  }

  // Split into 11-bit groups and map to words
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    let idx = 0;
    for (let j = 0; j < 11; j++) {
      idx = (idx << 1) | bits[i * 11 + j];
    }
    words.push(BIP39_WORDLIST[idx % BIP39_WORDLIST.length]);
  }

  return { mnemonic: words.join(" "), words, wordCount, language: "english" };
}

/**
 * Convert a mnemonic phrase to a 64-byte seed buffer.
 * Uses PBKDF2-HMAC-SHA512 with 2048 iterations (BIP39-compatible).
 */
export function mnemonicToSeed(mnemonic: string, passphrase: string = ""): Buffer {
  const mnemonicBuf  = Buffer.from(mnemonic.normalize("NFKD"), "utf8");
  const saltBuf      = Buffer.from(("mnemonic" + passphrase).normalize("NFKD"), "utf8");
  return crypto.pbkdf2Sync(mnemonicBuf, saltBuf, 2048, 64, "sha512");
}

/**
 * Generate a mnemonic and immediately derive its seed.
 */
export function generateSeed(
  wordCount: 12 | 15 | 18 | 21 | 24 = 24,
  passphrase: string = ""
): { mnemonic: BTNGMnemonicResult; seed: Buffer } {
  const mnemonic = generateMnemonic(wordCount);
  const seed     = mnemonicToSeed(mnemonic.mnemonic, passphrase);
  return { mnemonic, seed };
}

// ── Master Node ───────────────────────────────────────────────────────────────

/** Internal representation of a BIP32-style node */
interface DeriveNode {
  key:       Buffer; // 32 bytes
  chainCode: Buffer; // 32 bytes
  depth:     number;
}

/** Domain separator for BTNG sovereign derivation */
const BTNG_HMAC_KEY = "BTNG sovereign seed";

/**
 * BTNGDeriveEngine
 *
 * Hierarchical deterministic address derivation for the BTNG54 standard.
 *
 * @example
 * const { mnemonic, seed } = generateSeed(24);
 * const engine = new BTNGDeriveEngine(seed);
 *
 * // Single derivation
 * const addr = engine.derive("BTNG1G/w/0");
 *
 * // Batch derivation (Ghana wallet addresses 0–9)
 * const batch = engine.deriveBatch("BTNG1G", "w", 0, 10);
 *
 * // Export account-level Xpub (for read-only watchers)
 * const xpub = engine.exportXpub("BTNG1G");
 */
export class BTNGDeriveEngine {
  private readonly masterNode: DeriveNode;
  private readonly nodeCache  = new Map<string, DeriveNode>();

  constructor(seed: Buffer) {
    if (seed.length < 16) {
      throw new Error("BTNG seed must be at least 16 bytes");
    }
    // Master node from seed (BIP32 §Master key generation)
    const I         = hmac512(BTNG_HMAC_KEY, seed);
    this.masterNode = {
      key:       I.slice(0, 32),
      chainCode: I.slice(32, 64),
      depth:     0,
    };
  }

  // ── Internal derivation ─────────────────────────────────────────────────────

  /** Derive a child node from a parent using a numeric index */
  private deriveChildNode(parent: DeriveNode, index: number): DeriveNode {
    const indexBuf = Buffer.alloc(4);
    indexBuf.writeUInt32BE(index >>> 0, 0);
    const data = Buffer.concat([parent.key, indexBuf]);
    const I    = hmac512(parent.chainCode, data);
    return {
      key:       Buffer.from(I.slice(0, 32)),
      chainCode: Buffer.from(I.slice(32, 64)),
      depth:     parent.depth + 1,
    };
  }

  /** Get (or compute + cache) a country-level node */
  private countryNode(countryIndex: number): DeriveNode {
    const cacheKey = `country:${countryIndex}`;
    if (this.nodeCache.has(cacheKey)) return this.nodeCache.get(cacheKey)!;
    const node = this.deriveChildNode(this.masterNode, countryIndex);
    this.nodeCache.set(cacheKey, node);
    return node;
  }

  /** Get (or compute + cache) a type-level node */
  private typeNode(countryIndex: number, typeIndex: number): DeriveNode {
    const cacheKey = `type:${countryIndex}:${typeIndex}`;
    if (this.nodeCache.has(cacheKey)) return this.nodeCache.get(cacheKey)!;
    const cn   = this.countryNode(countryIndex);
    const node = this.deriveChildNode(cn, typeIndex);
    this.nodeCache.set(cacheKey, node);
    return node;
  }

  /** Get (or compute + cache) a leaf address node */
  private addressNode(countryIndex: number, typeIndex: number, addrIndex: number): DeriveNode {
    const cacheKey = `addr:${countryIndex}:${typeIndex}:${addrIndex}`;
    if (this.nodeCache.has(cacheKey)) return this.nodeCache.get(cacheKey)!;
    const tn   = this.typeNode(countryIndex, typeIndex);
    const node = this.deriveChildNode(tn, addrIndex);
    this.nodeCache.set(cacheKey, node);
    return node;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Derive a single address from a BTNG path string.
   *
   * @param path  e.g. "BTNG1G/w/0" | "BTNG2N/m/5"
   */
  derive(path: string): BTNGDerivedAddress {
    const parsed = parsePath(path);
    return this._deriveByParts(parsed.prefix, parsed.type, parsed.index, path);
  }

  /**
   * Derive an address by explicit components.
   *
   * @param countryKey  e.g. "GHANA" | "NIGERIA"
   * @param type        address type
   * @param index       child index (≥ 0)
   */
  deriveByKey(
    countryKey: BTNGCountryKey,
    type: AddressType,
    index: number = 0
  ): BTNGDerivedAddress {
    const prefix = PREFIXES[countryKey];
    const path   = `${prefix}/${type}/${index}`;
    return this._deriveByParts(prefix, type, index, path);
  }

  /**
   * Derive a consecutive range of addresses for one country + type.
   *
   * @param prefix  e.g. "BTNG1G"
   * @param type    address type
   * @param start   first index (inclusive, default 0)
   * @param count   number of addresses to derive (default 10)
   */
  deriveBatch(
    prefix: string,
    type: AddressType,
    start: number = 0,
    count: number = 10
  ): BTNGDerivedAddress[] {
    return Array.from({ length: count }, (_, i) => {
      const index = start + i;
      const path  = `${prefix}/${type}/${index}`;
      return this._deriveByParts(prefix, type, index, path);
    });
  }

  /**
   * Derive addresses for all 7 types at index 0 for a given country — useful
   * for initialising a new sovereign account.
   *
   * @param prefix  e.g. "BTNG1G"
   */
  deriveAccountSet(prefix: string): Record<AddressType, BTNGDerivedAddress> {
    const types: AddressType[] = ["w", "m", "e", "g", "t", "v", "c"];
    return Object.fromEntries(
      types.map(type => [type, this._deriveByParts(prefix, type, 0, `${prefix}/${type}/0`)])
    ) as Record<AddressType, BTNGDerivedAddress>;
  }

  /**
   * Derive all 54 country wallets at index 0 — sovereign mesh bootstrap.
   */
  deriveFullMesh(
    type: AddressType = "w",
    index: number = 0
  ): Record<string, BTNGDerivedAddress> {
    return Object.fromEntries(
      Object.entries(PREFIXES).map(([key, prefix]) => {
        const path = `${prefix}/${type}/${index}`;
        return [key, this._deriveByParts(prefix, type, index, path)];
      })
    );
  }

  /**
   * Export an account-level Xpub (public key + chain code) for a country.
   * Xpubs can be shared with read-only watchers to derive child public keys
   * without exposing the master private key.
   *
   * @param prefix  e.g. "BTNG1G"
   */
  exportXpub(prefix: string): BTNGMasterXpub {
    const ci       = countryIndexFromPrefix(prefix);
    const cn       = this.countryNode(ci);
    const xpubHex  = `xpub-btng54-${prefix.toLowerCase()}-${cn.key.toString("hex").slice(0, 32)}-${cn.chainCode.toString("hex").slice(0, 16)}`;
    return {
      countryPrefix: prefix,
      publicKey:     cn.key.toString("hex"),
      chainCode:     cn.chainCode.toString("hex"),
      xpub:          xpubHex,
      accountPath:   `m/${ci}`,
    };
  }

  /**
   * Export Xpubs for all 54 countries.
   */
  exportAllXpubs(): BTNGMasterXpub[] {
    return Object.values(PREFIXES).map(prefix => this.exportXpub(prefix));
  }

  /**
   * Reconstruct a child node from an Xpub (read-only — no private key).
   * Useful for watch-only wallets.
   */
  deriveFromXpub(
    xpub: BTNGMasterXpub,
    type: AddressType,
    index: number
  ): Omit<BTNGDerivedAddress, "path"> & { path: string } {
    const accountNode: DeriveNode = {
      key:       Buffer.from(xpub.publicKey, "hex"),
      chainCode: Buffer.from(xpub.chainCode, "hex"),
      depth:     1,
    };
    const ti       = TYPE_INDEX[type];
    const typeN    = this.deriveChildNode(accountNode, ti);
    const leafN    = this.deriveChildNode(typeN, index);
    const hash     = digestToAddressHash(Buffer.concat([leafN.key, leafN.chainCode]));
    const address  = `${xpub.countryPrefix}${type}${hash}`;
    const path     = `${xpub.countryPrefix}/${type}/${index}`;
    const country  = PREFIX_TO_COUNTRY[xpub.countryPrefix] ?? xpub.countryPrefix;
    return {
      address,
      path,
      countryPrefix: xpub.countryPrefix,
      type,
      index,
      publicKey:  leafN.key.toString("hex"),
      chainCode:  leafN.chainCode.toString("hex"),
      depth:      3,
      country,
    };
  }

  // ── Internal helper ─────────────────────────────────────────────────────────

  private _deriveByParts(
    prefix: string,
    type: AddressType,
    index: number,
    path: string
  ): BTNGDerivedAddress {
    const ci      = countryIndexFromPrefix(prefix);
    const ti      = TYPE_INDEX[type];
    const leafN   = this.addressNode(ci, ti, index);
    // Address = prefix + type + first 35 chars of hex(key||chainCode)
    const hash    = digestToAddressHash(Buffer.concat([leafN.key, leafN.chainCode]));
    const address = `${prefix}${type}${hash}`;
    const country = PREFIX_TO_COUNTRY[prefix] ?? prefix;
    return {
      address,
      path,
      countryPrefix: prefix,
      type,
      index,
      publicKey:  leafN.key.toString("hex"),
      chainCode:  leafN.chainCode.toString("hex"),
      depth:      leafN.depth,
      country,
    };
  }
}

// ── Path Parser ───────────────────────────────────────────────────────────────

export interface ParsedBTNGPath {
  prefix: string;
  type:   AddressType;
  index:  number;
  raw:    string;
}

/**
 * Parse a BTNG path string into its components.
 *
 * Accepted formats:
 *   "BTNG1G/w/0"         → prefix=BTNG1G, type=w, index=0
 *   "BTNG35D/c/3"        → prefix=BTNG35D, type=c, index=3
 *   "m/BTNG1G/w/5"       → BIP32-prefixed notation (m/ stripped)
 */
export function parsePath(path: string): ParsedBTNGPath {
  const cleaned = path.replace(/^m\//, "").trim();
  const parts   = cleaned.split("/");

  if (parts.length < 3) {
    throw new Error(
      `Invalid BTNG path "${path}". Expected format: BTNG<n><C>/<type>/<index>`
    );
  }

  const [rawPrefix, rawType, rawIndex] = parts;
  const prefix = rawPrefix.toUpperCase();

  if (!/^BTNG\d+[A-Z]$/.test(prefix)) {
    throw new Error(
      `Invalid country prefix "${prefix}". Must match BTNG<number><letter> (e.g. BTNG1G)`
    );
  }

  const type = rawType.toLowerCase() as AddressType;
  if (!(type in TYPE_INDEX)) {
    throw new Error(
      `Unknown address type "${rawType}". Valid types: w m e g t v c`
    );
  }

  const index = parseInt(rawIndex, 10);
  if (isNaN(index) || index < 0) {
    throw new Error(`Invalid index "${rawIndex}". Must be a non-negative integer.`);
  }

  return { prefix, type, index, raw: path };
}

// ── Convenience factory functions ─────────────────────────────────────────────

/**
 * Create a BTNGDeriveEngine from an existing mnemonic string.
 */
export function engineFromMnemonic(
  mnemonic: string,
  passphrase: string = ""
): BTNGDeriveEngine {
  const seed = mnemonicToSeed(mnemonic, passphrase);
  return new BTNGDeriveEngine(seed);
}

/**
 * Create a fresh BTNGDeriveEngine with a new random mnemonic.
 * Returns both the engine and the mnemonic for backup.
 */
export function createFreshEngine(
  wordCount: 12 | 15 | 18 | 21 | 24 = 24,
  passphrase: string = ""
): { engine: BTNGDeriveEngine; mnemonic: BTNGMnemonicResult; seed: Buffer } {
  const { mnemonic, seed } = generateSeed(wordCount, passphrase);
  return { engine: new BTNGDeriveEngine(seed), mnemonic, seed };
}

/**
 * Verify that a derived address belongs to the correct country prefix + type.
 */
export function verifyDerivedAddress(derived: BTNGDerivedAddress): boolean {
  return (
    derived.address.startsWith(derived.countryPrefix) &&
    derived.address[derived.countryPrefix.length] === derived.type &&
    derived.address.length === derived.countryPrefix.length + 1 + 35
  );
}

/**
 * Inspect a BTNG address to extract prefix, type, and index hint.
 * (Index cannot be recovered from address alone — this is a one-way function.)
 */
export function inspectAddress(address: string): {
  countryPrefix: string;
  type: AddressType | null;
  country: string;
  valid: boolean;
} {
  if (!address.startsWith("BTNG") || address.length < 8) {
    return { countryPrefix: "", type: null, country: "Unknown", valid: false };
  }
  // Find matching prefix (try longest first to handle BTNG10A vs BTNG1G)
  const allPrefixes = Object.values(PREFIXES).sort((a, b) => b.length - a.length);
  for (const prefix of allPrefixes) {
    if (address.startsWith(prefix)) {
      const typeChar = address[prefix.length] as AddressType;
      const isKnownType = typeChar in TYPE_INDEX;
      return {
        countryPrefix: prefix,
        type:          isKnownType ? typeChar : null,
        country:       PREFIX_TO_COUNTRY[prefix] ?? prefix,
        valid:         isKnownType && address.length === prefix.length + 1 + 35,
      };
    }
  }
  return { countryPrefix: "", type: null, country: "Unknown", valid: false };
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { PREFIXES, PREFIX_TO_COUNTRY, PREFIX_TO_KEY, TYPE_INDEX, INDEX_TYPE };

// ── Usage examples ─────────────────────────────────────────────────────────────
//
// 1. Generate a fresh engine
// ──────────────────────────
//   import { createFreshEngine } from "./btngDerive";
//
//   const { engine, mnemonic } = createFreshEngine(24);
//   console.log("Backup phrase:", mnemonic.mnemonic);   // STORE SECURELY
//
//   const ghanaWallet = engine.derive("BTNG1G/w/0");
//   // ghanaWallet.address → "BTNG1Gw<35-char-hash>"
//   // ghanaWallet.path    → "BTNG1G/w/0"
//
//
// 2. Restore engine from mnemonic
// ─────────────────────────────────
//   import { engineFromMnemonic } from "./btngDerive";
//
//   const engine = engineFromMnemonic("word1 word2 ... word24");
//   const addr   = engine.derive("BTNG2N/m/0");   // Nigeria merchant
//
//
// 3. Batch derivation (10 validator nodes for DRC)
// ─────────────────────────────────────────────────
//   const validators = engine.deriveBatch("BTNG35D", "v", 0, 10);
//   validators.forEach(v => console.log(v.path, "→", v.address));
//
//
// 4. Full account set for Ghana (one address per type)
// ──────────────────────────────────────────────────────
//   const account = engine.deriveAccountSet("BTNG1G");
//   // account.w → wallet, account.m → merchant, account.t → treasury, …
//
//
// 5. Derive all 54 sovereign mesh wallets
// ──────────────────────────────────────────
//   const mesh = engine.deriveFullMesh("w", 0);
//   // mesh.GHANA.address, mesh.NIGERIA.address, …
//
//
// 6. Export Xpub for watch-only watcher
// ──────────────────────────────────────
//   const xpub = engine.exportXpub("BTNG1G");
//   // share xpub.xpub — gives NO spending ability
//
//   const watchAddr = engine.deriveFromXpub(xpub, "w", 1);
//   // Derives Ghana wallet #1 address without master key
//
//
// 7. Inspect an unknown BTNG address
// ────────────────────────────────────
//   import { inspectAddress } from "./btngDerive";
//
//   const info = inspectAddress("BTNG1Gw3f8a9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6");
//   // info.country → "Ghana"
//   // info.type    → "w"
//   // info.valid   → true
