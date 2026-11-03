import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { formatNumber } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { createInputLock } from '../../core/inputLock'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import s from './style.module.css'

export { meta } from './meta'

const COLS = 7
const ROWS = 7
const N = COLS * ROWS
/** 블록 종류: 0 냉각 셀 · 1 회로 조각 · 2 산소 캔 (목표) · 3 수리 키트 (목표 아님) */
const KINDS = 4
const NAMES = ['냉각 셀', '회로 조각', '산소 캔', '수리 키트']
/** 목표 개수 = goalCount × 비율 */
const GOAL_RATIO = [1, 0.8, 0.6]
const SCORE_MAX = 5000
const STAR_CURVES: Record<string, number[]> = { standard: [1000, 2500, 4000], easy: [700, 1800, 3200], hard: [2000, 3500, 4700] }
const POP = 0.22
const FALL = 0.28
const SHUFFLE = 0.35
/** 연쇄 단계 상한 — 이 단계를 넘으면 3개 줄이 남아도 자연 연쇄를 멈춘다 (무한 연쇄 방지) */
const MAX_CHAIN = 4
/** 블록 하나의 점수 × 연쇄 단계 */
const POINTS = 20
const POOL = 48
const STAGGER = 0.035
const MANUAL_PAUSE = 6
const BOOSTERS = [
  { name: '폭발 충전', what: '커서 둘레 3×3' },
  { name: '가로 정리', what: '커서 줄 전체' },
  { name: '재배치', what: '블록 섞기' },
]
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }

interface Flyer {
  g: number
  /** 이 아이콘이 도착하면 줄일 개수 (보통 1, 동작 줄이기면 묶음 하나) */
  count: number
  start: number
  dur: number
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
}
interface Result {
  win: boolean
  at: number
  /** 연쇄가 끝나기 전에 낸 판정 (즉시 판정 = 나쁜 규칙) */
  early: boolean
  /** 즉시 실패 뒤 연쇄가 목표를 다 채웠다 */
  regret: boolean
}
interface Sim {
  t: number
  seed: number
  types: number[]
  /** 낙하 시작 때 몇 칸 위에 있었나 */
  fall: number[]
  pop: boolean[]
  phase: 'idle' | 'pop' | 'fall'
  phaseT: number
  chain: number
  /** 남은 강제 연쇄 단계 (이벤트 '연쇄 3단' · '마지막 이동') */
  forced: number
  movesLeft: number
  /** 실제값: 깨진 순간 늘어난다 — 판정은 이것으로 */
  collected: number[]
  /** 표시값: 아이콘이 도착할 때 늘어난다 (언제나 landed ≤ collected) */
  landed: number[]
  score: number
  shownScore: number
  flyers: Flyer[]
  goalPulse: number[]
  boosters: number[]
  shopHint: { k: number; until: number } | null
  result: Result | null
  cursor: number
  kbd: boolean
  hover: boolean
  shake: { i: number; until: number } | null
  shuffleT: number
  note: { text: string; bad: boolean; until: number } | null
  humanAt: number
  autoStep: number
  version: number
}

/** mulberry32 — 같은 시드면 같은 보드 (수업에서 같은 장면을 다시 보기 위해) */
function rand(S: Sim) {
  let t = (S.seed = (S.seed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const boosterStart = (stock: number) => [stock, Math.max(0, stock - 2), stock]

function initial(seed: number, moves: number, stock: number): Sim {
  const S: Sim = {
    t: 0,
    seed,
    types: new Array(N).fill(-1),
    fall: new Array(N).fill(0),
    pop: new Array(N).fill(false),
    phase: 'idle',
    phaseT: 0,
    chain: 0,
    forced: 0,
    movesLeft: moves,
    collected: [0, 0, 0],
    landed: [0, 0, 0],
    score: 0,
    shownScore: 0,
    flyers: [],
    goalPulse: [0, 0, 0],
    boosters: boosterStart(stock),
    shopHint: null,
    result: null,
    cursor: 3 * COLS + 3,
    kbd: false,
    hover: false,
    shake: null,
    shuffleT: 0,
    note: null,
    humanAt: -100,
    autoStep: 0,
    version: 0,
  }
  // 첫 판에는 가로 · 세로 3개 줄이 없게 (시작하자마자 저절로 깨지지 않게)
  for (let i = 0; i < N; i++) {
    let k = 0
    do k = Math.floor(rand(S) * KINDS)
    while (makesRun(S.types, i, k))
    S.types[i] = k
  }
  return S
}

function makesRun(types: number[], i: number, k: number) {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  return (c >= 2 && types[i - 1] === k && types[i - 2] === k) || (r >= 2 && types[i - COLS] === k && types[i - 2 * COLS] === k)
}

/** 같은 종류로 이어진 묶음 (상하좌우) */
function groupAt(types: number[], i: number): number[] {
  const k = types[i]
  const seen = new Set([i])
  const stack = [i]
  while (stack.length) {
    const j = stack.pop()!
    const r = Math.floor(j / COLS)
    const c = j % COLS
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr
      const cc = c + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      const n = rr * COLS + cc
      if (!seen.has(n) && types[n] === k) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return [...seen]
}

/** 가로 · 세로로 3개 이상 늘어선 줄 (자연 연쇄) */
function runs(types: number[]): number[] {
  const out = new Set<number>()
  const scan = (at: (a: number, b: number) => number, outer: number, inner: number) => {
    for (let a = 0; a < outer; a++) {
      let b = 0
      while (b < inner) {
        let e = b + 1
        while (e < inner && types[at(a, e)] === types[at(a, b)]) e++
        if (e - b >= 3) for (let x = b; x < e; x++) out.add(at(a, x))
        b = e
      }
    }
  }
  scan((r, c) => r * COLS + c, ROWS, COLS)
  scan((c, r) => r * COLS + c, COLS, ROWS)
  return [...out]
}

/** 퍼즐 스테이지 HUD — 남은 이동(경고) · 수집 목표(날아와 도착할 때 −1) · 별 임계 마커 · 부스터 배지.
 * 보드는 HUD 를 움직이기 위한 최소한의 격자: 같은 종류 2개 이상 묶음을 누르면 깨지고, 채운 뒤 3개 줄이 생기면 연쇄한다 */
export default function Match3GoalHud(p: SpecimenProps) {
  const juice = p.juice
  const moves = Math.round(num(p.params, 'moves', 12))
  const goalCount = Math.round(num(p.params, 'goalCount', 18))
  const warnAt = Math.round(num(p.params, 'warnAt', 5))
  const flyMs = num(p.params, 'flyMs', 650)
  const stars = STAR_CURVES[str(p.params, 'starCurve', 'standard')] ?? STAR_CURVES.standard
  const deferFail = bool(p.params, 'deferFail', true)
  const boosterStock = Math.round(num(p.params, 'boosterStock', 2))
  const showLedger = bool(p.params, 'showLedger', false)
  const targets = GOAL_RATIO.map(r => Math.max(1, Math.round(goalCount * r)))
  const cfg = { juice, moves, warnAt, flyMs, deferFail, boosterStock, targets, stars }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initial(20261103, moves, boosterStock)
  const S = simRef.current

  const [, setVersion] = useState(0)
  const shownVersion = useRef(S.version)
  const touch = () => S.version++
  const sync = () => {
    if (S.version !== shownVersion.current) {
      shownVersion.current = S.version
      setVersion(S.version)
    }
  }
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 3.2 }
    touch()
  }
  const human = () => (S.humanAt = S.t)

  const rootRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const movesRef = useRef<HTMLDivElement>(null)
  const movesNumRef = useRef<HTMLElement>(null)
  const movesLabelRef = useRef<HTMLSpanElement>(null)
  const pipRefs = useRef<(HTMLElement | null)[]>([])
  const goalsRef = useRef<HTMLDivElement>(null)
  const goalRefs = useRef<(HTMLDivElement | null)[]>([])
  const goalIconRefs = useRef<(HTMLSpanElement | null)[]>([])
  const goalNumRefs = useRef<(HTMLElement | null)[]>([])
  const ledgerRefs = useRef<(HTMLElement | null)[]>([])
  const scoreNumRef = useRef<HTMLElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const starRefs = useRef<(HTMLDivElement | null)[]>([])
  const flyerRefs = useRef<(HTMLDivElement | null)[]>([])
  const retryRef = useRef<HTMLButtonElement>(null)

  /* ───── 좌표 (무대가 축소돼 있어도 논리 해상도 기준) ───── */
  const scaleK = () => {
    const root = rootRef.current
    if (!root) return null
    const r = root.getBoundingClientRect()
    return { r, k: r.width / p.width || 1 }
  }
  const center = (el: Element | null | undefined) => {
    const m = scaleK()
    if (!m || !el) return { x: p.width / 2, y: p.height / 2 }
    const e = el.getBoundingClientRect()
    return { x: (e.left + e.width / 2 - m.r.left) / m.k, y: (e.top + e.height / 2 - m.r.top) / m.k }
  }
  const boardRect = () => {
    const m = scaleK()
    const b = boardRef.current?.getBoundingClientRect()
    if (!m || !b) return { x: 0, y: 0, w: p.width, h: p.height }
    return { x: (b.left - m.r.left) / m.k, y: (b.top - m.r.top) / m.k, w: b.width / m.k, h: b.height / m.k }
  }

  /* ───── 규칙 ───── */
  const remaining = (g: number) => Math.max(0, cfgRef.current.targets[g] - S.collected[g])
  const shown = (g: number) => Math.max(0, cfgRef.current.targets[g] - S.landed[g])
  const allDone = () => [0, 1, 2].every(g => remaining(g) === 0)

  /** 날아오는 것을 기다리지 않고 표시값 = 실제값 (다시 시작 · 효과 끄기) */
  const flush = () => {
    S.flyers = []
    S.landed = S.collected.slice()
  }

  /** 결과 창 입력 잠금 — 누른 시각(e.timeStamp)으로 판정하니 시계도 performance.now */
  const [retryLock] = useState(() => createInputLock(300))
  const retryDownAt = useRef(0)
  const setResult = (win: boolean, early: boolean) => {
    S.result = { win, at: S.t, early, regret: false }
    retryLock.open(performance.now())
    touch()
  }

  /** 판정: 연쇄가 다 끝나고(idle) 날아오던 아이콘이 다 도착한 뒤에만 */
  const judge = () => {
    const r = S.result
    if (r) {
      if (r.early && !r.regret && S.phase === 'idle' && allDone()) {
        r.regret = true
        note('⚠ 연쇄가 목표를 모두 채웠는데 이미 실패 — 이동 0 에서 바로 판정한 결과', true)
      }
      return
    }
    // 성공 · 실패 모두 — 실패만 먼저 내면 창 위로 아이콘이 날고 "남은 목표" 와 HUD 숫자가 어긋난다
    if (S.phase !== 'idle' || S.flyers.length) return
    if (allDone()) setResult(true, false)
    else if (S.movesLeft <= 0) setResult(false, false)
  }

  /** 블록을 깬다: 실제값은 지금, 표시값은 아이콘이 도착할 때 */
  const clear = (idx: number[]) => {
    const c = cfgRef.current
    S.chain++
    idx.sort((a, b) => a - b)
    const byKind: number[][] = [[], [], [], []]
    for (const i of idx) {
      S.pop[i] = true
      byKind[S.types[i]].push(i)
    }
    S.score += idx.length * POINTS * S.chain
    const b = boardRect()
    const gp = goalsRef.current
    const panelTop = center(gp).y - (gp?.offsetHeight ?? 0) / 2
    const wide = p.aspect === '16:9'
    const reduced = prefersReducedMotion()
    let order = 0
    for (let g = 0; g < 3; g++) {
      // 남은 개수까지만 목표로 날린다 — 넘친 블록은 점수만 (표시값이 음수가 되지 않게)
      const k = Math.min(byKind[g].length, remaining(g))
      if (!k) continue
      S.collected[g] += k
      if (!c.juice || c.flyMs <= 0) {
        // 나쁜 예(효과 끄기) · 비행 0ms: 깨지는 순간 숫자만 바뀐다
        S.landed[g] = S.collected[g]
        if (c.juice) S.goalPulse[g] = 1
        continue
      }
      const to = center(goalIconRefs.current[g])
      const n = reduced ? 1 : k // 동작 줄이기: 묶음 하나가 k 개를 들고 간다
      for (let j = 0; j < n; j++) {
        const i = byKind[g][j]
        const fx = b.x + ((i % COLS) + 0.5) * (b.w / COLS)
        const fy = b.y + (Math.floor(i / COLS) + 0.5) * (b.h / ROWS)
        const side = ((j + g) % 2 ? 1 : -1) * (70 + ((j * 47) % 130))
        S.flyers.push({
          g,
          count: reduced ? k : 1,
          start: S.t + 0.06 + order++ * STAGGER,
          dur: c.flyMs / 1000,
          x0: fx,
          y0: fy,
          // 16:9 는 목표가 보드 옆에 가로로 늘어선다 — 조절점을 목표 패널 위로 올려 위에서 내려앉게 (다른 목표 아이콘을 가로지르지 않게)
          cx: wide ? to.x + side / 2 : (fx + to.x) / 2 + side,
          cy: wide ? Math.min(fy, panelTop) - 160 - Math.max(0, fy - panelTop) / 2 : Math.min(fy, to.y) - 140,
          x1: to.x,
          y1: to.y,
        })
      }
    }
    S.phase = 'pop'
    S.phaseT = 0
    touch()
  }

  /** 깨진 칸을 위에서 채운다 (fall = 몇 칸 떨어지는가) */
  const gravity = () => {
    for (let c = 0; c < COLS; c++) {
      let w = ROWS - 1
      for (let r = ROWS - 1; r >= 0; r--) {
        const i = r * COLS + c
        if (S.pop[i]) continue
        const j = w * COLS + c
        S.types[j] = S.types[i]
        S.fall[j] = w - r
        w--
      }
      const empty = w + 1
      for (let r = w; r >= 0; r--) {
        S.types[r * COLS + c] = Math.floor(rand(S) * KINDS)
        S.fall[r * COLS + c] = empty
      }
    }
    S.pop.fill(false)
  }

  /** 깰 묶음 고르기. jitter 를 주면 사람처럼 가끔 덜 좋은 묶음을 고른다 (자동 데모가 너무 빨리 끝나지 않게) */
  const bestGroup = (jitter = 0) => {
    let best: number[] = []
    let bestScore = -1
    const seen = new Set<number>()
    for (let i = 0; i < N; i++) {
      if (seen.has(i)) continue
      const g = groupAt(S.types, i)
      g.forEach(x => seen.add(x))
      if (g.length < 2) continue
      const k = S.types[i]
      const sc = g.length + (k < 3 && remaining(k) > 0 ? 5 : 0) + rand(S) * jitter
      if (sc > bestScore) {
        best = g
        bestScore = sc
      }
    }
    return best
  }

  /** 낙하가 끝났다: 강제 연쇄 → 자연 연쇄(3개 줄) → 없으면 끝 */
  const afterFall = () => {
    S.fall.fill(0)
    let next: number[] = []
    if (S.forced > 0) {
      S.forced--
      next = bestGroup()
    }
    if (!next.length && S.chain < MAX_CHAIN) next = runs(S.types)
    if (next.length) clear(next)
    else {
      S.phase = 'idle'
      S.chain = 0
      touch()
    }
  }

  /** 목표를 다 채우고 비행을 기다리는 동안은 이동 · 부스터를 쓰지 않는다 */
  const waitNote = () => (note('목표 완료 — 날아오는 아이콘이 도착하면 판정'), false)

  /** 묶음 누르기 (이동 −1) */
  const tap = (i: number) => {
    const c = cfgRef.current
    if (S.result) return false
    if (S.phase !== 'idle') {
      note('연쇄 처리 중 — 끝나면 다시 누른다')
      return false
    }
    if (S.movesLeft <= 0) return false
    if (allDone()) return waitNote()
    const g = groupAt(S.types, i)
    if (g.length < 2) {
      S.shake = { i, until: S.t + 0.3 }
      note(`${NAMES[S.types[i]]} 하나뿐 — 같은 자원이 2개 이상 붙어 있어야 깨진다`)
      return false
    }
    S.movesLeft--
    clear(g)
    // 나쁜 규칙: 이 이동이 일으킬 연쇄를 기다리지 않고 바로 판정
    if (!c.deferFail && S.movesLeft === 0 && !allDone()) setResult(false, true)
    return true
  }

  /** 부스터 (이동을 쓰지 않는다). 0개면 상점 안내 */
  const fireBooster = (k: number) => {
    if (S.result) return
    if (S.boosters[k] <= 0) {
      S.shopHint = { k, until: S.t + 2.4 }
      note(`${BOOSTERS[k].name} 0개 — 보급 상점에서 충전 (모의 안내 · 이 표본은 결제하지 않는다)`)
      return
    }
    if (S.phase !== 'idle') {
      note('연쇄 처리 중 — 부스터는 연쇄가 끝난 뒤')
      return
    }
    if (allDone()) return void waitNote()
    S.boosters[k]--
    const r = Math.floor(S.cursor / COLS)
    const c = S.cursor % COLS
    if (k === 2) {
      // 재배치: 섞기만 한다. 섞은 뒤 3개 줄이 생기면 연쇄
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(rand(S) * (i + 1))
        ;[S.types[i], S.types[j]] = [S.types[j], S.types[i]]
      }
      S.shuffleT = SHUFFLE
      S.phase = 'fall'
      S.phaseT = 0
      S.fall.fill(0)
      touch()
    } else {
      const idx: number[] = []
      for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++) if (k === 1 ? rr === r : Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) idx.push(rr * COLS + cc)
      clear(idx)
    }
    note(`${BOOSTERS[k].name} — 이동은 그대로 ${S.movesLeft}`)
  }

  const restart = (why = '처음부터 — 새 보드') => {
    const c = cfgRef.current
    const keep = { t: S.t, humanAt: S.humanAt, autoStep: S.autoStep, cursor: S.cursor, kbd: S.kbd, version: S.version + 1 }
    Object.assign(S, initial(S.seed + 1013, c.moves, c.boosterStock), keep)
    note(why)
  }

  const handle = (id: string, auto = false) => {
    if (id === 'reset') return restart()
    if (id === 'last') {
      // 이동 1 · 목표마다 2개 남긴 상태에서 마지막 이동 → 강제 연쇄 2단이 나머지를 채운다
      if (S.result || S.phase !== 'idle') restart()
      flush()
      const c = cfgRef.current
      for (let g = 0; g < 3; g++) S.collected[g] = Math.max(S.collected[g], c.targets[g] - 2)
      S.landed = S.collected.slice()
      S.movesLeft = 1
      const g = bestGroup()
      if (g.length && tap(g[0])) S.forced = 2
      note(c.deferFail ? '마지막 이동 — 이동 0 이지만 연쇄가 끝날 때까지 판정하지 않는다' : '마지막 이동 — 즉시 판정: 연쇄가 시작되기도 전에 실패', !c.deferFail)
      return
    }
    if (S.result) return note('결과가 나왔다 — "다시 하기" 나 "처음부터"')
    if (id === 'booster') {
      const k = S.boosters.findIndex(b => b > 0)
      return fireBooster(k < 0 ? 1 : k)
    }
    if (S.phase !== 'idle') return note('연쇄 처리 중 — 끝나면 다시 누른다')
    const g = bestGroup(auto ? 9 : 0)
    if (!g.length) return restart('깰 묶음이 없다 — 새 보드')
    S.cursor = g[0]
    if (tap(g[0]) && id === 'chain') S.forced = 2
  }

  useTrigger(p.trigger, id => {
    human()
    handle(id)
    touch()
    sync()
  })

  /* ───── param 이 바뀌면 상태를 그 안으로 ───── */
  const prevMoves = useRef(moves)
  useEffect(() => {
    const used = prevMoves.current - S.movesLeft
    prevMoves.current = moves
    if (S.result) restart('이동 수가 바뀌어 새로 시작')
    else S.movesLeft = Math.max(S.movesLeft > 0 ? 1 : 0, moves - used) // 쓴 이동 수는 그대로, 한도 안으로
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves])
  useEffect(() => {
    if (S.result) restart('목표 개수가 바뀌어 새로 시작')
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalCount])
  useEffect(() => {
    S.boosters = boosterStart(boosterStock)
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boosterStock])
  // 효과를 끄면 날아오던 것을 그 자리에서 끝낸다 (숫자만 바뀌는 나쁜 예와 섞이지 않게)
  useEffect(() => {
    if (!juice) flush()
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juice])

  /* ───── 자동 데모: 묶음 깨기 · 연쇄 · 부스터를 돌리다 끝나면 새 판 ───── */
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    0.9,
    () => {
      if (!p.thumbnail && S.t - S.humanAt < MANUAL_PAUSE) return
      if (S.result) {
        if (S.t - S.result.at > 2.6) restart('자동 데모 — 새 판')
      } else if (S.phase === 'idle' && !allDone()) {
        const step = S.autoStep++ % 7
        if (step === 5 && S.boosters.some(b => b > 0)) {
          S.cursor = bestGroup()[0] ?? S.cursor
          handle('booster', true)
        } else handle(step === 2 ? 'chain' : 'match', true)
      }
      touch()
      sync()
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    if (S.phase !== 'idle') {
      S.phaseT += dt
      if (S.phase === 'pop' && S.phaseT >= POP) {
        gravity()
        S.phase = 'fall'
        S.phaseT = 0
      } else if (S.phase === 'fall' && S.phaseT >= FALL) afterFall()
    }
    if (S.flyers.length) {
      const left: Flyer[] = []
      for (const f of S.flyers) {
        if (S.t - f.start >= f.dur) {
          // 도착: 표시값을 하나 줄인다 (실제값을 앞지르지 않게)
          S.landed[f.g] = Math.min(S.collected[f.g], S.landed[f.g] + f.count)
          S.goalPulse[f.g] = 1
        } else left.push(f)
      }
      S.flyers = left
    }
    for (let g = 0; g < 3; g++) S.goalPulse[g] = Math.max(0, S.goalPulse[g] - dt * 5)
    S.shuffleT = Math.max(0, S.shuffleT - dt)
    S.shownScore = cfgRef.current.juice ? damp(S.shownScore, S.score, 8, dt) : S.score
    if (Math.abs(S.shownScore - S.score) < 1) S.shownScore = S.score
    judge()
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    if (S.shopHint && S.shopHint.until <= S.t) {
      S.shopHint = null
      touch()
    }
    paint()
    sync()
  })

  const paint = () => {
    const c = cfgRef.current
    // 보드
    const fallK = S.phase === 'fall' ? Math.min(1, S.phaseT / FALL) : 1
    const popK = S.phase === 'pop' ? Math.min(1, S.phaseT / POP) : 0
    for (let i = 0; i < N; i++) {
      const el = cellRefs.current[i]
      if (!el) continue
      const t = String(S.types[i])
      if (el.dataset.type !== t) el.dataset.type = t
      let tf = ''
      if (S.pop[i]) tf = `scale(${1 - popK * popK})`
      else if (S.fall[i] > 0) tf = `translateY(${-S.fall[i] * (1 - fallK * fallK) * 100}%)`
      else if (S.shake && S.shake.i === i && S.shake.until > S.t) tf = `translateX(${Math.sin(S.t * 70) * 8}%)`
      else if (S.shuffleT > 0) tf = `scale(${1 - 0.3 * Math.sin(Math.PI * (1 - S.shuffleT / SHUFFLE))})`
      el.style.transform = tf
      el.style.opacity = S.pop[i] ? String(1 - popK) : ''
    }
    const cur = cursorRef.current
    if (cur) {
      cur.style.left = `${((S.cursor % COLS) / COLS) * 100}%`
      cur.style.top = `${(Math.floor(S.cursor / COLS) / ROWS) * 100}%`
      cur.toggleAttribute('data-on', (S.kbd || S.hover) && !S.result)
    }
    // 남은 이동
    const warn = c.juice && c.warnAt > 0 && S.movesLeft <= c.warnAt && !S.result
    const mv = movesRef.current
    if (mv) {
      mv.toggleAttribute('data-warn', warn)
      mv.toggleAttribute('data-critical', warn && S.movesLeft <= 2)
    }
    if (movesNumRef.current) movesNumRef.current.textContent = String(S.movesLeft)
    if (movesLabelRef.current)
      movesLabelRef.current.textContent = S.movesLeft === 0 && S.phase !== 'idle' && !S.result ? '연쇄 처리 중' : warn ? '이동 부족!' : '남은 이동'
    pipRefs.current.forEach((el, i) => el?.toggleAttribute('data-on', i < S.movesLeft))
    // 목표
    for (let g = 0; g < 3; g++) {
      const sh = shown(g)
      const rem = remaining(g)
      const slot = goalRefs.current[g]
      if (slot) {
        slot.toggleAttribute('data-done', sh === 0)
        slot.style.setProperty('--pulse', String(S.goalPulse[g]))
      }
      const n = goalNumRefs.current[g]
      if (n) n.textContent = String(sh)
      const l = ledgerRefs.current[g]
      if (l) l.textContent = `실제 ${rem} · 오는 중 ${sh - rem}`
    }
    // 점수 · 별
    if (scoreNumRef.current) scoreNumRef.current.textContent = formatNumber(S.shownScore)
    if (fillRef.current) fillRef.current.style.width = `${Math.min(1, S.shownScore / SCORE_MAX) * 100}%`
    starRefs.current.forEach((el, j) => el?.toggleAttribute('data-on', S.shownScore >= c.stars[j]))
    // 날아가는 아이콘 (만들어 둔 것을 돌려쓴다)
    for (let i = 0; i < POOL; i++) {
      const el = flyerRefs.current[i]
      if (!el) continue
      const f = S.flyers[i]
      const k = f ? (S.t - f.start) / f.dur : -1
      if (!f || k < 0) {
        if (el.style.opacity !== '0') el.style.opacity = '0'
        continue
      }
      const e = k * k * (3 - 2 * k)
      const u = 1 - e
      const x = u * u * f.x0 + 2 * u * e * f.cx + e * e * f.x1
      const y = u * u * f.y0 + 2 * u * e * f.cy + e * e * f.y1
      el.dataset.g = String(f.g)
      el.style.opacity = '1'
      el.style.transform = `translate(${x}px, ${y}px) scale(${1.25 - 0.45 * e})`
    }
  }
  useLayoutEffect(paint)

  /* ───── 결과 창 포커스: 열리면 다시 하기 버튼, 닫히면 연 곳으로 (무대 안에 포커스가 있을 때만) ───── */
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  useLayoutEffect(() => {
    const root = rootRef.current
    const open = !!S.result
    if (open === wasOpen.current) return
    wasOpen.current = open
    const a = document.activeElement
    if (!root || p.thumbnail || !(a instanceof HTMLElement) || !root.contains(a)) return
    if (open) {
      opener.current = a
      retryRef.current?.focus()
    } else (opener.current?.isConnected && opener.current !== retryRef.current ? opener.current : root).focus()
  })

  /* ───── 입력 ───── */
  const cellAt = (e: ReactPointerEvent) => {
    const r = boardRef.current?.getBoundingClientRect()
    if (!r) return -1
    const c = Math.floor(((e.clientX - r.left) / r.width) * COLS)
    const row = Math.floor(((e.clientY - r.top) / r.height) * ROWS)
    return c < 0 || c >= COLS || row < 0 || row >= ROWS ? -1 : row * COLS + c
  }
  // 결과 창이 없을 때만 방향키(커서) · Enter(깨기)를 먹는다. 그 밖의 키(Space · 숫자 · J …)는 갤러리로
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const onButton = !!(e.target as HTMLElement).closest('button')
    if (S.result) {
      if (e.key !== 'Enter') return
      // 입력 잠금: 창이 막 열렸을 때 누른 Enter · 자동 반복은 먹기만 한다 (먹으면 다시 하기 버튼의 click 도 나지 않는다)
      if (e.repeat || retryLock.blocks(e.timeStamp)) return true
      if (onButton) return
      human()
      restart()
    } else if (ARROWS[e.key]) {
      const [dr, dc] = ARROWS[e.key]
      const r = Math.min(ROWS - 1, Math.max(0, Math.floor(S.cursor / COLS) + dr))
      const c = Math.min(COLS - 1, Math.max(0, (S.cursor % COLS) + dc))
      S.cursor = r * COLS + c
      S.kbd = true
      human()
      paint()
    } else if (e.key === 'Enter' && !onButton) {
      if (!e.repeat) {
        S.kbd = true
        human()
        tap(S.cursor)
      }
    } else return
    touch()
    sync()
    return true
  })

  /* ───── 렌더 ───── */
  const r = S.result
  const earned = stars.filter(t => S.score >= t).length
  const status = r
    ? r.win
      ? '스테이지 완료'
      : '스테이지 실패'
    : S.phase !== 'idle'
      ? `연쇄 ×${Math.max(1, S.chain)} 처리 중${S.movesLeft === 0 ? ' — 이동 0, 판정은 연쇄가 끝난 뒤' : ''}`
      : S.flyers.length && (allDone() || S.movesLeft <= 0)
        ? `${allDone() ? '목표 완료' : '이동 0'} — 마지막 아이콘이 도착하면 판정`
        : deferFail
          ? '판정: 마지막 연쇄 · 비행이 끝난 뒤'
          : '⚠ 판정: 이동 0 즉시 (나쁜 규칙)'
  const left = [0, 1, 2].filter(g => remaining(g) > 0).map(g => `${NAMES[g]} ${remaining(g)}`)

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="퍼즐 목표 HUD 데모 (방향키 커서 · Enter 깨기)"
      onKeyDown={onKeyDown}
      onPointerDown={human}
    >
      {/* ───── 위: 남은 이동 · 목표 ───── */}
      <header className={s.top}>
        <div ref={movesRef} className={s.moves} data-part="moves">
          <span ref={movesLabelRef} className={s.movesLabel}>
            남은 이동
          </span>
          <b ref={movesNumRef} className={s.movesNum}>
            {S.movesLeft}
          </b>
          <div className={s.pips} aria-hidden>
            {Array.from({ length: moves }, (_, i) => (
              <i
                key={i}
                ref={el => {
                  pipRefs.current[i] = el
                }}
                data-zone={(juice && i < warnAt) || undefined}
              />
            ))}
          </div>
        </div>
        <div ref={goalsRef} className={s.goals} data-part="goals" data-pin={p.aspect === '9:16' ? 'left' : 'right'}>
          <div className={s.goalsHead}>
            <span>정비 구역 07 · 회수 목표</span>
            <small>도착하면 −1 · 비행 {flyMs > 0 && juice ? `${(flyMs / 1000).toFixed(2)}초` : '없음'}</small>
          </div>
          <div className={s.goalRow}>
            {[0, 1, 2].map(g => (
              <div
                key={g}
                ref={el => {
                  goalRefs.current[g] = el
                }}
                className={s.goal}
                data-g={g}
                data-part={g === 0 ? 'fly' : undefined}
              >
                <span
                  ref={el => {
                    goalIconRefs.current[g] = el
                  }}
                  className={s.goalIcon}
                >
                  <svg viewBox="-50 -50 100 100" aria-hidden>
                    <Shape k={g} />
                  </svg>
                </span>
                <span className={s.goalCount}>
                  <b
                    ref={el => {
                      goalNumRefs.current[g] = el
                    }}
                  >
                    {targets[g]}
                  </b>
                  <svg className={s.check} viewBox="-20 -20 40 40" aria-hidden>
                    <circle r="18" />
                    <path d="M-9 0l6 6 11-12" />
                  </svg>
                </span>
                <span className={s.goalName}>{NAMES[g]}</span>
                <small
                  ref={el => {
                    ledgerRefs.current[g] = el
                  }}
                  className={s.ledger}
                  data-on={showLedger || undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ───── 점수 · 별 임계 마커 (위치 = 임계값 / 최대 점수) ───── */}
      <section className={s.score}>
        <div className={s.scoreHead}>
          <span>점수</span>
          <b ref={scoreNumRef}>0</b>
          <small>/ {formatNumber(SCORE_MAX)}</small>
        </div>
        <div className={s.bar} data-part="stars">
          <div className={s.track}>
            <div ref={fillRef} className={s.fill} />
          </div>
          {stars.map((t, j) => (
            <div
              key={j}
              ref={el => {
                starRefs.current[j] = el
              }}
              className={s.star}
              style={{ left: `${(t / SCORE_MAX) * 100}%` }}
            >
              <svg viewBox="-50 -50 100 100" aria-hidden>
                <StarPath />
              </svg>
              <i />
              <span>{formatNumber(t)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ───── 보드 (최소한의 격자) ───── */}
      <div
        ref={boardRef}
        className={s.board}
        onPointerDown={e => {
          if (p.thumbnail) return
          const i = cellAt(e)
          if (i < 0) return
          human()
          S.cursor = i
          S.kbd = false
          tap(i)
          sync()
        }}
        onPointerMove={e => {
          if (e.pointerType !== 'mouse') return
          const i = cellAt(e)
          if (i >= 0) {
            S.cursor = i
            S.hover = true
            paint()
          }
        }}
        onPointerLeave={() => {
          S.hover = false
          paint()
        }}
      >
        {Array.from({ length: N }, (_, i) => (
          <div
            key={i}
            ref={el => {
              cellRefs.current[i] = el
            }}
            className={s.cell}
            style={{ left: `${((i % COLS) / COLS) * 100}%`, top: `${(Math.floor(i / COLS) / ROWS) * 100}%` }}
          >
            <svg viewBox="-50 -50 100 100" aria-hidden>
              {[0, 1, 2, 3].map(k => (
                <Shape key={k} k={k} />
              ))}
            </svg>
          </div>
        ))}
        <div ref={cursorRef} className={s.cursor} />
        <div className={s.note} data-on={!!S.note || undefined} data-bad={S.note?.bad || undefined}>
          {S.note?.text}
        </div>
        {/* 결과 창 (늘 DOM 에 두고 열고 닫는다) */}
        <div className={s.result} data-on={!!r || undefined} data-win={r?.win || undefined} role="dialog" aria-label="스테이지 결과" aria-hidden={!r}>
          <h3>{r ? (r.win ? '정비 구역 07 완료' : '이동을 모두 썼다') : '결과'}</h3>
          <div className={s.resultStars}>
            {[0, 1, 2].map(j => (
              <svg key={j} viewBox="-50 -50 100 100" data-on={(r?.win && j < earned) || undefined} aria-hidden>
                <StarPath />
              </svg>
            ))}
          </div>
          <p>{r ? (r.win ? `점수 ${formatNumber(S.score)} · 별 ${earned}개` : `남은 목표: ${left.join(' · ') || '없음'}`) : ''}</p>
          <p className={s.early} data-on={r?.early || undefined}>
            {r?.regret ? '⚠ 연쇄가 목표를 다 채웠지만 판정이 먼저 났다' : '⚠ 이동 0 즉시 판정 — 연쇄가 아직 끝나지 않았다'}
          </p>
          <button
            ref={retryRef}
            tabIndex={r && !p.thumbnail ? 0 : -1}
            onPointerDown={e => (retryDownAt.current = e.timeStamp)}
            onClick={e => {
              // 마우스 · 터치는 누른 시각, Enter · Space 로 난 click(detail 0)은 그 시각
              if (retryLock.blocks(e.detail ? retryDownAt.current : e.timeStamp)) return
              human()
              restart('다시 하기 — 새 보드')
              sync()
            }}
          >
            다시 하기
          </button>
        </div>
      </div>

      <p className={s.status} data-bad={!deferFail || undefined}>
        {status}
      </p>
      <p className={s.help}>같은 자원 2개 이상 묶음을 누르면 깨진다 · 방향키 커서 + Enter</p>

      {/* ───── 아래: 부스터 (보유 수 배지 · 0개면 충전 안내) ───── */}
      <footer className={s.boosters} data-part="boosters">
        {BOOSTERS.map((b, k) => {
          const n = S.boosters[k]
          return (
            <button
              key={k}
              className={s.booster}
              data-empty={n === 0 || undefined}
              data-hint={S.shopHint?.k === k || undefined}
              tabIndex={p.thumbnail ? -1 : 0}
              aria-label={n === 0 ? `${b.name} 0개 — 충전` : `${b.name} ${n}개 · ${b.what}`}
              onClick={() => {
                human()
                fireBooster(k)
                sync()
              }}
            >
              <svg className={s.bIcon} viewBox="-50 -50 100 100" aria-hidden>
                <BoosterIcon k={k} />
              </svg>
              <span className={s.bName}>{n === 0 ? '충전' : b.name}</span>
              <small>{n === 0 ? '보급 상점' : b.what}</small>
              <i className={s.badge}>{n === 0 ? '+' : n}</i>
            </button>
          )
        })}
      </footer>

      {/* ───── 날아가는 아이콘 풀 ───── */}
      <div className={s.flyers} aria-hidden>
        {Array.from({ length: POOL }, (_, i) => (
          <div
            key={i}
            ref={el => {
              flyerRefs.current[i] = el
            }}
            className={s.flyer}
          >
            <svg viewBox="-50 -50 100 100">
              {[0, 1, 2].map(k => (
                <Shape key={k} k={k} />
              ))}
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── 그림 (직접 그린 SVG) — 색만이 아니라 모양으로도 구분한다 ───── */
function Shape({ k }: { k: number }) {
  return (
    <g data-k={k} className={s.shape}>
      {k === 0 && (
        <>
          {/* 냉각 셀: 육각형 + 눈송이 */}
          <polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" />
          <path className={s.line} d="M0 -22V22M-19 -11L19 11M-19 11L19 -11" />
        </>
      )}
      {k === 1 && (
        <>
          {/* 회로 조각: 사각 칩 + 다리 */}
          <path className={s.line} d="M-20 -46V-34M0 -46V-34M20 -46V-34M-20 34V46M0 34V46M20 34V46M-46 -20H-34M-46 0H-34M-46 20H-34M34 -20H46M34 0H46M34 20H46" />
          <rect x="-34" y="-34" width="68" height="68" rx="8" />
          <rect className={s.inner} x="-14" y="-14" width="28" height="28" rx="4" />
        </>
      )}
      {k === 2 && (
        <>
          {/* 산소 캔: 캡슐 + 밸브 + 띠 */}
          <rect className={s.valve} x="-10" y="-47" width="20" height="12" rx="3" />
          <rect x="-24" y="-38" width="48" height="84" rx="24" />
          <rect className={s.inner} x="-24" y="-2" width="48" height="14" />
        </>
      )}
      {k === 3 && (
        <>
          {/* 수리 키트: 십자 */}
          <path d="M-14 -40H14V-14H40V14H14V40H-14V14H-40V-14H-14Z" />
          <rect className={s.inner} x="-8" y="-8" width="16" height="16" rx="3" />
        </>
      )}
    </g>
  )
}

function StarPath() {
  return <polygon points="0,-46 13,-16 46,-14 20,8 28,42 0,24 -28,42 -20,8 -46,-14 -13,-16" />
}

function BoosterIcon({ k }: { k: number }) {
  if (k === 0)
    return (
      <>
        <polygon points="0,-46 10,-18 38,-30 22,-4 46,10 16,14 18,44 0,22 -18,44 -16,14 -46,10 -22,-4 -38,-30 -10,-18" />
        <circle r="12" className={s.bCore} />
      </>
    )
  if (k === 1)
    return (
      <>
        <rect x="-30" y="-9" width="60" height="18" rx="4" />
        <polygon points="-46,0 -26,-20 -26,20" />
        <polygon points="46,0 26,-20 26,20" />
      </>
    )
  return (
    <>
      <path className={s.bLine} d="M-30 -8A32 32 0 0 1 26 -18M30 8A32 32 0 0 1 -26 18" />
      <polygon points="34,-34 34,-6 8,-16" />
      <polygon points="-34,34 -34,6 -8,16" />
    </>
  )
}
