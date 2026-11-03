/* 킬 피드 + 스코어보드 — 화면을 모르는 모델 (Unity 판 KillFeedModel.cs 와 같은 규칙).
 *  Match     : 선수 기록 · 팀 점수 · 정렬
 *  FeedQueue : 피드 줄 큐 — 최대 줄 수 · 유지 시간 · 같은 가해자 합치기 · 몰릴 때 속도 조절 */

export type TeamId = 'orbit' | 'surface'
export type WeaponId = 'pulse' | 'scatter' | 'longshot' | 'shock' | 'baton' | 'boundary'
export type SortKey = 'score' | 'takedowns' | 'join'
export type Mine = 'attacker' | 'victim' | null

export const ME = 'harin'
/** 팀 제압전 — 먼저 이 제압 수에 닿는 팀이 이긴다 */
export const WIN = 50
export const TEAM_NAME: Record<TeamId, string> = { orbit: '궤도 분대', surface: '지표 분대' }
export const WEAPON_NAME: Record<WeaponId, string> = {
  pulse: '펄스 소총',
  scatter: '산탄 방출기',
  longshot: '정밀 조준총',
  shock: '충격 수류탄',
  baton: '진압봉',
  boundary: '경계 밖',
}
export const other = (t: TeamId): TeamId => (t === 'orbit' ? 'surface' : 'orbit')

export interface Player {
  id: string
  name: string
  team: TeamId
  /** 들어온 순서 (정렬 안 함 = 이 순서) */
  join: number
  takedowns: number
  assists: number
  outs: number
  precision: number
  ping: number
}
/** 점수 = 제압 100 + 지원 50 + 정밀 타격 25 */
export const scoreOf = (p: Player) => p.takedowns * 100 + p.assists * 50 + p.precision * 25

// id, 이름, 팀, 제압, 지원, 이탈, 정밀, 핑 — 5 대 5 에서 한 팀의 제압 합 = 상대 팀의 이탈 합
const ROSTER: [string, string, TeamId, number, number, number, number, number][] = [
  ['harin', '하린', 'orbit', 5, 3, 4, 2, 24],
  ['doyun', '도윤', 'orbit', 4, 5, 4, 1, 38],
  ['sera', '세라', 'orbit', 6, 2, 3, 3, 61],
  ['minjae', '민재', 'orbit', 3, 4, 5, 0, 45],
  ['yuna', '유나', 'orbit', 2, 6, 3, 0, 132],
  ['taeo', '태오', 'orbit', 2, 1, 3, 1, 29],
  ['jiho', '지호', 'surface', 6, 2, 5, 2, 33],
  ['seoyeon', '서연', 'surface', 5, 4, 4, 2, 52],
  ['geonu', '건우', 'surface', 3, 3, 4, 1, 27],
  ['ara', '아라', 'surface', 3, 5, 4, 0, 148],
  ['junseo', '준서', 'surface', 2, 2, 3, 0, 41],
  ['daon', '다온', 'surface', 1, 3, 2, 0, 36],
]

export interface FeedEvent {
  /** null = 환경(경계 밖) */
  attacker: string | null
  victim: string
  weapon: WeaponId
  precision: boolean
  assist: string | null
}

export class Match {
  all: Player[] = []
  count = 5
  /** 경계 밖 이탈로 상대 팀이 얻은 제압 수 */
  bonus: Record<TeamId, number> = { orbit: 0, surface: 0 }

  constructor(count: number) {
    this.reset(count)
  }
  reset(count = this.count) {
    this.count = count
    this.bonus = { orbit: 0, surface: 0 }
    this.all = ROSTER.map(([id, name, team, takedowns, assists, outs, precision, ping], i) => ({ id, name, team, join: i % 6, takedowns, assists, outs, precision, ping }))
  }
  team(t: TeamId) {
    return this.all.filter(p => p.team === t && p.join < this.count)
  }
  get(id: string | null) {
    return this.all.find(p => p.id === id)
  }
  teamScore(t: TeamId) {
    return this.team(t).reduce((n, p) => n + p.takedowns, 0) + this.bonus[t]
  }
  apply(e: FeedEvent) {
    const v = this.get(e.victim)
    if (!v) return
    v.outs++
    const a = this.get(e.attacker)
    if (a) {
      a.takedowns++
      if (e.precision) a.precision++
    } else this.bonus[other(v.team)]++
    const s = this.get(e.assist)
    if (s) s.assists++
  }
  /** 정렬 — 점수가 같으면 제압 → 들어온 순서 (매번 순서가 흔들리지 않게 끝까지 정한다) */
  sorted(t: TeamId, key: SortKey) {
    const list = this.team(t)
    if (key === 'join') return list
    const k = key === 'score' ? scoreOf : (p: Player) => p.takedowns
    return list.sort((a, b) => k(b) - k(a) || b.takedowns - a.takedowns || a.join - b.join)
  }
}

/* ───── 가짜 이벤트 소스 (네트워크 대신) ───── */

/** 시드 고정 난수 */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const WEAPONS: [WeaponId, number][] = [
  ['pulse', 0.4],
  ['scatter', 0.2],
  ['longshot', 0.15],
  ['shock', 0.12],
  ['baton', 0.08],
  ['boundary', 0.05],
]
const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length) % list.length]

export function randomEvent(m: Match, r: () => number, o: { attacker?: string; victim?: string; weapon?: WeaponId } = {}): FeedEvent {
  let x = r()
  let weapon: WeaponId = 'boundary'
  for (const [w, p] of WEAPONS) {
    if ((x -= p) > 0) continue
    weapon = w
    break
  }
  weapon = o.weapon ?? weapon
  const atk = o.attacker ? m.get(o.attacker)! : pick(r, m.all.filter(p => p.join < m.count))
  if (weapon === 'boundary' && !o.attacker) return { attacker: null, victim: o.victim ?? atk.id, weapon, precision: false, assist: null }
  if (weapon === 'boundary') weapon = 'pulse'
  const victim = o.victim ?? pick(r, m.team(other(atk.team))).id
  const mates = m.team(atk.team).filter(p => p.id !== atk.id)
  const precision = (weapon === 'pulse' && r() < 0.3) || (weapon === 'longshot' && r() < 0.6)
  return { attacker: atk.id, victim, weapon, precision, assist: r() < 0.5 ? pick(r, mates).id : null }
}

/* ───── 피드 큐 ───── */

export interface FeedRow {
  uid: number
  attacker: string | null
  victims: string[]
  weapon: WeaponId
  precision: boolean
  mine: Mine
  lifeMs: number
  leftMs: number
  /** 최대 줄 수에 밀려 빨리 사라지는 중 */
  leaving: boolean
  lastAt: number
  bump: number
}
export interface FeedConfig {
  maxRows: number
  displayMs: number
  /** 같은 가해자 · 같은 무기를 한 줄로 합치는 시간 창. 0 = 합치지 않음 */
  mergeWindowMs: number
  /** 새 줄 사이 기본 간격 (대기가 길면 80ms 까지 줄인다). 0 = 받는 즉시 */
  paceMs: number
  /** 내가 관련된 줄은 이만큼 오래 */
  mineScale: number
}
/** 밀려난 줄이 사라지는 시간 · 수명이 다한 줄이 흐려지는 시간 */
export const EXIT_MS = 220
export const FADE_MS = 450

export class FeedQueue {
  rows: FeedRow[] = []
  pending: FeedRow[] = []
  stats = { merged: 0, pushed: 0 }
  now = 0
  private uid = 0
  private gap = 0

  constructor(public cfg: FeedConfig) {}

  push(e: FeedEvent, me = ME): 'merged' | 'queued' | 'shown' {
    const c = this.cfg
    const mine: Mine = e.attacker === me ? 'attacker' : e.victim === me ? 'victim' : null
    if (c.mergeWindowMs > 0 && e.attacker) {
      // 나와 관련된 소식은 남의 줄에 합치지 않는다 — 내 줄로 따로 서야 강조 · 1.5배 수명을 받는다
      const t = [...this.pending, ...this.rows].find(r => !r.leaving && r.attacker === e.attacker && r.weapon === e.weapon && (!mine || r.mine) && this.now - r.lastAt <= c.mergeWindowMs)
      if (t) {
        t.victims.push(e.victim)
        t.precision ||= e.precision
        t.lastAt = this.now
        t.lifeMs = c.displayMs * (t.mine ? c.mineScale : 1)
        t.leftMs = t.lifeMs
        t.bump++
        this.stats.merged++
        return 'merged'
      }
    }
    const life = c.displayMs * (mine ? c.mineScale : 1)
    const row: FeedRow = { uid: ++this.uid, attacker: e.attacker, victims: [e.victim], weapon: e.weapon, precision: e.precision, mine, lifeMs: life, leftMs: life, leaving: false, lastAt: this.now, bump: 0 }
    if (c.paceMs > 0 && (this.pending.length > 0 || this.gap > 0)) {
      this.pending.push(row)
      return 'queued'
    }
    this.show(row)
    return 'shown'
  }

  private show(r: FeedRow) {
    this.rows.push(r)
    // 대기가 길수록 간격을 줄인다 (속도 조절) — 그래도 한 줄씩 들어오는 것은 보이게 최소 80ms
    this.gap = this.cfg.paceMs > 0 ? Math.max(80, this.cfg.paceMs - 30 * this.pending.length) : 0
    this.cap()
  }
  /** 넘치면 내 줄이 아닌 줄을 마지막 갱신(lastAt)이 오래된 순으로 먼저 뺀다. 남은 줄이 모두 내 줄일 때만 내 줄을 */
  private cap() {
    const live = this.rows.filter(x => !x.leaving).sort((a, b) => +!!a.mine - +!!b.mine || a.lastAt - b.lastAt)
    for (const x of live.slice(0, Math.max(0, live.length - this.cfg.maxRows))) {
      x.leaving = true
      x.leftMs = Math.min(x.leftMs, EXIT_MS)
      this.stats.pushed++
    }
  }

  /** 줄이 들고 나면 true (다시 그릴 때) */
  tick(ms: number): boolean {
    this.now += ms
    let changed = false
    if (this.gap > 0) this.gap -= ms
    if (this.gap <= 0 && this.pending.length) {
      this.show(this.pending.shift()!)
      changed = true
    }
    for (const r of this.rows) r.leftMs -= ms
    const n = this.rows.length
    this.rows = this.rows.filter(r => r.leftMs > 0)
    return changed || n !== this.rows.length
  }

  alpha(r: FeedRow) {
    return Math.max(0, Math.min(1, r.leaving ? r.leftMs / EXIT_MS : r.leftMs / FADE_MS))
  }

  reconfigure(cfg: FeedConfig) {
    this.cfg = cfg
    if (cfg.paceMs <= 0) while (this.pending.length) this.rows.push(this.pending.shift()!)
    this.cap()
  }
}
