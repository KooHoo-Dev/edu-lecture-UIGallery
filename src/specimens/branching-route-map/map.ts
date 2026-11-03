/* 분기 경로 맵 — 지도 생성 (순수 함수, UI 와 무관).
 * Unity 판 RouteMapData.cs 와 한 줄씩 같은 알고리즘이다. 난수 호출 순서까지 같아야 같은 시드에서 같은 지도가 나온다. */

export type Kind = 'fight' | 'elite' | 'rest' | 'shop' | 'loot' | 'signal' | 'goal'
/** C# enum NodeKind 와 같은 순서 (지문 계산에 숫자로 들어간다) */
export const KINDS: Kind[] = ['fight', 'elite', 'rest', 'shop', 'loot', 'signal', 'goal']
export type Mix = 'balanced' | 'danger' | 'supply' | 'unknown'

/** 종류 비율 — fight, elite, rest, shop, loot, signal (loot 는 중간 층에서만 고정 배정) */
export const MIX_WEIGHTS: Record<Mix, number[]> = {
  balanced: [45, 10, 12, 8, 0, 22],
  danger: [38, 30, 6, 5, 0, 18],
  supply: [34, 4, 18, 22, 0, 18],
  unknown: [24, 8, 10, 6, 0, 52],
}
/** 이 층보다 아래(0~3층)에는 강적이 나오지 않는다 */
export const ELITE_FROM = 4
/** 같은 경로에서 연달아 나오지 않는 종류 */
const NO_REPEAT: Kind[] = ['elite', 'rest', 'shop']

export interface RouteNode {
  id: number
  floor: number
  col: number
  kind: Kind
  next: number[]
  prev: number[]
  /** 배치 흔들림 −0.5~0.5 (같은 난수기에서 뽑아 Unity 와 같은 모양) */
  jx: number
  jy: number
}

export interface RouteMap {
  seed: number
  floors: number
  cols: number
  paths: number
  mix: Mix
  nodes: RouteNode[]
  byId: Map<number, RouteNode>
  goalId: number
  /** 지도 지문 (FNV-1a) — Unity 판이 Debug.Log 로 찍는 값과 같아야 한다 */
  print: string
}

/** mulberry32 — 32비트 상태 하나짜리 작은 시드 난수기. C# 판은 uint 로 같은 연산을 한다 */
export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generate(seed: number, floors: number, cols: number, paths: number, mix: Mix, preventCross: boolean): RouteMap {
  const rnd = mulberry32(seed)
  const pick = (n: number) => Math.floor(rnd() * n)
  const F = floors
  const C = cols
  // edge[f][c] = 다음 층에서 이어지는 열 목록
  const edge: Set<number>[][] = Array.from({ length: F }, () => Array.from({ length: C }, () => new Set<number>()))
  const used: boolean[][] = Array.from({ length: F }, () => new Array<boolean>(C).fill(false))
  const has = (f: number, a: number, b: number) => edge[f][a].has(b)

  /* (1) 경로 긋기: 시작 열에서 한 층씩 위로, 이웃 열(−1 · 0 · +1)로만 */
  let firstStart = -1
  for (let p = 0; p < paths; p++) {
    let c = pick(C)
    // 처음 두 경로는 다른 열에서 출발 (선택지가 적어도 둘)
    if (p === 1 && C > 1 && c === firstStart) c = (c + 1 + pick(C - 1)) % C
    if (p === 0) firstStart = c
    used[0][c] = true
    for (let f = 0; f < F - 1; f++) {
      const cands: number[] = []
      for (let d = -1; d <= 1; d++) {
        const n = c + d
        if (n < 0 || n >= C) continue
        // 교차 검사: 오른쪽 위로 가려는데 오른쪽 노드가 왼쪽 위로 가는 간선이 있으면 X 자로 엇갈린다
        if (preventCross && ((d === 1 && has(f, c + 1, c)) || (d === -1 && has(f, c - 1, c)))) continue
        cands.push(n)
      }
      // 곧장 위(d = 0)는 절대 교차하지 않으므로 후보가 비지 않는다
      const n = cands[pick(cands.length)]
      edge[f][c].add(n)
      used[f + 1][n] = true
      c = n
    }
  }

  /* 노드 목록: 층 오름차순, 열 오름차순 (Unity 와 같은 순서) */
  const nodes: RouteNode[] = []
  const byId = new Map<number, RouteNode>()
  const goalId = F * C
  for (let f = 0; f < F; f++)
    for (let c = 0; c < C; c++) {
      if (!used[f][c]) continue
      const id = f * C + c
      const next = f === F - 1 ? [goalId] : [...edge[f][c]].sort((a, b) => a - b).map(n => (f + 1) * C + n)
      const node: RouteNode = { id, floor: f, col: c, kind: 'fight', next, prev: [], jx: 0, jy: 0 }
      nodes.push(node)
      byId.set(id, node)
    }
  const goal: RouteNode = { id: goalId, floor: F, col: Math.floor((C - 1) / 2), kind: 'goal', next: [], prev: [], jx: 0, jy: 0 }
  nodes.push(goal)
  byId.set(goalId, goal)
  for (const n of nodes) for (const m of n.next) byId.get(m)!.prev.push(n.id)

  /* (2) 종류 배정: 고정 층 + 비율에서 제약에 걸리는 종류를 뺀 가중 추첨 (노드마다 난수 1회) */
  const mid = Math.floor(F / 2)
  const base = MIX_WEIGHTS[mix]
  for (const n of nodes) {
    if (n.kind === 'goal') continue
    if (n.floor === 0) n.kind = 'fight'
    else if (n.floor === F - 1) n.kind = 'rest' // 최종 목표 바로 앞은 정비 보장
    else if (n.floor === mid) n.kind = 'loot' // 중간 층은 회수
    else {
      const w = base.slice()
      if (n.floor < ELITE_FROM) w[1] = 0
      if (n.floor === F - 2) w[2] = 0 // 다음 층이 정비라 연달아 나오지 않게
      for (const pid of n.prev) {
        const pk = byId.get(pid)!.kind
        if (NO_REPEAT.includes(pk)) w[KINDS.indexOf(pk)] = 0
      }
      const sum = w.reduce((a, b) => a + b, 0)
      let r = rnd() * sum
      let k = 0
      for (; k < w.length - 1; k++) {
        if (r < w[k]) break
        r -= w[k]
      }
      n.kind = sum > 0 ? KINDS[k] : 'fight'
    }
  }

  /* (3) 배치 흔들림 — 격자가 그대로 보이지 않게 */
  for (const n of nodes) {
    if (n.kind === 'goal') continue
    n.jx = rnd() - 0.5
    n.jy = rnd() - 0.5
  }

  return { seed, floors: F, cols: C, paths, mix, nodes, byId, goalId, print: fingerprint(F, C, paths, nodes) }
}

/** FNV-1a 32비트 — 층 · 열 · 경로 수, 노드마다 id · 종류 · 다음 id 들, 그리고 −1 구분자 */
function fingerprint(F: number, C: number, P: number, nodes: RouteNode[]) {
  let h = 0x811c9dc5
  const mix = (v: number) => {
    h = Math.imul(h ^ v, 16777619) >>> 0
  }
  mix(F)
  mix(C)
  mix(P)
  for (const n of nodes) {
    mix(n.id)
    mix(KINDS.indexOf(n.kind))
    for (const m of n.next) mix(m)
    mix(-1)
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

/** 저장 형식 — Unity 의 JsonUtility.ToJson(RunSave) 와 필드 순서까지 같다.
 * print = 저장할 때 지도의 지문. 불러올 때 다시 만든 지도의 지문과 비교해 생성 규칙이 바뀌었는지 안다 */
export interface RunSave {
  seed: number
  floors: number
  cols: number
  paths: number
  mix: Mix
  print: string
  at: number
  path: number[]
}

/** print 를 따로 주면 그 지문으로 저장한다 (옛 생성 규칙으로 만든 저장을 흉내 낼 때) */
export function saveRun(map: RouteMap, path: number[], print = map.print): string {
  const s: RunSave = { seed: map.seed, floors: map.floors, cols: map.cols, paths: map.paths, mix: map.mix, print, at: path.length ? path[path.length - 1] : -1, path }
  return JSON.stringify(s)
}

export type LoadCheck = 'ok' | 'print' | 'path'

/** 불러오기 검사: ① 저장된 지문 = 다시 만든 지도의 지문 (생성 규칙이 그대로인가) ② 길이 그 지도에서 이어지는가 */
export function checkSave(sv: RunSave, again: RouteMap): LoadCheck {
  if (sv.print !== again.print) return 'print'
  return validPath(again, sv.path) ? 'ok' : 'path'
}

/** 불러오기: 지도는 저장하지 않고 시드로 다시 만든다. 지나온 길이 그 지도에서 실제로 이어지는지 검사한다 */
export function validPath(map: RouteMap, path: number[]): boolean {
  for (let i = 0; i < path.length; i++) {
    const n = map.byId.get(path[i])
    if (!n) return false
    if (i === 0 ? n.floor !== 0 : !map.byId.get(path[i - 1])!.next.includes(n.id)) return false
  }
  return true
}

/** X 자로 엇갈린 간선 쌍 (a → a+1 과 a+1 → a 가 같은 층에 함께 있음). 교차 막기를 끈 지도에서만 생긴다 */
export function crossings(map: RouteMap): [RouteNode, RouteNode][] {
  const out: [RouteNode, RouteNode][] = []
  for (const n of map.nodes) {
    if (n.floor >= map.floors - 1) continue
    const right = map.byId.get(n.id + 1)
    if (!right || right.floor !== n.floor) continue
    if (n.next.includes(right.id + map.cols) && right.next.includes(n.id + map.cols)) out.push([n, right])
  }
  return out
}

/** 지금 갈 수 있는 노드 — 출발 전이면 0층 전부, 아니면 현재 노드의 다음 */
export function reachable(map: RouteMap, path: number[]): number[] {
  if (!path.length) return map.nodes.filter(n => n.floor === 0).map(n => n.id)
  return map.byId.get(path[path.length - 1])!.next
}
