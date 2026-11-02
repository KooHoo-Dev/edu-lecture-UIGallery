import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { easeInOutSine, easeOutCubic, formatNumber } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import type { SpecimenProps } from '../../core/types'
import { createRecycler, itemOffset, visibleRange, type IndexRange, type Recycler } from '../../core/virtualList'
import { CREST_PATHS, generateRows, reshuffle, rng, type Row } from './model'
import s from './style.module.css'

export { meta } from './meta'

/** Unity ScrollRect 기본값: 관성 감속률(1초 뒤 남는 속도 비율) · 탄성(되돌아오는 시간, 초) */
const DECEL = 0.135
const LAMBDA = -Math.log(DECEL)
const ELASTICITY = 0.1
/** 사람이 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** 디버그 지도의 재배치 화살표가 남는 시간(게임 시간 초) — 배속 0.25 면 4배 오래 보인다 */
const ARC_LIFE = 0.9
const HIST = 120
/** 가상화 없음 모드에서 한 프레임에 만드는 셀 수 상한 (긴 멈춤 대신 '만든 셀' 이 차오르는 것을 보이게) */
const MOUNT_BATCH = 60

/** recycle = 셀 돌려쓰기 · grow = 재활용 끄기(만든 셀을 버리지 않음) · all = 가상화 없음(항목마다 셀, 나쁜 예) */
type Mode = 'recycle' | 'grow' | 'all'

interface Fields {
  tag: HTMLElement
  rank: HTMLElement
  delta: HTMLElement
  crest: SVGPathElement
  name: HTMLElement
  sub: HTMLElement
  score: HTMLElement
  cheer: HTMLElement
  cheers: HTMLElement
}

/** 셀 하나 (= Unity 의 셀 프리팹 인스턴스). index 는 지금 빌려 보여 주는 항목 */
interface CellRec {
  n: number
  el: HTMLDivElement | null
  f: Fields | null
  index: number
  stamp: number
  shown: boolean
  posIndex: number
  h: number
  ver: number
  /** cellState = 'cell'(흔한 실수)일 때만 쓰는 '셀에 남은' 응원 표시 */
  cheered: boolean
  reusedAt: number
  hl: boolean
  fresh: boolean
  flash: number
}

interface Move {
  cell: number
  from: number
  to: number
  at: number
}

interface Sim {
  t: number
  version: number
  r: () => number
  rows: Row[]
  myIndex: number
  dataVer: number
  gen: number
  mode: Mode
  count: number
  recycler: Recycler
  map: Map<number, number>
  range: IndexRange | null
  cells: CellRec[]
  /** 셀 번호마다 '하트가 켜진 항목을 보여 준 적이 있나' — 상태를 셀에 두면 그 하트가 남는다 */
  everCheer: boolean[]
  frame: number
  h: number
  scroll: number
  vel: number
  lastScroll: number
  drag: { id: number; y0: number; s0: number; lastY: number; lastT: number; moved: boolean; target: Element } | null
  anim: { from: number; to: number; t: number; dur: number; ease: 'out' | 'inout' } | null
  moves: Move[]
  hist: number[]
  highlightUntil: number
  flashUntil: number
  note: { text: string; bad: boolean; until: number } | null
  realT: number
  autoStep: number
  cheerCell: number
  costPending: string | null
  cost: { cells: number; ms: number; what: string } | null
  /** 실제로 DOM 에 만들어 붙인 셀 수 (가상화 없음 모드에서는 프레임마다 조금씩 늘어난다) */
  mounted: number
  /** 셀 만들기에 든 시간 합 (JS + 레이아웃) */
  createMs: number
  domCount: number
  mapKey: string
  pinned: string
}

const hue = (n: number) => Math.round((n * 137.5) % 360)

/** Mathf.SmoothDamp 와 같은 식 — ScrollRect 의 탄성 복귀가 이것을 쓴다 */
function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, dt: number): [number, number] {
  const omega = 2 / Math.max(0.0001, smoothTime)
  const x = omega * dt
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = cur - target
  const temp = (vel + omega * change) * dt
  let v = (vel - omega * temp) * e
  let out = target + (change + temp) * e
  if (target - cur > 0 === out > target) {
    out = target
    v = 0
  }
  return [out, v]
}

/** 끌어서 범위 밖으로 당길 때 고무줄처럼 덜 따라오게 (ScrollRect.RubberDelta 와 같은 식) */
const rubber = (over: number, view: number) => (1 - 1 / ((Math.abs(over) * 0.55) / view + 1)) * view * Math.sign(over)

/**
 * 재활용 스크롤 리스트 — 1,000명 랭킹을 셀 십여 개로 돌려 보여 준다.
 * ① visibleRange 로 보이는 항목 범위 ② createRecycler 로 범위를 벗어난 셀을 새 항목에 다시 배정 ③ 셀은 위치만 옮기고 내용만 다시 채운다.
 * 셀 수가 바뀔 때만 React 가 렌더하고, 스크롤 · 위치 · 글자는 매 프레임 ref 로 DOM 을 직접 고친다.
 */
export default function RecycledScrollList(p: SpecimenProps) {
  const juice = p.juice
  const recycle = bool(p.params, 'recycle', true)
  const overscan = Math.round(num(p.params, 'overscan', 1))
  const itemHeight = num(p.params, 'itemHeight', 104)
  const showDebug = bool(p.params, 'showDebug', true)
  const cellState = (str(p.params, 'cellState', 'data') === 'cell' ? 'cell' : 'data') as 'data' | 'cell'
  const dataCount = Math.round(num(p.params, 'dataCount', 1000))
  const portrait = p.aspect === '9:16'
  const vpH = portrait ? 890 : 650
  const mode: Mode = !juice ? 'all' : recycle ? 'recycle' : 'grow'
  const reduced = prefersReducedMotion()

  const cfg = { juice, overscan, itemHeight, showDebug, cellState, vpH, portrait, reduced, playing: p.playing }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(mode, dataCount, itemHeight, vpH, overscan)
  const S = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(S.version)
  const sync = () => {
    if (S.version !== shown.current) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const touch = () => S.version++
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 2.8 }
    touch()
  }
  const human = () => {
    S.realT = S.t
  }

  const lastNote = useRef<Sim['note']>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLElement>(null)
  const pinnedRef = useRef<HTMLButtonElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const graphRef = useRef<HTMLCanvasElement>(null)
  const txt = useRef<Record<string, HTMLElement | null>>({})
  const setText = (k: string, v: string) => {
    const el = txt.current[k]
    if (el && el.textContent !== v) el.textContent = v
  }

  const maxScroll = () => Math.max(0, S.rows.length * cfgRef.current.itemHeight - cfgRef.current.vpH)

  /* ───── 셀 기록 ───── */
  const ensureRec = (n: number): CellRec => {
    let rec = S.cells[n]
    if (!rec) {
      rec = { n, el: null, f: null, index: -1, stamp: -1, shown: true, posIndex: -2, h: -1, ver: -1, cheered: false, reusedAt: -9, hl: false, fresh: false, flash: 0 }
      S.cells[n] = rec
    }
    return rec
  }
  /* 셀 만들기 (= Instantiate). React 를 거치지 않고 뼈대를 복제해 Content 에 붙인다 — 셀 수가 늘어도 기존 셀은 건드리지 않는다 */
  const skeleton = useRef<HTMLDivElement | null>(null)
  const mountSome = (limit: number): number | null => {
    const content = contentRef.current
    const want = S.recycler.stats().created
    if (!content || S.mounted >= want) return null
    void content.offsetHeight // 이전에 밀린 레이아웃(첫 화면 전체 등)은 먼저 끝내 두고, 셀 만들기만 잰다
    const t0 = performance.now()
    if (!skeleton.current) skeleton.current = makeSkeleton()
    const end = Math.min(want, S.mounted + limit)
    const frag = document.createDocumentFragment()
    for (let n = S.mounted; n < end; n++) {
      const el = skeleton.current.cloneNode(true) as HTMLDivElement
      el.setAttribute('data-cell', String(n))
      const q = <T extends Element>(k: string) => el.querySelector(`[data-f="${k}"]`) as T
      const rec = ensureRec(n)
      rec.el = el
      rec.f = { tag: q('tag'), rank: q('rank'), delta: q('delta'), crest: q('crest'), name: q('name'), sub: q('sub'), score: q('score'), cheer: q('cheer'), cheers: q('cheers') }
      rec.f.tag.textContent = `셀 ${n}`
      rec.shown = true
      rec.cheered = cfgRef.current.cellState === 'cell' && !!S.everCheer[n]
      rec.posIndex = -2
      rec.h = -1
      rec.ver = -1
      el.style.setProperty('--cell-hue', String(hue(n)))
      frag.appendChild(el)
    }
    content.appendChild(frag)
    S.mounted = end
    S.domCount = content.getElementsByTagName('*').length
    return t0
  }

  /** 셀에 항목 내용 채우기 (Unity 의 Bind / ListView.bindItem) */
  const bind = (rec: CellRec) => {
    const row = S.rows[rec.index]
    const f = rec.f
    const el = rec.el
    if (!row || !f || !el) return
    f.rank.textContent = String(rec.index + 1)
    if (rec.index < 3) el.setAttribute('data-medal', String(rec.index + 1))
    else el.removeAttribute('data-medal')
    el.toggleAttribute('data-me', !!row.me)
    f.delta.textContent = row.delta > 0 ? `▲${row.delta}` : row.delta < 0 ? `▼${-row.delta}` : ''
    f.delta.setAttribute('data-dir', row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : 'none')
    f.crest.setAttribute('d', CREST_PATHS[row.crest])
    el.style.setProperty('--crest-hue', String((row.squad * 40 + 170) % 360))
    f.name.textContent = row.me ? `${row.name} (나)` : row.name
    f.sub.textContent = `${row.squad}분대 · Lv ${row.level}`
    f.score.textContent = formatNumber(row.score)
    f.cheers.textContent = String(row.cheers)
    if (row.cheered) S.everCheer[rec.n] = true
    if (cfgRef.current.cellState === 'cell' && row.cheered) rec.cheered = true // 흔한 실수: 켜기만 하고 끄지 않는다
    paintCheer(rec)
    rec.ver = S.dataVer
  }
  const paintCheer = (rec: CellRec) => {
    const row = S.rows[rec.index]
    if (!row || !rec.f || !rec.el) return
    const cellMode = cfgRef.current.cellState === 'cell'
    const on = cellMode ? rec.cheered : row.cheered
    rec.f.cheer.toggleAttribute('data-on', on)
    rec.el.toggleAttribute('data-stale', cellMode && rec.cheered !== row.cheered)
    rec.f.cheer.setAttribute('aria-label', on ? `${row.name} 응원 취소` : `${row.name} 응원`)
  }

  /* ───── 목록 다시 만들기 (모드 · 데이터 수가 바뀔 때) ───── */
  const resetList = (m: Mode, count: number) => {
    const c = cfgRef.current
    if (count !== S.count) {
      S.rows = generateRows(count)
      S.myIndex = S.rows.findIndex(r => r.me)
      S.count = count
      S.scroll = clamp(S.scroll, 0, maxScroll())
    }
    S.gen++
    contentRef.current?.replaceChildren()
    S.mounted = 0
    S.createMs = 0
    S.domCount = 0
    S.cost = null
    S.costPending = null
    S.mode = m
    S.recycler = createRecycler(m === 'recycle')
    S.cells = []
    S.everCheer = []
    S.moves = []
    S.range = null
    S.map = new Map()
    S.cheerCell = -1
    S.dataVer++
    if (m === 'all') {
      S.range = { first: 0, last: S.rows.length - 1 }
      S.map = S.recycler.layout(S.range)
    } else {
      S.range = visibleRange(S.scroll, c.vpH, c.itemHeight, S.rows.length, c.overscan)
      S.map = S.recycler.layout(S.range)
    }
    touch()
  }
  const lastKey = useRef(`${mode}|${dataCount}`)
  useEffect(() => {
    const key = `${mode}|${dataCount}`
    if (key === lastKey.current) return
    lastKey.current = key
    resetList(mode, dataCount)
    if (mode === 'all') note(`가상화 없음 — 항목마다 셀을 하나씩, ${formatNumber(S.rows.length)}개를 처음에 다 만든다`, true)
    else if (mode === 'grow') note('재활용 끔 — 새 항목이 보일 때마다 셀을 새로 만들고 버리지 않는다', true)
    else note('재활용 켬 — 화면 밖으로 나간 셀을 새 항목에 다시 쓴다')
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dataCount])
  // 상태 저장 위치를 바꾸면: '셀에' 는 그 셀이 전에 보여 준 하트가 남은 상태로(버그가 처음부터 있었던 것처럼), '데이터에' 는 깨끗하게
  const lastCellState = useRef(cellState)
  useEffect(() => {
    if (lastCellState.current === cellState) return
    lastCellState.current = cellState
    for (const rec of S.cells) if (rec) rec.cheered = cellState === 'cell' && !!S.everCheer[rec.n]
    S.dataVer++
    note(cellState === 'cell' ? '응원 표시를 셀이 들고 있다 — 전에 하트를 보여 준 셀이 지금은 다른 대원을 보여 준다' : '응원 상태를 데이터에 — 셀은 지금 항목을 그대로 보여 준다', cellState === 'cell')
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellState])
  /* ───── 동작 ───── */
  const scrollTo = (to: number, dur: number) => {
    const c = cfgRef.current
    S.vel = 0
    if (!c.juice || c.reduced) {
      S.scroll = to
      S.anim = null
    } else S.anim = { from: S.scroll, to, t: 0, dur, ease: 'out' }
  }
  /** 끝까지 튕기기 — 관성이 정확히 끝을 조금 지나 멈출 속도로 (지나친 만큼 탄성으로 되돌아온다) */
  const fling = (toTop: boolean) => {
    const c = cfgRef.current
    S.anim = null
    S.drag = null
    const dist = toTop ? -(S.scroll + 1.5 * c.vpH) : maxScroll() - S.scroll + 1.5 * c.vpH
    S.vel = dist * LAMBDA
  }
  const jumpMe = () => {
    const c = cfgRef.current
    const h = c.itemHeight
    const target = clamp(S.myIndex * h - (c.vpH - h) / 2, 0, maxScroll())
    S.vel = 0
    S.drag = null
    if (!c.juice) {
      S.scroll = target
      S.anim = null
      note(`내 순위 #${S.myIndex + 1} 로 순간 이동 — 강조가 없어 어느 줄이 나인지 다시 찾아야 한다`, true)
      return
    }
    const far = Math.abs(target - S.scroll) > 2 * c.vpH
    if (far) S.scroll = target - Math.sign(target - S.scroll) * 1.5 * c.vpH
    if (c.reduced) {
      S.scroll = target
      S.anim = null
    } else S.anim = { from: S.scroll, to: target, t: 0, dur: 0.55, ease: 'out' }
    S.highlightUntil = S.t + (c.reduced ? 0 : 0.55) + 1.6
    note(far ? `내 순위 #${S.myIndex + 1} — 먼 거리는 바로 앞까지 건너뛰고 마지막 한 화면만 굴린다` : `내 순위 #${S.myIndex + 1}`)
  }
  const refresh = () => {
    const c = cfgRef.current
    const before = S.myIndex
    S.rows = reshuffle(S.rows, S.r)
    S.myIndex = S.rows.findIndex(r => r.me)
    S.dataVer++
    S.costPending = '순위 변동'
    S.flashUntil = c.juice && !c.reduced ? S.t + 0.9 : 0
    if (S.mode === 'all') note(`순위 변동 — 화면에는 열 줄인데 셀 ${formatNumber(S.rows.length)}개를 모두 다시 채운다`, true)
    else if (S.mode === 'grow') note(`순위 변동 — 버리지 않은 셀 ${formatNumber(S.mounted)}개를 모두 다시 채운다 (화면 밖 셀도 다시 보일 수 있으니까)`, true)
    else note(`순위 변동 — 보이는 셀만 다시 채운다 (내 순위 #${before + 1} → #${S.myIndex + 1})`)
  }
  const cheer = (rec: CellRec, quiet = false) => {
    const row = S.rows[rec.index]
    if (!row) return
    if (cfgRef.current.cellState === 'cell') {
      // 흔한 실수: 버튼이 셀의 그림만 바꾸고 데이터는 그대로 — 표시가 셀에 붙어 다닌다
      rec.cheered = !rec.cheered
      paintCheer(rec)
      if (!quiet) note(`${rec.cheered ? '♥' : '♡'} ${row.name} — 셀 ${rec.n} 의 그림만 바꿨다 (데이터는 그대로)`, true)
    } else {
      row.cheered = !row.cheered
      row.cheers += row.cheered ? 1 : -1
      bind(rec)
      if (!quiet) note(`${row.cheered ? '♥' : '♡'} ${row.name} 응원 — 데이터에 저장, 셀은 그것을 보여 줄 뿐`)
    }
  }
  const cheerScroll = () => {
    const c = cfgRef.current
    const h = c.itemHeight
    const count = S.rows.length
    let idx = Math.ceil(S.scroll / h - 0.001) + 1
    const on = (i: number) => {
      const n = S.map.get(i)
      const rec = n === undefined ? undefined : S.cells[n]
      return c.cellState === 'cell' ? !!rec?.cheered : S.rows[i].cheered
    }
    while (idx < count - 1 && (S.rows[idx].me || on(idx))) idx++
    const n = S.map.get(idx)
    const rec = n === undefined ? undefined : S.cells[n]
    if (rec) cheer(rec, true)
    const row = S.rows[idx]
    if (row) {
      note(
        c.cellState === 'cell'
          ? `♥ #${idx + 1} ${row.name} 응원 → 스크롤: 하트가 셀 ${n} 을 따라 다른 대원에게 간다`
          : `♥ #${idx + 1} ${row.name} 응원 → 스크롤: 하트는 ${row.name} 에게만 남는다`,
        c.cellState === 'cell',
      )
    }
    S.vel = 0
    const to = clamp(S.scroll + 1.6 * c.vpH, 0, maxScroll())
    S.anim = { from: S.scroll, to, t: -0.6, dur: c.juice ? 1.4 : 0.01, ease: 'inout' }
  }

  const handle = (id: string) => {
    if (id === 'fling-bottom') {
      const toTop = S.scroll > maxScroll() * 0.9
      fling(toTop)
      note(toTop ? '이미 맨 아래 — 맨 위로 튕긴다' : `맨 아래로 튕김 — ${formatNumber(S.rows.length)}줄을 지나가도 ${S.mode === 'recycle' ? '셀 수는 그대로' : '셀이 계속 늘어난다'}`, S.mode === 'grow')
    } else if (id === 'jump-me') jumpMe()
    else if (id === 'reshuffle') refresh()
    else if (id === 'cheer-scroll') cheerScroll()
  }
  useTrigger(p.trigger, id => {
    human()
    handle(id)
    touch()
    sync()
  })

  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    3.2,
    () => {
      if (S.t - S.realT < MANUAL_PAUSE || S.drag) return
      const k = S.autoStep++ % 7
      const c = cfgRef.current
      const glide = () => {
        S.vel = 0
        S.anim = { from: S.scroll, to: clamp(S.scroll + 3.5 * c.itemHeight, 0, maxScroll()), t: 0, dur: 2.6, ease: 'inout' }
      }
      // 가상화 없음(셀 1,000개)에서는 무거운 순위 변동 · 끝까지 튕기기를 자동으로 돌리지 않는다 — 버튼으로만 (수업 화면이 멈추지 않게)
      if (S.mode === 'all' && (k === 3 || k >= 5)) glide()
      else if (k === 0) glide()
      else if (k === 1) {
        S.anim = null
        S.vel = 1800
      } else if (k === 2) jumpMe()
      else if (k === 3) refresh()
      else if (k === 4) cheerScroll()
      else if (k === 5) handle('fling-bottom')
      else fling(true)
      touch()
      sync()
    },
    p.trigger?.seq,
  )

  // 갤러리 카드 썸네일(마우스를 올렸을 때): 천천히 굴러 셀이 위에서 아래로 건너가는 것만 짧게 반복
  useAutoplay(
    p.autoplay && p.thumbnail,
    p.playing,
    p.timeScale,
    1.4,
    () => {
      const h = cfgRef.current.itemHeight
      S.vel = 0
      const to = S.scroll > 24 * h ? 7.4 * h : S.scroll + 3 * h
      S.anim = { from: S.scroll, to: clamp(to, 0, maxScroll()), t: 0, dur: 1.2, ease: 'inout' }
    },
  )

  /* ───── 입력: 끌기 · 휠 · 키보드 ───── */
  const stageScale = () => {
    const r = rootRef.current?.getBoundingClientRect()
    return r && r.height ? p.height / r.height : 1
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || e.button !== 0) return
    human()
    S.anim = null
    S.vel = 0
    S.drag = { id: e.pointerId, y0: e.clientY, s0: S.scroll, lastY: S.scroll, lastT: performance.now(), moved: false, target: e.target as Element }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 */
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = S.drag
    if (!d || d.id !== e.pointerId) return
    const c = cfgRef.current
    const dy = (d.y0 - e.clientY) * stageScale()
    if (Math.abs(dy) > 8) d.moved = true
    if (!d.moved) return
    const max = maxScroll()
    let pos = d.s0 + dy
    if (c.juice) {
      if (pos < 0) pos = rubber(pos, c.vpH)
      else if (pos > max) pos = max + rubber(pos - max, c.vpH)
    } else pos = clamp(pos, 0, max)
    const now = performance.now()
    const dtR = Math.max(0.001, (now - d.lastT) / 1000)
    const inst = (pos - d.lastY) / dtR
    S.vel += (inst - S.vel) * 0.5
    d.lastY = pos
    d.lastT = now
    S.scroll = pos
    human()
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = S.drag
    if (!d || d.id !== e.pointerId) return
    S.drag = null
    if (!d.moved) {
      S.vel = 0
      const cell = d.target.closest('[data-cheer]')?.closest('[data-cell]')
      const n = cell ? Number(cell.getAttribute('data-cell')) : NaN
      const rec = Number.isFinite(n) ? S.cells[n] : undefined
      if (rec && rec.index >= 0) cheer(rec)
      sync()
      return
    }
    if (performance.now() - d.lastT > 90) S.vel = 0 // 멈췄다가 놓으면 관성 없음
  }
  useEffect(() => {
    const el = vpRef.current
    if (!el || p.thumbnail) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      human()
      const c = cfgRef.current
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? c.vpH : 1) * 1.4
      const base = S.anim ? S.anim.to : S.scroll
      scrollTo(clamp(base + dy, 0, maxScroll()), 0.2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.thumbnail])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    const c = cfgRef.current
    const h = c.itemHeight
    const base = S.anim ? S.anim.to : S.scroll
    const max = maxScroll()
    let to: number | null = null
    if (e.key === 'ArrowDown') to = base + h
    else if (e.key === 'ArrowUp') to = base - h
    else if (e.key === 'PageDown') to = base + c.vpH - h
    else if (e.key === 'PageUp') to = base - c.vpH + h
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = max
    else if (e.key === 'm' || e.key === 'M') {
      if (e.repeat) return
      jumpMe()
    } else if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('[data-cheer]')) {
      // 응원 버튼에 포커스가 있으면 Enter / Space 로 누른다
      if (e.repeat) return
      const n = Number((e.target as Element).closest('[data-cell]')?.getAttribute('data-cell'))
      const rec = Number.isFinite(n) ? S.cells[n] : undefined
      if (rec && rec.index >= 0) cheer(rec)
    } else return
    if (to !== null) scrollTo(clamp(to, 0, max), 0.2)
    e.preventDefault()
    e.stopPropagation()
    human()
    sync()
  }

  /* ───── 물리 (ScrollRect 와 같은 순서: 범위 밖이면 탄성, 아니면 관성) ───── */
  const physics = (dt: number) => {
    if (dt <= 0 || S.drag) return
    const c = cfgRef.current
    if (S.anim) {
      const a = S.anim
      a.t += dt
      const k = Math.min(1, Math.max(0, a.t) / a.dur)
      S.scroll = a.from + (a.to - a.from) * (a.ease === 'out' ? easeOutCubic(k) : easeInOutSine(k))
      if (k >= 1) S.anim = null
      return
    }
    const max = maxScroll()
    const offset = S.scroll < 0 ? -S.scroll : S.scroll > max ? max - S.scroll : 0
    if (offset !== 0 && c.juice) {
      const target = S.scroll + offset
      ;[S.scroll, S.vel] = smoothDamp(S.scroll, target, S.vel, ELASTICITY, dt)
      if (Math.abs(S.scroll - target) < 0.5) {
        S.scroll = target
        S.vel = 0
      }
    } else if (S.vel !== 0) {
      // 지수 감속을 정확히 적분 (v·dt 로 더하면 프레임레이트에 따라 멈추는 자리가 달라진다)
      const r = Math.pow(DECEL, dt)
      S.scroll += (S.vel * (1 - r)) / LAMBDA
      S.vel *= r
      if (Math.abs(S.vel) < 2) S.vel = 0
      if (!c.juice && (S.scroll < 0 || S.scroll > max)) {
        S.scroll = clamp(S.scroll, 0, max)
        S.vel = 0
      }
    } else if (!c.juice) S.scroll = clamp(S.scroll, 0, max)
  }

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    physics(dt)
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    paint(dt)
    sync()
  })

  /* ───── 그리기 ───── */
  const paint = (dt: number) => {
    const c = cfgRef.current
    const h = c.itemHeight
    const count = S.rows.length
    if (S.h !== h) {
      S.scroll = (S.scroll * h) / S.h
      if (S.anim) S.anim = null
      S.h = h
    }
    S.frame++
    // ① 보이는 범위 ② 셀 배정 (범위가 바뀔 때만)
    if (S.mode !== 'all') {
      const range = visibleRange(S.scroll, c.vpH, h, count, c.overscan)
      if (!S.range || range.first !== S.range.first || range.last !== S.range.last) {
        S.map = S.recycler.layout(range)
        S.range = range
      }
    }
    const st = S.recycler.stats()
    // 셀이 모자라면 만든다. 한 프레임에 MOUNT_BATCH 개까지만 — 1,000개를 한 번에 만들면 페이지 전체가 멈춘다 (정지 중이면 한 번에)
    const mountT0 = mountSome(c.playing ? MOUNT_BATCH : Infinity)
    for (const [index, n] of S.map) {
      const rec = ensureRec(n)
      if (rec.index !== index) {
        if (S.mode === 'recycle' && rec.index >= 0) {
          S.moves.push({ cell: n, from: rec.index, to: index, at: S.t })
          rec.reusedAt = S.t
        }
        rec.index = index
        rec.ver = -1
      }
      rec.stamp = S.frame
    }
    // ③ 셀마다: 켜고 끄기 · 위치 · 내용
    const tBind = performance.now()
    let rebinds = 0
    let active = 0
    const flashing = S.t < S.flashUntil
    for (const rec of S.cells) {
      if (!rec) continue
      const on = rec.index >= 0 && (S.mode !== 'recycle' || rec.stamp === S.frame)
      if (on) active++
      const el = rec.el
      if (!el) continue
      if (on !== rec.shown) {
        el.style.visibility = on ? '' : 'hidden'
        rec.shown = on
      }
      if (!on) continue
      if (rec.posIndex !== rec.index || rec.h !== h) {
        el.style.transform = `translateY(${itemOffset(rec.index, h)}px)`
        el.style.height = `${h}px`
        rec.posIndex = rec.index
        rec.h = h
      }
      if (rec.ver !== S.dataVer) {
        bind(rec)
        rebinds++
      }
      const hl = c.juice && rec.index === S.myIndex && S.t < S.highlightUntil
      if (hl !== rec.hl) {
        el.toggleAttribute('data-hl', hl)
        rec.hl = hl
      }
      const fresh = S.t - rec.reusedAt < 0.5
      if (fresh !== rec.fresh) {
        el.toggleAttribute('data-fresh', fresh)
        rec.fresh = fresh
      }
      const fl = flashing && S.rows[rec.index]?.delta ? (S.flashUntil - S.t) / 0.9 : 0
      if (fl !== rec.flash) {
        el.style.setProperty('--flash', fl.toFixed(3))
        rec.flash = fl
      }
    }
    if (mountT0 !== null || (rebinds > 0 && S.costPending)) {
      void contentRef.current?.offsetHeight // 레이아웃까지 끝내고 잰다 (그리기는 빠진다)
      const now = performance.now()
      if (mountT0 !== null) S.createMs += now - mountT0
      if (rebinds > 0 && S.costPending) {
        S.cost = { cells: rebinds, ms: now - tBind, what: S.costPending }
        S.costPending = null
      }
    }
    // 해설 번호 5: 첫 번째로 온전히 보이는 줄의 응원 버튼
    const cheerIdx = clamp(Math.ceil(S.scroll / h - 0.001), 0, count - 1)
    const cn = S.map.get(cheerIdx) ?? -1
    if (cn !== S.cheerCell && S.cells[cn]?.f) {
      S.cells[S.cheerCell]?.f?.cheer.removeAttribute('data-part')
      S.cells[cn].f!.cheer.setAttribute('data-part', 'cheer')
      S.cheerCell = cn
    }
    if (S.moves.length) S.moves = S.moves.filter(m => S.t - m.at < ARC_LIFE).slice(-60)
    const scrolled = Math.abs(S.scroll - S.lastScroll) > 0.01
    S.lastScroll = S.scroll
    if (dt > 0) {
      S.hist.push(scrolled ? active : rebinds)
      if (S.hist.length > HIST) S.hist.shift()
    }

    // 스크롤 위치: Content 하나만 옮긴다 (ScrollRect 가 Content 의 anchoredPosition 을 바꾸는 것과 같다)
    if (contentRef.current) contentRef.current.style.transform = `translate3d(0, ${-S.scroll}px, 0)`
    const max = maxScroll()
    if (thumbRef.current) {
      const trackH = c.vpH - 16
      const th = Math.max(48, Math.min(trackH, (trackH * c.vpH) / Math.max(1, count * h)))
      thumbRef.current.style.height = `${th}px`
      thumbRef.current.style.transform = `translateY(${(max > 0 ? clamp(S.scroll / max, 0, 1) : 0) * (trackH - th)}px)`
    }
    // 내 순위 고정 행: 내 줄이 화면에 온전히 보이면 숨긴다
    const myTop = S.myIndex * h
    const myVisible = myTop >= S.scroll - 1 && myTop + h <= S.scroll + c.vpH + 1
    const pinState = !c.juice ? 'none' : myVisible ? 'hidden' : myTop < S.scroll ? 'up' : 'down'
    if (pinState !== S.pinned && pinnedRef.current) {
      pinnedRef.current.setAttribute('data-state', pinState)
      S.pinned = pinState
    }

    // 카운터
    const vf = clamp(Math.floor(S.scroll / h), 0, count - 1)
    const vl = clamp(Math.ceil((S.scroll + c.vpH) / h) - 1, 0, count - 1)
    const need = Math.min(count, Math.ceil(c.vpH / h) + 1 + 2 * c.overscan)
    setText('data', formatNumber(count))
    setText('created', formatNumber(S.mounted))
    setText('reused', formatNumber(st.reused))
    setText('active', S.mode === 'recycle' ? `지금 쓰는 셀 ${active} · 대기 ${st.created - active}` : `지금 켜진 셀 ${formatNumber(active)}`)
    setText('dom', formatNumber(S.domCount))
    setText(
      'formula',
      S.mode === 'all'
        ? `필요한 셀 ≈ ${need}개인데 ${formatNumber(count)}개를 모두 만들었다`
        : `필요한 셀 = ⌈${c.vpH} ÷ ${h}⌉ + 1 + 2 × 여유 ${c.overscan} = ${need}${S.mode === 'grow' ? ' — 만든 셀은 계속 는다' : ''}`,
    )
    setText('range', S.mode === 'all' ? `보이는 #${vf + 1} ~ #${vl + 1} · 켜진 셀 #1 ~ #${count} (전부)` : `보이는 #${vf + 1} ~ #${vl + 1} · 셀 배정 #${(S.range?.first ?? 0) + 1} ~ #${(S.range?.last ?? -1) + 1}`)
    setText('touch', formatNumber(S.hist[S.hist.length - 1] ?? 0))
    setText(
      'cost',
      [
        `셀 ${formatNumber(S.mounted)}개 만들기 ${S.createMs.toFixed(0)} ms`,
        S.cost ? `${S.cost.what}: ${formatNumber(S.cost.cells)}개 다시 채움 ${S.cost.ms.toFixed(1)} ms` : '데이터 갱신 때 다시 채운 셀을 잰다',
      ].join(' · ') + ' — JS·레이아웃 실측, 그리기 제외',
    )

    // 지도 · 그래프는 바뀐 것이 있을 때만 다시 그린다 (정지 중 매 프레임 그리지 않게)
    const mapKey = `${S.scroll.toFixed(1)}|${S.moves.length}|${S.dataVer}|${S.mounted}|${c.showDebug}|${h}|${c.cellState}|${c.vpH}|${S.range?.first}-${S.range?.last}`
    if (mapKey !== S.mapKey || S.moves.length) {
      S.mapKey = mapKey
      drawMap()
    }
    if (dt > 0 || !S.hist.length) drawGraph()
  }

  const drawMap = () => {
    const cv = mapRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const c = cfgRef.current
    const W = cv.width
    const H = cv.height
    ctx.clearRect(0, 0, W, H)
    if (!c.showDebug) return
    const h = c.itemHeight
    const count = S.rows.length
    const pad = c.vpH * (c.portrait ? 0.3 : 0.42)
    const top = S.scroll - pad
    const k = H / (c.vpH + 2 * pad)
    const Y = (v: number) => (v - top) * k
    const LX = c.portrait ? 70 : 96
    const CX = LX + 10
    const CW = c.portrait ? 116 : 290
    const rowPx = h * k
    const font = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
    ctx.textBaseline = 'middle'
    // 데이터 자리 (셀 없음 = 점선)
    const i0 = Math.max(0, Math.floor(top / h))
    const i1 = Math.min(count - 1, Math.floor((top + H / k) / h))
    const every = rowPx >= 25 ? 1 : rowPx >= 13 ? 2 : 5
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.font = `22px ${font}`
    ctx.textAlign = 'right'
    for (let i = i0; i <= i1; i++) {
      const y = Y(i * h)
      ctx.strokeStyle = 'rgba(160, 190, 220, 0.32)'
      ctx.strokeRect(CX + 1, y + 2, CW - 2, rowPx - 4)
      if (i % every === 0 || i === S.myIndex) {
        ctx.fillStyle = i === S.myIndex ? '#5ee6c9' : 'rgba(205, 222, 240, 0.8)'
        ctx.fillText(i === S.myIndex ? `나 #${i + 1}` : `#${i + 1}`, LX, y + rowPx / 2)
      }
    }
    ctx.setLineDash([])
    // 셀 배정 범위 (보이는 범위 + 여유분)
    if (S.range && S.mode !== 'all' && S.range.last >= S.range.first) {
      ctx.fillStyle = 'rgba(94, 230, 201, 0.10)'
      ctx.fillRect(CX - 8, Y(S.range.first * h), CW + 16, (S.range.last - S.range.first + 1) * rowPx)
    }
    // 셀
    ctx.textAlign = 'left'
    ctx.font = `bold 22px ${font}`
    for (const rec of S.cells) {
      if (!rec || !rec.shown || rec.index < i0 - 1 || rec.index > i1 + 1) continue
      if (S.mode === 'recycle' && rec.stamp !== S.frame) continue
      const y = Y(rec.index * h)
      const fresh = S.t - rec.reusedAt < 0.5
      ctx.fillStyle = `hsl(${hue(rec.n)} 62% ${fresh ? 52 : 38}%)`
      ctx.beginPath()
      ctx.roundRect(CX + 3, y + 3, CW - 6, Math.max(2, rowPx - 6), 6)
      ctx.fill()
      if (fresh) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.stroke()
      }
      if (rowPx >= 24) {
        ctx.fillStyle = '#ffffff'
        const stale = c.cellState === 'cell' && rec.cheered !== !!S.rows[rec.index]?.cheered
        ctx.fillText(`셀 ${rec.n}${stale ? ' ⚠' : ''}`, CX + 12, y + rowPx / 2)
      }
    }
    // 목록 시작 · 끝
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 2
    ctx.font = `22px ${font}`
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    if (Y(0) > 0) {
      ctx.beginPath()
      ctx.moveTo(0, Y(0))
      ctx.lineTo(CX + CW, Y(0))
      ctx.stroke()
      ctx.fillText('목록 시작', CX + 8, Y(0) - 16)
    }
    if (Y(count * h) < H) {
      ctx.beginPath()
      ctx.moveTo(0, Y(count * h))
      ctx.lineTo(CX + CW, Y(count * h))
      ctx.stroke()
      ctx.fillText('목록 끝', CX + 8, Y(count * h) + 18)
    }
    // 보이는 영역 (ScrollRect 의 Viewport)
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 4
    ctx.strokeRect(CX - 8, Y(S.scroll), CW + 16, c.vpH * k)
    ctx.fillStyle = '#ffd166'
    ctx.font = `bold 22px ${font}`
    if (c.portrait) {
      ctx.save()
      ctx.translate(CX + CW + 24, Y(S.scroll) + (c.vpH * k) / 2)
      ctx.rotate(Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText('보이는 영역', 0, 0)
      ctx.restore()
    } else ctx.fillText('보이는 영역', CX + CW + 20, Y(S.scroll) + 16)
    // 재배치 화살표: 위로 나간 셀이 아래 새 항목으로 (또는 반대로)
    const ax = CX + CW + 10
    for (const m of S.moves) {
      const a = 1 - (S.t - m.at) / ARC_LIFE
      if (a <= 0) continue
      const y1 = clamp(Y(m.from * h + h / 2), 6, H - 6)
      const y2 = clamp(Y(m.to * h + h / 2), 6, H - 6)
      const bend = (c.portrait ? 60 : 130) * Math.min(1, Math.abs(y2 - y1) / 200 + 0.4)
      ctx.strokeStyle = `hsl(${hue(m.cell)} 85% 68% / ${a.toFixed(3)})`
      ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(ax, y1)
      ctx.quadraticCurveTo(ax + bend, (y1 + y2) / 2, ax + 4, y2)
      ctx.stroke()
      const dir = Math.atan2(y2 - (y1 + y2) / 2, ax + 4 - (ax + bend))
      ctx.beginPath()
      ctx.moveTo(ax + 4, y2)
      ctx.lineTo(ax + 4 - 16 * Math.cos(dir - 0.45), y2 - 16 * Math.sin(dir - 0.45))
      ctx.lineTo(ax + 4 - 16 * Math.cos(dir + 0.45), y2 - 16 * Math.sin(dir + 0.45))
      ctx.closePath()
      ctx.fill()
    }
  }

  const drawGraph = () => {
    const cv = graphRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const W = cv.width
    const H = cv.height
    const right = 70
    ctx.clearRect(0, 0, W, H)
    const L = (v: number) => Math.log10(1 + v) / Math.log10(1001)
    ctx.font = '22px "Chakra Petch", "Malgun Gothic", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    for (const g of [10, 1000]) {
      const y = H - L(g) * (H - 4)
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W - right, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(220,232,245,0.7)'
      ctx.fillText(formatNumber(g), W - right + 8, Math.max(11, y))
    }
    const bw = (W - right) / HIST
    const off = HIST - S.hist.length
    S.hist.forEach((v, i) => {
      const bh = Math.max(v > 0 ? 3 : 0, L(v) * (H - 4))
      ctx.fillStyle = v > 60 ? '#ff7a59' : '#5ee6c9'
      ctx.fillRect((off + i) * bw, H - bh, Math.max(1, bw - 1), bh)
    })
  }

  useLayoutEffect(() => paint(0))

  /* ───── 렌더 ───── */
  if (S.note) lastNote.current = S.note // 사라지는 동안에도 글자를 남겨 빈 말풍선이 보이지 않게
  const me = S.rows[S.myIndex]
  const ts = Math.max(0.05, p.timeScale)
  const mapSize = portrait ? { w: 290, h: 1080 } : { w: 740, h: 392 }
  const graphSize = portrait ? { w: 980, h: 110 } : { w: 740, h: 64 }
  return (
    <div
      ref={rootRef}
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-debug={showDebug || undefined}
      data-mode={mode}
      style={{ '--ts': ts } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="재활용 스크롤 리스트 데모 (끌기 · 휠 · ↑/↓ · PageUp/PageDown · Home/End 스크롤, M 내 순위)"
      onKeyDown={onKeyDown}
    >
      <section className={s.panel}>
        <header className={s.head}>
          <svg className={s.trophy} viewBox="-20 -20 40 40" aria-hidden>
            <path d="M-12 -16 H12 V-6 Q12 6 0 8 Q-12 6 -12 -6 Z M-12 -12 H-18 Q-18 0 -10 2 M12 -12 H18 Q18 0 10 2 M-3 8 V13 H-9 V17 H9 V13 H3 V8" />
          </svg>
          <div className={s.title}>
            <b>시즌 랭킹</b>
            <span>잔해 드론 격추 점수 · 시즌 3</span>
          </div>
          <span className={s.canvasTag}>{mode === 'all' ? 'Canvas 하나 + LayoutGroup' : mode === 'grow' ? '서브 Canvas · 풀 없음' : '서브 Canvas · 셀 풀'}</span>
          <span className={s.total}>
            참가 <b className={s.num}>{formatNumber(S.rows.length)}</b>명
          </span>
        </header>
        <div className={s.cols}>
          <span>순위</span>
          <span>대원</span>
          <span>점수</span>
          <span>응원</span>
        </div>
        <div
          ref={vpRef}
          className={s.viewport}
          data-part="cells"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onScroll={e => {
            // 포커스가 화면 밖 셀로 가면 브라우저가 Viewport 를 스크롤한다 — 위치는 transform 으로만 다루므로 되돌린다
            e.currentTarget.scrollTop = 0
          }}
        >
          <div ref={contentRef} className={s.content}>
          </div>
          <div className={s.scrollbar} aria-hidden>
            <i ref={thumbRef} />
          </div>
          <div className={s.note} data-show={!!S.note || undefined} data-bad={(S.note ?? lastNote.current)?.bad || undefined}>
            {(S.note ?? lastNote.current)?.text}
          </div>
        </div>
        <button
          ref={pinnedRef}
          className={s.pinned}
          data-part="pinned"
          data-state={S.pinned}
          tabIndex={-1}
          onClick={() => {
            human()
            jumpMe()
            sync()
          }}
        >
          <span className={s.pinLabel}>
            내 순위
            <svg viewBox="-12 -12 24 24" aria-hidden>
              <path d="M0 -9 L8 1 H3 V9 H-3 V1 H-8 Z" />
            </svg>
          </span>
          <span className={s.rank}>
            <b className={s.num}>{S.myIndex + 1}</b>
            {me && me.delta !== 0 && <em data-dir={me.delta > 0 ? 'up' : 'down'}>{me.delta > 0 ? `▲${me.delta}` : `▼${-me.delta}`}</em>}
          </span>
          <span className={s.who}>
            <b>{me?.name} (나)</b>
            <small>
              {me?.squad}분대 · Lv {me?.level}
            </small>
          </span>
          <span className={`${s.score} ${s.num}`}>{me ? formatNumber(me.score) : ''}</span>
          <span className={s.pinKey}>
            <KeyCap label="M" size={34} /> 이동
          </span>
        </button>
      </section>

      <aside className={s.stats}>
        <div className={s.statsHead}>
          <h4>재활용 디버그</h4>
          <span className={s.modeChip} data-mode={mode}>
            {mode === 'recycle' ? '재활용 켬' : mode === 'grow' ? '재활용 끔' : '가상화 없음'}
          </span>
        </div>
        <div className={s.tiles}>
          <div className={s.tile}>
            <span>데이터</span>
            <b className={s.num} ref={el => void (txt.current.data = el)} />
          </div>
          <div className={s.tileGroup} data-part="counter">
            <div className={s.tile} data-hot>
              <span>만든 셀</span>
              <b className={s.num} ref={el => void (txt.current.created = el)} />
            </div>
            <div className={s.tile}>
              <span>재사용</span>
              <b className={s.num} ref={el => void (txt.current.reused = el)} />
            </div>
          </div>
          <div className={s.tile}>
            <span>DOM 요소</span>
            <b className={s.num} ref={el => void (txt.current.dom = el)} />
          </div>
        </div>
        <p className={s.line} ref={el => void (txt.current.formula = el)} />
        <p className={s.line}>
          <span ref={el => void (txt.current.range = el)} /> · <span ref={el => void (txt.current.active = el)} />
        </p>
        <div className={s.graphHead}>
          <span>프레임마다 다시 묶는 셀 — Unity Canvas 기준 모형</span>
          <b className={s.num} ref={el => void (txt.current.touch = el)} />
        </div>
        <canvas ref={graphRef} className={s.graph} width={graphSize.w} height={graphSize.h} />
        <p className={s.cost} ref={el => void (txt.current.cost = el)} />
      </aside>

      <aside className={s.mapCard} data-part="pool">
        <h4>셀 풀 지도</h4>
        <p className={s.legend}>
          <i data-k="cell" /> 셀(번호) <i data-k="slot" /> 데이터만 <i data-k="vp" /> 보이는 영역 · 화살표 = 재배치
        </p>
        <canvas ref={mapRef} className={s.map} width={mapSize.w} height={mapSize.h} />
        <div className={s.mapOff}>디버그 보기 꺼짐 — 플레이어에게 보이는 것은 왼쪽 목록뿐이다</div>
      </aside>
    </div>
  )
}

/** 셀 뼈대 (= 셀 프리팹). 복제해서 쓰고, 내용은 bind() 가 DOM 을 직접 고친다 */
function makeSkeleton(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = s.cell
  el.innerHTML =
    `<i class="${s.tag}" data-f="tag"></i>` +
    `<span class="${s.rank}"><b class="${s.num}" data-f="rank"></b><em data-f="delta"></em></span>` +
    `<svg class="${s.crest}" viewBox="-18 -18 36 36" aria-hidden="true"><path data-f="crest"/></svg>` +
    `<span class="${s.who}"><b data-f="name"></b><small data-f="sub"></small></span>` +
    `<span class="${s.score} ${s.num}" data-f="score"></span>` +
    `<span class="${s.cheer}" data-cheer data-f="cheer" role="button" tabindex="0">` +
    `<svg viewBox="-12 -11 24 22" aria-hidden="true"><path d="M0 9 C-14 0 -11 -10 -5 -10 C-2 -10 0 -7 0 -6 C0 -7 2 -10 5 -10 C11 -10 14 0 0 9 Z"/></svg>` +
    `<span class="${s.num}" data-f="cheers"></span></span>` +
    `<i class="${s.stale}" aria-hidden="true">⚠ 셀에 남은 표시</i>`
  return el
}

/* ───── 처음 상태 ───── */
function initSim(mode: Mode, count: number, h: number, vpH: number, overscan: number): Sim {
  const rows = generateRows(count)
  const S: Sim = {
    t: 0,
    version: 0,
    r: rng(29),
    rows,
    myIndex: rows.findIndex(r => r.me),
    dataVer: 1,
    gen: 1,
    mode,
    count,
    recycler: createRecycler(mode === 'recycle'),
    map: new Map(),
    range: null,
    cells: [],
    everCheer: [],
    frame: 0,
    h,
    scroll: 0,
    vel: 0,
    lastScroll: 0,
    drag: null,
    anim: null,
    moves: [],
    hist: [],
    highlightUntil: -9,
    flashUntil: 0,
    note: null,
    realT: -1e9,
    autoStep: 0,
    cheerCell: -1,
    costPending: null,
    cost: null,
    mounted: 0,
    createMs: 0,
    domCount: 0,
    mapKey: '',
    pinned: '',
  }
  if (mode === 'all') {
    S.range = { first: 0, last: rows.length - 1 }
    S.map = S.recycler.layout(S.range)
  } else {
    // 첫 화면: 7.4줄 굴린 상태 — 위에서 나간 셀이 이미 아래로 옮겨 간 모습(재사용 수 · 화살표)이 보이게.
    // 굴리는 동안 셀이 보여 준 항목을 그대로 따라가 기록한다 (상태를 셀에 두는 버그를 처음부터 재현할 수 있게)
    const end = 7.4 * h
    const path: number[] = []
    for (let y = 0; y < end; y += h / 3) path.push(y)
    path.push(end)
    for (const y of path) {
      const range = visibleRange(y, vpH, h, rows.length, overscan)
      const before = new Map(S.map)
      S.map = S.recycler.layout(range)
      S.range = range
      for (const [index, n] of S.map) {
        if (rows[index].cheered) S.everCheer[n] = true
        const old = [...before].find(([, m]) => m === n)?.[0]
        if (old !== undefined && old !== index) S.moves.push({ cell: n, from: old, to: index, at: -0.15 })
      }
    }
    S.moves = S.moves.slice(-4)
    S.scroll = end
    S.lastScroll = end
  }
  return S
}
