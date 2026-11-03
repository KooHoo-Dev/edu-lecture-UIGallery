import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { DPad, KeyCap, MouseGlyph, PadButton, Shoulder, TouchGlyph, useLastInputDevice, type Device } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import {
  evaluate,
  evaluateAll,
  GATHER,
  itemName,
  RECIPE,
  RECIPES,
  RES_NAME,
  RES_ORDER,
  startInventory,
  TABS,
  UNLOCK_ORDER,
  type Inventory,
  type ItemId,
  type Need,
  type RecipeId,
  type ResId,
  type Status,
  type TabId,
} from './data'
import { Icon, OkMark, ShortMark } from './Icons'
import s from './style.module.css'

export { meta } from './meta'

/** 목록 한 줄 높이 + 간격 (논리 px) */
const ROW = 92
const PITCH = 100
/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** 창 닫힘 연출 · 닫힌 채로 있는 시간 (초) */
const CLOSE_S = 0.22
const CLOSED_S = 0.8

type ShortageStyle = 'icon-text' | 'color-only' | 'need-only'
type BadgeClear = 'on-select' | 'on-open' | 'off'
type Win = 'open' | 'closing' | 'closed'

/** 창이 기억할 보기 상태 — Unity 판의 OnDisable 저장 / OnEnable 복원 대상 */
interface View {
  tab: TabId
  sel: Partial<Record<TabId, RecipeId>>
  search: string
  scrollTop: number
}
interface Job {
  uid: number
  id: RecipeId
  elapsed: number
  /** 시작할 때 실제로 쓴 재료 — 취소하면 이만큼 돌려준다 */
  used: Need[]
}
interface Log {
  seq: number
  text: string
  tone?: 'good' | 'bad'
  chips?: { id: ItemId; n: number }[]
}
interface Sim {
  inv: Inventory
  /** 인벤토리가 바뀔 때마다 다시 계산한 상태 (좋은 예) */
  status: Record<RecipeId, Status>
  /** 창을 열 때 한 번만 계산한 상태 (나쁜 예 — 이후 변경을 모른다) */
  snapshot: Record<RecipeId, Status>
  recomputes: number
  lastChange: string
  /** 방금 '만들 수 있음' 으로 바뀐 레시피 */
  became: RecipeId[]
  becameSeq: number
  unlocked: Set<RecipeId>
  fresh: Set<RecipeId>
  queue: Job[]
  uid: number
  log: Log[]
  logSeq: number
  pops: Partial<Record<ResId, { n: number; seq: number }>>
  popSeq: number
  view: View
  saved: View | null
  filter: boolean
  win: Win
  winT: number
  opens: number
  note: { seq: number; text: string; kind: 'restore' | 'reset' } | null
  shake: { seq: number; at: 'craft' | 'queue' }
  pendingScroll: 'ensure' | 'restore' | null
  gather: number
  t: number
  version: number
}

const firstView = (): View => ({ tab: 'all', sel: {}, search: '', scrollTop: 0 })

function createSim(scale: number, filter: boolean): Sim {
  const inv = startInventory(scale)
  const status = evaluateAll(inv)
  return {
    inv,
    status,
    snapshot: status,
    recomputes: 0,
    lastChange: '창 열림',
    became: [],
    becameSeq: 0,
    unlocked: new Set(RECIPES.filter(r => !r.locked).map(r => r.id)),
    fresh: new Set<RecipeId>(['flare']),
    // 시작 화면에 진행 중인 제작 하나 (재료는 이미 썼다)
    queue: [{ uid: 1, id: 'cellpack', elapsed: 2.8, used: RECIPE.cellpack.needs }],
    uid: 1,
    log: [{ seq: 1, text: '냉각 셀 팩 제작 시작' }],
    logSeq: 1,
    pops: {},
    popSeq: 0,
    // 첫 화면: 회로 조각이 3/5 로 모자란 드론 교란기를 보고 있다 (목록은 조금 스크롤된 상태)
    view: { tab: 'all', sel: { all: 'jammer' }, search: '', scrollTop: 0 },
    saved: null,
    filter,
    win: 'open',
    winT: 0,
    opens: 0,
    note: null,
    shake: { seq: 0, at: 'craft' },
    pendingScroll: 'ensure',
    gather: 0,
    t: 0,
    version: 0,
  }
}

const SCRIPT = ['gather', 'craft', 'tab', 'down', 'craft', 'craft', 'cancel', 'unlock', 'tab', 'tab', 'select-new', 'reopen', 'filter', 'gather', 'filter', 'tab-all', 'search', 'search-clear', 'up'] as const

/**
 * 제작 패널. 레시피 데이터와 인벤토리 수량을 나누고, 인벤토리가 바뀔 때마다 레시피 상태 전체를 다시 계산한다.
 * 구조가 바뀔 때(선택 · 대기열 · 수량)만 React 로 다시 그리고, 진행 바는 매 프레임 ref 로 직접 칠한다.
 */
export default function CraftingRecipePanel(p: SpecimenProps) {
  const juice = p.juice
  const stockScale = num(p.params, 'stockScale', 1)
  const craftTimeScale = num(p.params, 'craftTimeScale', 1)
  const queueSize = clamp(Math.round(num(p.params, 'queueSize', 3)), 1, 5)
  const shortage = (juice ? str(p.params, 'shortageStyle', 'icon-text') : 'need-only') as ShortageStyle
  const craftableOnly = bool(p.params, 'craftableOnly', false)
  const badgeClear = str(p.params, 'newBadgeClear', 'on-select') as BadgeClear
  const restore = juice && bool(p.params, 'restoreSelection', true)
  const showBadges = juice && badgeClear !== 'off'
  const motion = juice && !prefersReducedMotion()
  const cfg = { juice, queueSize, craftTimeScale, badgeClear, restore, showBadges }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = createSim(stockScale, craftableOnly)
  const S = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(-1)
  const sync = () => {
    if (S.version !== shown.current) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const bump = () => {
    S.version++
    sync()
  }

  /* ───── 조절 값이 바뀌면 ───── */
  const firstScale = useRef(true)
  useEffect(() => {
    if (firstScale.current) {
      firstScale.current = false
      return
    }
    // 보유 재료량이 바뀌면 새 판: 인벤토리를 다시 채우고 대기열을 비운다
    S.inv = startInventory(stockScale)
    S.queue = []
    inventoryChanged(`보유 재료량 ×${stockScale}`)
    S.snapshot = S.status
    bump()
  }, [stockScale])
  useEffect(() => {
    if (S.filter !== craftableOnly) {
      S.filter = craftableOnly
      S.pendingScroll = 'ensure'
      bump()
    }
  }, [craftableOnly])

  /* ───── 데이터: 인벤토리 변경 → 레시피 전체 재계산 (이벤트) ───── */
  const timeOf = (id: RecipeId) => RECIPE[id].time * cfgRef.current.craftTimeScale
  const say = (text: string, tone?: Log['tone'], chips?: Log['chips']) => {
    S.log = [{ seq: ++S.logSeq, text, tone, chips }, ...S.log].slice(0, 5)
  }
  const pop = (id: ItemId, n: number) => {
    if (id in RES_NAME) S.pops[id as ResId] = { n, seq: ++S.popSeq }
  }
  /** 인벤토리의 '바뀜' 이벤트 구독자. 어느 수량이 바뀌었든 레시피 12개를 모두 다시 계산한다 */
  function inventoryChanged(reason: string) {
    const before = S.status
    S.status = evaluateAll(S.inv)
    S.recomputes++
    S.lastChange = reason
    S.became = RECIPES.filter(r => S.unlocked.has(r.id) && S.status[r.id].craftable && !before[r.id].craftable).map(r => r.id)
    if (S.became.length) {
      S.becameSeq++
      if (cfgRef.current.juice) say(`이제 만들 수 있음: ${S.became.map(id => RECIPE[id].name).join(', ')}`, 'good')
    }
    S.version++
  }
  const addItems = (list: { id: ItemId; n: number }[], reason: string) => {
    for (const { id, n } of list) {
      S.inv[id] = Math.max(0, (S.inv[id] ?? 0) + n)
      pop(id, n)
    }
    inventoryChanged(reason)
  }
  const fmtList = (list: { id: ItemId; n: number }[]) => list.map(x => `${itemName(x.id)} ${x.n > 0 ? '+' : '−'}${Math.abs(x.n)}`).join(' · ')

  /* ───── 보기 상태 ───── */
  const statusShown = () => (cfgRef.current.juice ? S.status : S.snapshot)
  const visibleOf = (v: View) => {
    const st = statusShown()
    const q = v.search.trim()
    return RECIPES.filter(r => S.unlocked.has(r.id) && (v.tab === 'all' || r.tab === v.tab) && (!q || r.name.includes(q)) && (!S.filter || st[r.id].craftable))
  }
  const selectedOf = (v: View, list = visibleOf(v)): RecipeId | null => {
    const want = v.sel[v.tab]
    return want && list.some(r => r.id === want) ? want : (list[0]?.id ?? null)
  }

  const select = (id: RecipeId) => {
    S.view.sel[S.view.tab] = id
    if (cfgRef.current.showBadges && cfgRef.current.badgeClear === 'on-select') S.fresh.delete(id)
    S.pendingScroll = 'ensure'
    bump()
  }
  const move = (d: number) => {
    const list = visibleOf(S.view)
    if (!list.length) return
    const i = list.findIndex(r => r.id === selectedOf(S.view, list))
    select(list[clamp(i + d, 0, list.length - 1)].id)
  }
  const setTab = (tab: TabId) => {
    S.view.tab = tab
    S.pendingScroll = 'ensure'
    bump()
  }
  const cycleTab = (d: number) => {
    const i = TABS.findIndex(t => t.id === S.view.tab)
    setTab(TABS[(i + d + TABS.length) % TABS.length].id)
  }
  const toggleFilter = () => {
    S.filter = !S.filter
    S.pendingScroll = 'ensure'
    bump()
  }
  const setSearch = (q: string) => {
    S.view.search = q
    S.pendingScroll = 'ensure'
    bump()
  }

  /* ───── 제작 · 취소 · 완성 ───── */
  const craft = (id = selectedOf(S.view)) => {
    if (!id) return
    const c = cfgRef.current
    const r = RECIPE[id]
    if (S.queue.length >= c.queueSize) {
      if (c.juice) {
        S.shake = { seq: S.shake.seq + 1, at: 'queue' }
        say(`대기열이 가득 찼다 (${S.queue.length}/${c.queueSize}) — 끝나기를 기다리거나 하나를 취소한다`, 'bad')
      }
      return bump()
    }
    const st = evaluate(r, S.inv)
    if (!st.craftable) {
      if (c.juice) {
        S.shake = { seq: S.shake.seq + 1, at: 'craft' }
        say(`${r.name}: ${st.short.map(x => `${itemName(x.id)} ${x.need - x.have}개`).join(', ')} 부족`, 'bad')
      }
      return bump()
    }
    S.queue.push({ uid: ++S.uid, id, elapsed: 0, used: r.needs.map(x => ({ ...x })) })
    say(`${r.name} 대기열에 추가`)
    addItems(
      r.needs.map(x => ({ id: x.id, n: -x.n })),
      `${r.name} 재료 사용`,
    )
    bump()
  }
  const cancel = (uid?: number) => {
    const job = uid !== undefined ? S.queue.find(j => j.uid === uid) : S.queue[S.queue.length - 1]
    if (!job) return
    S.queue = S.queue.filter(j => j !== job)
    const back = job.used.map(x => ({ id: x.id, n: x.n }))
    // 나쁜 예: 환불은 되지만 아무 말도 하지 않는다 — 재료가 사라졌는지 돌아왔는지 플레이어가 세어 봐야 안다
    if (cfgRef.current.juice) say(`취소: ${RECIPE[job.id].name} — 재료 환불`, 'good', back)
    addItems(back, `${RECIPE[job.id].name} 취소 환불`)
    bump()
  }
  const complete = () => {
    const job = S.queue.shift()
    if (!job) return
    const r = RECIPE[job.id]
    S.inv[job.id] = (S.inv[job.id] ?? 0) + 1
    say(`완성: ${r.name} → 보관함 (보유 ${S.inv[job.id]})`, 'good')
    // 완성품도 인벤토리다 → 냉각 셀 팩이 생기면 소형 반응로 상태가 바뀐다
    inventoryChanged(`${r.name} 완성 +1`)
  }
  const gather = () => {
    const batch = GATHER[S.gather++ % GATHER.length]
    const list = (Object.keys(batch) as ResId[]).map(id => ({ id, n: batch[id]! }))
    say(`재료 획득: ${fmtList(list)}`)
    addItems(list, fmtList(list))
    bump()
  }
  const unlock = () => {
    const id = UNLOCK_ORDER.find(x => !S.unlocked.has(x))
    if (!id) {
      say('더 해금할 레시피가 없다')
      return bump()
    }
    S.unlocked.add(id)
    S.fresh.add(id)
    say(`새 레시피: ${RECIPE[id].name} (${TABS.find(t => t.id === RECIPE[id].tab)!.label} 탭)`, 'good')
    bump()
  }

  /* ───── 창 닫았다 열기 (선택 복원) ───── */
  const listRef = useRef<HTMLDivElement>(null)
  const reopen = () => {
    if (S.win !== 'open') return
    // OnDisable 에 해당: 지금 보기 상태를 저장해 둔다
    S.saved = { ...S.view, sel: { ...S.view.sel }, scrollTop: listRef.current?.scrollTop ?? S.view.scrollTop }
    S.win = cfgRef.current.juice ? 'closing' : 'closed'
    S.winT = 0
    S.note = null
    bump()
  }
  const openWindow = () => {
    const c = cfgRef.current
    // OnEnable 에 해당: 저장한 보기 상태를 되살리거나(좋은 예), 매번 첫 탭 첫 줄로 시작한다(나쁜 예)
    const saved = S.saved
    if (c.restore && saved) {
      S.view = saved
      const sel = selectedOf(saved)
      const tab = TABS.find(t => t.id === saved.tab)!.label
      S.note = { seq: S.opens + 1, kind: 'restore', text: `복원: ${tab} 탭 · ${sel ? RECIPE[sel].name : '선택 없음'} · 스크롤 ${Math.round(saved.scrollTop / PITCH)}줄 아래` }
      S.pendingScroll = 'restore'
    } else {
      S.view = firstView()
      S.note = { seq: S.opens + 1, kind: 'reset', text: '처음으로: 전체 탭 · 첫 줄 — 보던 레시피를 다시 찾아야 한다' }
      S.pendingScroll = 'ensure'
    }
    if (c.badgeClear === 'on-open') S.fresh.clear()
    S.snapshot = S.status
    S.opens++
    S.win = 'open'
    S.winT = 0
    S.version++
  }

  /* ───── 이벤트 · 자동 데모 ───── */
  const realAt = useRef(-1e9)
  const real = () => {
    realAt.current = S.t
  }
  const handle = (id: string) => {
    if (id === 'gather') gather()
    else if (id === 'craft') craft()
    else if (id === 'cancel') cancel()
    else if (id === 'unlock') unlock()
    else if (id === 'reopen') reopen()
  }
  useTrigger(p.trigger, id => {
    real()
    handle(id)
  })

  const step = useRef(0)
  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.6,
    () => {
      if (S.t - realAt.current < MANUAL_PAUSE || S.win !== 'open') return
      const a = SCRIPT[step.current++ % SCRIPT.length]
      if (a === 'gather') gather()
      else if (a === 'craft') craft()
      else if (a === 'cancel') cancel()
      else if (a === 'unlock') unlock()
      else if (a === 'reopen') reopen()
      else if (a === 'tab') cycleTab(1)
      else if (a === 'tab-all') setTab('all')
      else if (a === 'down') move(1)
      else if (a === 'up') move(-1)
      else if (a === 'filter') toggleFilter()
      else if (a === 'search') setSearch('셀')
      else if (a === 'search-clear') setSearch('')
      else if (a === 'select-new') {
        const id = RECIPES.find(r => S.fresh.has(r.id) && S.unlocked.has(r.id))?.id
        if (id) {
          S.view.tab = RECIPE[id].tab
          select(id)
        }
      }
    },
    p.trigger?.seq,
  )

  /* ───── 시간: 창 상태 · 대기열 진행 ───── */
  const jobRefs = useRef(new Map<number, { fill: HTMLElement | null; time: HTMLElement | null }>())
  const paint = () => {
    const head = S.queue[0]
    if (!head) return
    const r = jobRefs.current.get(head.uid)
    if (!r) return
    const total = timeOf(head.id)
    if (r.fill) r.fill.style.transform = `scaleX(${clamp(head.elapsed / total, 0, 1)})`
    if (r.time) r.time.textContent = cfgRef.current.juice ? `${Math.max(0, total - head.elapsed).toFixed(1)}초` : '제작 중…'
  }
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    if (S.win === 'closing') {
      S.winT += dt
      if (S.winT >= CLOSE_S) {
        S.win = 'closed'
        S.winT = 0
        S.version++
      }
    } else if (S.win === 'closed') {
      S.winT += dt
      if (S.winT >= CLOSED_S) openWindow()
    }
    // 대기열은 창과 상관없이 흐른다 (창이 닫혀 있어도 제작은 계속된다)
    const head = S.queue[0]
    if (head) {
      head.elapsed += dt
      if (head.elapsed >= timeOf(head.id)) complete()
    }
    paint()
    sync()
  })

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && S.pendingScroll && S.win === 'open') {
      if (S.pendingScroll === 'restore') el.scrollTop = S.view.scrollTop
      else {
        const list = visibleOf(S.view)
        const i = list.findIndex(r => r.id === selectedOf(S.view, list))
        if (i >= 0) {
          const top = i * PITCH
          if (top < el.scrollTop) el.scrollTop = top
          // 아래로 따라갈 때는 줄 단위로 맞춰 맨 위 줄이 반쯤 잘리지 않게 한다
          else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = Math.ceil((top + ROW - el.clientHeight) / PITCH) * PITCH
        }
      }
      S.view.scrollTop = el.scrollTop
      S.pendingScroll = null
    }
    paint()
  })

  /* ───── 입력 ───── */
  const device: Device = useLastInputDevice(p.thumbnail ? 'keyboard' : 'auto')
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail || S.win !== 'open') return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    // 입력 소비: 무대 안 버튼에 포커스가 있으면 Enter 는 그 버튼만 처리한다
    if (k === 'Enter' && e.target !== e.currentTarget) return
    if (k === 'ArrowUp' || k === 'ArrowDown') move(k === 'ArrowUp' ? -1 : 1)
    else if (k === 'q' || k === 'e') !e.repeat && cycleTab(k === 'e' ? 1 : -1)
    else if (k === 'Enter') !e.repeat && craft()
    else if (k === 'f') !e.repeat && toggleFilter()
    else if (k === 'Backspace' || k === 'Delete') !e.repeat && cancel()
    else return
    real()
    return true
  })

  /* ───── 그리기 준비 ───── */
  const st = statusShown()
  const list = visibleOf(S.view)
  const sel = selectedOf(S.view, list)
  const recipe = sel ? RECIPE[sel] : null
  const live = recipe ? S.status[recipe.id] : null
  const full = S.queue.length >= queueSize
  const ready = !!live?.craftable && !full
  const tabFresh = (tab: TabId) => (showBadges ? RECIPES.filter(r => S.fresh.has(r.id) && S.unlocked.has(r.id) && (tab === 'all' || r.tab === tab)).length : 0)
  const okCount = list.filter(r => st[r.id].craftable).length
  const totalInTab = RECIPES.filter(r => S.unlocked.has(r.id) && (S.view.tab === 'all' || r.tab === S.view.tab)).length
  const glyph = 34

  const rows = list.map(r => {
    const rs = st[r.id]
    const flash = juice && motion && S.became.includes(r.id)
    return (
      <div
        key={flash ? `${r.id}-${S.becameSeq}` : r.id}
        className={s.row}
        data-sel={r.id === sel || undefined}
        data-ok={(juice && rs.craftable) || undefined}
        data-flash={flash || undefined}
        onClick={() => select(r.id)}
        onDoubleClick={() => craft(r.id)}
      >
        <i className={s.okBar} />
        <Icon id={r.id} className={s.rowIcon} />
        <span className={s.rowText}>
          <b>{r.name}</b>
          <small>
            {TABS.find(t => t.id === r.tab)!.label} · {fmtTime(timeOf(r.id))}
            {S.inv[r.id] > 0 && ` · 보유 ${S.inv[r.id]}`}
          </small>
        </span>
        {juice ? (
          <span className={s.rowState} data-ok={rs.craftable || undefined}>
            {rs.craftable ? <OkMark className={s.mark} /> : <ShortMark className={s.mark} />}
            {rs.craftable ? `×${rs.max} 가능` : `${rs.short.length}종 부족`}
          </span>
        ) : (
          <span className={s.rowState} data-plain>
            {rs.craftable ? '가능' : '불가'}
          </span>
        )}
        {showBadges && S.fresh.has(r.id) && <span className={s.newTag}>새</span>}
      </div>
    )
  })

  const slots: ReactNode[] = []
  jobRefs.current.clear() // 아래 ref 콜백이 커밋 때 다시 채운다
  for (let i = 0; i < Math.max(queueSize, S.queue.length); i++) {
    const j = S.queue[i]
    if (!j) {
      slots.push(
        <div key={`e${i}`} className={s.jobEmpty}>
          빈 칸
        </div>,
      )
      continue
    }
    const head = i === 0
    slots.push(
      <div key={j.uid} className={s.job} data-head={head || undefined} data-over={i >= queueSize || undefined}>
        <Icon id={j.id} className={s.jobIcon} />
        <span className={s.jobText}>
          <b>{RECIPE[j.id].name}</b>
          {!head ? (
            <small className={s.jobWait}>{juice ? `대기 · ${fmtTime(timeOf(j.id))}` : '대기'}</small>
          ) : juice ? (
            <span className={s.jobBar}>
              <i
                ref={el => {
                  const m = jobRefs.current.get(j.uid) ?? { fill: null, time: null }
                  m.fill = el
                  jobRefs.current.set(j.uid, m)
                }}
              />
            </span>
          ) : null}
        </span>
        {head && (
          <span
            className={s.jobTime}
            ref={el => {
              const m = jobRefs.current.get(j.uid) ?? { fill: null, time: null }
              m.time = el
              jobRefs.current.set(j.uid, m)
            }}
          />
        )}
        <button type="button" className={s.cancel} tabIndex={-1} aria-label={`${RECIPE[j.id].name} 취소`} onClick={() => cancel(j.uid)}>
          <ShortMark />
        </button>
      </div>,
    )
  }

  const reason = !recipe
    ? ''
    : full
      ? `대기열 가득 참 (${S.queue.length}/${queueSize})`
      : live!.craftable
        ? `지금 재료로 ×${live!.max} 가능 · ${fmtTime(timeOf(recipe.id))}`
        : `${live!.short.map(x => `${itemName(x.id)} ${x.need - x.have}개`).join(', ')} 부족`

  return (
    <div
      className={s.root}
      data-juice={juice || undefined}
      data-motion={motion || undefined}
      data-paused={!p.playing || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      onKeyDown={onKeyDown}
      onPointerDownCapture={real}
      aria-label="제작대 (클릭 후 ↑↓ 레시피, Q/E 탭, Enter 제작, F 만들 수 있는 것만, Backspace 마지막 제작 취소)"
    >
      <div className={s.bg} aria-hidden />
      <div className={s.window} data-state={S.win}>
        <header className={s.head}>
          <div>
            <p className={s.eyebrow}>외곽 탐사대 · 궤도 정비 기지</p>
            <h1 className={s.title}>제작대</h1>
          </div>
          <div className={s.stockWrap}>
            <div className={s.stock} data-part="stock">
              {RES_ORDER.map(id => {
                const pp = S.pops[id]
                return (
                  <span key={id} className={s.chip}>
                    <Icon id={id} className={s.chipIcon} />
                    <span className={s.chipName}>{RES_NAME[id]}</span>
                    <b className={s.num}>{S.inv[id]}</b>
                    {motion && pp && (
                      <em key={pp.seq} className={s.pop} data-neg={pp.n < 0 || undefined}>
                        {pp.n > 0 ? '+' : '−'}
                        {Math.abs(pp.n)}
                      </em>
                    )}
                  </span>
                )
              })}
            </div>
            <p className={s.recalc} data-stale={!juice || undefined}>
              {juice ? (
                <>
                  인벤토리 변경 → 레시피 {RECIPES.length}개 상태 다시 계산 · <b>{S.recomputes}회</b> · 방금: {S.lastChange}
                </>
              ) : (
                '레시피 상태: 창을 열 때 한 번만 계산 (이후 수량 변화는 목록에 반영 안 됨)'
              )}
            </p>
          </div>
        </header>

        {/* ───── 레시피 목록 ───── */}
        <section className={s.listPanel}>
          <div className={s.tabs} data-part="tabs">
            {device === 'gamepad' ? <Shoulder side="L" size={glyph} /> : <KeyCap label="Q" size={glyph} />}
            {TABS.map(t => {
              const n = tabFresh(t.id)
              return (
                <button key={t.id} type="button" tabIndex={-1} className={s.tab} data-active={S.view.tab === t.id || undefined} onClick={() => setTab(t.id)}>
                  {t.label}
                  {n > 0 && <span className={s.tabNew}>새 {n}</span>}
                </button>
              )
            })}
            {device === 'gamepad' ? <Shoulder side="R" size={glyph} /> : <KeyCap label="E" size={glyph} />}
          </div>
          <div className={s.tools}>
            <label className={s.search}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.5 15.5L21 21" />
              </svg>
              <input
                value={S.view.search}
                placeholder="레시피 검색"
                tabIndex={p.thumbnail ? -1 : 0}
                onChange={e => setSearch(e.target.value)}
                aria-label="레시피 이름 검색"
              />
            </label>
            <button type="button" tabIndex={-1} className={s.filter} data-on={S.filter || undefined} onClick={toggleFilter} aria-pressed={S.filter}>
              <i className={s.box}>{S.filter && <OkMark />}</i>
              만들 수 있는 것만
              {device === 'gamepad' ? <PadButton face="top" size={30} /> : <KeyCap label="F" size={30} />}
            </button>
          </div>
          <div key={S.opens} ref={listRef} className={s.list} data-part="recipe-list" onScroll={e => (S.view.scrollTop = e.currentTarget.scrollTop)}>
            {rows}
            {!rows.length && <p className={s.empty}>{S.filter ? '지금 재료로 만들 수 있는 레시피가 없다 — 재료를 모으거나 필터를 끈다' : '찾는 레시피가 없다'}</p>}
          </div>
          <p className={s.listFoot}>
            <span>
              {list.length} / {totalInTab}개 표시
            </span>
            {juice && (
              <span>
                <OkMark className={s.mark} /> 만들 수 있음 {okCount}
              </span>
            )}
          </p>
        </section>

        {/* ───── 고른 레시피 ───── */}
        <section className={s.detail}>
          {recipe ? (
            <>
              <div className={s.dHead}>
                <span className={s.dIconBox}>
                  <Icon id={recipe.id} className={s.dIcon} />
                </span>
                <div>
                  <h2 className={s.dName}>{recipe.name}</h2>
                  <p className={s.dMeta}>
                    {TABS.find(t => t.id === recipe.tab)!.label} · 결과 ×1 · {fmtTime(timeOf(recipe.id))} · 보유 {S.inv[recipe.id]}
                  </p>
                </div>
              </div>
              <p className={s.dDesc}>{recipe.desc}</p>
              <h3 className={s.dSub}>필요 재료</h3>
              <div className={s.ings} data-part="ingredients">
                {recipe.needs.map(k => {
                  const have = S.inv[k.id] ?? 0
                  const short = have < k.n
                  return (
                    <div key={k.id} className={s.ing} data-short={short || undefined} data-style={shortage}>
                      <Icon id={k.id} className={s.ingIcon} />
                      <span className={s.ingName}>{itemName(k.id)}</span>
                      {shortage === 'icon-text' && (
                        <span className={s.ingBar}>
                          <i style={{ width: `${Math.min(1, have / k.n) * 100}%` }} />
                        </span>
                      )}
                      <span className={s.ingNum}>
                        {shortage === 'need-only' ? (
                          `×${k.n}`
                        ) : (
                          <>
                            <b>{have}</b> / {k.n}
                          </>
                        )}
                      </span>
                      {shortage === 'icon-text' && (
                        <span className={s.ingTag} data-ok={!short || undefined}>
                          {short ? <ShortMark className={s.mark} /> : <OkMark className={s.mark} />}
                          {short ? `${k.n - have}개 부족` : '충분'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className={s.result}>
                <span className={s.resultLabel}>제작하면</span>
                <Icon id={recipe.id} className={s.resultIcon} />
                <span>
                  보관함 보유 <b className={s.num}>{S.inv[recipe.id]}</b> → <b className={s.num}>{S.inv[recipe.id] + 1}</b>
                </span>
                {juice && <small>재료는 걸 때 빠지고, 취소하면 그대로 돌려받는다</small>}
              </div>
              <div className={s.craftArea}>
                <button
                  key={S.shake.at === 'craft' ? S.shake.seq : 0}
                  type="button"
                  tabIndex={-1}
                  className={s.craft}
                  data-ready={(juice && ready) || undefined}
                  data-shake={(motion && S.shake.at === 'craft' && S.shake.seq > 0) || undefined}
                  onClick={() => craft()}
                >
                  제작
                  {device === 'gamepad' ? <PadButton face="bottom" size={36} /> : device === 'touch' ? null : <KeyCap label="Enter" size={36} />}
                </button>
                {juice && (
                  <p className={s.reason} data-ok={ready || undefined}>
                    {ready ? <OkMark className={s.mark} /> : <ShortMark className={s.mark} />}
                    {reason}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className={s.empty}>레시피를 고르면 재료와 제작 시간이 여기에 나온다</p>
          )}
        </section>

        {/* ───── 대기열 ───── */}
        <section className={s.queuePanel}>
          <h3 className={s.qTitle}>
            제작 대기열
            <b className={s.num}>
              {S.queue.length}/{queueSize}
            </b>
          </h3>
          <div
            key={S.shake.at === 'queue' ? S.shake.seq : 0}
            className={s.slots}
            data-part="queue"
            data-shake={(motion && S.shake.at === 'queue' && S.shake.seq > 0) || undefined}
          >
            {slots}
          </div>
          <ol className={s.log}>
            {S.log.map(l => (
              <li key={l.seq} data-tone={l.tone}>
                {l.text}
                {l.chips && (
                  <span className={s.chips}>
                    {l.chips.map(c => (
                      <em key={c.id}>
                        {itemName(c.id)} +{c.n}
                      </em>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <div className={s.hints}>
          {hintsFor(device, glyph).map(([g, t]) => (
            <span key={t} className={s.hint}>
              {g}
              {t}
            </span>
          ))}
        </div>
      </div>

      {S.win === 'closed' && <div className={s.closed}>제작대 닫힘 · 다시 여는 중…</div>}
      {S.note && S.win === 'open' && (
        <div key={S.note.seq} className={s.note} data-kind={S.note.kind}>
          {S.note.text}
        </div>
      )}
    </div>
  )
}

const fmtTime = (sec: number) => `${Number.isInteger(sec) ? sec : sec.toFixed(1)}초`

/** 입력 장치별 하단 안내 — 숫자 키는 갤러리 이벤트라 쓰지 않는다 */
function hintsFor(device: Device, size: number): [ReactNode, string][] {
  if (device === 'gamepad')
    return [
      [<DPad dirs={['up', 'down']} size={size} />, '레시피'],
      [<Shoulder side="L" size={size} />, '탭'],
      [<PadButton face="bottom" size={size} />, '제작'],
      [<PadButton face="top" size={size} />, '만들 수 있는 것만'],
      [<PadButton face="left" size={size} />, '마지막 제작 취소'],
    ]
  if (device === 'mouse')
    return [
      [<MouseGlyph button="left" size={size} />, '고르기 · 두 번 = 제작'],
      [<MouseGlyph button="wheel" size={size} />, '목록 스크롤'],
      [<KeyCap label="Q E" size={size} />, '탭'],
      [<KeyCap label="F" size={size} />, '만들 수 있는 것만'],
      [<KeyCap label="✕" size={size} />, '대기열 취소 = 환불'],
    ]
  if (device === 'touch')
    return [
      [<TouchGlyph kind="tap" size={size} />, '고르기'],
      [<TouchGlyph kind="swipe" size={size} />, '목록 스크롤'],
      [<TouchGlyph kind="tap" size={size} />, '✕ 취소 = 환불'],
    ]
  return [
    [<KeyCap label="↑↓" size={size} />, '레시피'],
    [<KeyCap label="Q E" size={size} />, '탭'],
    [<KeyCap label="Enter" size={size} />, '제작'],
    [<KeyCap label="F" size={size} />, '만들 수 있는 것만'],
    [<KeyCap label="Backspace" size={size} />, '마지막 제작 취소'],
  ]
}
