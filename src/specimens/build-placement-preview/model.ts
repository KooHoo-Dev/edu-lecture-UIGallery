/* 건설 배치 — 맵 · 건물 정의 · 배치 검사(사유를 돌려준다). 화면과 무관한 순수 계산이라 Unity 의 PlacementValidator 와 1:1 로 대응한다.
 * 좌표: 칸 (x 오른쪽 +, y 아래 +). 맵 왼쪽 위 칸이 (0,0). 화면 px = MAP_X + x·CELL */

export const COLS = 24
export const ROWS = 14
export const CELL = 64
export const MAP_X = 32
export const MAP_Y = 112

export type BuildingId = 'turret' | 'sensor' | 'depot'
/** 검사 결과 — bool 이 아니라 '왜 안 되는지' (우선순위 순서) */
export type Reason = 'ok' | 'out-of-bounds' | 'water' | 'overlap' | 'on-path' | 'no-credits'

export interface BuildingDef {
  id: BuildingId
  name: string
  cost: number
  /** 본체 크기 (칸) */
  w: number
  h: number
  /** 본체 옆에 붙는 착륙 패드 (회전 0 기준 오프셋) — 회전하면 따라 돈다 */
  pad?: [number, number]
  /** 사거리 (칸, 본체 중심부터). 0 = 없음 */
  range: number
  key: string
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  turret: { id: 'turret', name: '방어 포탑', cost: 100, w: 1, h: 1, range: 3.5, key: 'Q' },
  sensor: { id: 'sensor', name: '센서탑', cost: 60, w: 1, h: 1, range: 5, key: 'W' },
  depot: { id: 'depot', name: '수리 기지', cost: 150, w: 2, h: 2, pad: [2, 0], range: 0, key: 'E' },
}
export const BUILD_ORDER: BuildingId[] = ['turret', 'sensor', 'depot']

export interface Placed {
  uid: number
  id: BuildingId
  x: number
  y: number
  rot: number
}

export interface Cell {
  x: number
  y: number
  pad?: boolean
}

export const key = (x: number, y: number) => `${x},${y}`

/** 드론 경로 꺾이는 칸 (왼쪽 진입 → 오른쪽 기지) */
export const PATH_POINTS: [number, number][] = [
  [0, 3],
  [6, 3],
  [6, 10],
  [14, 10],
  [14, 4],
  [23, 4],
]
const WATER_ROWS: Record<number, [number, number]> = { 8: [18, 21], 9: [17, 22], 10: [17, 22], 11: [17, 21], 12: [18, 20] }

export const PATH = new Set<string>()
for (let i = 1; i < PATH_POINTS.length; i++) {
  const [ax, ay] = PATH_POINTS[i - 1]
  const [bx, by] = PATH_POINTS[i]
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
  for (let k = 0; k <= n; k++) PATH.add(key(ax + Math.sign(bx - ax) * k, ay + Math.sign(by - ay) * k))
}
export const WATER = new Set<string>()
for (const [row, [a, b]] of Object.entries(WATER_ROWS)) for (let x = a; x <= b; x++) WATER.add(key(x, Number(row)))

export const INITIAL: Placed[] = [
  { uid: 1, id: 'turret', x: 4, y: 5, rot: 0 },
  { uid: 2, id: 'sensor', x: 10, y: 7, rot: 0 },
  { uid: 3, id: 'depot', x: 9, y: 0, rot: 0 },
]

/** 회전한 발자국. 본체 중심을 기준으로 시계 방향 90°씩 — (x, y) → (c − (y − c), c + (x − c)). 정사각 본체라 본체는 그대로, 패드만 돈다 */
export function footprint(def: BuildingDef, rot: number): Cell[] {
  const out: Cell[] = []
  for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) out.push({ x, y })
  if (def.pad) {
    const cx = (def.w - 1) / 2
    const cy = (def.h - 1) / 2
    let [px, py] = def.pad
    for (let r = 0; r < ((rot % 4) + 4) % 4; r++) [px, py] = [cx - (py - cy), cy + (px - cx)]
    out.push({ x: px, y: py, pad: true })
  }
  return out
}

export interface Check {
  reason: Reason
  /** 문제가 된 칸 (맵 좌표 key) — 고스트에서 그 칸만 빗금 */
  bad: Set<string>
  /** 겹친 건물 이름 */
  other?: string
  /** 부족한 크레딧 */
  short?: number
}

const RANK: Reason[] = ['ok', 'no-credits', 'on-path', 'overlap', 'water', 'out-of-bounds']

/** 한 칸의 문제 (없으면 ok) */
export function cellReason(x: number, y: number, occ: Map<string, Placed>): Reason {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return 'out-of-bounds'
  if (WATER.has(key(x, y))) return 'water'
  if (occ.has(key(x, y))) return 'overlap'
  if (PATH.has(key(x, y))) return 'on-path'
  return 'ok'
}

/** 칸 → 그 칸을 차지한 건물 */
export function occupancy(placed: Placed[]): Map<string, Placed> {
  const m = new Map<string, Placed>()
  for (const b of placed) for (const c of footprint(BUILDINGS[b.id], b.rot)) m.set(key(b.x + c.x, b.y + c.y), b)
  return m
}

/**
 * 배치 검사. 경로가 정해진 타워 디펜스라 '경로 칸 위에는 못 짓는다' 만 본다 (길을 끊는지 탐색하지 않는다).
 * 칸마다 문제를 보고 가장 우선인 사유 하나를 고른다 (맵 밖 > 물 > 겹침 > 경로).
 * 자리가 괜찮을 때만 크레딧을 본다 — 자리를 고치는 것이 먼저라서.
 */
export function validate(def: BuildingDef, ox: number, oy: number, rot: number, credits: number, occ: Map<string, Placed>): Check {
  let reason: Reason = 'ok'
  const bad = new Set<string>()
  let other: string | undefined
  for (const c of footprint(def, rot)) {
    const x = ox + c.x
    const y = oy + c.y
    const r = cellReason(x, y, occ)
    if (r === 'ok') continue
    bad.add(key(x, y))
    if (r === 'overlap' && !other) other = BUILDINGS[occ.get(key(x, y))!.id].name
    if (RANK.indexOf(r) > RANK.indexOf(reason)) reason = r
  }
  if (reason === 'ok' && credits < def.cost) return { reason: 'no-credits', bad, short: def.cost - credits }
  return { reason, bad, other }
}

export function reasonText(c: Check, def: BuildingDef): string {
  switch (c.reason) {
    case 'ok':
      return `설치 가능 · ${def.cost} 크레딧`
    case 'out-of-bounds':
      return '맵 밖 — 구역 경계를 넘는다'
    case 'water':
      return '물 위 — 단단한 땅에만 짓는다'
    case 'overlap':
      return `${c.other ?? '건물'} 자리와 겹친다`
    case 'on-path':
      return '드론 경로 위 — 길에는 못 짓는다'
    case 'no-credits':
      return `크레딧 ${c.short} 부족`
  }
}

/** 사거리 안에 드는 경로 칸 (칸 중심까지 거리 ≤ 사거리) */
export function pathInRange(def: BuildingDef, ox: number, oy: number): [number, number][] {
  if (!def.range) return []
  const cx = ox + def.w / 2
  const cy = oy + def.h / 2
  const out: [number, number][] = []
  for (const k of PATH) {
    const [x, y] = k.split(',').map(Number)
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= def.range) out.push([x, y])
  }
  return out
}

/** 포인터(맵 기준 px) → 본체가 포인터 가운데 오도록 원점 칸 = round(m − 크기/2). Unity: grid.WorldToCell(world + (1 − 크기)/2 칸) */
export const snapOrigin = (def: BuildingDef, mx: number, my: number): [number, number] => [Math.round(mx / CELL - def.w / 2), Math.round(my / CELL - def.h / 2)]

/** preferred 에서 가까운 순서로 칸을 훑어 조건에 맞는 원점을 찾는다 (시연용) */
export function findSpot(pref: [number, number], ok: (x: number, y: number) => boolean): [number, number] | null {
  for (let d = 0; d < 12; d++)
    for (let y = pref[1] - d; y <= pref[1] + d; y++)
      for (let x = pref[0] - d; x <= pref[0] + d; x++) if (Math.max(Math.abs(x - pref[0]), Math.abs(y - pref[1])) === d && ok(x, y)) return [x, y]
  return null
}

/** 드론 경로 (px, 칸 중심) */
export const PATH_PX = PATH_POINTS.map(([x, y]) => ({ x: MAP_X + (x + 0.5) * CELL, y: MAP_Y + (y + 0.5) * CELL }))
// 화면 밖에서 들어오고 나가게 양 끝을 늘린다
PATH_PX[0] = { ...PATH_PX[0], x: MAP_X - 40 }
PATH_PX[PATH_PX.length - 1] = { ...PATH_PX[PATH_PX.length - 1], x: MAP_X + COLS * CELL + 40 }
const SEG = PATH_PX.slice(1).map((p, i) => Math.hypot(p.x - PATH_PX[i].x, p.y - PATH_PX[i].y))
export const PATH_LEN = SEG.reduce((a, b) => a + b, 0)
export function pointOnPath(d: number): { x: number; y: number; deg: number } {
  let rest = ((d % PATH_LEN) + PATH_LEN) % PATH_LEN
  for (let i = 0; i < SEG.length; i++) {
    if (rest <= SEG[i]) {
      const a = PATH_PX[i]
      const b = PATH_PX[i + 1]
      const k = rest / SEG[i]
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, deg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
    }
    rest -= SEG[i]
  }
  return { ...PATH_PX[0], deg: 0 }
}
