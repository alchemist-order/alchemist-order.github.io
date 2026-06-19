// 各幻獣の絵文字スプライト。未定義はタイプ別の既定にフォールバック。
export const SPRITES: Record<string, string> = {
  // 火
  ignif: '🦎', flamand: '🦎', volcadon: '🐉',
  emberio: '🦁', blazeroar: '🦁', ignisleo: '🦁',
  candle: '🕯️', lanternwisp: '🏮', hellflare: '🔥',
  // 水
  aquab: '💧', marinel: '🧜‍♀️', leviaran: '🐉',
  teary: '💧', naiad: '🧚', undine: '🧜‍♀️',
  shelk: '🐚', coralga: '🦀', krakent: '🐙',
  frost: '❄️', glacia: '🧊', iceberg: '🏔️',
  // 風
  cogrif: '🦅', sylfeed: '🦅', grandroc: '🦅',
  pibit: '🐦', skylark: '🐤', tempesta: '🦅',
  briezel: '🦊', gailfox: '🦊', zampu: '🦊',
  wingly: '🐲', skydrake: '🐲', stormwyvern: '🐲',
  // 地
  falcone: '🌱', mandrago: '🌿', alraune: '🌸',
  pebblin: '🪨', rockgolem: '🗿', titanrock: '🗿',
  gnomy: '🧙', earthgnome: '🧙', gaialord: '🗿',
  hobgobalt: '👹', ogrebalt: '👹',
  tsunousa: '🐰', hornrabi: '🦌', crystag: '🦌',
  ammo: '🐚', ankylos: '🦕',
  // 雷
  sparki: '⚡', boltmouse: '🐭', zircondor: '🦅',
  latterune: '🐭', coinlatte: '🐭', mithrilrat: '🐀',
  jolty: '🐱', elecat: '🐱', ligarv: '🐯',
  // 毒
  portabupa: '🐛', morpholucis: '🦋', prismapapillon: '🦋',
  venomite: '🐝', toxeed: '🐛', pestilence: '🪰',
  sporin: '🍄', myconid: '🍄', deathcap: '🍄',
  // 錬成
  slimeflask: '🧪', amalgamhedoro: '🫧', chimeriaooze: '🫧',
  ghostarmor: '🛡️', dullahanknight: '🏇', blackpaladin: '⚔️',
  coghomuncle: '⚙️', gearknight: '🤖', clockworktitan: '🤖',
  mimicris: '🎁',
  // 聖
  florapixie: '🧚', titania: '🧚‍♀️', seraphim: '👼',
  lumiel: '👼', archange: '👼',
  chimeracub: '🦁', mysticchimera: '🦁', celestialchimera: '🌟',
  // 冥
  nosferabat: '🦇', vamplord: '🧛', noxdracul: '🧛‍♂️',
  bonekids: '💀', skelknight: '💀', lich: '🧙‍♂️',
  shadowl: '👻', wraith: '👻', nightmare: '🐴',
  // 伝説
  ignaros: '🔥', abystia: '🌊', tempestroc: '🌪️', terrabehemoth: '⛰️', sol: '☀️', luna: '🌙',
  // ボス
  magnus: '🧙‍♂️', abysschimera: '😈',
}

const TYPE_FALLBACK: Record<string, string> = {
  火: '🔥', 水: '💧', 風: '🌪️', 地: '🌿', 雷: '⚡', 毒: '☠️', 聖: '✨', 冥: '🌑', 錬成: '⚙️',
}

export function spriteOf(id: string, type: string): string {
  return SPRITES[id] ?? TYPE_FALLBACK[type] ?? '❔'
}
