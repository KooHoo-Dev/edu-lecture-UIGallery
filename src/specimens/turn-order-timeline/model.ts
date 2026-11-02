/* 전투 큐 (모델) — 화면을 모르는 순수 계산. 뷰(index.tsx)는 preview() 결과만 보고 그린다.
 *   행동값(AV) = 남은 거리 ÷ 속도. 모두가 같은 기준 거리(DIST)를 달리고, 가장 먼저 도착하는 유닛이 행동한다.
 *   행동이 끝나면 그 유닛만 거리를 DIST 로 되돌린다. 속도가 빠르면 같은 시간에 여러 번 도착한다 = 큐에 여러 번 나온다.
 * Unity 판 TurnQueue.cs 와 같은 규칙이다. */

export const DIST = 10000

export type Role = 'ally' | 'enemy'

export interface UnitDef {
  id: string
  name: string
  /** 초상 아래 짧은 이름 */
  short: string
  /** 효과 끄기에서 쓰는 한 글자 */
  initial: string
  role: Role
  speed: number
}

export interface Unit extends UnitDef {
  baseSpeed: number
  /** 남은 거리 (DIST → 0) */
  dist: number
  /** 지금까지 시작한 정규 차례 수 — 차례마다 영구 key(`id:번호`)를 만든다 */
  turns: number
  /** 속도 변화가 남은 차례 수 (0 = 없음). 자기 차례가 끝날 때 1 줄어든다 */
  modTurns: number
  /** 지금 속도 변화 비율 (+0.4 = 40% 빨라짐) */
  modPct: number
}

export type EntryKind = 'active' | 'extra' | 'turn'

export interface Entry {
  /** 같은 차례는 큐가 바뀌어도 같은 key — 뷰가 같은 초상을 미끄러뜨린다 */
  key: string
  unitId: string
  /** 지금부터 이 차례까지 남은 행동값 */
  av: number
  /** active = 지금 행동 중 · extra = 끼어들기(추가 행동) · turn = 정규 차례 */
  kind: EntryKind
  /** active 인데 끼어들기 차례인가 */
  extra: boolean
}

export const UNITS: UnitDef[] = [
  { id: 'harin', name: '하린', short: '하린', initial: '하', role: 'ally', speed: 105 },
  { id: 'doyun', name: '도윤', short: '도윤', initial: '도', role: 'ally', speed: 96 },
  { id: 'sera', name: '세라', short: '세라', initial: '세', role: 'ally', speed: 160 },
  { id: 'droneA', name: '잔해 드론 A', short: '드론 A', initial: 'A', role: 'enemy', speed: 88 },
  { id: 'droneB', name: '잔해 드론 B', short: '드론 B', initial: 'B', role: 'enemy', speed: 132 },
]

const EPS = 1e-6

export class TurnQueue {
  units: Unit[] = []
  active: { key: string; unitId: string; extra: boolean } | null = null
  extras: { key: string; unitId: string }[] = []
  /** 전투 시작부터 흐른 행동값 */
  elapsed = 0
  private extraSeq = 0

  constructor(private defs: UnitDef[] = UNITS) {
    this.reset()
  }

  reset() {
    this.units = this.defs.map(d => ({ ...d, baseSpeed: d.speed, dist: DIST, turns: 0, modTurns: 0, modPct: 0 }))
    this.active = null
    this.extras = []
    this.elapsed = 0
    this.extraSeq = 0
    this.begin()
  }

  unit(id: string) {
    return this.units.find(u => u.id === id)!
  }

  /** 행동값 = 남은 거리 ÷ 속도 */
  static av(u: { dist: number; speed: number }) {
    return u.dist / u.speed
  }

  /** 다음 행동자를 정한다 — 끼어들기가 있으면 시간이 흐르지 않고 먼저 */
  private begin() {
    const x = this.extras.shift()
    if (x) {
      this.active = { ...x, extra: true }
      return
    }
    const next = pickNext(this.units)
    const t = TurnQueue.av(next)
    for (const u of this.units) u.dist = Math.max(0, u.dist - u.speed * t)
    next.dist = 0
    this.elapsed += t
    next.turns++
    this.active = { key: `${next.id}:${next.turns}`, unitId: next.id, extra: false }
  }

  /** 지금 차례를 끝낸다. 정규 차례면 그 유닛만 거리를 DIST 로 되돌리고, 남은 속도 변화를 한 차례 줄인다 */
  endTurn(): { ended: string; expired: string | null } {
    const a = this.active
    let expired: string | null = null
    if (a && !a.extra) {
      const u = this.unit(a.unitId)
      u.dist = DIST
      if (u.modTurns > 0 && --u.modTurns === 0) {
        u.speed = u.baseSpeed
        u.modPct = 0
        expired = u.id
      }
    }
    this.begin()
    return { ended: a?.unitId ?? '', expired }
  }

  /** 속도 변화 (pct = +0.4 → 40% 빨라짐). 남은 거리는 그대로라 행동값만 바뀐다 */
  setSpeedMod(id: string, pct: number, turns = 1) {
    const u = this.unit(id)
    u.modPct = pct
    // 지금 행동 중인 유닛이면 이번 차례가 끝날 때 바로 사라지지 않게 한 차례 더 센다
    u.modTurns = turns + (this.active && !this.active.extra && this.active.unitId === id ? 1 : 0)
    u.speed = Math.max(1, Math.round(u.baseSpeed * (1 + pct)))
  }

  /** 행동 앞당김(pct > 0) · 지연(pct < 0). 기준 거리의 pct 만큼 남은 거리를 줄이거나 늘린다 — 다음 한 차례만 바뀐다 */
  shiftAction(id: string, pct: number) {
    const u = this.unit(id)
    u.dist = Math.min(DIST * 2, Math.max(0, u.dist - DIST * pct))
  }

  /** 끼어들기(추가 행동) — 지금 차례가 끝나면 바로. 정규 차례 · 남은 거리는 건드리지 않는다 */
  addExtra(id: string) {
    this.extras.push({ key: `x${++this.extraSeq}`, unitId: id })
  }

  /** 지금 차례 + 앞으로 n 개 차례. 정규 차례는 복사본으로 시간을 흘려 미리 계산한다 (속도 변화가 끝나는 것까지) */
  preview(n: number): Entry[] {
    const out: Entry[] = []
    const a = this.active
    if (a) out.push({ key: a.key, unitId: a.unitId, av: 0, kind: 'active', extra: a.extra })
    for (const x of this.extras) {
      if (out.length > n) break
      out.push({ key: x.key, unitId: x.unitId, av: 0, kind: 'extra', extra: true })
    }
    const sim = this.units.map(u => ({ ...u }))
    if (a && !a.extra) finishSim(sim.find(u => u.id === a.unitId)!)
    let t = 0
    while (out.length <= n) {
      const next = pickNext(sim)
      const dt = TurnQueue.av(next)
      for (const u of sim) u.dist = Math.max(0, u.dist - u.speed * dt)
      t += dt
      next.turns++
      out.push({ key: `${next.id}:${next.turns}`, unitId: next.id, av: t, kind: 'turn', extra: false })
      finishSim(next)
    }
    return out
  }
}

/** 행동값이 가장 작은 유닛. 같으면 목록 앞쪽(아군 → 적 순서)이 먼저 */
function pickNext<T extends { dist: number; speed: number }>(units: T[]): T {
  let best = units[0]
  for (const u of units) if (TurnQueue.av(u) < TurnQueue.av(best) - EPS) best = u
  return best
}

function finishSim(u: Unit) {
  u.dist = DIST
  if (u.modTurns > 0 && --u.modTurns === 0) {
    u.speed = u.baseSpeed
    u.modPct = 0
  }
}

/** 각 유닛의 다음 정규 차례 순번 (지금 차례 = 0). 앞당겨졌는지 알릴 때 쓴다 */
export function firstIndex(entries: Entry[], unitId: string) {
  return entries.findIndex(e => e.unitId === unitId && e.kind === 'turn')
}
