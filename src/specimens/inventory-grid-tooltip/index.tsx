import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { DPad, KeyCap, MouseGlyph, PadButton, TouchGlyph, useLastInputDevice, type Device } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import { placeFloating, type Rect } from '../../core/placement'
import type { SpecimenProps } from '../../core/types'
import {
  CAPACITY,
  deltasOf,
  fmt,
  LOOT_POOL,
  RARITY,
  scoreOf,
  signed,
  SLOT_LABEL,
  SLOT_ORDER,
  SORT_CYCLE,
  SORT_LABEL,
  sortItems,
  START_EQUIPPED,
  START_ITEMS,
  type EquipSlot,
  type Item,
  type Rarity,
  type SortKey,
} from './data'
import { ItemIcon, RarityMark } from './Icons'
import s from './style.module.css'

export { meta } from './meta'

/* ───────────── 상태 ───────────── */

type Focus = { zone: 'grid'; cell: number } | { zone: 'equip'; slot: EquipSlot }
type TipState = 'closed' | 'pending' | 'open'
type Via = 'key' | 'hover' | 'click'
type CompareMode = 'off' | 'side-by-side' | 'inline-delta'
type AnchorMode = 'slot' | 'pointer' | 'panel'

interface UI {
  items: Item[]
  equipped: Record<EquipSlot, Item>
  sort: SortKey
  minRarity: 0 | 2
  focus: Focus
  scroll: number
  tip: TipState
  via: Via
  tipSeq: number
  newIds: string[]
  pop: { seq: number; ids: string[]; slot: EquipSlot | null }
  toast: { seq: number; text: string; tone?: 'good' | 'bad' }
  shakeSeq: number
  sortSeq: number
  loot: number
}

const isEquip = (it: Item | undefined): it is Item & { kind: EquipSlot } => !!it && it.kind !== 'supply'
/** 처음 보여 줄 아이템 — 장착품보다 좋아진 수치와 나빠진 수치가 섞여 있는 탐사 바이저 */
const DEFAULT_FOCUS_ID = 'visor'

/* ───────────── 배치 (논리 좌표) ───────────── */

interface Geo {
  x: number
  y: number
  /** 정렬 바·그리드·안내 줄이 쓸 수 있는 가로 폭 (가로 화면) */
  availW: number
  cell: number
  gap: number
  pitch: number
  gridW: number
  visRows: number
  viewH: number
  display: number
  rows: number
  maxScroll: number
}

/** 고정 정보 패널 폭 — 한 장 / 나란히 비교 두 장(400 + 12 + 400) */
const PANEL_W = 540
const PANEL_PAIR_W = 812
const PANEL_TOP = 168
/** 고정 패널 자리를 비울 때 접은 장착 패널 폭 */
const EQUIP_COMPACT_W = 340
/** 정렬·필터 바 아래 끝 (가로) */
const BAR_BOTTOM = 232
/** 커서 방식에서 키보드·패드 포커스일 때 쓰는 칸 안 가상 커서 위치 (칸 크기 비율) */
const VCURSOR = 0.72

/**
 * reserve > 0 이면 오른쪽에 그 폭만큼 고정 패널 자리를 비워 두고, 장착 패널을 좁게 접은 뒤 남은 폭으로 칸 크기를 다시 계산한다.
 * (패널이 그리드를 덮지 않게 레이아웃 단계에서 나눈다)
 */
function geoOf(portrait: boolean, cols: number, reserve: number): Geo {
  const gap = portrait ? 16 : 14
  const x0 = portrait ? 0 : reserve ? 64 + EQUIP_COMPACT_W + 40 : 668
  const availW = portrait ? 984 : reserve ? 1920 - 40 - reserve - 48 - x0 : 1120
  const cell = portrait ? 200 : Math.min(196, Math.floor((availW - gap * (cols - 1)) / cols))
  const pitch = cell + gap
  const gridW = cols * cell + (cols - 1) * gap
  const maxH = portrait ? 640 : 744
  const visRows = Math.max(1, Math.floor((maxH + gap) / pitch))
  let display = Math.ceil(CAPACITY / cols) * cols
  if (display === CAPACITY) display += cols // 확장해야 열리는 잠긴 줄을 하나 보여 준다
  const rows = display / cols
  return {
    x: portrait ? Math.round((1080 - gridW) / 2) : x0,
    y: portrait ? 584 : 250,
    availW,
    cell,
    gap,
    pitch,
    gridW,
    visRows,
    viewH: visRows * pitch - gap,
    display,
    rows,
    maxScroll: Math.max(0, rows - visRows),
  }
}

/** 포커스한 줄이 보이도록 스크롤 줄 수를 맞춘다 (게임패드 포커스는 ScrollRect 가 따라가 주지 않는다) */
const fitScroll = (scroll: number, row: number, g: Geo) => clamp(row < scroll ? row : row >= scroll + g.visRows ? row - g.visRows + 1 : scroll, 0, g.maxScroll)

/* 자동 데모 대본 — 이동(지연) → 가장자리 보정 → 정렬 → 장착 → 획득 → 필터 */
const SCRIPT = ['right', 'down', 'edge', 'close', 'left', 'sort', 'sort', 'home', 'equip', 'loot', 'filter', 'up', 'filter', 'sort', 'sort', 'home'] as const

export default function InventoryGridTooltip(p: SpecimenProps) {
  const portrait = p.aspect === '9:16'
  const juice = p.juice
  const cols = portrait ? 4 : clamp(Math.round(num(p.params, 'columns', 6)), 4, 9)
  const rarityStyle = juice ? str(p.params, 'rarityStyle', 'color-shape') : 'off'
  const compareMode = (juice ? str(p.params, 'compareMode', 'inline-delta') : 'off') as CompareMode
  const anchorMode = (portrait ? 'panel' : str(p.params, 'tooltipAnchor', 'slot')) as AnchorMode
  const edgeCorrection = juice && bool(p.params, 'edgeCorrection', true)
  const delayMs = juice ? num(p.params, 'tooltipDelayMs', 250) : 0
  const sortParam = str(p.params, 'sortBy', 'rarity') as SortKey
  // 고정 패널(가로): 패널 자리를 비워 두고 그리드를 줄인다. 나쁜 예는 자리를 비우지 않아 패널이 그리드를 덮는다
  const reservePanel = !portrait && anchorMode === 'panel' && juice
  const g = geoOf(portrait, cols, reservePanel ? (compareMode === 'side-by-side' ? PANEL_PAIR_W : PANEL_W) : 0)
  const W = p.width
  const H = p.height

  const [ui, setUi] = useState<UI>(() => {
    const ordered = sortItems(START_ITEMS, sortParam)
    const cell = Math.max(0, ordered.findIndex(it => it.id === DEFAULT_FOCUS_ID))
    return {
      items: START_ITEMS,
      equipped: { ...START_EQUIPPED },
      sort: sortParam,
      minRarity: 0,
      focus: { zone: 'grid', cell },
      scroll: fitScroll(0, Math.floor(cell / cols), g),
      tip: 'open',
      via: 'key',
      tipSeq: 0,
      newIds: [],
      pop: { seq: 0, ids: [], slot: null },
      toast: { seq: 0, text: '' },
      shakeSeq: 0,
      sortSeq: 0,
      loot: 0,
    }
  })
  const uiRef = useRef(ui)
  uiRef.current = ui
  const patch = (fn: (u: UI) => Partial<UI>) => setUi(u => ({ ...u, ...fn(u) }))

  const ordered = sortItems(ui.items, ui.sort)
  const orderedRef = useRef(ordered)
  orderedRef.current = ordered
  const itemAt = (u: UI, cell: number) => sortItems(u.items, u.sort)[cell]

  /* 정렬 기준 조절 값이 바뀌면 = 저장된 정렬 설정이 바뀜. 포커스는 같은 아이템을 따라간다 */
  const firstSort = useRef(true)
  useEffect(() => {
    if (firstSort.current) {
      firstSort.current = false
      return
    }
    patch(u => resort(u, sortParam))
  }, [sortParam])

  const resort = (u: UI, key: SortKey): Partial<UI> => {
    const before = u.focus.zone === 'grid' ? sortItems(u.items, u.sort)[u.focus.cell] : undefined
    const after = sortItems(u.items, key)
    const cell = before ? after.findIndex(it => it.id === before.id) : u.focus.zone === 'grid' ? u.focus.cell : -1
    const focus: Focus = cell >= 0 ? { zone: 'grid', cell } : u.focus
    return { sort: key, sortSeq: u.sortSeq + 1, focus, scroll: focus.zone === 'grid' ? fitScroll(u.scroll, Math.floor(focus.cell / cols), g) : u.scroll }
  }

  /* ───── 동작 ───── */
  const delayT = useRef(0)
  const focusTo = (focus: Focus, via: Via) =>
    patch(u => {
      const same = u.focus.zone === focus.zone && (focus.zone === 'grid' ? u.focus.zone === 'grid' && u.focus.cell === focus.cell : u.focus.zone === 'equip' && u.focus.slot === focus.slot)
      if (same && u.tip === 'open') return {}
      delayT.current = 0
      // 이미 툴팁이 떠 있으면 이웃 칸으로 옮길 때 지연 없이 바로 교체한다. 나쁜 예는 매번 처음부터 다시 띄운다
      const instant = via === 'click' || delayMs === 0 || (juice && u.tip === 'open')
      const tip: TipState = instant ? 'open' : 'pending'
      const scroll = focus.zone === 'grid' ? fitScroll(u.scroll, Math.floor(focus.cell / cols), g) : u.scroll
      const opened = tip === 'open' ? openedPatch(u, focus) : {}
      return { focus, via, tip, scroll, tipSeq: tip === 'open' && (u.tip !== 'open' || !juice) ? u.tipSeq + 1 : u.tipSeq, ...opened }
    })
  /** 툴팁을 한 번 열면 '새 아이템' 배지가 사라진다 */
  const openedPatch = (u: UI, focus: Focus): Partial<UI> => {
    if (focus.zone !== 'grid') return {}
    const it = itemAt(u, focus.cell)
    return it && u.newIds.includes(it.id) ? { newIds: u.newIds.filter(id => id !== it.id) } : {}
  }

  const move = (dx: number, dy: number) => {
    const u = uiRef.current
    if (u.focus.zone === 'grid') {
      const col = u.focus.cell % cols
      const row = Math.floor(u.focus.cell / cols)
      if (!portrait && dx < 0 && col === 0) return focusTo({ zone: 'equip', slot: SLOT_ORDER[clamp(row - u.scroll, 0, 3)] }, 'key')
      if (portrait && dy < 0 && row === 0) return focusTo({ zone: 'equip', slot: SLOT_ORDER[clamp(col, 0, 3)] }, 'key')
      const c = clamp(col + dx, 0, cols - 1)
      const r = clamp(row + dy, 0, g.rows - 1)
      return focusTo({ zone: 'grid', cell: r * cols + c }, 'key')
    }
    const i = SLOT_ORDER.indexOf(u.focus.slot)
    if (!portrait) {
      if (dx > 0) return focusTo({ zone: 'grid', cell: (u.scroll + i) * cols }, 'key')
      if (dy) return focusTo({ zone: 'equip', slot: SLOT_ORDER[clamp(i + dy, 0, 3)] }, 'key')
    } else {
      if (dy > 0) return focusTo({ zone: 'grid', cell: u.scroll * cols + Math.min(i, cols - 1) }, 'key')
      if (dx) return focusTo({ zone: 'equip', slot: SLOT_ORDER[clamp(i + dx, 0, 3)] }, 'key')
    }
  }

  const closeTip = () => patch(() => ({ tip: 'closed' }))
  const say = (text: string, tone?: 'good' | 'bad') => patch(x => ({ toast: { seq: x.toast.seq + 1, text, tone } }))

  /**
   * 장착. 키보드·탭·우클릭은 고른 칸만 장착하고(장비가 아니면 이유만 알린다),
   * fallback 은 갤러리 이벤트 버튼·자동 데모 전용 — 고른 칸이 장비가 아니면 가장 크게 좋아지는 장비를 찾아 장착한다.
   */
  const equip = (cellArg?: number, fallback = false) => {
    const u = uiRef.current
    const list = sortItems(u.items, u.sort)
    let cell = cellArg ?? (u.focus.zone === 'grid' ? u.focus.cell : -1)
    let it = list[cell]
    if (!isEquip(it) && !fallback) {
      if (cellArg === undefined && u.focus.zone === 'equip') say('이미 장착 중 — 보관함에서 바꿀 장비를 고른다')
      else if (it) say(`${it.name}: 소모품은 장착할 수 없다`, 'bad')
      return
    }
    if (!isEquip(it)) {
      // (이벤트 버튼 전용) 포커스한 칸이 장비가 아니면, 가장 크게 좋아지는 장비를 먼저 찾아 포커스한다
      let best = -1
      let gain = -Infinity
      list.forEach((x, i) => {
        if (!isEquip(x)) return
        const d = scoreOf(x) - scoreOf(u.equipped[x.kind])
        if (d > gain) {
          gain = d
          best = i
        }
      })
      if (best < 0) return
      cell = best
      it = list[best]
    }
    if (!isEquip(it)) return
    const slot = it.kind
    const old = u.equipped[slot]
    const gainNow = scoreOf(it) - scoreOf(old)
    const items = u.items.map(x => (x.id === it!.id ? old : x))
    const after = sortItems(items, u.sort)
    const newCell = Math.max(0, after.findIndex(x => x.id === old.id))
    patch(x => ({
      items,
      equipped: { ...x.equipped, [slot]: it! },
      focus: { zone: 'grid', cell: newCell },
      scroll: fitScroll(x.scroll, Math.floor(newCell / cols), g),
      tip: 'open',
      tipSeq: x.tip === 'open' ? x.tipSeq : x.tipSeq + 1,
      pop: { seq: x.pop.seq + 1, ids: [old.id], slot },
      toast: { seq: x.toast.seq + 1, text: `${it!.name} 장착 · 장비 점수 ${gainNow >= 0 ? '▲' : '▼'} ${signed(gainNow, 0)}`, tone: gainNow >= 0 ? 'good' : 'bad' },
    }))
  }

  const cycleSort = () => patch(u => resort(u, SORT_CYCLE[(SORT_CYCLE.indexOf(u.sort) + 1) % SORT_CYCLE.length]))
  const toggleFilter = () =>
    patch(u => ({
      minRarity: u.minRarity ? 0 : 2,
      toast: { seq: u.toast.seq + 1, text: u.minRarity ? '필터 해제 · 모든 희귀도 표시' : '필터: 정예 이상만 강조' },
    }))

  const gridRef = useRef<HTMLDivElement>(null)
  const loot = () => {
    const u = uiRef.current
    if (u.items.length >= CAPACITY) {
      // 공간 부족: 그리드 테두리를 짧게 흔들고(모션 줄이기면 테두리 색만) 알린다
      gridRef.current?.animate(
        prefersReducedMotion() || !juice ? [{ outlineColor: '#ff6b6b' }, { outlineColor: 'transparent' }] : [{ translate: '0' }, { translate: '-4px' }, { translate: '4px' }, { translate: '-4px' }, { translate: '4px' }, { translate: '0' }],
        { duration: 300 / Math.max(0.05, p.timeScale), easing: 'ease-out' },
      )
      patch(x => ({ shakeSeq: x.shakeSeq + 1, toast: { seq: x.toast.seq + 1, text: `보관함이 가득 찼다 (${CAPACITY}/${CAPACITY}) — 버리거나 분해해야 한다`, tone: 'bad' } }))
      return
    }
    const src = LOOT_POOL[u.loot % LOOT_POOL.length]
    const it: Item = { ...src, id: `${src.id}-${u.loot}` }
    // 새 칸이 툴팁에 가려지지 않게 툴팁을 닫고, 새 아이템 자리가 보이도록 스크롤한다 (포커스는 그대로)
    const at = sortItems([...u.items, it], u.sort).findIndex(x => x.id === it.id)
    patch(x => ({
      items: [...x.items, it],
      tip: 'closed',
      scroll: x.focus.zone === 'grid' && Math.abs(Math.floor(x.focus.cell / cols) - Math.floor(at / cols)) >= g.visRows ? x.scroll : fitScroll(x.scroll, Math.floor(at / cols), g),
      loot: x.loot + 1,
      newIds: juice ? [...x.newIds, it.id] : x.newIds,
      toast: { seq: x.toast.seq + 1, text: `획득: ${it.name}${it.qty ? ` ×${it.qty}` : ''} (${RARITY[it.rarity].name})` },
    }))
  }

  const focusEdge = () => {
    // 오른쪽 아래 끝 칸: 마지막 열에서 가장 아래에 있는 장비 (비교 툴팁이 가장 커서 잘림이 잘 보인다)
    const list = orderedRef.current
    let cell = -1
    let any = -1
    for (let i = 0; i < list.length; i++) {
      if (i % cols !== cols - 1) continue
      any = i
      if (isEquip(list[i])) cell = i
    }
    if (cell < 0) cell = any >= 0 ? any : list.length - 1
    patch(u => ({ scroll: clamp(Math.floor(cell / cols) - g.visRows + 1, 0, g.maxScroll), tip: u.tip === 'open' ? 'closed' : u.tip }))
    focusTo({ zone: 'grid', cell }, 'key')
  }
  const focusHome = () => {
    const cell = Math.max(0, orderedRef.current.findIndex(it => it.id === DEFAULT_FOCUS_ID))
    patch(u => ({ scroll: fitScroll(0, Math.floor(cell / cols), g), tip: u.tip }))
    focusTo({ zone: 'grid', cell }, 'key')
  }

  const handle = (id: string) => {
    if (id === 'focus-edge-slot') focusEdge()
    else if (id === 'equip-focused') equip(undefined, true)
    else if (id === 'loot-drop') loot()
    else if (id === 'cycle-sort') cycleSort()
    else if (id === 'toggle-rarity-filter') toggleFilter()
  }
  useTrigger(p.trigger, handle)

  const step = useRef(0)
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    1.6,
    () => {
      const a = SCRIPT[step.current % SCRIPT.length]
      step.current++
      if (a === 'right') move(1, 0)
      else if (a === 'left') move(-1, 0)
      else if (a === 'down') move(0, 1)
      else if (a === 'up') move(0, -1)
      else if (a === 'edge') focusEdge()
      else if (a === 'close') closeTip()
      else if (a === 'sort') cycleSort()
      else if (a === 'home') focusHome()
      else if (a === 'equip') equip(undefined, true)
      else if (a === 'loot') {
        if (uiRef.current.items.length < CAPACITY - 4) loot()
        else toggleFilter()
      } else if (a === 'filter') toggleFilter()
    },
    p.trigger?.seq,
  )

  /* ───── 툴팁 지연 (게임 시간) ───── */
  const delayBarRef = useRef<HTMLElement>(null)
  const effectiveDelay = () => (delayMs / 1000) * (uiRef.current.via === 'hover' ? 1 : 0.5)
  useGameLoop(p.playing, p.timeScale, dt => {
    // 지연 막대(시각 표시)만 매 프레임 DOM 으로 갱신한다
    const u = uiRef.current
    const bar = delayBarRef.current
    if (u.tip !== 'pending') {
      if (bar) bar.style.transform = 'scaleX(0)'
      return
    }
    delayT.current += dt
    const d = effectiveDelay()
    if (bar) bar.style.transform = `scaleX(${d > 0 ? Math.min(1, delayT.current / d) : 1})`
  })
  // 툴팁 열기는 한 번만 일어나는 사건이라 타이머로 예약한다 (배속 반영, 정지하면 취소 → 재생하면 다시 예약)
  const focusKey = ui.focus.zone === 'grid' ? `g${ui.focus.cell}` : `e${ui.focus.slot}`
  useEffect(() => {
    if (ui.tip !== 'pending' || !p.playing) return
    const ms = (effectiveDelay() * 1000) / Math.max(0.05, p.timeScale)
    const id = window.setTimeout(() => {
      delayT.current = 0
      patch(x => (x.tip === 'pending' ? { tip: 'open', tipSeq: x.tipSeq + 1, ...openedPatch(x, x.focus) } : {}))
    }, ms)
    return () => clearTimeout(id)
  }, [ui.tip, focusKey, ui.via, p.playing, p.timeScale, delayMs])

  /* ───── 툴팁 위치: 크기를 잰 뒤 → 오른쪽 → 넘치면 뒤집기 → 그래도 넘치면 고정 ───── */
  const rootRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLSpanElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const toLogical = (r: DOMRect): Rect => {
    const root = rootRef.current!.getBoundingClientRect()
    const k = W / root.width
    return { x: (r.left - root.left) * k, y: (r.top - root.top) * k, w: r.width * k, h: r.height * k }
  }
  const anchorRect = (): Rect | null => {
    const u = uiRef.current
    if (u.focus.zone === 'grid') {
      const col = u.focus.cell % cols
      const row = Math.floor(u.focus.cell / cols)
      return { x: g.x + col * g.pitch, y: g.y + (row - fitScroll(u.scroll, row, g)) * g.pitch, w: g.cell, h: g.cell }
    }
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-eq="${u.focus.slot}"]`)
    return el ? toLogical(el.getBoundingClientRect()) : null
  }
  const place = () => {
    const tt = tipRef.current
    const a = anchorRect()
    if (!tt || !a) return pickRarityPart(null)
    const size = { w: tt.offsetWidth, h: tt.offsetHeight }
    const bounds = { x: 24, y: 24, w: W - 48, h: H - 48 }
    let x = 0
    let y = 0
    let side = 'right'
    let note = ''
    if (portrait) {
      x = 48
      y = 1240
    } else if (anchorMode === 'panel') {
      // 고정 정보 패널: 늘 오른쪽 같은 자리. 레이아웃(geoOf)이 이 자리를 비워 두었으므로 비킬 필요가 없다.
      // 나쁜 예는 자리를 비우지 않아 오른쪽 열과 정렬 바 끝을 덮는다
      x = W - 40 - size.w
      y = PANEL_TOP
    } else {
      // 커서 방식: 마우스 호버면 실제 커서, 키보드·패드·자동 데모면 칸 안의 '가상 커서'(오른쪽 아래 72% 지점)에 붙는다
      const ptr = anchorMode === 'pointer' ? (uiRef.current.via === 'hover' && pointer.current ? pointer.current : { x: a.x + a.w * VCURSOR, y: a.y + a.h * VCURSOR }) : null
      // 칸 오른쪽, 윗변을 칸 윗변에 맞춘다 (placeFloating 은 세로 가운데 정렬이므로 기준 높이를 툴팁 높이로 넘긴다)
      const anchor = ptr ? { x: ptr.x, y: ptr.y, w: 1, h: size.h } : { x: a.x, y: a.y, w: a.w, h: size.h }
      const gap = ptr ? 28 : 16
      if (edgeCorrection) {
        const pl = placeFloating(anchor, size, bounds, 'right', gap)
        x = pl.x
        y = pl.y
        side = pl.side
        note = [pl.flipped ? '오른쪽 공간 부족 → 왼쪽으로 뒤집음' : '', pl.clamped ? '화면 안으로 고정' : ''].filter(Boolean).join(' · ')
      } else {
        // 보정 없음: 언제나 오른쪽, 세로 가운데 — 끝 열·끝 줄에서 화면 밖으로 잘린다
        x = anchor.x + anchor.w + gap
        y = anchor.y + anchor.h / 2 - size.h / 2
      }
    }
    tt.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    tt.dataset.side = side
    // 보정 안내 띠는 툴팁 위에 붙는다. 그 자리가 정렬·필터 바(아래 끝 232px)와 겹치면 툴팁 아래로 내린다
    tt.toggleAttribute('data-note-below', !portrait && y < BAR_BOTTOM + 56)
    if (noteRef.current) {
      noteRef.current.textContent = note
      noteRef.current.toggleAttribute('hidden', !note)
    }
    pickRarityPart(tt.hasAttribute('data-visible') ? { x, y, w: size.w, h: size.h } : null)
  }

  /**
   * 해설 1번(희귀도 테두리)이 붙을 칸을 고른다: 지금 보이는 줄 가운데 툴팁과 겹치지 않고, 첫 줄(정렬 바 바로 아래)보다 둘째 줄,
   * 희귀도가 높은 칸. 툴팁 위치는 크기를 잰 뒤에야 정해지므로 렌더가 아니라 배치 직후 DOM 속성으로 붙인다.
   */
  const pickRarityPart = (tip: Rect | null) => {
    const root = rootRef.current
    if (!root) return
    const u = uiRef.current
    const list = orderedRef.current
    const fc = u.focus.zone === 'grid' ? u.focus.cell : -1
    const sc = fc >= 0 ? fitScroll(u.scroll, Math.floor(fc / cols), g) : clamp(u.scroll, 0, g.maxScroll)
    const hit = (r: Rect) => !!tip && r.x < tip.x + tip.w && r.x + r.w > tip.x && r.y < tip.y + tip.h && r.y + r.h > tip.y
    let best = -1
    let bestScore = -Infinity
    for (let row = sc; row < sc + g.visRows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col
        const it = list[i]
        if (!it) continue
        // 번호는 칸 위쪽 가운데의 바로 위(약 70px)에 붙는다 → 번호 자리 + 칸 위쪽 절반이 툴팁에 가리는지 본다
        const top = g.y + (row - sc) * g.pitch
        const r = { x: g.x + col * g.pitch + g.cell / 2 - 36, y: top - 72, w: 72, h: 72 + g.cell * 0.5 }
        // 첫 줄의 번호는 정렬·필터 바 위에 올라가므로 둘째 줄부터 고른다
        let score = it.rarity * 10 - (row === sc && g.visRows > 1 ? 30 : 0) - col * 0.1
        if (hit(r)) score -= 100
        if (i === fc) score -= 8
        if (it.rarity < u.minRarity) score -= 50
        if (score > bestScore) {
          bestScore = score
          best = i
        }
      }
    }
    const id = list[best]?.id ?? list[0]?.id
    root.querySelectorAll('[data-part="rarity-frame"]').forEach(el => el.removeAttribute('data-part'))
    root.querySelector(`[data-frame="${id}"]`)?.setAttribute('data-part', 'rarity-frame')
  }
  useLayoutEffect(() => place())

  /* ───── 입력 ───── */
  const device: Device = useLastInputDevice(p.thumbnail ? 'keyboard' : 'auto')

  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    const k = e.key
    // 입력 소비: 무대 안 버튼(정렬·필터)에 포커스가 있으면 Enter·Space 는 그 버튼만 처리한다 (장착까지 관통하지 않게)
    if ((k === 'Enter' || k === ' ') && e.target !== e.currentTarget) return
    let used = true
    if (k === 'ArrowLeft') move(-1, 0)
    else if (k === 'ArrowRight') move(1, 0)
    else if (k === 'ArrowUp') move(0, -1)
    else if (k === 'ArrowDown') move(0, 1)
    else if (k === 'Enter') equip()
    else if (k === 'Escape' || k === 'Backspace') {
      // 툴팁이 닫혀 있으면 소비하지 않는다 → 갤러리의 Esc(발표 모드 해제 등)로 흘려보낸다
      if (uiRef.current.tip !== 'closed') closeTip()
      else used = false
    } else if (k === 'q' || k === 'Q') cycleSort()
    else if (k === 'f' || k === 'F') toggleFilter()
    else used = false
    // 무대에 포커스가 있을 때만 처리하고, 갤러리 단축키(←/→ 해설 넘김 등)로 번지지 않게 먹는다 (core/stageKeys)
    return used
  })

  const onGridPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!rootRef.current) return
    const r = rootRef.current.getBoundingClientRect()
    const k = W / r.width
    pointer.current = { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
    if (anchorMode === 'pointer') place()
  }
  const onGridLeave = () => {
    if (uiRef.current.via === 'hover') closeTip()
  }

  /** 화면에 실제로 보이는 스크롤 줄 (포커스 줄이 보이도록 맞춘 값) */
  const shownScroll = (u: UI) => (u.focus.zone === 'grid' ? fitScroll(u.scroll, Math.floor(u.focus.cell / cols), g) : clamp(u.scroll, 0, g.maxScroll))
  /** 스크롤 줄을 바꾸고, 포커스가 보이는 범위 밖에 남지 않게 같은 열의 보이는 줄로 데려온다 */
  const scrollTo = (target: number, close = false) =>
    setUi(u => {
      const scroll = clamp(target, 0, g.maxScroll)
      if (scroll === shownScroll(u)) return u
      const extra: Partial<UI> = close && u.tip !== 'closed' ? { tip: 'closed' } : {}
      if (u.focus.zone !== 'grid') return { ...u, ...extra, scroll }
      const col = u.focus.cell % cols
      const row = clamp(Math.floor(u.focus.cell / cols), scroll, scroll + g.visRows - 1)
      return { ...u, ...extra, scroll, focus: { zone: 'grid', cell: row * cols + col } }
    })
  const scrollToRef = useRef(scrollTo)
  scrollToRef.current = scrollTo

  // 휠 스크롤: 페이지가 함께 스크롤되지 않게 non-passive 로 등록한다
  const viewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = viewRef.current
    if (!el || p.thumbnail) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      scrollToRef.current(shownScroll(uiRef.current) + (e.deltaY > 0 ? 1 : -1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [p.thumbnail])

  // 터치 스와이프 스크롤: 세로로 16px 넘게 끌면 드래그로 보고 한 줄(pitch)마다 스크롤한다.
  // 드래그로 판정된 뒤에만 포인터를 붙잡는다 (처음부터 붙잡으면 탭이 칸의 click 으로 가지 않는다)
  const drag = useRef<{ id: number; y0: number; s0: number; k: number; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const onViewDown = (e: PointerEvent<HTMLDivElement>) => {
    dragged.current = false
    if (e.pointerType === 'mouse' || p.thumbnail || !rootRef.current) return
    const r = rootRef.current.getBoundingClientRect()
    drag.current = { id: e.pointerId, y0: e.clientY, s0: shownScroll(uiRef.current), k: W / r.width, moved: false }
  }
  const onViewMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dy = (e.clientY - d.y0) * d.k
    if (!d.moved) {
      if (Math.abs(dy) < 16) return
      d.moved = true
      dragged.current = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId) // 손가락이 그리드 밖으로 나가도 계속 받는다
      } catch {
        /* 이미 끝난 포인터면 무시 */
      }
    }
    // 손가락을 위로 밀면 아래 줄이 올라온다. 끄는 동안 툴팁은 닫는다 (손가락 밑 칸이 계속 바뀌므로)
    scrollTo(d.s0 + Math.round(-dy / g.pitch), true)
  }
  const onViewUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  /* ───── 그리기 준비 ───── */
  const focusCell = ui.focus.zone === 'grid' ? ui.focus.cell : -1
  const scroll = focusCell >= 0 ? fitScroll(ui.scroll, Math.floor(focusCell / cols), g) : clamp(ui.scroll, 0, g.maxScroll)
  const focusItem: Item | undefined = ui.focus.zone === 'grid' ? ordered[ui.focus.cell] : ui.equipped[ui.focus.slot]
  const focusIsEquipped = ui.focus.zone === 'equip'
  const base = focusItem && isEquip(focusItem) && !focusIsEquipped ? ui.equipped[focusItem.kind] : undefined
  const tipVisible = ui.tip === 'open' && !!focusItem
  const showPanelAlways = portrait
  const targetSlot = juice && compareMode !== 'off' && base && isEquip(focusItem) ? focusItem.kind : null
  const total = SLOT_ORDER.reduce((a, k) => a + scoreOf(ui.equipped[k]), 0)
  const shown = ordered.filter(it => it.rarity >= ui.minRarity).length
  const motion = juice && !prefersReducedMotion()
  // 커서 방식인데 마우스를 쓰지 않을 때(키보드·패드·자동 데모): 툴팁이 붙는 칸 안 가상 커서를 그려 준다
  const showVCursor = !portrait && anchorMode === 'pointer' && ui.via !== 'hover'
  const wideStyle = portrait ? undefined : { left: g.x, width: g.availW }

  const rootStyle = {
    '--ts': p.timeScale,
    '--cell': `${g.cell}px`,
    '--pitch': `${g.pitch}px`,
  } as CSSProperties

  /* ───── 조각: 칸 ───── */
  const cellPos = (i: number) => ({ x: (i % cols) * g.pitch, y: Math.floor(i / cols) * g.pitch })
  const cells = Array.from({ length: g.display }, (_, i) => {
    const { x, y } = cellPos(i)
    const state = i >= CAPACITY ? 'locked' : i >= ordered.length ? 'empty' : 'filled'
    return <div key={i} className={s.cell} data-state={state} style={{ transform: `translate(${x}px, ${y}px)` }} />
  })

  const slots = ordered.map((it, i) => {
    const { x, y } = cellPos(i)
    const isFocus = i === focusCell
    const eq = isEquip(it) ? ui.equipped[it.kind] : undefined
    const upgrade = juice && compareMode !== 'off' && eq && scoreOf(it) > scoreOf(eq)
    const out = it.rarity < ui.minRarity
    const popKey = ui.pop.ids.includes(it.id) ? ui.pop.seq : 0
    return (
      <div
        key={it.id}
        className={s.slot}
        data-r={it.rarity}
        data-focus={isFocus || undefined}
        data-out={out || undefined}
        style={{ transform: `translate(${x}px, ${y}px)` }}
        onPointerEnter={e => e.pointerType === 'mouse' && focusTo({ zone: 'grid', cell: i }, 'hover')}
        onClick={e => {
          if (e.detail > 1 || dragged.current) return
          const u = uiRef.current
          if (device === 'touch' && u.focus.zone === 'grid' && u.focus.cell === i && u.tip === 'open') equip(i)
          else focusTo({ zone: 'grid', cell: i }, 'click')
        }}
        onDoubleClick={() => equip(i)}
        onContextMenu={e => {
          e.preventDefault()
          equip(i)
        }}
      >
        {/* 해설 1번(data-part="rarity-frame")은 배치 직후 pickRarityPart 가 툴팁과 겹치지 않는 칸에 붙인다 */}
        <div key={popKey} className={s.frame} data-pop={popKey > 0 || undefined} data-frame={it.id}>
          <i className={s.strip} />
          <RarityMark r={it.rarity} className={s.mark} size={Math.max(22, Math.round(g.cell * 0.16))} />
          <ItemIcon id={it.icon} className={s.icon} />
          {it.qty ? <span className={s.qty}>×{it.qty}</span> : <span className={s.sc}>{scoreOf(it)}</span>}
          {upgrade && (
            <span className={s.up} aria-label="장착품보다 좋음">
              ▲
            </span>
          )}
          {ui.newIds.includes(it.id) && <span className={s.newDot}>새</span>}
        </div>
      </div>
    )
  })

  const focusRing = focusCell >= 0 && (
    <div className={s.cursor} style={{ transform: `translate(${cellPos(focusCell).x}px, ${cellPos(focusCell).y}px)` }} data-pending={ui.tip === 'pending' || undefined}>
      <i />
      <i />
      <i />
      <i />
      <b ref={delayBarRef} className={s.delayBar} />
      {showVCursor && (
        <svg className={s.vcursor} style={{ left: `${VCURSOR * 100}%`, top: `${VCURSOR * 100}%` }} viewBox="0 0 24 24" aria-hidden>
          <path d="M2 2l18 7-7.5 2.5L10 19z" />
        </svg>
      )}
    </div>
  )

  /* ───── 조각: 장착 패널 ───── */
  const equipRows = SLOT_ORDER.map(slot => {
    const it = ui.equipped[slot]
    const focus = ui.focus.zone === 'equip' && ui.focus.slot === slot
    const target = targetSlot === slot
    const popKey = ui.pop.slot === slot ? ui.pop.seq : 0
    return (
      <div
        key={slot}
        className={s.eqRow}
        data-eq={slot}
        data-focus={focus || undefined}
        data-target={target || undefined}
        onPointerEnter={e => e.pointerType === 'mouse' && focusTo({ zone: 'equip', slot }, 'hover')}
        onClick={() => focusTo({ zone: 'equip', slot }, 'click')}
      >
        <div key={popKey} className={s.eqFrame} data-r={it.rarity} data-pop={popKey > 0 || undefined}>
          <i className={s.strip} />
          <RarityMark r={it.rarity} className={s.mark} size={portrait ? 30 : 26} />
          <ItemIcon id={it.icon} className={s.icon} />
        </div>
        <div className={s.eqText}>
          <span className={s.eqSlot}>{SLOT_LABEL[slot]}</span>
          <b className={s.eqName}>{it.name}</b>
          <span className={s.eqScore}>
            점수 <em>{scoreOf(it)}</em>
          </span>
        </div>
        {target && <span className={s.targetTag}>비교 기준</span>}
      </div>
    )
  })

  /* ───── 조각: 툴팁 ───── */
  const card = (it: Item, role: 'main' | 'equipped', baseItem?: Item) => (
    <TipCard
      key={role}
      item={it}
      base={baseItem}
      role={role}
      compareMode={compareMode}
      portrait={portrait}
      equippedBadge={role === 'equipped' || focusIsEquipped}
      partCompare={role === 'main'}
      device={device}
    />
  )
  const sideBySide = compareMode === 'side-by-side' && !!base
  const tooltip = (
    <div
      ref={tipRef}
      className={s.tipLayer}
      data-part="tooltip"
      data-mode={portrait ? 'dock' : anchorMode}
      data-visible={tipVisible || showPanelAlways || undefined}
      data-pair={sideBySide || undefined}
      data-catch={!juice || undefined}
      onPointerEnter={() => {
        // 나쁜 예: 툴팁이 커서를 받아 칸에서 '나감'이 생기고 → 닫힘 → 다시 열림이 반복된다
        if (!juice && uiRef.current.via === 'hover') closeTip()
      }}
    >
      <span ref={noteRef} className={s.placeNote} hidden />
      <div key={juice ? ui.tipSeq : `${ui.tipSeq}-bad`} className={s.tipInner} data-anim={motion || undefined}>
        {focusItem && (tipVisible || !portrait) ? (
          sideBySide ? (
            <>
              {card(focusItem, 'main')}
              {card(base!, 'equipped')}
            </>
          ) : (
            card(focusItem, 'main', compareMode === 'inline-delta' ? base : undefined)
          )
        ) : (
          <div className={s.placeholder}>
            <ItemIcon id="repair" className={s.phIcon} />
            <span>칸을 고르면 정보와 장착품 비교가 여기에 뜬다</span>
            {/* 해설 번호가 늘 가리킬 수 있게 비교 블록 자리는 남겨 둔다 */}
            <span data-part="compare-block" className={s.phCompare} />
          </div>
        )}
      </div>
    </div>
  )

  /* ───── 조각: 정렬·필터 바 ───── */
  const glyph = portrait ? 44 : 36
  const sortBar = (
    <div className={s.bar} style={wideStyle}>
      <div className={s.barGroup} data-part="sort-bar">
        <span className={s.barLabel}>정렬</span>
        <button type="button" className={s.sortChip} onClick={cycleSort}>
          <span key={ui.sortSeq} className={s.sortText} data-anim={motion || undefined}>
            {SORT_LABEL[ui.sort]}
          </span>
          {device === 'gamepad' ? <PadButton face="left" size={glyph - 4} /> : <KeyCap label="Q" size={glyph - 4} />}
        </button>
        <span className={s.barLabel}>필터</span>
        <button type="button" className={s.filterChips} onClick={toggleFilter} aria-label="희귀도 필터">
          {RARITY.map((r, i) => (
            <span key={r.name} className={s.fChip} data-off={i < ui.minRarity || undefined} style={{ '--rc': r.color } as CSSProperties}>
              <RarityMark r={i as Rarity} size={portrait ? 28 : 24} />
              {!portrait && r.name}
            </span>
          ))}
          {device === 'gamepad' ? <PadButton face="top" size={glyph - 4} /> : <KeyCap label="F" size={glyph - 4} />}
        </button>
      </div>
      <span className={s.count}>
        {ui.minRarity ? (
          <>
            강조 <b>{shown}</b> / {ordered.length}
          </>
        ) : (
          <>
            <b>{ordered.length}</b> / {CAPACITY}칸
          </>
        )}
      </span>
    </div>
  )

  const hints = (
    <div className={s.hints} data-part="hint-bar" style={wideStyle}>
      {hintsFor(device, glyph).map(([icon, text]) => (
        <span key={text} className={s.hint}>
          {icon}
          {text}
        </span>
      ))}
    </div>
  )

  const toast = ui.toast.seq > 0 && (
    <div key={ui.toast.seq} className={s.toast} data-tone={ui.toast.tone} role="status" style={portrait ? undefined : { left: g.x + g.availW / 2 }}>
      {ui.toast.text}
    </div>
  )

  const header = (
    <header className={s.head}>
      <div>
        <p className={s.eyebrow}>외곽 탐사대 · 궤도 정비 기지 창고</p>
        <h1 className={s.title}>보관함</h1>
      </div>
      <div className={s.headRight}>
        <span className={s.capacity}>
          <span>보관</span>
          <i className={s.capBar}>
            <i style={{ width: `${(ordered.length / CAPACITY) * 100}%` }} data-full={ordered.length >= CAPACITY || undefined} />
          </i>
          <b>
            {ordered.length}/{CAPACITY}
          </b>
        </span>
        <span className={s.credits}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 2l9 5v10l-9 5-9-5V7z" />
            <path d="M9 9h6M9 15h6M12 9v6" />
          </svg>
          1,240
        </span>
      </div>
    </header>
  )

  const equipPanel = (
    <section className={s.equip}>
      <div className={s.eqHead}>
        <svg className={s.capsule} viewBox="0 0 40 80" aria-hidden>
          <rect x="6" y="4" width="28" height="72" rx="14" />
        </svg>
        <div>
          <p className={s.eyebrow}>장착 중</p>
          <h2 className={s.eqWho}>하린</h2>
        </div>
        <div className={s.eqTotal}>
          <span>장비 점수</span>
          <b key={ui.pop.seq} data-anim={motion && ui.pop.seq > 0 ? true : undefined}>
            {total}
          </b>
        </div>
      </div>
      <div className={s.eqList}>{equipRows}</div>
    </section>
  )

  const grid = (
    <div
      ref={gridRef}
      className={s.gridFrame}
      style={{ left: g.x, top: g.y, width: g.gridW, height: g.viewH }}
      onPointerMove={onGridPointerMove}
      onPointerLeave={onGridLeave}
    >
      <div ref={viewRef} className={s.viewport} onPointerDown={onViewDown} onPointerMove={onViewMove} onPointerUp={onViewUp} onPointerCancel={onViewUp}>
        <div className={s.content} style={{ transform: `translateY(${-scroll * g.pitch}px)` }}>
          {cells}
          {slots}
          {focusRing}
        </div>
      </div>
      {g.maxScroll > 0 && (
        <div className={s.scrollTrack} aria-hidden>
          <i style={{ height: `${(g.visRows / g.rows) * 100}%`, top: `${(scroll / g.rows) * 100}%` }} />
        </div>
      )}
    </div>
  )

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-layout={portrait ? 'portrait' : 'wide'}
      data-reserve={reservePanel || undefined}
      data-juice={juice || undefined}
      data-motion={motion || undefined}
      data-rs={rarityStyle}
      data-paused={!p.playing || undefined}
      tabIndex={p.thumbnail ? -1 : 0}
      onKeyDown={onKeyDown}
      style={rootStyle}
      aria-label="보관함 (클릭 후 방향키로 칸 이동, Enter 장착, Q 정렬, F 필터, Esc 닫기)"
    >
      <div className={s.bg} aria-hidden />
      {header}
      {equipPanel}
      {sortBar}
      {grid}
      {hints}
      {tooltip}
      {toast}
    </div>
  )
}

/* ───────────── 툴팁 카드 ───────────── */

function TipCard({
  item,
  base,
  role,
  compareMode,
  portrait,
  equippedBadge,
  partCompare,
  device,
}: {
  item: Item
  base?: Item
  role: 'main' | 'equipped'
  compareMode: CompareMode
  portrait: boolean
  equippedBadge: boolean
  partCompare: boolean
  device: Device
}) {
  const r = RARITY[item.rarity]
  const deltas = isEquip(item) ? deltasOf(item, base) : []
  const scoreDiff = base ? scoreOf(item) - scoreOf(base) : 0
  const showDelta = !!base && compareMode === 'inline-delta'
  return (
    <div className={s.card} data-r={item.rarity} data-role={role} style={{ '--rc': r.color } as CSSProperties}>
      <div className={s.cardHead}>
        <RarityMark r={item.rarity} size={portrait ? 34 : 30} />
        <span className={s.rName}>{r.name}</span>
        <span className={s.kind}>
          {SLOT_LABEL[item.kind]}
          {isEquip(item) ? ' · 장비' : ''}
        </span>
        {equippedBadge && <span className={s.badge}>장착 중</span>}
      </div>
      <div className={s.cardBody}>
        <div className={s.nameRow}>
          <ItemIcon id={item.icon} className={s.cardIcon} />
          <div>
            <h3 className={s.name}>
              {item.name}
              {item.qty ? <small> ×{item.qty}</small> : null}
            </h3>
            {showDelta && (
              <p className={s.vs}>
                장착 중인 <b>{base!.name}</b> 대비
              </p>
            )}
          </div>
        </div>
        {isEquip(item) ? (
          <>
            <div className={s.scoreRow}>
              <span className={s.scoreLbl}>장비 점수</span>
              <b className={s.score}>{scoreOf(item)}</b>
              {showDelta && <DeltaChip verdict={scoreDiff > 0 ? 1 : scoreDiff < 0 ? -1 : 0} text={signed(scoreDiff, 0)} big />}
            </div>
            <div className={s.stats}>
              {/* 해설 2번은 막대·값·차이 영역만 가리킨다 (번호가 장비 점수 숫자를 덮지 않게 왼쪽 라벨 열은 뺀다) */}
              {partCompare && <span className={s.partBox} data-part="compare-block" aria-hidden />}
              {deltas.map(d => {
                const ratio = clamp(d.value / d.def.max, 0, 1)
                const baseRatio = clamp(d.base / d.def.max, 0, 1)
                return (
                  <div key={d.def.key} className={s.stat} data-v={showDelta ? d.verdict : undefined}>
                    <span className={s.sLabel}>
                      {d.def.label}
                      {!d.def.higherIsBetter && <small className={s.lowGood}>↓좋음</small>}
                    </span>
                    <span className={s.sBar}>
                      <i className={s.sFill} style={{ width: `${Math.min(ratio, showDelta ? baseRatio : ratio) * 100}%` }} />
                      {showDelta && d.diff !== 0 && (
                        <i
                          className={s.sDiff}
                          data-dir={d.value > d.base ? 'more' : 'less'}
                          style={{ left: `${Math.min(ratio, baseRatio) * 100}%`, width: `${Math.abs(ratio - baseRatio) * 100}%` }}
                        />
                      )}
                      {showDelta && <i className={s.sTick} style={{ left: `${baseRatio * 100}%` }} />}
                    </span>
                    <span className={s.sVal}>
                      {fmt(d.value, d.def.decimals)}
                      {d.def.unit && <small>{d.def.unit}</small>}
                    </span>
                    {showDelta && <DeltaChip verdict={d.verdict} text={signed(d.diff, d.def.decimals)} />}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className={s.supply} data-part={partCompare ? 'compare-block' : undefined}>
            <span>소모품 · 장착 칸 없음</span>
            <b>보유 {item.qty ?? 1}개</b>
          </div>
        )}
        <p className={s.desc}>{item.desc}</p>
        {showDelta && (
          <p className={s.legend}>
            <span data-v="1">▲ 좋아짐</span>
            <span data-v="-1">▼ 나빠짐</span>
            <span data-v="0">＝ 같음</span>
          </p>
        )}
        {role === 'main' && isEquip(item) && !equippedBadge && (
          <div className={s.tipHints}>
            {device === 'gamepad' ? <PadButton face="bottom" size={portrait ? 40 : 32} /> : device === 'mouse' ? <MouseGlyph button="right" size={portrait ? 40 : 32} /> : device === 'touch' ? <TouchGlyph kind="tap" size={portrait ? 40 : 32} /> : <KeyCap label="Enter" size={portrait ? 40 : 32} />}
            {device === 'touch' ? '한 번 더 눌러 장착' : '장착'}
          </div>
        )}
      </div>
    </div>
  )
}

function DeltaChip({ verdict, text, big }: { verdict: 1 | -1 | 0; text: string; big?: boolean }) {
  return (
    <span className={s.delta} data-v={verdict} data-big={big || undefined}>
      <i aria-hidden>{verdict > 0 ? '▲' : verdict < 0 ? '▼' : '＝'}</i>
      {verdict === 0 ? '같음' : text}
    </span>
  )
}

/** 입력 장치별 하단 안내 — 같은 동작을 장치마다 하나씩 연결한다 */
function hintsFor(device: Device, size: number): [ReactNode, string][] {
  if (device === 'gamepad')
    return [
      [<DPad size={size} />, '칸 이동'],
      [<PadButton face="bottom" size={size} />, '장착'],
      [<PadButton face="left" size={size} />, '정렬'],
      [<PadButton face="top" size={size} />, '필터'],
      [<PadButton face="right" size={size} />, '툴팁 닫기'],
    ]
  if (device === 'mouse')
    return [
      [<MouseGlyph button="left" size={size} />, '가리키기 · 선택'],
      [<MouseGlyph button="right" size={size} />, '장착'],
      [<MouseGlyph button="wheel" size={size} />, '스크롤'],
      [<KeyCap label="Q" size={size} />, '정렬'],
      [<KeyCap label="F" size={size} />, '필터'],
    ]
  if (device === 'touch')
    return [
      [<TouchGlyph kind="tap" size={size} />, '선택'],
      [<TouchGlyph kind="tap" size={size} />, '한 번 더 = 장착'],
      [<TouchGlyph kind="swipe" size={size} />, '스크롤'],
    ]
  return [
    [<KeyCap label="↑↓←→" size={size} />, '칸 이동'],
    [<KeyCap label="Enter" size={size} />, '장착'],
    [<KeyCap label="Q" size={size} />, '정렬'],
    [<KeyCap label="F" size={size} />, '필터'],
    [<KeyCap label="Esc" size={size} />, '툴팁 닫기'],
  ]
}
