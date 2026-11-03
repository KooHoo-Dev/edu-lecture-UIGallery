import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { easeOutCubic, formatNumber } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { createInputLock } from '../../core/inputLock'
import { bool, num, str } from '../../core/params'
import { useStageKeys } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { createRecycler, itemOffset, visibleRange, type IndexRange } from '../../core/virtualList'
import {
  DAY, KIND_PATH, SEASON_END, SERVER_DELAY, SERVER_START, XP_PER_LEVEL,
  claimables, formatClock, formatLeft, initialPass, key, rewardFor, summarize, tierState,
  type PassState, type Reward, type RewardKind, type TierState, type Track,
} from './model'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** 경험치 막대가 차는 속도 (XP/초) — 레벨 하나에 0.5초 */
const FILL_RATE = 2000
const DECEL = 0.135
const LAMBDA = -Math.log(DECEL)

const STATE_TEXT: Record<TierState, string> = { none: '', locked: '잠김', 'need-prem': '패스 필요', claimable: '받기', claiming: '받는 중', claimed: '받음' }
const STATE_PATH: Record<TierState, string> = {
  none: '',
  locked: 'M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5Z M12 15v2.5',
  'need-prem': 'M3 9l4.5 4L12 6l4.5 7L21 9l-2 10H5Z',
  claimable: 'M12 4v10 M12 18.5v1.5',
  claiming: 'M12 3a9 9 0 1 1-9 9',
  claimed: 'M4.5 12.5l5 5L20 7',
}
const TRACKS: Track[] = ['free', 'prem']

interface SlotF {
  el: HTMLElement
  icon: SVGPathElement
  name: HTMLElement
  count: HTMLElement
  badge: SVGPathElement
  text: HTMLElement
}
/** 칸(열) 하나 = Unity 의 TierColumnView 인스턴스. index 는 지금 빌려 보여 주는 레벨 − 1 */
interface ColRec {
  n: number
  el: HTMLDivElement
  lvl: HTMLElement
  slots: Record<Track, SlotF>
  index: number
  stamp: number
  shown: boolean
  pos: string
  sig: string
}

interface Pending {
  at: number
  /** 요청할 때의 보상을 같이 적어 둔다 (응답 전에 조절 값이 바뀌어도 받은 것이 달라지지 않게) */
  items: { level: number; track: Track; r: Reward }[]
  mode: 'one' | 'all' | 'optimistic'
  by: 'auto' | 'human'
}
interface Result {
  items: ReturnType<typeof summarize>
  n: number
  all: boolean
  openedAt: number
  by: 'auto' | 'human'
  blocked: number
}

interface Sim {
  t: number
  version: number
  pass: PassState
  /** 서버가 준 총 경험치 (막대는 이것을 따라 찬다) */
  xpTarget: number
  scroll: number
  vel: number
  anim: { from: number; to: number; t: number; dur: number } | null
  drag: { id: number; x0: number; s0: number; lastX: number; lastT: number; moved: boolean; target: Element } | null
  recycler: ReturnType<typeof createRecycler>
  map: Map<number, number>
  range: IndexRange | null
  cells: ColRec[]
  frame: number
  focus: { level: number; track: Track }
  kbd: boolean
  /** 칸 연출: key → 끝나는 시각. new = 막 받을 수 있게 됨, got = 막 받음 */
  fx: Map<string, { kind: 'new' | 'got'; until: number }>
  hlUntil: number
  pending: Pending[]
  result: Result | null
  /** 연타 집계 — 보낸 요청 · 요청 중이라 무시한 누름 · 잠금이 막은 누름 · 너무 빨리 닫힌 결과 창(ms, 없으면 -1) */
  stat: { sent: number; ignored: number; blocked: number; fast: number }
  wallet: Record<RewardKind, number>
  ghosts: { id: number; text: string; bad: boolean; until: number }[]
  ghostId: number
  serverMs: number
  skewDays: number
  lastDay: boolean
  mash: { left: number; next: number; by: 'auto' | 'human' } | null
  note: { text: string; bad: boolean; until: number } | null
  realT: number
  autoStep: number
  stateCell: string
}

const startWallet = (): Record<RewardKind, number> => ({ credit: 4200, kit: 9, cell: 14, chip: 86, oxygen: 6, skin: 0, emote: 0, frame: 0 })

/**
 * 배틀패스 보상 트랙 — 무료 · 프리미엄 2단 가로 트랙을 칸 열두어 개로 돌려 보여 준다(core/virtualList).
 * 칸 상태는 모델에서 계산(잠김 → 받을 수 있음 → 받는 중 → 받음), 받기는 서버 확인 뒤 결과 창 + 입력 잠금(core/inputLock).
 * 시즌 카운트다운은 서버 시각 기준. 칸 · 막대 · 시계는 매 프레임 ref 로 DOM 을 직접 고치고, 창 · 버튼만 React 가 그린다.
 */
export default function BattlePassTrack(p: SpecimenProps) {
  const juice = p.juice
  const levelCount = Math.round(num(p.params, 'levelCount', 50))
  const itemWidth = num(p.params, 'itemWidth', 180)
  const freeEvery = Math.round(num(p.params, 'freeEvery', 2))
  const premiumOwned = bool(p.params, 'premiumOwned', false)
  const clockSource = juice && str(p.params, 'clockSource', 'server') !== 'device' ? 'server' : 'device'
  const inputLockMs = num(p.params, 'inputLockMs', 300)
  const dailyXp = num(p.params, 'dailyXp', 1500)
  const portrait = p.aspect === '9:16'
  const vpW = portrait ? 860 : 1590
  const reduced = prefersReducedMotion()

  const cfg = { juice, itemWidth, clockSource, dailyXp, vpW, reduced, inputLockMs }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const lock = useRef(createInputLock(inputLockMs)).current
  lock.setDuration(juice ? inputLockMs : 0)

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(levelCount, freeEvery, premiumOwned, itemWidth, vpW, juice)
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
    S.note = { text, bad, until: S.t + 3 }
    touch()
  }
  const lastNote = useRef<Sim['note']>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const flagRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const lockBarRef = useRef<HTMLElement>(null)
  const thumbRef = useRef<HTMLElement>(null)
  const txt = useRef<Record<string, HTMLElement | null>>({})
  const setText = (k: string, v: string) => {
    const el = txt.current[k]
    if (el && el.textContent !== v) el.textContent = v
  }
  const T = (k: string) => (el: HTMLElement | null) => void (txt.current[k] = el)

  const maxScroll = () => Math.max(0, S.pass.count * cfgRef.current.itemWidth - cfgRef.current.vpW)
  const snapTarget = (level = S.pass.level) => {
    const c = cfgRef.current
    return clamp((level - 1) * c.itemWidth + c.itemWidth / 2 - c.vpW * 0.6, 0, maxScroll())
  }
  const glide = (to: number, dur = 0.3) => {
    const c = cfgRef.current
    S.vel = 0
    if (!c.juice || c.reduced) {
      S.scroll = to
      S.anim = null
    } else S.anim = { from: S.scroll, to, t: 0, dur }
  }

  /* ───── 조절 값 바뀜 ───── */
  useEffect(() => {
    S.pass.count = levelCount
    S.pass.level = Math.min(S.pass.level, levelCount)
    S.xpTarget = Math.min(S.xpTarget, (levelCount - 1) * XP_PER_LEVEL)
    S.pass.freeEvery = freeEvery
    S.scroll = clamp(S.scroll, 0, maxScroll())
    S.focus.level = Math.min(S.focus.level, levelCount)
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelCount, freeEvery, itemWidth, vpW])
  const lastPrem = useRef(premiumOwned)
  useEffect(() => {
    if (lastPrem.current === premiumOwned) return
    lastPrem.current = premiumOwned
    setPremium(premiumOwned, false)
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premiumOwned])
  const lastJuice = useRef(juice)
  useEffect(() => {
    if (lastJuice.current === juice) return
    lastJuice.current = juice
    // 응답을 기다리던 요청은 버리지 않고 지금 확정한다 (결과 창 없이) — 버리면 보상이 사라지거나 두 번 받는다
    const pend = S.pending
    S.pending = []
    pend.forEach(pd => resolve(pd, true))
    S.result = null
    S.mash = null
    openTrack()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juice])

  /* ───── 동작 ───── */
  const openTrack = () => {
    const c = cfgRef.current
    S.drag = null
    S.vel = 0
    if (!c.juice) {
      S.scroll = 0
      S.anim = null
      note(`트랙이 늘 Lv 1 부터 열린다 — 지금 레벨 ${S.pass.level} 을 보려면 ${S.pass.level - 1}칸을 끌어야 한다`, true)
      return
    }
    const to = snapTarget()
    if (c.reduced) S.scroll = to
    else {
      S.scroll = clamp(to - 2.5 * c.itemWidth, 0, maxScroll())
      S.anim = { from: S.scroll, to, t: 0, dur: 0.5 }
    }
    S.hlUntil = S.t + 1.8
    const first = claimables(S.pass)[0]
    S.focus = first ? { ...first } : { level: S.pass.level, track: 'free' }
    note(`트랙을 열면 지금 레벨(Lv ${S.pass.level})로 스냅 — 받을 수 있는 칸이 바로 보인다`)
  }

  const addXp = (amount: number) => {
    const max = (S.pass.count - 1) * XP_PER_LEVEL
    const before = S.pass.level
    S.xpTarget = Math.min(max, S.xpTarget + amount)
    const after = Math.floor(S.xpTarget / XP_PER_LEVEL) + 1
    if (!cfgRef.current.juice) {
      applyXp(S.xpTarget)
      note(`+${formatNumber(amount)} XP — 막대가 순간 이동. Lv ${before} → ${after}, 어느 칸이 열렸는지 표시가 없다`, true)
    } else note(after > before ? `+${formatNumber(amount)} XP — Lv ${before} → ${after}, 열리는 칸을 차례로 보여 준다` : `+${formatNumber(amount)} XP`)
  }
  /** 막대가 보여 주는 총 경험치를 모델에 반영 — 레벨을 넘을 때마다 그 칸이 '받을 수 있음' 으로 바뀐다 */
  const applyXp = (total: number) => {
    const level = Math.min(S.pass.count, Math.floor(total / XP_PER_LEVEL) + 1)
    const xp = level >= S.pass.count ? 0 : total - (level - 1) * XP_PER_LEVEL
    while (S.pass.level < level) {
      S.pass.level++
      for (const t of TRACKS) S.fx.set(key(S.pass.level, t), { kind: 'new', until: S.t + 0.9 })
      if (cfgRef.current.juice) {
        // 새 레벨을 따라 트랙을 옮긴다 (보이지 않으면)
        const x = (S.pass.level - 1) * cfgRef.current.itemWidth
        if (x + cfgRef.current.itemWidth > S.scroll + cfgRef.current.vpW - 40 && !S.drag) glide(snapTarget(), 0.35)
      }
      touch()
    }
    S.pass.xp = xp
  }

  const reward = (level: number, track: Track) => rewardFor(level, track, S.pass.freeEvery)

  const claimOne = (level: number, track: Track, by: 'auto' | 'human') => {
    const st = tierState(S.pass, level, track)
    const r = reward(level, track)
    if (!r) return
    if (!cfgRef.current.juice) {
      // 흔한 실수: 서버 확인 전에 지갑부터 더하고, 칸은 '받을 수 있음' 그대로 — 연타하면 여러 번 보낸다
      if (st !== 'claimable') {
        if (st === 'claimed') note(`Lv ${level} 은 이미 받았다`, true)
        return
      }
      S.wallet[r.kind] += r.count
      S.stat.sent++
      ghost(`+${formatNumber(r.count)} ${r.name}`, false)
      S.pending.push({ at: S.t + SERVER_DELAY, items: [{ level, track, r }], mode: 'optimistic', by })
      touch()
      return
    }
    if (st === 'claiming') {
      S.stat.ignored++
      note(`요청 중인 칸 — 같은 칸은 한 번만 보낸다 (무시 ${S.stat.ignored})`)
      return
    }
    if (st === 'need-prem') return note('프리미엄 줄 — 레벨은 됐지만 패스가 없다 (아래 "프리미엄 활성화 (시연)")')
    if (st === 'locked') return note(`Lv ${level} 에 도달하면 받을 수 있다 — 앞으로 ${formatNumber((level - 1) * XP_PER_LEVEL - S.xpTarget)} XP`)
    if (st === 'claimed') return note(`Lv ${level} ${track === 'free' ? '무료' : '프리미엄'} 보상은 이미 받았다`)
    if (st !== 'claimable') return
    S.pass.claiming.add(key(level, track))
    S.stat.sent++
    S.pending.push({ at: S.t + SERVER_DELAY, items: [{ level, track, r }], mode: 'one', by })
    touch()
  }
  const claimAll = (by: 'auto' | 'human') => {
    const list = claimables(S.pass)
    if (!list.length) return note('받을 수 있는 보상이 없다')
    if (!cfgRef.current.juice) {
      claimOne(list[0].level, list[0].track, by)
      note(`'모두 받기' 가 없다 — 하나씩 눌러야 한다 (남은 ${list.length - 1}개)`, true)
      return
    }
    for (const it of list) S.pass.claiming.add(key(it.level, it.track))
    S.pending.push({ at: S.t + SERVER_DELAY, items: list.map(it => ({ ...it, r: reward(it.level, it.track)! })), mode: 'all', by })
    touch()
  }
  const resolve = (pd: Pending, quiet = false) => {
    if (pd.mode === 'optimistic') {
      const { level, track, r } = pd.items[0]
      const k = key(level, track)
      if (!S.pass.claimed.has(k)) {
        S.pass.claimed.add(k)
        S.fx.set(k, { kind: 'got', until: S.t + 0.6 })
      } else {
        S.wallet[r.kind] -= r.count
        ghost(`−${formatNumber(r.count)} ${r.name} (서버: 이미 받음)`, true)
        note(`서버가 중복 받기를 거절 — 늘어났던 ${r.name} 이 되돌아간다. 화면만 두 번 받은 것처럼 보였다`, true)
      }
      touch()
      return
    }
    pd.items.forEach((it, i) => {
      const k = key(it.level, it.track)
      S.pass.claiming.delete(k)
      S.pass.claimed.add(k)
      S.fx.set(k, { kind: 'got', until: S.t + 0.6 + i * 0.05 })
      S.wallet[it.r.kind] += it.r.count
    })
    if (quiet) {
      touch()
      return
    }
    S.result = { items: summarize(pd.items.map(it => it.r)), n: pd.items.length, all: pd.mode === 'all', openedAt: S.t, by: pd.by, blocked: 0 }
    lock.open(S.t * 1000)
    const next = claimables(S.pass)[0]
    if (next) S.focus = { ...next }
    touch()
  }
  /** 결과 창 확인. pressedAt = 누른 시각(게임 시간 ms) — 처리가 늦어도 잠금 중에 누른 입력은 막힌다 */
  const confirm = (pressedAt: number) => {
    const R = S.result
    if (!R) return
    if (lock.blocks(pressedAt)) {
      R.blocked++
      S.stat.blocked++
      touch()
      return
    }
    const fast = S.t - R.openedAt
    S.result = null
    if (fast < 0.15) S.stat.fast = Math.round(fast * 1000)
    if (fast < 0.15) note(`결과 창이 ${Math.round(fast * 1000)}ms 만에 닫혔다 — 무엇을 받았는지 못 봤다 (입력 잠금 없음)`, true)
    touch()
  }
  const press = (by: 'auto' | 'human') => {
    if (S.result) confirm(S.t * 1000)
    else claimOne(S.focus.level, S.focus.track, by)
  }
  const ghost = (text: string, bad: boolean) => {
    S.ghosts.push({ id: S.ghostId++, text, bad, until: S.t + 1.4 })
    S.ghosts = S.ghosts.slice(-3)
  }

  const setPremium = (on: boolean, fromButton: boolean) => {
    if (S.pass.premium === on) return
    S.pass.premium = on
    if (on) {
      let n = 0
      for (let l = 1; l <= S.pass.level; l++)
        if (tierState(S.pass, l, 'prem') === 'claimable') {
          S.fx.set(key(l, 'prem'), { kind: 'new', until: S.t + 0.9 + n * 0.03 })
          n++
        }
      note(`프리미엄 활성화 (시연${fromButton ? '' : ' · 조절 값'}) — 지난 레벨의 프리미엄 칸 ${n}개도 받을 수 있게 된다`)
    } else note('프리미엄 해제 (시연) — 받지 않은 프리미엄 칸은 다시 "패스 필요"')
    touch()
  }

  const mash = (by: 'auto' | 'human') => {
    if (!claimables(S.pass).length) {
      S.xpTarget = Math.min((S.pass.count - 1) * XP_PER_LEVEL, (S.pass.level) * XP_PER_LEVEL)
      applyXp(S.xpTarget)
    }
    const first = claimables(S.pass)[0]
    if (!first) return
    S.result = null
    S.focus = { ...first }
    S.stat = { sent: 0, ignored: 0, blocked: 0, fast: -1 }
    S.mash = { left: 7, next: 0, by }
    const x = (first.level - 1) * cfgRef.current.itemWidth
    if (x < S.scroll || x + cfgRef.current.itemWidth > S.scroll + cfgRef.current.vpW) glide(snapTarget(first.level), 0.3)
    note('받기 버튼 연타 — 0.1초 간격으로 7번')
  }

  const deviceClock = () => {
    S.skewDays = (S.skewDays + 1) % 4
    const c = cfgRef.current
    if (!S.skewDays) note('기기 시계를 원래대로 되돌렸다')
    else if (c.clockSource === 'server') note(`기기 시계를 +${S.skewDays}일 — 카운트다운은 그대로. 서버 시각 = 접속 때 받은 서버 시각 + 그 뒤 흐른 시간`)
    else note(`기기 시계를 +${S.skewDays}일 — 카운트다운이 ${S.skewDays}일 줄었다! 시계만 돌려도 시즌이 '끝난다'`, true)
  }
  const lastDay = () => {
    S.lastDay = !S.lastDay
    S.serverMs = S.lastDay ? SEASON_END - (3 * 3600 + 10 * 60) * 1000 : SERVER_START
    note(S.lastDay ? '시즌 마지막 날 — 남은 시간과 받지 않은 보상을 숫자로 알린다' : '시즌 첫 주로 되돌림')
  }

  const human = () => {
    S.realT = S.t
    if (S.result) S.result.by = 'human'
  }
  const handle = (id: string, by: 'auto' | 'human') => {
    // 결과 창이 떠 있으면 다음 상황으로 넘어가기 전에 닫는다 (이벤트 도중 다른 이벤트)
    if (S.result && id !== 'mash-claim') S.result = null
    if (id === 'gain-xp') addXp(700)
    else if (id === 'multi-level') addXp(3200)
    else if (id === 'claim-all') claimAll(by)
    else if (id === 'mash-claim') mash(by)
    else if (id === 'device-clock') deviceClock()
    else if (id === 'last-day') lastDay()
    else if (id === 'open-track') openTrack()
  }
  useTrigger(p.trigger, id => {
    human()
    handle(id, 'human')
    touch()
    sync()
  })

  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    2.8,
    () => {
      if (S.t - S.realT < MANUAL_PAUSE || S.drag || S.mash || (S.result && S.result.by === 'human')) return
      if (S.pass.level >= S.pass.count - 4) {
        resetSeason()
        note('데모 되감기 — 시즌 처음 상태로')
      } else {
        const k = S.autoStep++ % 9
        const seq = ['gain-xp', 'claim-all', 'multi-level', 'device-clock', 'mash-claim', 'open-track', 'prem-on', 'claim-all', 'prem-off']
        const id = seq[k]
        if (id === 'prem-on' || id === 'prem-off') setPremium(id === 'prem-on' || premiumOwned, true)
        else handle(id, 'auto')
      }
      touch()
      sync()
    },
    p.trigger?.seq,
  )
  const resetSeason = () => {
    S.pass = initialPass(S.pass.count, S.pass.freeEvery, S.pass.premium)
    S.fx.clear()
    S.xpTarget = (S.pass.level - 1) * XP_PER_LEVEL + S.pass.xp
    S.pending = []
    S.result = null
    S.wallet = startWallet()
    S.skewDays = 0
    openTrack()
  }

  /* ───── 입력: 끌기 · 휠 · 키보드 ───── */
  const stageScale = () => {
    const r = rootRef.current?.getBoundingClientRect()
    return r && r.width ? p.width / r.width : 1
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || e.button !== 0 || S.result) return
    human()
    S.kbd = false
    S.anim = null
    S.vel = 0
    S.drag = { id: e.pointerId, x0: e.clientX, s0: S.scroll, lastX: S.scroll, lastT: performance.now(), moved: false, target: e.target as Element }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 */
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = S.drag
    if (!d || d.id !== e.pointerId) return
    const dx = (d.x0 - e.clientX) * stageScale()
    if (Math.abs(dx) > 10) d.moved = true
    if (!d.moved) return
    const pos = clamp(d.s0 + dx, 0, maxScroll())
    const now = performance.now()
    const inst = (pos - d.lastX) / Math.max(0.001, (now - d.lastT) / 1000)
    S.vel += (inst - S.vel) * 0.5
    d.lastX = pos
    d.lastT = now
    S.scroll = pos
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = S.drag
    if (!d || d.id !== e.pointerId) return
    S.drag = null
    if (!d.moved) {
      S.vel = 0
      const slot = d.target.closest('[data-slot]')
      const col = slot?.closest('[data-col]')
      const rec = col ? S.cells[Number(col.getAttribute('data-col'))] : undefined
      if (slot && rec && rec.index >= 0) {
        const track = slot.getAttribute('data-slot') as Track
        S.focus = { level: rec.index + 1, track }
        claimOne(rec.index + 1, track, 'human')
      }
      sync()
      return
    }
    if (performance.now() - d.lastT > 90) S.vel = 0
  }
  const vpRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = vpRef.current
    if (!el || p.thumbnail) return
    // 가로 의도(가로 휠 · Shift + 휠)만 먹는다 — 세로 휠은 페이지 스크롤로 흘려보낸다
    const onWheel = (e: WheelEvent) => {
      const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (!horiz && !e.shiftKey) return
      e.preventDefault()
      human()
      const d = (horiz ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 40 : 1) * 1.4
      glide(clamp((S.anim ? S.anim.to : S.scroll) + d, 0, maxScroll()), 0.2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.thumbnail])

  /* 무대에 포커스가 있을 때만: ←/→ 칸 · ↑/↓ 줄 · Home/End · Enter 받기(결과 창이면 확인). Space · 숫자 · 글자는 갤러리 단축키로 그대로 */
  /* 키보드 (core/stageKeys) — 무대에 포커스가 있을 때만 칸 이동 · Enter 받기.
   * 자동 데모가 연 결과 창에 무대 밖 키가 오면: 사람이 넘겨받은 것 — 창을 닫고 키는 그대로 흘려보낸다 */
  useStageKeys(rootRef, {
    enabled: !p.thumbnail,
    autoOpen: ({ focused }) => !focused && S.result?.by === 'auto',
    takeOver: () => {
      S.result = null
      S.realT = S.t
      touch()
      sync()
    },
    onKey: e => {
      if ((e.target as Element).closest?.('button')) return // 무대 안 버튼은 Enter · Space 가 그 버튼을 누른다
      const k = e.key
      const f = S.focus
      const count = S.pass.count
      if (k === 'Enter') {
        if (!e.repeat) {
          if (S.result) confirm(S.t * 1000)
          else claimOne(f.level, f.track, 'human')
        }
      } else if (S.result) return
      else if (k === 'ArrowLeft' || k === 'ArrowRight') f.level = clamp(f.level + (k === 'ArrowLeft' ? -1 : 1), 1, count)
      else if (k === 'ArrowUp' || k === 'ArrowDown') f.track = k === 'ArrowUp' ? 'free' : 'prem'
      else if (k === 'Home') f.level = 1
      else if (k === 'End') f.level = count
      else return
      S.kbd = true
      human()
      // 포커스 칸이 보이게
      const c = cfgRef.current
      const x = (f.level - 1) * c.itemWidth
      const base = S.anim ? S.anim.to : S.scroll
      if (x < base) glide(clamp(x - c.itemWidth * 0.5, 0, maxScroll()), 0.2)
      else if (x + c.itemWidth > base + c.vpW) glide(clamp(x + c.itemWidth * 1.5 - c.vpW, 0, maxScroll()), 0.2)
      touch()
      sync()
      return true
    },
  })

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    // 모형: 웹 재현의 '서버 시각' 은 갤러리의 정지 · 배속을 따른다(게임 시간). 실제 게임에서는 단조 시계(realtimeSinceStartup)로 흐른 시간을 더한다
    // 입력 잠금도 같은 게임 시간이라 정지 중에는 잠금이 멈춘다 — 배속 0.25 로 잠금 막대를 눈으로 보기 위해서다
    S.serverMs += dt * 1000
    const c = cfgRef.current
    // 경험치 막대가 서버 값을 따라 찬다
    const shownTotal = (S.pass.level - 1) * XP_PER_LEVEL + S.pass.xp
    if (shownTotal < S.xpTarget) applyXp(c.juice && !c.reduced ? Math.min(S.xpTarget, shownTotal + FILL_RATE * dt) : S.xpTarget)
    // 서버 응답
    if (S.pending.length) {
      const due = S.pending.filter(pd => pd.at <= S.t)
      if (due.length) {
        S.pending = S.pending.filter(pd => pd.at > S.t)
        due.forEach(pd => resolve(pd))
      }
    }
    // 연타 흉내 (0.1초 간격)
    if (S.mash) {
      S.mash.next -= dt
      if (S.mash.next <= 0) {
        press(S.mash.by)
        S.mash.left--
        S.mash.next += 0.1
        if (S.mash.left <= 0) {
          S.mash = null
          const m = S.stat
          if (c.juice)
            note(
              `연타 7번 → 받기 요청 ${m.sent}번 · 요청 중 무시 ${m.ignored} · 잠금이 막은 입력 ${m.blocked}` +
                (m.fast >= 0 ? ` · 결과 창이 열리자마자 닫히고 다음 칸까지 눌렸다` : ''),
              m.fast >= 0 || m.sent > 1,
            )
          else note(`연타 7번 → 요청 ${m.sent}번이 서버로 — 지갑이 ${m.sent}번 늘었다가 서버 거절로 되돌아간다`, true)
        }
      }
    }
    if (S.result?.by === 'auto' && S.t - S.result.openedAt > 1.8) {
      S.result = null
      touch()
    }
    physics(dt)
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    if (S.fx.size > 120) for (const [k, f] of S.fx) if (f.until <= S.t) S.fx.delete(k)
    if (S.ghosts.length && S.ghosts[0].until <= S.t) {
      S.ghosts = S.ghosts.filter(g => g.until > S.t)
      touch()
    }
    paint()
    sync()
  })

  const physics = (dt: number) => {
    if (dt <= 0 || S.drag) return
    if (S.anim) {
      const a = S.anim
      a.t += dt
      const k = Math.min(1, a.t / a.dur)
      S.scroll = a.from + (a.to - a.from) * easeOutCubic(k)
      if (k >= 1) S.anim = null
    } else if (S.vel !== 0) {
      const r = Math.pow(DECEL, dt)
      S.scroll += (S.vel * (1 - r)) / LAMBDA
      S.vel *= r
      if (Math.abs(S.vel) < 2) S.vel = 0
    }
    const max = maxScroll()
    if (S.scroll < 0 || S.scroll > max) {
      S.scroll = clamp(S.scroll, 0, max)
      S.vel = 0
    }
  }

  /* ───── 칸 만들기 · 채우기 ───── */
  const skeleton = useRef<HTMLDivElement | null>(null)
  const mount = () => {
    const content = contentRef.current
    const want = S.recycler.stats().created
    if (!content || S.cells.length >= want) return
    if (!skeleton.current) skeleton.current = makeSkeleton()
    for (let n = S.cells.length; n < want; n++) {
      const el = skeleton.current.cloneNode(true) as HTMLDivElement
      el.setAttribute('data-col', String(n))
      const q = <E extends Element>(sel: string, root: Element = el) => root.querySelector(sel) as E
      const slot = (t: Track): SlotF => {
        const se = q<HTMLElement>(`[data-slot="${t}"]`)
        return { el: se, icon: q('[data-f=icon]', se), name: q('[data-f=name]', se), count: q('[data-f=count]', se), badge: q('[data-f=badge]', se), text: q('[data-f=text]', se) }
      }
      S.cells.push({ n, el, lvl: q('[data-f=lvl]'), slots: { free: slot('free'), prem: slot('prem') }, index: -1, stamp: -1, shown: true, pos: '', sig: '' })
      content.appendChild(el)
    }
  }
  const fxOf = (k: string) => {
    const f = S.fx.get(k)
    return f && f.until > S.t ? f.kind : ''
  }
  const bindCol = (rec: ColRec) => {
    const c = cfgRef.current
    const level = rec.index + 1
    const sts = TRACKS.map(t => tierState(S.pass, level, t))
    const fx = TRACKS.map(t => fxOf(key(level, t)))
    const focus = S.kbd && S.focus.level === level ? S.focus.track : ''
    const hl = c.juice && level === S.pass.level && S.t < S.hlUntil
    const sig = `${level}|${S.pass.level}|${S.pass.freeEvery}|${sts}|${fx}|${focus}|${hl}|${c.juice}`
    if (sig === rec.sig) return
    rec.sig = sig
    rec.lvl.textContent = String(level)
    rec.el.toggleAttribute('data-cur', level === S.pass.level)
    rec.el.toggleAttribute('data-reached', level <= S.pass.level)
    rec.el.toggleAttribute('data-hl', hl)
    TRACKS.forEach((t, i) => {
      const f = rec.slots[t]
      const r = rewardFor(level, t, S.pass.freeEvery)
      const st = sts[i]
      f.el.setAttribute('data-state', st)
      f.el.toggleAttribute('data-big', !!r?.big)
      f.el.toggleAttribute('data-focus', focus === t)
      if (fx[i]) f.el.setAttribute('data-fx', fx[i])
      else f.el.removeAttribute('data-fx')
      f.icon.setAttribute('d', r ? KIND_PATH[r.kind] : '')
      f.name.textContent = r ? r.name : t === 'free' ? '빈칸' : ''
      f.count.textContent = r && r.count > 1 ? `×${formatNumber(r.count)}` : ''
      f.badge.setAttribute('d', STATE_PATH[st])
      f.text.textContent = STATE_TEXT[st]
      f.el.setAttribute('aria-label', r ? `레벨 ${level} ${t === 'free' ? '무료' : '프리미엄'} ${r.name} ${f.count.textContent} — ${STATE_TEXT[st]}` : `레벨 ${level} 무료 보상 없음`)
    })
  }

  /* ───── 그리기 ───── */
  const paint = () => {
    const c = cfgRef.current
    const W = c.itemWidth
    const P = S.pass
    const count = P.count
    S.frame++
    const range = visibleRange(S.scroll, c.vpW, W, count, 1)
    if (!S.range || range.first !== S.range.first || range.last !== S.range.last) {
      S.map = S.recycler.layout(range)
      S.range = range
    }
    mount()
    for (const [index, n] of S.map) {
      const rec = S.cells[n]
      if (!rec) continue
      if (rec.index !== index) {
        rec.index = index
        rec.sig = ''
      }
      rec.stamp = S.frame
    }
    let stateKey = ''
    let fallback = ''
    let fbIndex = Infinity
    for (const rec of S.cells) {
      const on = rec.index >= 0 && rec.stamp === S.frame
      if (on !== rec.shown) {
        rec.el.style.visibility = on ? '' : 'hidden'
        rec.shown = on
      }
      if (!on) continue
      const pos = `${itemOffset(rec.index, W)}|${W}`
      if (pos !== rec.pos) {
        rec.el.style.transform = `translateX(${itemOffset(rec.index, W)}px)`
        rec.el.style.width = `${W}px`
        rec.pos = pos
      }
      bindCol(rec)
      // 해설 번호 1: 화면 안의 첫 '받을 수 있음' 칸 (없으면 첫 칸)
      const inView = rec.index * W >= S.scroll - 1 && (rec.index + 1) * W <= S.scroll + c.vpW + 1
      if (inView) {
        if (rec.index < fbIndex) {
          // 받을 칸이 없을 때: 화면 안 첫 칸 중 보상이 있는 줄 (무료가 빈칸이면 프리미엄)
          const t0: Track = tierState(P, rec.index + 1, 'free') === 'none' ? 'prem' : 'free'
          fallback = `${rec.index}:${t0}:${rec.n}`
          fbIndex = rec.index
        }
        for (const t of TRACKS)
          if (tierState(P, rec.index + 1, t) === 'claimable' && (!stateKey || Number(stateKey.split(':')[0]) > rec.index)) stateKey = `${rec.index}:${t}:${rec.n}`
      }
    }
    if (!stateKey) stateKey = fallback
    if (stateKey && stateKey !== S.stateCell) {
      const [, ot, on] = S.stateCell.split(':')
      if (on !== undefined) S.cells[Number(on)]?.slots[ot as Track]?.el.removeAttribute('data-part')
      const [, nt, nn] = stateKey.split(':')
      S.cells[Number(nn)]?.slots[nt as Track].el.setAttribute('data-part', 'state')
      S.stateCell = stateKey
    }
    if (contentRef.current) contentRef.current.style.transform = `translate3d(${-S.scroll}px, 0, 0)`
    // 진행 선: 1 레벨 칸 가운데부터 지금 레벨 + 경험치 비율까지
    const prog = (P.level - 1 + (P.level >= count ? 0 : P.xp / XP_PER_LEVEL)) * W
    if (railRef.current) railRef.current.style.width = `${(count - 1) * W}px`
    if (fillRef.current) fillRef.current.style.width = `${prog}px`
    const max = maxScroll()
    if (thumbRef.current) {
      const tw = Math.max(60, (c.vpW * c.vpW) / Math.max(c.vpW, count * W))
      thumbRef.current.style.width = `${tw}px`
      thumbRef.current.style.transform = `translateX(${(max > 0 ? S.scroll / max : 0) * (c.vpW - tw)}px)`
    }

    // 경험치 막대
    if (barRef.current) barRef.current.style.transform = `scaleX(${P.level >= count ? 1 : P.xp / XP_PER_LEVEL})`
    setText('level', String(P.level))
    setText('xp', P.level >= count ? '최고 레벨' : `${formatNumber(P.xp)} / ${formatNumber(XP_PER_LEVEL)} XP`)
    setText('toNext', P.level >= count ? '모든 칸 도달' : `다음 레벨까지 ${formatNumber(XP_PER_LEVEL - P.xp)} XP`)

    // 시계: 서버 시각 = 접속 때 받은 서버 시각 + 흐른 시간. 기기 시각은 사용자가 바꿀 수 있다
    const device = S.serverMs + S.skewDays * DAY
    const basis = c.clockSource === 'server' ? S.serverMs : device
    const left = SEASON_END - basis
    setText('countdown', left > 0 ? formatLeft(left) : '시즌 종료')
    setText('serverClock', `서버 ${formatClock(S.serverMs)} UTC`)
    setText('deviceClock', `기기 ${formatClock(device, 9)}${S.skewDays ? ` (+${S.skewDays}일 바꿈)` : ''}`)
    const root = rootRef.current
    root?.toggleAttribute('data-urgent', left < DAY)

    // 정직한 남은 양: 끝까지 남은 경험치 · 하루 획득량으로 걸리는 날 · 시즌 안에 갈 수 있는 레벨 (추정)
    const total = (P.level - 1) * XP_PER_LEVEL + P.xp
    const need = Math.max(0, (count - 1) * XP_PER_LEVEL - total)
    const daysLeft = Math.max(0, left / DAY)
    const days = need / Math.max(1, c.dailyXp)
    const proj = Math.min(count, Math.floor((total + c.dailyXp * daysLeft) / XP_PER_LEVEL) + 1)
    const unclaimed = claimables(P).length
    setText('need', `${formatNumber(need)} XP`)
    setText('days', need <= 0 ? '끝까지 도달했다' : `하루 ${formatNumber(c.dailyXp)} XP 면 약 ${days.toFixed(1)}일 · 시즌 남은 ${daysLeft.toFixed(1)}일`)
    setText(
      'verdict',
      need <= 0
        ? '남은 칸이 없다'
        : proj >= count
          ? `이 속도면 시즌 안에 Lv ${count} 까지 갈 수 있다`
          : `이 속도면 시즌 끝에 Lv ${proj} 쯤 — Lv ${count} 까지 ${count - proj}칸이 남는다`,
    )
    setText('unclaimed', unclaimed ? `받지 않은 보상 ${unclaimed}개 — 시즌이 끝나기 전에 받는다` : '받지 않은 보상 없음')
    const seg = (v: number) => `${(clamp(v, 1, count) - 1) / Math.max(1, count - 1) * 100}%`
    root?.style.setProperty('--now', seg(P.level))
    root?.style.setProperty('--proj', seg(proj))
    if (flagRef.current) {
      flagRef.current.style.transform = `translateX(${(proj - 1) * W + W / 2}px)`
      setText('flag', `예상 Lv ${proj}`)
    }

    // 지갑 · 디버그
    setText('credit', formatNumber(S.wallet.credit))
    setText('chip', formatNumber(S.wallet.chip))
    setText('kit', formatNumber(S.wallet.kit))
    setText('oxygen', formatNumber(S.wallet.oxygen))
    const st = S.recycler.stats()
    setText('debug', `${count}칸 중 만든 칸 ${st.created} · 재사용 ${formatNumber(st.reused)} · 배정 Lv ${(S.range?.first ?? 0) + 1}~${(S.range?.last ?? 0) + 1}`)
    setText('claimN', String(unclaimed))
    // 결과 창 잠금 막대
    if (lockBarRef.current) {
      const pr = S.result ? lock.progress(S.t * 1000) : 1
      lockBarRef.current.style.transform = `scaleX(${pr})`
    }
  }

  useLayoutEffect(() => paint())

  /* ───── 렌더 ───── */
  if (S.note) lastNote.current = S.note
  const shownNote = S.note ?? lastNote.current
  const ts = Math.max(0.05, p.timeScale)
  const R = S.result
  const premium = S.pass.premium
  return (
    <div
      ref={rootRef}
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-premium={premium || undefined}
      data-clock={clockSource}
      style={{ '--ts': ts, '--w': `${itemWidth}px`, '--vpw': `${vpW}px` } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="배틀패스 보상 트랙 (끌기 · 휠 스크롤, ←/→ 칸 · ↑/↓ 줄 이동, Enter 받기)"
      onPointerDown={() => {
        if (S.result?.by === 'auto') S.result.by = 'human'
      }}
    >
      <header className={s.top}>
        <svg className={s.emblem} viewBox="-20 -20 40 40" aria-hidden>
          <path d="M0 -18 L15 -9 V9 L0 18 L-15 9 V-9 Z M0 -8 L7 4 H-7 Z" />
        </svg>
        <div className={s.title}>
          <b>외곽 탐사 패스</b>
          <span>시즌 4 · 궤도 정비 기지</span>
        </div>
        <div className={s.countdown} data-part="countdown">
          <svg className={s.hourglass} viewBox="0 0 24 24" aria-hidden>
            <path d="M6 3h12 M6 21h12 M7 3c0 6 10 6 10 9s-10 3-10 9 M17 3c0 6-10 6-10 9s10 3 10 9" />
          </svg>
          <div className={s.cdText}>
            <span className={s.cdLabel}>
              시즌 종료까지 <em className={s.basis}>{clockSource === 'server' ? '서버 시각 기준' : '⚠ 기기 시계 기준'}</em>
              <em className={s.lastTag}>마지막 날</em>
            </span>
            <b className={s.num} ref={T('countdown')} />
            <small>
              <span ref={T('serverClock')} /> · <span ref={T('deviceClock')} />
            </small>
          </div>
        </div>
        <div className={s.wallet}>
          <span>
            <Icon kind="credit" /> <b className={s.num} ref={T('credit')} />
          </span>
          <span>
            <Icon kind="chip" /> <b className={s.num} ref={T('chip')} />
          </span>
          <span>
            <Icon kind="kit" /> <b className={s.num} ref={T('kit')} />
          </span>
          <span>
            <Icon kind="oxygen" /> <b className={s.num} ref={T('oxygen')} />
          </span>
          <div className={s.ghosts} aria-hidden>
            {S.ghosts.map(g => (
              <i key={g.id} data-bad={g.bad || undefined}>
                {g.text}
              </i>
            ))}
          </div>
        </div>
      </header>

      <section className={s.xpRow}>
        <div className={s.lvBadge}>
          <small>Lv</small>
          <b className={s.num} ref={T('level')} />
        </div>
        <div className={s.xpBox}>
          <div className={s.xpBar}>
            <i ref={barRef} />
          </div>
          <div className={s.xpText}>
            <span className={s.num} ref={T('xp')} />
            <span ref={T('toNext')} />
          </div>
        </div>
        <button
          className={s.premBtn}
          data-on={premium || undefined}
          tabIndex={p.thumbnail ? -1 : 0}
          onClick={() => {
            human()
            setPremium(!S.pass.premium, true)
            sync()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={STATE_PATH['need-prem']} />
          </svg>
          <span>
            <b>{premium ? '프리미엄 보유 중' : '프리미엄 활성화'}</b>
            <small>시연용 토글 — 결제 없음</small>
          </span>
        </button>
      </section>

      <section className={s.trackPanel}>
        <div className={s.rowLabels}>
          <span className={s.lvHead}>레벨</span>
          <span className={s.rowFree}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="8" />
            </svg>
            무료
          </span>
          <span className={s.rowPrem}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={STATE_PATH['need-prem']} />
            </svg>
            프리미엄
            <small>{premium ? '보유' : '잠김'}</small>
          </span>
        </div>
        <div
          ref={vpRef}
          className={s.viewport}
          data-part="track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onScroll={e => {
            e.currentTarget.scrollLeft = 0
          }}
        >
          <div ref={contentRef} className={s.content}>
            <i ref={railRef} className={s.rail}>
              <i ref={fillRef} />
            </i>
            <i ref={flagRef} className={s.flag}>
              <span ref={T('flag')} />
            </i>
          </div>
          <div className={s.scrollbar} aria-hidden>
            <i ref={thumbRef} />
          </div>
        </div>
        <div className={s.note} data-show={!!S.note || undefined} data-bad={shownNote?.bad || undefined}>
          {shownNote?.text}
        </div>
        <div className={s.result} data-open={!!R || undefined} role="dialog" aria-label="받은 보상">
          <h4>{R ? (R.all ? `보상 ${R.n}개 모두 받음` : '보상 받음') : ''}</h4>
          <ul>
            {R?.items.slice(0, 6).map((it, i) => (
              <li key={i} data-big={it.big || undefined}>
                <Icon kind={it.kind} />
                <span>{it.name}</span>
                {it.count > 1 && <b className={s.num}>×{formatNumber(it.count)}</b>}
              </li>
            ))}
            {R && R.items.length > 6 && <li className={s.more}>외 {R.items.length - 6}종</li>}
          </ul>
          <div className={s.lockRow}>
            <span className={s.lockBar}>
              <i ref={lockBarRef} />
            </span>
            <small>{inputLockMs > 0 && juice ? `입력 잠금 ${inputLockMs}ms${R?.blocked ? ` · 막은 입력 ${R.blocked}` : ''}` : '입력 잠금 없음'}</small>
          </div>
          <button
            className={s.okBtn}
            tabIndex={R && !p.thumbnail ? 0 : -1}
            onClick={() => {
              human()
              confirm(S.t * 1000)
              sync()
            }}
          >
            확인 <kbd className={s.kbd}>Enter</kbd>
          </button>
        </div>
      </section>

      <section className={s.bottom}>
        <div className={s.preview}>
          <h4>다음 보상 · Lv {Math.min(S.pass.level + 1, S.pass.count)}</h4>
          <div className={s.previewItems}>
            {TRACKS.map(t => {
              const r = rewardFor(Math.min(S.pass.level + 1, S.pass.count), t, S.pass.freeEvery)
              return (
                <div key={t} className={s.previewItem} data-track={t}>
                  {r ? <Icon kind={r.kind} /> : <span className={s.dash}>—</span>}
                  <span>
                    <small>{t === 'free' ? '무료' : premium ? '프리미엄' : '프리미엄 (잠김)'}</small>
                    <b>{r ? `${r.name}${r.count > 1 ? ` ×${formatNumber(r.count)}` : ''}` : '보상 없음'}</b>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className={s.honest} data-part="honest">
          <div className={s.honestBody}>
            <h4>
              끝까지 남은 경험치 <b className={s.num} ref={T('need')} />
            </h4>
            <p ref={T('days')} />
            <div className={s.reach} aria-hidden>
              <i className={s.reachNow} />
              <i className={s.reachProj} />
            </div>
            <p className={s.verdict} ref={T('verdict')} />
            <p className={s.unclaimed} ref={T('unclaimed')} />
            <small className={s.est}>추정 — 하루 획득량 × 남은 일수 (보너스 · 미션 변동 제외)</small>
          </div>
          <div className={s.hype}>
            <b>⏰ 곧 끝납니다!</b>
            <span>지금 놓치면 영영 못 받아요 — 서두르세요!</span>
          </div>
        </div>
        <div className={s.actions}>
          <button
            className={s.claimAll}
            data-part="claimAll"
            data-pin={portrait ? 'top' : undefined}
            tabIndex={p.thumbnail || !juice ? -1 : 0}
            onClick={() => {
              human()
              // 결과 창이 떠 있으면 이 버튼도 '확인' 시도일 뿐 — 잠금이 판단한다 (갤러리 이벤트 버튼만 창을 강제로 닫는다)
              if (S.result) confirm(S.t * 1000)
              else claimAll('human')
              sync()
            }}
          >
            모두 받기 <b className={s.num} ref={T('claimN')} />
          </button>
          <button
            className={s.toNow}
            tabIndex={p.thumbnail ? -1 : 0}
            onClick={() => {
              human()
              openTrack()
              sync()
            }}
          >
            현재 레벨로
          </button>
          <p className={s.debug} ref={T('debug')} />
        </div>
      </section>
    </div>
  )
}

function Icon({ kind }: { kind: RewardKind }) {
  return (
    <svg className={s.icon} data-kind={kind} viewBox="0 0 24 24" aria-hidden>
      <path d={KIND_PATH[kind]} />
    </svg>
  )
}

/** 칸 뼈대 (= TierColumnView 프리팹). 복제해서 쓰고, 내용은 bindCol() 이 DOM 을 직접 고친다 */
function makeSkeleton(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = s.col
  const slot = (t: Track) =>
    `<div class="${s.slot}" data-slot="${t}" role="button">` +
    `<svg class="${s.icon}" viewBox="0 0 24 24" aria-hidden="true"><path data-f="icon"/></svg>` +
    `<span class="${s.rname}" data-f="name"></span><span class="${s.rcount} ${s.num}" data-f="count"></span>` +
    `<span class="${s.state}"><svg viewBox="0 0 24 24" aria-hidden="true"><path data-f="badge"/></svg><em data-f="text"></em></span></div>`
  el.innerHTML = `<div class="${s.lvl}"><b class="${s.num}" data-f="lvl"></b></div>${slot('free')}${slot('prem')}`
  return el
}

/* ───── 처음 상태 ───── */
function initSim(count: number, freeEvery: number, premium: boolean, W: number, vpW: number, juice: boolean): Sim {
  const pass = initialPass(count, freeEvery, premium)
  const first = claimables(pass)[0]
  const max = Math.max(0, count * W - vpW)
  return {
    t: 0,
    version: 0,
    pass,
    xpTarget: (pass.level - 1) * XP_PER_LEVEL + pass.xp,
    // 첫 화면: 효과를 켜면 지금 레벨로 스냅된 상태, 끄면 Lv 1 부터
    scroll: juice ? clamp((pass.level - 1) * W + W / 2 - vpW * 0.6, 0, max) : 0,
    vel: 0,
    anim: null,
    drag: null,
    recycler: createRecycler(true),
    map: new Map(),
    range: null,
    cells: [],
    frame: 0,
    focus: first ? { ...first } : { level: pass.level, track: 'free' },
    kbd: false,
    fx: new Map(),
    hlUntil: 0,
    pending: [],
    result: null,
    stat: { sent: 0, ignored: 0, blocked: 0, fast: -1 },
    wallet: startWallet(),
    ghosts: [],
    ghostId: 0,
    serverMs: SERVER_START,
    skewDays: 0,
    lastDay: false,
    mash: null,
    note: null,
    realT: -1e9,
    autoStep: 0,
    stateCell: '',
  }
}
