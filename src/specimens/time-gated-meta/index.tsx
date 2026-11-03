import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import {
  DAY, HOUR, KIND_PATH, MIN, REWARDS, SERVER_START,
  addEnergy, claimedToday, dayOf, energyAt, formatClock, formatDay, formatDur, formatHm, initialAttendance, missedBefore,
  nextReset, serverNow, settle, settleDay, slotState, spend, syncClock, untilEnough,
  type Attendance, type Energy, type EnergyView, type RewardKind, type Rule, type ServerClock,
} from './model'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** '앱 꺼짐' 화면을 보여 주는 시간(게임 시간 초) */
const OFF_SEC = 1.4
/** 앱 복귀 뒤 서버 시각을 다시 받는 데 걸리는 시간(모형) */
const SYNC_SEC = 0.5
const BONUS = 30
const START_RATIO = 0.62

/** server = 서버 시각 + 타임스탬프 계산(바른 방법) · device = 기기 시계 + 타임스탬프 · tick = 기기 시계 + 매초 증가(효과 끄기) */
type Mode = 'server' | 'device' | 'tick'

interface Sim {
  t: number
  version: number
  /** 실제 세계 시각 = 서버가 아는 진짜 시각 (ms) */
  world: number
  /** 단조 시계 — 앱이 켜져 있는 동안만 흐른다 (ms) */
  mono: number
  clock: ServerClock
  skewDays: number
  /** 화면이 쓰는 연료 기록 (모드의 시계 기준) */
  E: Energy
  /** 서버 기록 (늘 서버 시각 기준 — 아래 '서버 계산' 줄) */
  T: Energy
  /** 매초 증가 방식의 누적기 — 앱이 켜져 있는 동안만 쌓인다 */
  tickAcc: number
  att: Attendance
  lastDay: number
  off: { until: number; hours: number; before: number } | null
  resume: { hours: number; before: number } | null
  note: { text: string; bad: boolean; until: number } | null
  newDayUntil: number
  syncUntil: number
  deniedUntil: number
  realT: number
  autoStep: number
}

export default function TimeGatedMeta(p: SpecimenProps) {
  const juice = p.juice
  const energyMax = Math.round(num(p.params, 'energyMax', 60))
  const regenMinutes = num(p.params, 'regenMinutes', 6)
  const stageCost = Math.round(num(p.params, 'stageCost', 20))
  const offlineHours = num(p.params, 'offlineHours', 8)
  const resetHour = Math.round(num(p.params, 'resetHour', 5))
  const scale = Number(str(p.params, 'clockScale', '60')) || 60
  const rule = (str(p.params, 'attendanceRule', 'cumulative') === 'streak' ? 'streak' : 'cumulative') as Rule
  const clockSource = str(p.params, 'clockSource', 'server')
  const mode: Mode = !juice ? 'tick' : clockSource === 'device' ? 'device' : 'server'
  const interval = regenMinutes * MIN

  const cfg = { mode, max: energyMax, interval, cost: stageCost, resetHour, rule, scale, juice }
  const C = useRef(cfg)
  C.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(energyMax, interval, resetHour, rule)
  const S = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(S.version)
  const sync = () => {
    if (S.version !== shown.current) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const touch = () => void S.version++
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 3.6 }
    touch()
  }
  const lastNote = useRef<Sim['note']>(null)

  /* ───── 시계 ───── */
  const basisNow = () => (C.current.mode === 'server' ? serverNow(S.clock, S.mono) : S.world + S.skewDays * DAY)
  const synced = () => C.current.mode !== 'server' || S.clock.synced
  const shownEnergy = (): EnergyView => {
    const c = C.current
    if (c.mode !== 'tick') return energyAt(S.E, basisNow(), c.max, c.interval)
    const v = S.E.value
    if (v >= c.max) return { value: v, next: -1, full: 0, over: v > c.max }
    const next = c.interval - S.tickAcc
    return { value: v, next, full: next + (c.max - v - 1) * c.interval, over: false }
  }
  const truth = () => energyAt(S.T, S.world, C.current.max, C.current.interval)

  /** 날짜가 바뀌었으면 출석 규칙을 적용한다. 돌려주는 값: 새 날 · 연속 끊김 · 그대로 */
  const checkDay = (): 'new' | 'broke' | null => {
    const c = C.current
    const today = dayOf(basisNow(), c.resetHour)
    if (today === S.lastDay) return null
    const before = S.att
    S.att = settleDay(S.att, today, c.rule)
    const forward = today > S.lastDay
    S.lastDay = today
    touch()
    if (!forward) return null
    S.newDayUntil = S.t + 1.8
    return S.att.broke && S.att.broke !== before.broke ? 'broke' : 'new'
  }
  const dayNote = (kind: 'new' | 'broke' | null) => {
    const b = S.att.broke
    if (kind === 'broke' && b) note(`연속 출석 끊김 — ${formatDay(b.day, C.current.resetHour)} 를 놓쳐 ${b.lost}칸을 잃고 1일차부터`, true)
    else if (kind === 'new') note(`${two(C.current.resetHour)}:00 초기화 — 새 출석일, 오늘 칸이 열렸다`)
  }

  /* ───── 조절 값 · 효과 끄기 바뀜 ───── */
  const resetEnergy = () => {
    const c = C.current
    const v = Math.round(c.max * START_RATIO)
    const off = c.interval * 0.37
    S.T = { value: v, lastAt: S.world - off }
    S.E = { value: v, lastAt: basisNow() - off }
    S.tickAcc = off
  }
  const firstMax = useRef(energyMax)
  useEffect(() => {
    if (firstMax.current === energyMax) return
    firstMax.current = energyMax
    resetEnergy()
    note(`최대치 ${energyMax} — 연료를 시작 값(${Math.round(energyMax * START_RATIO)})으로`)
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energyMax])
  const firstRule = useRef(rule)
  useEffect(() => {
    if (firstRule.current === rule) return
    firstRule.current = rule
    S.att = initialAttendance(dayOf(basisNow(), resetHour), rule)
    note(rule === 'streak' ? '연속 출석 — 하루라도 비면 1일차부터 (시작 기록으로)' : '누적 출석 — 놓친 날이 있어도 다음 칸으로 (시작 기록으로)')
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule])
  const firstMode = useRef(mode)
  useEffect(() => {
    if (firstMode.current === mode) return
    firstMode.current = mode
    // 화면 기록을 서버 기록에서 다시 만든다 (모드마다 기준 시계가 다르다)
    const c = C.current
    const ts = settle(S.T, S.world, c.max, c.interval)
    S.T = ts
    S.E = { value: ts.value, lastAt: basisNow() - (S.world - ts.lastAt) }
    S.tickAcc = ts.value < c.max ? Math.min(c.interval - 1, S.world - ts.lastAt) : 0
    syncClock(S.clock, S.world, S.mono)
    S.resume = null
    S.lastDay = dayOf(basisNow(), resetHour)
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])
  useEffect(() => {
    S.tickAcc = Math.min(S.tickAcc, interval - 1)
  }, [interval, S])

  /* ───── 동작 ───── */
  const busy = () => !!S.off || !synced()

  const addFuel = (n: number) => {
    const c = C.current
    const before = shownEnergy().value
    let lost = 0
    if (c.mode === 'tick') {
      // 흔한 실수: 최대치에서 잘라 버린다 — 보상으로 받은 초과분이 사라진다
      const nv = Math.min(c.max, S.E.value + n)
      lost = S.E.value + n - nv
      S.E.value = nv
      if (nv >= c.max) S.tickAcc = 0
    } else S.E = addEnergy(S.E, n, basisNow(), c.max, c.interval)
    S.T = addEnergy(S.T, n, S.world, c.max, c.interval)
    const after = shownEnergy().value
    if (lost > 0) return { text: ` — 연료가 ${c.max} 에서 잘려 ${lost} 사라졌다`, bad: true }
    if (after > c.max) return { text: ` — 연료 ${before} → ${after} / ${c.max}: 초과분은 남기고 그동안 회복은 멈춘다`, bad: false }
    return { text: ` — 연료 ${before} → ${after}`, bad: false }
  }

  const claim = () => {
    const c = C.current
    if (busy()) return note('동기화 중 — 서버 시각을 받기 전에는 받지 않는다')
    dayNote(checkDay())
    const now = basisNow()
    const today = dayOf(now, c.resetHour)
    if (claimedToday(S.att, today)) {
      note(`오늘 보급은 받았다 — 다음은 ${formatDur(nextReset(now, c.resetHour) - now)} 뒤 ${two(c.resetHour)}:00`)
      return
    }
    const k = S.att.claimed.length
    const r = REWARDS[k]
    S.att = { claimed: [...S.att.claimed, today], broke: null }
    const fuel = r.kind === 'fuel' ? addFuel(r.count) : null
    const serverDay = dayOf(S.world, c.resetHour)
    if (c.mode !== 'server' && today > serverDay)
      note(
        `기기 시계 +${S.skewDays}일 — ${S.att.claimed.includes(serverDay) ? '오늘 받았는데 출석이 다시 열려 또 받았다' : `${formatDay(today, c.resetHour)} 몫을 미리 받았다`}. 서버 날짜는 아직 ${formatDay(serverDay, c.resetHour)}`,
        true,
      )
    else note(`${k + 1}일차 보급: ${r.name} ×${r.count}${r.detail ? ` (${r.detail})` : ''}${fuel ? fuel.text : ''}`, !!fuel?.bad)
    touch()
  }

  const depart = () => {
    const c = C.current
    if (busy()) return note('동기화 중 — 서버 시각을 받기 전에는 출발하지 않는다')
    const ev = shownEnergy()
    if (ev.value < c.cost) {
      S.deniedUntil = S.t + 0.5
      if (c.juice) note(`연료 부족 — ${c.cost} 필요, 지금 ${ev.value}. ${formatDur(untilEnough(ev, c.cost, c.interval))} 뒤 출발할 수 있다`)
      else note('"연료가 부족합니다" — 얼마나 기다려야 하는지 알려 주지 않는다', true)
      touch()
      return
    }
    if (c.mode === 'tick') {
      if (S.E.value >= c.max) S.tickAcc = 0
      S.E.value -= c.cost
    } else S.E = spend(S.E, c.cost, basisNow(), c.max, c.interval) ?? S.E
    const ts = settle(S.T, S.world, c.max, c.interval)
    S.T = { value: Math.max(0, ts.value - c.cost), lastAt: ts.value >= c.max ? S.world : ts.lastAt }
    const restart = ev.value >= c.max && ev.value - c.cost < c.max
    if (ts.value < c.cost) note(`탐사 출발 — 화면은 연료 ${ev.value}, 서버 계산은 ${ts.value}. 실제 게임이면 서버가 거절한다`, true)
    else note(`탐사 출발: 북쪽 통신탑 — 연료 ${ev.value} → ${ev.value - c.cost}${restart ? ' · 최대치 아래로 내려가 지금부터 회복 시작' : ''}`)
    touch()
  }

  const goOffline = (hours: number) => {
    if (S.off) return
    S.off = { until: S.t + OFF_SEC, hours, before: shownEnergy().value }
    touch()
  }
  /** 앱 복귀 (OnApplicationPause(false)) — 서버 시각을 다시 받고, 마지막 기록 + 경과로 다시 계산한다 */
  const wake = () => {
    const o = S.off!
    S.off = null
    S.world += o.hours * HOUR
    // 단조 시계는 앱이 꺼진 동안 흐르지 않았다(또는 플랫폼마다 다르다) → 서버 시각을 다시 받을 때까지 '동기화 중'
    if (C.current.mode === 'server') {
      S.clock.synced = false
      S.resume = { hours: o.hours, before: o.before }
      S.syncUntil = S.t + SYNC_SEC
    } else finishWake(o.hours, o.before)
    touch()
  }
  const finishWake = (hours: number, before: number) => {
    const c = C.current
    const kind = checkDay()
    const tv = truth()
    if (c.mode === 'tick') {
      S.tickAcc = 0
      note(`앱 다시 켬 (+${hours}시간) — 연료 ${S.E.value} 그대로, 타이머도 처음부터. 꺼진 동안 센 사람이 없다 (서버 계산 ${tv.value})`, true)
      return
    }
    const ev = shownEnergy()
    const day = kind === 'broke' ? ' · 연속 출석 끊김' : kind === 'new' ? ' · 새 출석일' : ''
    note(`앱 다시 켬 (+${hours}시간) — ${c.mode === 'server' ? '서버 시각을 다시 받아 ' : ''}계산: 연료 ${before} → ${ev.value}${ev.value > c.max ? ' (초과라 그동안 회복 정지)' : ev.value === c.max ? ' (가득)' : ''}${day}`, kind === 'broke')
  }

  const deviceClock = (back = false) => {
    const c = C.current
    const before = shownEnergy().value
    S.skewDays = back ? 0 : (S.skewDays + 1) % 4
    const kind = checkDay()
    const after = shownEnergy().value
    if (!S.skewDays) note('기기 시계를 원래대로 되돌렸다')
    else if (c.mode === 'server') note(`기기 시계 +${S.skewDays}일 — 서버 시각 기준이라 출석 · 연료 모두 그대로`)
    else
      note(
        `기기 시계 +${S.skewDays}일 — ${kind ? '출석이 다시 열렸다' : '날짜가 바뀌었다'}${after > before ? ` · 연료도 ${before} → ${after} 한 번에 찼다` : ''}`,
        true,
      )
  }

  const human = () => void (S.realT = S.t)
  const handle = (id: string) => {
    if (id === 'claim') claim()
    else if (id === 'depart') depart()
    else if (id === 'offline') goOffline(offlineHours)
    else if (id === 'miss-day') goOffline(48)
    else if (id === 'device-clock') deviceClock()
    else if (id === 'clock-back') deviceClock(true)
    else if (id === 'bonus') {
      const r = addFuel(BONUS)
      note(`보급 보상 +${BONUS}${r.text}`, r.bad)
    }
  }
  const act = (id: string) => {
    human()
    handle(id)
    sync()
  }
  useTrigger(p.trigger, act)

  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    3.2,
    () => {
      if (S.t - S.realT < MANUAL_PAUSE || busy()) return
      const seq = ['claim', 'depart', 'offline', 'depart', 'bonus', 'device-clock', 'claim', 'clock-back', 'depart', 'miss-day', 'claim', 'depart']
      handle(seq[S.autoStep++ % seq.length])
      sync()
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = C.current
    if (S.off) {
      if (S.t >= S.off.until) wake()
    } else {
      // 모형: 이 웹 재현의 시계는 갤러리 정지 · 배속을 따르고 '시간 배속' 만큼 빨리 흐른다
      const ms = dt * 1000 * c.scale
      S.world += ms
      S.mono += ms
      if (c.mode === 'tick') {
        // 흔한 실수: 켜져 있는 동안 흐른 시간만 센다 (매초 +1 과 같은 방식)
        if (S.E.value < c.max) {
          S.tickAcc += ms
          while (S.tickAcc >= c.interval && S.E.value < c.max) {
            S.tickAcc -= c.interval
            S.E.value++
          }
          if (S.E.value >= c.max) S.tickAcc = 0
        } else S.tickAcc = 0
      }
      if (S.resume && S.t >= S.syncUntil) {
        syncClock(S.clock, S.world, S.mono)
        const r = S.resume
        S.resume = null
        finishWake(r.hours, r.before)
      } else if (synced()) dayNote(checkDay())
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    paint()
    sync()
  })

  /* ───── 그리기 (매 프레임 바뀌는 글자 · 막대만 직접) ───── */
  const rootRef = useRef<HTMLDivElement>(null)
  const txt = useRef<Record<string, HTMLElement | null>>({})
  const T = (k: string) => (el: HTMLElement | null) => void (txt.current[k] = el)
  const setText = (k: string, v: string) => {
    const el = txt.current[k]
    if (el && el.textContent !== v) el.textContent = v
  }
  const fillRef = useRef<HTMLElement>(null)
  const enterRef = useRef<HTMLButtonElement>(null)

  const paint = () => {
    const c = C.current
    const root = rootRef.current
    if (!root) return
    const ok = synced() && !S.off
    const now = basisNow()
    setText('server', formatClock(S.world))
    setText('device', formatClock(S.world + S.skewDays * DAY) + (S.skewDays ? ` (+${S.skewDays}일 바꿈)` : ''))
    const left = nextReset(now, c.resetHour) - now
    setText('reset', ok ? formatDur(left) : '동기화 중')
    setText('claimLeft', ok ? formatDur(left) : '—')

    const ev = shownEnergy()
    const st = ev.over ? 'over' : ev.value >= c.max ? 'full' : 'regen'
    if (root.dataset.energy !== st) root.dataset.energy = st
    setText('value', ok ? String(ev.value) : '—')
    setText('overN', ev.over ? `+${ev.value - c.max}` : '')
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, ev.value / c.max)})`
    setText('next', !ok ? '동기화 중' : st === 'regen' ? formatDur(ev.next) : st === 'over' ? '정지' : '가득')
    setText('full', !ok ? '동기화 중' : st === 'regen' ? formatDur(ev.full) : '—')
    setText(
      'notify',
      st !== 'regen' ? '예약 없음 (가득 참)' : c.mode === 'tick' ? '없음' : `${formatHm(now + ev.full)} 에 "탐사 연료 가득"`,
    )
    // 저장된 기록 → 지금 값 (계산 과정을 그대로 보인다)
    if (!ok) {
      setText('f1', '저장된 기록 — 서버 시각을 받는 중')
      setText('f2', '')
    } else if (c.mode === 'tick') {
      setText('f1', `저장: 값 ${S.E.value} · 타이머 ${formatDur(c.interval - S.tickAcc)} 남음`)
      setText('f2', '켜져 있는 동안만 준다 — 꺼진 시간은 기록에 없다')
    } else if (S.E.value >= c.max) {
      setText('f1', `저장: 값 ${S.E.value} (최대치 이상)`)
      setText('f2', `지금 = ${S.E.value} — 최대치 이상이면 회복 시계를 쓰지 않는다`)
    } else {
      const el = Math.max(0, now - S.E.lastAt)
      const raw = S.E.value + Math.floor(el / c.interval)
      setText('f1', `저장: 값 ${S.E.value} · 마지막 회복 ${formatClock(S.E.lastAt).slice(6)}`)
      setText('f2', `지금 = ${S.E.value} + ⌊경과 ${formatDur(el)} ÷ ${c.interval / MIN}분⌋ = ${ev.value}${raw > c.max ? ` (최대 ${c.max})` : ''}`)
    }
    const lack = ok && ev.value < c.cost
    const wait = lack ? untilEnough(ev, c.cost, c.interval) : 0
    root.toggleAttribute('data-lack', lack)
    root.toggleAttribute('data-denied', S.t < S.deniedUntil)
    root.toggleAttribute('data-newday', S.t < S.newDayUntil)
    root.toggleAttribute('data-sync', !synced())
    if (enterRef.current) enterRef.current.setAttribute('aria-disabled', String(c.juice && lack))
    setText('enter', c.juice && lack ? `연료 부족 · ${c.cost}까지 ${formatDur(wait)}` : `탐사 출발  −${c.cost}`)

    // 서버 계산 줄: 서버가 같은 규칙으로 계산한 값. 화면과 다르면 표시한다
    const tv = truth()
    const sday = dayOf(S.world, c.resetHour)
    const sClaimed = S.att.claimed.includes(sday)
    setText('truth', `연료 ${tv.value} · 서버 날짜 ${formatDay(sday, c.resetHour)} ${sClaimed ? '출석 받음' : '출석 전'}`)
    const mismatch = ok && (tv.value !== ev.value || dayOf(now, c.resetHour) !== sday)
    root.toggleAttribute('data-mismatch', mismatch)
  }
  useLayoutEffect(() => paint())

  /* ───── 렌더 ───── */
  if (S.note) lastNote.current = S.note
  const shownNote = S.note ?? lastNote.current
  const nowB = basisNow()
  const today = dayOf(nowB, resetHour)
  const done = claimedToday(S.att, today)
  const n = S.att.claimed.length
  const ticks = energyMax <= 20 ? energyMax : Math.floor(energyMax / 10)
  const modeText = mode === 'server' ? '서버 시각 기준' : mode === 'device' ? '⚠ 기기 시계 기준' : '⚠ 기기 시계 · 켜진 동안만 셈'
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (e.key !== 'Enter' || (e.target as Element).closest('button')) return
    if (!e.repeat) act('claim')
    return true
  })

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-mode={mode}
      data-rule={rule}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="출석 캘린더와 탐사 연료 (Enter: 오늘 보급 받기)"
      onKeyDown={onKeyDown}
    >
      <header className={s.top}>
        <div className={s.title}>
          <small>궤도 정비 기지 · 보급 센터</small>
          <b>출석 보급 · 탐사 연료</b>
        </div>
        <div className={s.clocks}>
          <span className={s.clockRow}>
            <em>서버</em>
            <b className={s.num} ref={T('server')} />
            <small>UTC+9</small>
          </span>
          <span className={s.clockRow} data-skew={S.skewDays > 0 || undefined}>
            <em>기기</em>
            <b className={s.num} ref={T('device')} />
          </span>
        </div>
        <span className={s.modeBadge}>{modeText}</span>
      </header>

      <section className={s.cal}>
        <div className={s.calHead}>
          <h3>7일 출석 보급</h3>
          <span className={s.rule} data-part="rule">
            {rule === 'streak' ? (
              <>
                <b>연속 출석</b> 하루라도 놓치면 1일차부터
              </>
            ) : (
              <>
                <b>누적 출석</b> 놓친 날이 있어도 다음 칸으로
              </>
            )}
          </span>
        </div>
        <div className={s.row2}>
          <div className={s.resetRow} data-part="reset">
          <svg className={s.icon} viewBox="0 0 24 24" aria-hidden>
            <path d="M12 3a9 9 0 1 0 9 9 M12 7v5l3 2 M17 3h4v4" />
          </svg>
          <span className={s.resetLabel}>
            다음 초기화 <small>매일 {two(resetHour)}:00 · 서버 시각</small>
          </span>
          <b className={s.num} ref={T('reset')} />
          </div>
          {S.att.broke && (
            <div className={s.broke}>
              연속 끊김 — {formatDay(S.att.broke.day, resetHour)} 를 놓쳐 {S.att.broke.lost}칸을 잃었다 · 1일차부터 다시
            </div>
          )}
        </div>
        <div className={s.grid}>
          {REWARDS.map((r, k) => {
            const st = slotState(S.att, k, today)
            const missed = rule === 'cumulative' ? missedBefore(S.att, k, today) : 0
            const ahead = k - n + (done ? 1 : 0)
            const tag = st === 'claimed' ? '받음' : st === 'today' ? '오늘' : st === 'next' ? '내일' : `+${ahead}일`
            return (
              <div
                key={k}
                className={s.slot}
                data-state={st}
                data-big={k === 6 || undefined}
                data-missed={missed > 0 || undefined}
                data-part={k === n ? 'today' : undefined}
                aria-label={`${k + 1}일차 ${r.name} ${r.count}개 — ${tag}`}
              >
                <span className={s.day}>{k + 1}일차</span>
                <span className={s.tag}>{tag}</span>
                <Icon kind={r.kind} />
                <span className={s.rname}>{r.name}</span>
                <b className={`${s.rcount} ${s.num}`}>{r.detail ?? `×${r.count.toLocaleString('ko-KR')}`}</b>
                {st === 'claimed' && (
                  <span className={s.stamp}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    <small>{formatDay(S.att.claimed[k], resetHour)}</small>
                  </span>
                )}
                {missed > 0 && <span className={s.missed}>✕ 놓친 날 {missed}</span>}
              </div>
            )
          })}
        </div>
        <button
          className={s.claimBtn}
          data-done={done || undefined}
          tabIndex={p.thumbnail ? -1 : 0}
          aria-disabled={done}
          onClick={() => act('claim')}
        >
          {done ? (
            <>
              받음 · 다음 보급까지 <b className={s.num} ref={T('claimLeft')} />
            </>
          ) : (
            <>
              {n + 1}일차 보급 받기 <kbd>Enter</kbd>
            </>
          )}
        </button>
      </section>

      <section className={s.fuel}>
        <div className={s.fuelHead}>
          <svg className={s.icon} viewBox="0 0 24 24" aria-hidden>
            <path d={KIND_PATH.fuel} />
          </svg>
          <h3>탐사 연료</h3>
          <small>
            {regenMinutes}분마다 +1 · 최대 {energyMax}
          </small>
        </div>
        <div className={s.meter}>
          <b className={s.num} ref={T('value')} />
          <span className={s.num}>/ {energyMax}</span>
          <em className={s.overTag}>
            초과 <span ref={T('overN')} />
          </em>
        </div>
        <div className={s.bar}>
          <i ref={fillRef} />
          {Array.from({ length: Math.max(0, ticks - 1) }, (_, i) => (
            <u key={i} style={{ left: `${((i + 1) / ticks) * 100}%` }} />
          ))}
        </div>
        <div className={s.timers}>
          <div>
            <span>다음 +1 까지</span>
            <b className={s.num} ref={T('next')} />
          </div>
          <div>
            <span>가득 찰 때까지</span>
            <b className={s.num} ref={T('full')} />
          </div>
        </div>
        <p className={s.formula} data-part="energy">
          <b ref={T('f1')} />
          <b ref={T('f2')} />
        </p>
        <p className={s.overMsg}>
          최대치 초과 · 회복 정지 — {energyMax} 아래로 내려가면 다시 회복
        </p>
        <p className={s.notify}>
          가득 참 알림 <b ref={T('notify')} />
        </p>
        <div className={s.mission}>
          <div className={s.missionText}>
            <b>북쪽 통신탑 복구</b>
            <small>지표 탐사 · 연료 {stageCost}</small>
          </div>
          <button ref={enterRef} className={s.enterBtn} data-part="enter" tabIndex={p.thumbnail ? -1 : 0} onClick={() => act('depart')}>
            <span ref={T('enter')} />
          </button>
        </div>
      </section>

      <div className={s.note} data-show={!!S.note || undefined} data-bad={shownNote?.bad || undefined}>
        {shownNote?.text}
      </div>

      <footer className={s.tools}>
        <span className={s.toolsLabel}>시험 도구</span>
        <button tabIndex={p.thumbnail ? -1 : 0} onClick={() => act('offline')}>
          앱 끄고 {offlineHours}시간 뒤 켜기
        </button>
        <button tabIndex={p.thumbnail ? -1 : 0} onClick={() => act('device-clock')}>
          기기 시계 +1일{S.skewDays ? ` (지금 +${S.skewDays})` : ''}
        </button>
        <button tabIndex={p.thumbnail ? -1 : 0} onClick={() => act('bonus')}>
          보급 +{BONUS}
        </button>
        <span className={s.speed}>
          시간 ×{scale} <small>{scale === 1 ? '실제 시간' : scale === 60 ? '1초 = 1분' : '1초 = 10분'}</small>
        </span>
        <span className={s.truth}>
          <em>서버 계산</em> <span ref={T('truth')} />
          <i className={s.mis}>화면과 다름</i>
        </span>
      </footer>

      <div className={s.off} data-open={!!S.off || undefined} aria-hidden={!S.off}>
        <svg viewBox="-20 -20 40 40" aria-hidden>
          <circle r="16" />
          <path className={s.hand} d="M0 0V-11" />
          <path d="M0 0H7" />
        </svg>
        <b>앱 꺼짐</b>
        <span>{S.off ? (S.off.hours >= 48 ? '이틀 뒤 다시 켬' : `${S.off.hours}시간 뒤 다시 켬`) : ''}</span>
      </div>
    </div>
  )
}

const two = (n: number) => String(n).padStart(2, '0')

function Icon({ kind }: { kind: RewardKind }) {
  return (
    <svg className={s.icon} data-kind={kind} viewBox="0 0 24 24" aria-hidden>
      <path d={KIND_PATH[kind]} />
    </svg>
  )
}

function initSim(max: number, interval: number, resetHour: number, rule: Rule): Sim {
  const v = Math.round(max * START_RATIO)
  const off = interval * 0.37
  const today = dayOf(SERVER_START, resetHour)
  return {
    t: 0,
    version: 0,
    world: SERVER_START,
    mono: 0,
    clock: { syncedServer: SERVER_START, syncedMono: 0, synced: true },
    skewDays: 0,
    E: { value: v, lastAt: SERVER_START - off },
    T: { value: v, lastAt: SERVER_START - off },
    tickAcc: off,
    att: initialAttendance(today, rule),
    lastDay: today,
    off: null,
    resume: null,
    note: null,
    newDayUntil: 0,
    syncUntil: 0,
    deniedUntil: 0,
    realT: -1e9,
    autoStep: 0,
  }
}
