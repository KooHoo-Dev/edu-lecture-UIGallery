import { useEffect, useLayoutEffect, useReducer, useRef, type CSSProperties } from 'react'
import { createCountUp, easeOutBack, easeOutCubic, formatNumber, type CountUp } from '../../core/countup'
import { clamp, useGameLoop, useTrigger } from '../../core/hooks'
import { ActionGlyph, useLastInputDevice } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { Silhouette } from '../../core/silhouettes'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import {
  BANNER_IN,
  buildSteps,
  CARD_IN,
  CLOSE_OUT,
  DIM_IN,
  EASINGS,
  easeInQuad,
  easeOutExpo,
  INPUT_LOCK,
  leveledMembers,
  levelAfter,
  MEMBERS,
  mustWait,
  PANEL_IN,
  PULSE,
  ROW_IN,
  RUNS,
  STAMP_IN,
  STEP_LABEL,
  stepDuration,
  sum,
  TILE_IN,
  type Run,
  type RunId,
  type SkipBehavior,
  type StepKind,
  type TallyMode,
} from './data'
import { ItemIcon, RankShape } from './Icons'
import s from './style.module.css'

export { meta } from './meta'

/** 자동 데모 순환: 레벨업 → 일반 → 큰 보상 */
const CYCLE: RunId[] = ['levelup', 'normal', 'big']
/** 나쁜 예: '프레임마다 18씩' 올리는 단위당 속도 카운트업 (60fps 기준 초당 1,080) */
const BAD_RATE = 1080
/** 전투 중 연타: 승리 직후 0.07초 간격 4회 */
const MASH = [0, 0.07, 0.14, 0.21]

type Tone = 'ok' | 'muted' | 'bad'
interface Eng {
  run: Run
  steps: StepKind[]
  si: number
  t: number
  /** 단계 완료 뒤 자동 진행까지 기다린 시간 */
  hold: number
  /** 진입 직후 입력 잠금 남은 시간 */
  lock: number
  closing: number
  closed: boolean
  idle: number
  rows: CountUp[]
  started: number
  landed: number
  total: CountUp
  pulse: number
  /** 현재 단계의 끝 상태(목표값)를 이미 확정했는가 */
  fin: boolean
  expCU: CountUp
  presses: number[]
  pressClock: number
  ignored: number
  fb: { seq: number; text: string; tone: Tone }
  wait: number
  cycle: number
  skipDemo: boolean
  badT: number
  sig: string
}

const zero = () => createCountUp(0, 0, 1)
const isPage = (k: StepKind) => k === 'exp' || k === 'credit' || k === 'ledger'

function makeEng(): Eng {
  return {
    run: RUNS.levelup,
    steps: ['banner'],
    si: 0,
    t: 0,
    hold: 0,
    lock: INPUT_LOCK,
    closing: -1,
    closed: false,
    idle: 0,
    rows: [],
    started: 0,
    landed: 0,
    total: zero(),
    pulse: 0,
    fin: false,
    expCU: zero(),
    presses: [],
    pressClock: 0,
    ignored: 0,
    fb: { seq: 0, text: '', tone: 'ok' },
    wait: 0,
    cycle: 0,
    skipDemo: false,
    badT: 0,
    sig: '',
  }
}

/**
 * 결과·보상 정산 화면 — 단계(배너 → 정산 → 레벨 업 → 물자 → 등급 → 완료)를 하나씩 보여 주고,
 * 입력 한 번은 한 단계만 소비한다(현재 단계 즉시 완료 → 다음 입력에 다음 단계).
 * 매 프레임 바뀌는 값(숫자·바·등장 모션)은 ref 로 DOM 을 직접 갱신하고, 단계가 바뀔 때만 다시 렌더한다.
 */
export default function ResultsReward(p: SpecimenProps) {
  const mode = str(p.params, 'tallyMode', 'category-pages') as TallyMode
  const countupMs = num(p.params, 'countupMs', 900)
  const staggerMs = num(p.params, 'staggerMs', 250)
  const easingKey = str(p.params, 'countEasing', 'easeOutExpo')
  const skip = str(p.params, 'skipBehavior', 'finish-step') as SkipBehavior
  const spotlight = bool(p.params, 'levelupSpotlight', true)
  const rankOn = bool(p.params, 'rankStamp', false)
  const autoMs = num(p.params, 'autoAdvanceMs', 1000)
  const skewDeg = num(p.params, 'skewDeg', 6)
  const accent = str(p.params, 'accentColor', '#ffb547')
  const juice = p.juice
  const portrait = p.aspect === '9:16'

  const cfg = useRef({ S: 0, C: 0, ease: easeOutExpo, mode, skip, spotlight, rankOn, autoMs, juice })
  cfg.current = { S: staggerMs / 1000, C: countupMs / 1000, ease: EASINGS[easingKey] ?? easeOutExpo, mode, skip, spotlight, rankOn, autoMs, juice }

  const eng = useRef<Eng>(null as unknown as Eng)
  if (!eng.current) eng.current = makeEng()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const rootRef = useRef<HTMLDivElement>(null)

  /* ───────── 엔진 ───────── */
  const kind = () => eng.current.steps[eng.current.si]
  const dur = (k: StepKind) => stepDuration(k, eng.current.run, cfg.current.S, cfg.current.C)
  const linesOf = (k: StepKind) => (k === 'exp' ? eng.current.run.expLines : eng.current.run.creditLines)

  const fb = (text: string, tone: Tone = 'ok') => {
    const e = eng.current
    e.fb = { seq: e.fb.seq + 1, text, tone }
    force()
  }

  const enterStep = () => {
    const e = eng.current
    const c = cfg.current
    const k = kind()
    if (isPage(k)) {
      const lines = linesOf(k)
      e.rows = lines.map(l => createCountUp(0, l.value, c.C * 1000, c.ease))
      e.started = 0
      e.landed = 0
      e.total = zero()
      e.pulse = 0
      if (k === 'ledger') e.expCU = createCountUp(0, sum(e.run.expLines), ((lines.length - 1) * c.S + c.C) * 1000, c.ease)
    }
  }

  /** 현재 단계를 끝 상태로 확정 — 코루틴을 멈추는 게 아니라 '최종 값 대입' */
  const finishStep = () => {
    const e = eng.current
    const k = kind()
    e.t = dur(k)
    e.fin = true
    if (isPage(k)) {
      e.rows.forEach(r => r.skip())
      e.started = e.rows.length
      e.landed = e.rows.length
      const tot = sum(linesOf(k))
      e.total = createCountUp(tot, tot, 1)
      e.total.skip()
      e.pulse = 0
      if (k === 'ledger') e.expCU.skip()
    }
  }

  const advance = () => {
    const e = eng.current
    finishStep()
    if (e.si >= e.steps.length - 1) return
    e.si++
    e.t = 0
    e.fin = false
    e.hold = 0
    e.wait = 0
    enterStep()
    force()
  }

  const start = (id: RunId) => {
    const e = eng.current
    const c = cfg.current
    const fresh = makeEng()
    Object.assign(e, fresh, { cycle: e.cycle, fb: e.fb, run: RUNS[id], steps: buildSteps(RUNS[id], c.mode, c.spotlight, c.rankOn) })
    enterStep()
    force()
  }

  /** 썸네일·정지 화면용: 크레딧(또는 원장) 정산이 끝난 순간 */
  const snapshot = () => {
    start('levelup')
    const e = eng.current
    e.lock = 0
    while (kind() !== 'credit' && kind() !== 'ledger' && kind() !== 'complete') advance()
    finishStep()
    e.badT = 99
    force()
  }

  const nextRun = () => {
    const e = eng.current
    e.cycle = (e.cycle + 1) % CYCLE.length
    return CYCLE[e.cycle]
  }

  const badTarget = () => Math.max(sum(eng.current.run.expLines), sum(eng.current.run.creditLines))

  /** 확인 입력 하나 = 한 단계 (입력 소비) */
  const press = (src: 'user' | 'auto' | 'mash') => {
    const e = eng.current
    const c = cfg.current
    if (e.closed) {
      if (src !== 'mash') start(nextRun())
      return
    }
    if (!c.juice) {
      // 나쁜 예: 잠금 없음 + 한 입력이 '숫자 완성'과 '닫기'를 함께 처리(관통)
      const counting = BAD_RATE * e.badT < badTarget()
      e.closed = true
      if (src === 'mash') fb('전투 중 연타가 그대로 들어가 결과 화면이 0.1초 만에 닫힘 — 입력 잠금 없음', 'bad')
      else if (counting) fb('입력 1회가 숫자 완성과 닫기를 함께 처리 — 결과를 못 보고 닫힘 (관통)', 'bad')
      else fb('확인 → 닫힘', 'muted')
      return
    }
    if (e.closing >= 0) return
    if (e.lock > 0) {
      e.ignored++
      fb(`입력 무시 ×${e.ignored} · 진입 잠금 ${INPUT_LOCK}초`, 'muted')
      return
    }
    const k = kind()
    const done = e.t >= dur(k)
    const next = e.steps[e.si + 1]
    if (k === 'complete') {
      fb('입력 → 결과 화면 닫기')
      e.closing = 0
      force()
      return
    }
    if (c.skip === 'disabled') {
      if (!done) return fb('입력 무시 · 연출이 끝나야 넘길 수 있음', 'muted')
      fb(`입력 → 다음 단계 ‘${STEP_LABEL[next]}’`)
      advance()
      return
    }
    if (c.skip === 'skip-all' && k !== 'levelup') {
      // 한 번에 끝까지 — 단, 레벨 업 카드는 입력을 받아야 넘어가는 '결과'로 남긴다
      while (kind() !== 'levelup' && kind() !== 'complete') advance()
      finishStep()
      fb(kind() === 'levelup' ? '입력 → 모두 건너뛰기 · 레벨 업은 남김' : '입력 → 모두 건너뛰기 · 최종 값 확정')
      return
    }
    if (!done) {
      finishStep()
      fb(`입력 → ‘${STEP_LABEL[k]}’ 단계 즉시 완료`)
    } else {
      fb(`입력 → 다음 단계 ‘${STEP_LABEL[next]}’`)
      advance()
    }
  }

  const tickGood = (dt: number) => {
    const e = eng.current
    const c = cfg.current
    if (e.closing >= 0) {
      e.closing += dt
      if (e.closing >= CLOSE_OUT) {
        e.closing = -1
        e.closed = true
        force()
      }
      return
    }
    if (e.closed) return
    e.lock = Math.max(0, e.lock - dt)
    const k = kind()
    const d = dur(k)
    if (e.t < d) {
      e.t = Math.min(d, e.t + dt)
      if (isPage(k)) {
        const lines = linesOf(k)
        // 행 i 는 i × 간격에 등장하고, 등장하는 순간 합계가 새 누적값을 향해 다시 올라가기 시작한다
        while (e.started < lines.length && e.t >= e.started * c.S) {
          const cum = sum(lines.slice(0, e.started + 1))
          e.total = createCountUp(e.total.value, cum, c.C * 1000, c.ease)
          e.started++
        }
        for (let i = 0; i < e.started; i++) e.rows[i].step(dt)
        e.total.step(dt)
        while (e.landed < e.started && e.rows[e.landed].done) {
          e.landed++
          e.pulse = PULSE
        }
        if (k === 'ledger') e.expCU.step(dt)
      }
    }
    // 단계가 끝나면 '항상' 목표값을 확정한다. 정산 도중 카운트업 시간·간격을 줄이면 단계 길이(d)가
    // 행·합계 CountUp(진입 때의 길이로 만든 것)보다 먼저 끝날 수 있다 — 그래도 값은 정확히 남는다
    if (e.t >= d) {
      if (!e.fin) finishStep()
      else if (k === 'banner') advance()
      else if (!mustWait(k) && c.autoMs > 0) {
        e.hold += dt
        if (e.hold >= c.autoMs / 1000) advance()
      }
    }
    e.pulse = Math.max(0, e.pulse - dt)
  }

  const tickBad = (dt: number) => {
    const e = eng.current
    if (!e.closed) e.badT += dt
  }

  useGameLoop(p.playing, p.timeScale, dt => {
    const e = eng.current
    const c = cfg.current
    // 예약된 연타 입력
    if (e.presses.length) {
      e.pressClock += dt
      while (e.presses.length && e.presses[0] <= e.pressClock) {
        e.presses.shift()
        press('mash')
      }
    }
    if (c.juice) tickGood(dt)
    else tickBad(dt)

    // 자동 데모: 입력을 기다리는 화면이면 잠시 뒤 '가상 입력', 닫혀 있으면 다음 전투
    if (p.autoplay) {
      if (e.closed) {
        e.idle += dt
        if (e.idle >= 1.4) start(nextRun())
      } else if (e.closing < 0) {
        const k = kind()
        const done = e.t >= dur(k)
        const waiting = c.juice ? done && (mustWait(k) || (c.autoMs === 0 && k !== 'banner')) : BAD_RATE * e.badT >= badTarget()
        if (waiting) {
          e.wait += dt
          if (e.wait >= 1.8) {
            e.wait = 0
            press('auto')
          }
        } else e.wait = 0
        // 큰 보상에서는 한 번 스킵해 '현재 단계만 즉시 완료'를 보여 준다
        if (c.juice && e.run.id === 'big' && !e.skipDemo && (k === 'exp' || k === 'ledger') && e.t >= 0.5 && c.skip === 'finish-step') {
          e.skipDemo = true
          press('auto')
        }
      }
    }

    // 표시 문구가 바뀌는 순간(완료·잠금 해제·자동 진행 대기)에만 다시 렌더
    const k = kind()
    const sig = `${e.si}|${e.t >= dur(k)}|${e.lock > 0}|${e.closed}|${!c.juice && BAD_RATE * e.badT >= badTarget()}`
    if (sig !== e.sig) {
      e.sig = sig
      force()
    }
    paint()
  })

  /* ───────── 이벤트 ───────── */
  useTrigger(p.trigger, id => {
    const e = eng.current
    e.wait = 0
    e.idle = 0
    if (id === 'victory-normal') {
      e.cycle = 1
      start('normal')
    } else if (id === 'victory-levelup') {
      e.cycle = 0
      start('levelup')
    } else if (id === 'victory-big') {
      e.cycle = 2
      start('big')
    } else if (id === 'confirm') press('user')
    else if (id === 'mash') {
      e.cycle = 0
      start('levelup')
      eng.current.presses = [...MASH]
    }
  })

  // 첫 화면: 썸네일은 정산이 끝난 정지 화면, 그 밖에는 배너가 자리 잡은 직후(경험치 정산 시작)부터.
  // 배너 등장 연출은 이벤트(1~3)·자동 데모에서 매번 처음부터 재생된다
  useLayoutEffect(() => {
    if (p.thumbnail) snapshot()
    else {
      start('levelup')
      advance()
      eng.current.lock = 0 // 전투에서 넘어온 게 아니므로 진입 잠금 없음
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 단계 구성이 바뀌는 값이 바뀌면 같은 전투를 처음부터
  const firstSync = useRef(true)
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false
      return
    }
    if (p.thumbnail) snapshot()
    else start(eng.current.run.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juice, mode, spotlight, rankOn, p.aspect])

  /* ───────── 매 프레임 그리기 (DOM 직접 갱신) ───────── */
  const setText = (el: Element | null, text: string) => {
    if (el && el.textContent !== text) el.textContent = text
  }
  const paint = () => {
    const root = rootRef.current
    if (!root) return
    const e = eng.current
    const c = cfg.current
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)
    const qa = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel))

    if (!c.juice) {
      const v = Math.min(BAD_RATE * e.badT, 1e9)
      setText(q('[data-badval="exp"]'), formatNumber(Math.min(sum(e.run.expLines), v)))
      setText(q('[data-badval="credit"]'), formatNumber(Math.min(sum(e.run.creditLines), v)))
      return
    }

    const k = kind()
    const idx = (x: StepKind) => e.steps.indexOf(x)
    const passed = (x: StepKind) => idx(x) >= 0 && idx(x) < e.si
    const pk = pageKindOf(e)

    // 승리 배너: 크게 튀어나왔다가(overshoot) 제자리
    const bp = e.si > 0 ? 1 : clamp(e.t / BANNER_IN, 0, 1)
    const banner = q('[data-banner]')
    if (banner) {
      banner.style.transform = `scale(${(1.6 - 0.6 * easeOutBack(bp)).toFixed(4)})`
      banner.style.opacity = String(clamp(bp * 4, 0, 1))
    }
    // 정산 패널·파티: 배너 뒤에 밀려 들어온다
    const pp = e.si > 0 ? 1 : clamp((e.t - BANNER_IN) / PANEL_IN, 0, 1)
    const pe = easeOutCubic(pp)
    const panel = q('[data-panel]')
    if (panel) {
      panel.style.transform = `translateX(${((1 - pe) * 140).toFixed(1)}px)`
      panel.style.opacity = String(pp)
    }
    const party = q('[data-party]')
    if (party) {
      party.style.transform = portrait ? `translateY(${((1 - pe) * 60).toFixed(1)}px)` : `translateX(${(-(1 - pe) * 100).toFixed(1)}px)`
      party.style.opacity = String(pp)
    }

    // 보상 행: 간격마다 하나씩 + 0 에서 목표값까지
    const rowActive = k === pk
    const rowAfter = idx(pk) < e.si
    qa('[data-row]').forEach((el, i) => {
      const local = rowActive ? e.t - i * c.S : rowAfter ? 99 : -1
      const a = clamp(local / ROW_IN, 0, 1)
      el.style.transform = `translateX(${((1 - easeOutCubic(a)) * 48).toFixed(1)}px)`
      el.style.opacity = String(a)
      setText(el.querySelector('[data-val]'), '+' + formatNumber(e.rows[i]?.value ?? 0))
      el.toggleAttribute('data-landed', i < e.landed)
    })
    // 합계: 행이 더해질 때마다 짧은 펄스
    const tot = q('[data-total]')
    if (tot && isPage(pk)) {
      setText(tot, formatNumber(e.total.value))
      const ph = e.pulse > 0 ? Math.sin(Math.PI * (1 - e.pulse / PULSE)) : 0
      tot.style.transform = `scale(${(1 + 0.12 * ph).toFixed(4)})`
    }

    // 파티 경험치 바: 카운트업과 같은 값으로 차오른다 (가득 차면 0 으로 돌아가 다음 레벨)
    const expTotal = sum(e.run.expLines)
    const expStep: StepKind = c.mode === 'ledger-lines' ? 'ledger' : 'exp'
    const gain = k === expStep ? (expStep === 'ledger' ? e.expCU.value : e.total.value) : passed(expStep) ? expTotal : 0
    for (const m of MEMBERS) {
      const card = q(`[data-member="${m.id}"]`)
      if (!card) continue
      const st = e.run.start[m.id]
      const r = levelAfter(st.lv, st.exp, gain)
      setText(card.querySelector('[data-lv]'), String(r.lv))
      const bar = card.querySelector<HTMLElement>('[data-bar]')
      if (bar) bar.style.transform = `scaleX(${(r.exp / r.need).toFixed(4)})`
      setText(card.querySelector('[data-exp]'), `${formatNumber(r.exp)} / ${formatNumber(r.need)}`)
      setText(card.querySelector('[data-gain]'), gain > 0 ? `+${formatNumber(gain)}` : '')
      card.toggleAttribute('data-up', r.ups > 0)
      const quiet = q(`[data-quiet="${m.id}"]`)
      if (quiet) {
        quiet.hidden = r.ups === 0
        setText(quiet, `▲ ${m.name} Lv ${r.lv}`)
      }
    }

    // 획득 물자
    const itemActive = k === 'items'
    qa('[data-tile]').forEach((el, i) => {
      const local = itemActive ? e.t - i * c.S : passed('items') ? 99 : -1
      const a = clamp(local / TILE_IN, 0, 1)
      el.style.transform = `scale(${(0.7 + 0.3 * easeOutBack(a)).toFixed(4)})`
      el.style.opacity = String(clamp(a * 2, 0, 1))
    })

    // 레벨 업 스포트라이트: 딤 200ms → 카드 확대 등장
    const spot = q('[data-spot]')
    if (spot) {
      const on = k === 'levelup'
      spot.style.visibility = on ? 'visible' : 'hidden'
      const dim = q('[data-dim]')
      if (dim) dim.style.opacity = on ? String(clamp(e.t / DIM_IN, 0, 1)) : '0'
      const a = on ? clamp((e.t - DIM_IN) / CARD_IN, 0, 1) : 0
      qa('[data-lvcard]').forEach((el, i) => {
        const ai = clamp(a * 1.25 - i * 0.12, 0, 1)
        el.style.transform = `scale(${(0.6 + 0.4 * easeOutBack(ai)).toFixed(4)})`
        el.style.opacity = String(clamp(ai * 2.5, 0, 1))
      })
    }

    // 등급 도장: 2배에서 1배로 가속하며 '찍힘' → 도장만 펄스 1회
    const rank = q('[data-rank]')
    if (rank) {
      const on = k === 'rank'
      const rp = on ? clamp(e.t / STAMP_IN, 0, 1) : passed('rank') ? 1 : 0
      const pt = on ? clamp((e.t - STAMP_IN) / 0.2, 0, 1) : 1
      const bump = pt > 0 && pt < 1 ? Math.sin(Math.PI * pt) * 0.08 : 0
      rank.style.transform = `rotate(-12deg) scale(${(2 - easeInQuad(rp) + bump).toFixed(4)})`
      rank.style.opacity = rp > 0 ? String(clamp(rp * 3, 0, 1)) : '0'
    }

    // 진행 안내: 입력 잠금 고리 · 자동 진행 막대 · 현재 단계 진행률
    const lock = q('[data-lock]')
    if (lock) {
      lock.style.opacity = e.lock > 0 ? '1' : '0'
      lock.style.strokeDashoffset = String(((1 - e.lock / INPUT_LOCK) * 100).toFixed(2))
    }
    const auto = q('[data-auto]')
    if (auto) auto.style.transform = `scaleX(${clamp(e.hold / Math.max(0.001, c.autoMs / 1000), 0, 1).toFixed(4)})`
    const tb = q('[data-trackbar]')
    if (tb) {
      const d = dur(k)
      tb.style.transform = `scaleX(${(d > 0 ? clamp(e.t / d, 0, 1) : 1).toFixed(4)})`
    }

    // 닫기: 아래로 빠지며 페이드
    const layer = q('[data-layer]')
    if (layer) {
      const cp = e.closed ? 1 : e.closing >= 0 ? clamp(e.closing / CLOSE_OUT, 0, 1) : 0
      layer.style.opacity = String(1 - cp)
      layer.style.transform = cp > 0 ? `translateY(${(cp * cp * 60).toFixed(1)}px)` : ''
    }
  }
  useLayoutEffect(() => paint())

  /* ───────── 입력 ───────── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(ev => {
    if (ev.key !== 'Enter') return
    if (!ev.repeat) press('user') // 누르고 있는 키의 반복 입력은 새 입력이 아니다
    return true
  })
  const onPointerDown = () => press('user')

  const device = useLastInputDevice(p.thumbnail ? 'keyboard' : 'auto')

  /* ───────── 렌더 ───────── */
  const e = eng.current
  const run = e.run
  const ups = leveledMembers(run)
  const rootStyle = {
    '--ts': p.timeScale,
    '--accent': accent,
    '--skew': skewDeg,
    '--tan': Math.tan((skewDeg * Math.PI) / 180),
  } as CSSProperties
  const common = {
    ref: rootRef,
    tabIndex: p.thumbnail ? -1 : 0,
    onKeyDown,
    onPointerDown,
    'data-paused': !p.playing || undefined,
    'data-layout': portrait ? 'port' : 'land',
    style: rootStyle,
    'aria-label': '결과 화면 (클릭하거나 Enter 로 확인)',
  }

  const toast = e.fb.seq > 0 && (
    <div key={e.fb.seq} className={s.fb} data-tone={e.fb.tone} role="status">
      {e.fb.text}
    </div>
  )

  const expTotal = sum(run.expLines)
  const creditTotal = sum(run.creditLines)

  // 해설 핀이 가리킬 요소: 결과 화면을 닫은 뒤에는 복귀 카드 안의 요약으로 옮긴다(빈 자리를 가리키지 않게)
  const live = (part: string) => (e.closed ? undefined : part)
  const gone = (part: string) => (e.closed ? part : undefined)
  const idleCard = (
    <div className={s.idle} data-show={e.closed || undefined}>
      <b data-part={gone('victory-banner')}>탐사 구역으로 복귀</b>
      <p className={s.recap}>
        <span data-part={gone('reward-row')}>경험치 +{formatNumber(expTotal)}</span>
        <span data-part={gone('total-line')}>크레딧 +{formatNumber(creditTotal)}</span>
        <span data-part={gone('levelup-spotlight')}>{ups.length ? `레벨 업 · ${ups.map(u => u.m.name).join(' · ')}` : '레벨 업 없음'}</span>
      </p>
      <span className={s.idleHint} data-part={juice ? undefined : gone('prompt-hint')}>
        다음 전투 대기 중 · 확인 입력이나 1~3번 이벤트로 다시 보기
      </span>
    </div>
  )

  if (!juice) {
    // 핀이 목록 가운데에 세로로 몰려 글자를 덮지 않게: 첫 줄의 라벨(왼쪽)·값(오른쪽) — 바로 위 제목 줄의 빈 좌우에 핀이 놓인다.
    // 레벨 업 줄은 줄 전체(핀이 윗줄 가운데 빈 곳에)
    return (
      <div className={s.root} data-bad {...common}>
        <div className={s.badBg} aria-hidden />
        <div className={s.badPanel} data-hide={e.closed || undefined}>
          <h1 className={s.badTitle} data-part={live('victory-banner')}>
            승리
          </h1>
          <ul className={s.badList}>
            <li>
              <span data-part={live('reward-row')}>경험치</span>
              <b data-badval="exp" data-part={live('total-line')}>
                {formatNumber(expTotal)}
              </b>
            </li>
            <li>
              <span>크레딧</span>
              <b data-badval="credit">{formatNumber(creditTotal)}</b>
            </li>
            {ups.map((u, i) => (
              <li key={u.m.id} data-part={i === 0 ? live('levelup-spotlight') : undefined}>
                <span>{u.m.name} 레벨이 올랐습니다</span>
                <b>Lv {u.lv}</b>
              </li>
            ))}
            {ups.length === 0 && (
              <li data-part={live('levelup-spotlight')}>
                <span>레벨 업</span>
                <b>없음</b>
              </li>
            )}
            {run.items.map(it => (
              <li key={it.id}>
                <span>{it.name}</span>
                <b>{it.count}</b>
              </li>
            ))}
          </ul>
          <button type="button" className={s.badBtn} data-part={live('prompt-hint')}>
            확인
          </button>
        </div>
        {idleCard}
        {toast}
      </div>
    )
  }

  const k = kind()
  const d = dur(k)
  const done = e.t >= d
  const pk = pageKindOf(e)
  const next = e.steps[e.si + 1]
  const ledger = mode === 'ledger-lines'
  const lines = pk === 'exp' ? run.expLines : run.creditLines

  // 해설 2번: 스포트라이트가 떠 있으면 그 카드, 아니면 레벨이 오르는(오를) 파티원 카드
  const spotOn = spotlight && ups.length > 0 && k === 'levelup'
  const lvPartMember = ups[0]?.m.id ?? 'harin'
  // 핀 대상 전환: 평소엔 본 화면 · 스포트라이트 중엔 딤 위의 '이전 단계' 요약 · 닫힌 뒤엔 복귀 카드
  const main = (part: string) => (!e.closed && !spotOn ? part : undefined)
  const sp = (part: string) => (!e.closed && spotOn ? part : undefined)
  const recapPage: StepKind = ledger ? 'ledger' : 'exp'
  const recapLines = ledger ? run.creditLines : run.expLines

  let action: string
  let actionDim = false
  if (e.closed) action = '다음 전투 결과 보기'
  else if (e.lock > 0) {
    action = '입력 잠금'
    actionDim = true
  } else if (k === 'complete') action = '닫기'
  else if (skip === 'disabled' && !done) {
    action = '연출 중 · 스킵 불가'
    actionDim = true
  } else if (skip === 'skip-all' && k !== 'levelup') action = '모두 건너뛰기'
  else if (!done) action = '이 단계 완료'
  else action = `다음 · ${STEP_LABEL[next]}`
  const autoWaiting = !e.closed && done && !mustWait(k) && k !== 'banner' && autoMs > 0

  const pitch = portrait ? 128 : 96
  const rowOffset = (i: number, n: number) => ((n - 1) / 2 - i) * pitch * Math.tan((skewDeg * Math.PI) / 180)

  const pageTitle: Record<string, string> = { exp: '획득 경험치', credit: '획득 크레딧', ledger: '정산 원장', items: '획득 물자' }
  const totalLabel: Record<string, string> = { exp: '경험치 합계', credit: '크레딧 합계', ledger: '크레딧 합계', items: '정산 요약' }
  const pageNo = ['exp', 'credit', 'items'].indexOf(pk) + 1

  const tiles = (cls: string) =>
    run.items.map((it, i) => (
      <div key={it.id} className={cls} data-tile={i} data-part={pk === 'items' && i === 0 ? main('reward-row') : undefined}>
        <ItemIcon id={it.id} size={portrait ? 104 : ledger ? 48 : 92} />
        <span className={s.tileName}>{it.name}</span>
        <b className={s.tileCount}>×{it.count}</b>
        {it.isNew && <em className={s.newTag}>신규</em>}
      </div>
    ))

  // 스포트라이트 중 딤 아래 요소를 대신하는 '이전 단계' 요약 — 해설 핀이 가려진 대상이나 카드 글자를 가리키지 않게.
  // 가로: 아래 단계 표시줄 오른쪽에 이어서 · 세로: 위쪽(배너 자리)
  const recap = spotOn && (
    <p className={s.spotRecap}>
      <span data-part={sp('victory-banner')}>✓ 승리</span>
      <span data-part={sp('reward-row')}>
        ✓ {STEP_LABEL[recapPage]} {recapLines.length}줄
      </span>
      <span data-part={sp('total-line')}>
        {ledger ? '크레딧' : '경험치'} 합계 <b>+{formatNumber(sum(recapLines))}</b>
      </span>
    </p>
  )

  return (
    <div className={s.root} data-mode={ledger ? 'ledger' : 'pages'} {...common}>
      <div className={s.bg} aria-hidden />
      <div className={s.layer} data-layer>
        {/* ── 승리 배너 ── */}
        <header className={s.banner} data-banner data-part={main('victory-banner')}>
          <span className={s.bannerSlash} aria-hidden />
          <h1 className={s.bannerWord}>승리</h1>
          <p className={s.mission}>
            <span className={s.missionTag}>작전 완료</span>
            {run.mission}
          </p>
          <p className={s.bannerMeta}>{run.meta}</p>
        </header>

        {/* ── 파티 경험치 ── */}
        <section className={s.party} data-party>
          {MEMBERS.map(m => (
            <div key={m.id} className={s.member} data-member={m.id} data-part={m.id === lvPartMember ? main('levelup-spotlight') : undefined}>
              <svg className={s.memberSil} viewBox="0 0 120 140" aria-hidden>
                <circle cx="60" cy="74" r="56" fill="rgba(90,209,255,0.10)" stroke="rgba(90,209,255,0.35)" strokeWidth="3" />
                <Silhouette role="ally" x={60} y={126} height={100} />
              </svg>
              <div className={s.memberBody}>
                <div className={s.memberHead}>
                  <b>{m.name}</b>
                  <span>{m.role}</span>
                  <span className={s.lv}>
                    Lv <em data-lv>{run.start[m.id].lv}</em>
                  </span>
                </div>
                <div className={s.expBar}>
                  <i data-bar />
                </div>
                <div className={s.memberFoot}>
                  <span data-exp />
                  <b className={s.gain} data-gain />
                </div>
              </div>
              <span className={s.upChip}>▲ 레벨 업</span>
            </div>
          ))}
        </section>

        {/* ── 정산 패널 ── */}
        <section className={s.panel} data-panel>
          <div className={s.frame} aria-hidden />
          <header className={s.pageHead}>
            <span className={s.pageNo}>{ledger ? '원장' : `0${pageNo} / 03`}</span>
            <h2 key={pk} className={s.pageTitle}>
              {pageTitle[pk]}
            </h2>
            {!ledger && (
              <nav className={s.tabs} aria-label="정산 단계">
                {(['exp', 'credit', 'items'] as const).map(t => (
                  <span key={t} className={s.tab} data-on={t === pk || undefined} data-done={['exp', 'credit', 'items'].indexOf(t) < pageNo - 1 || undefined}>
                    {STEP_LABEL[t]}
                  </span>
                ))}
              </nav>
            )}
            {ledger && <span className={s.expPill}>경험치 +{formatNumber(expTotal)} → 파티</span>}
          </header>

          {pk === 'items' ? (
            <div className={s.itemGrid}>{tiles(s.tile)}</div>
          ) : (
            <div className={s.rows} key={`${pk}-${e.run.id}`}>
              {lines.map((l, i) => (
                <div key={i} className={s.rowSlot} style={{ marginLeft: rowOffset(i, lines.length + 1) }}>
                  <div className={s.row} data-row={i} data-part={i === 0 ? main('reward-row') : undefined}>
                    <span className={s.rowOp} aria-hidden>
                      {i === 0 ? '' : '+'}
                    </span>
                    <span className={s.rowLabel}>
                      {l.label}
                      <small>{l.sub}</small>
                    </span>
                    <b className={s.rowVal} data-val>
                      +0
                    </b>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={s.total} data-part={main('total-line')} style={{ marginLeft: rowOffset(lines.length, lines.length + 1) }}>
            <span className={s.totalLabel}>{totalLabel[pk]}</span>
            {pk === 'items' ? (
              <span className={s.summary}>
                경험치 <b>+{formatNumber(expTotal)}</b> · 크레딧 <b>+{formatNumber(creditTotal)}</b>
              </span>
            ) : (
              <b className={s.totalVal} data-total>
                0
              </b>
            )}
            {!spotlight && ups.length > 0 && (pk === 'exp' || pk === 'ledger') && (
              // 경험치가 실제로 넘친 파티원만, 지금 레벨로 (paint 에서 파티 카드와 같은 조건으로 켠다)
              <span className={s.quietUp}>
                {ups.map(u => (
                  <em key={u.m.id} data-quiet={u.m.id} hidden />
                ))}
              </span>
            )}
          </div>
        </section>

        {ledger && (
          <div className={s.strip} data-on={e.steps.indexOf('items') <= e.si || undefined}>
            <span className={s.stripLabel}>획득 물자</span>
            {tiles(s.stripTile)}
          </div>
        )}

        {rankOn && (
          <div className={s.rank} data-rank data-grade={run.rank}>
            <RankShape rank={run.rank} />
            <b>{run.rank}</b>
            <span>등급 · {run.rankNote}</span>
          </div>
        )}
      </div>

      {/* ── 레벨 업 스포트라이트 ── */}
      {spotlight && ups.length > 0 && (
        <div className={s.spot} data-spot data-count={ups.length}>
          <div className={s.dim} data-dim />
          {portrait && recap}
          <div className={s.spotCards} data-part={sp('levelup-spotlight')}>
            {ups.map(u => (
              <article key={u.m.id} className={s.lvCard} data-lvcard>
                <div className={s.lvBadge}>레벨 업</div>
                <svg className={s.lvSil} viewBox="0 0 300 300" aria-hidden>
                  <circle cx="150" cy="160" r="120" fill="none" stroke="var(--accent)" strokeOpacity="0.35" strokeWidth="4" strokeDasharray="10 12" />
                  <circle cx="150" cy="160" r="92" fill="rgba(90,209,255,0.12)" />
                  <Silhouette role="ally" x={150} y={262} height={210} />
                </svg>
                <div className={s.lvInfo}>
                  <p className={s.lvName}>
                    {u.m.name}
                    <span>{u.m.role}</span>
                  </p>
                  <p className={s.lvJump}>
                    <small>Lv</small> {u.from} <span aria-hidden>→</span> <b>{u.lv}</b>
                  </p>
                  <ul className={s.lvStats}>
                    <li>
                      최대 체력 <span>{u.m.hp}</span> → <b>{u.m.hp + 24 * u.ups}</b>
                    </li>
                    <li>
                      출력 <span>{u.m.pow}</span> → <b>{u.m.pow + 3 * u.ups}</b>
                    </li>
                    <li className={s.lvSkill}>새 기술 · {u.m.skill}</li>
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* ── 진행 안내 ── */}
      <footer className={s.footer} data-hide={e.closed || undefined}>
        <ol className={s.track} aria-label="정산 단계">
          {e.steps.map((st, i) => (
            <li key={st} className={s.step} data-state={i < e.si ? 'done' : i === e.si ? 'cur' : 'next'}>
              {i < e.si ? '✓ ' : ''}
              {STEP_LABEL[st]}
              {i === e.si && <i className={s.stepBar} data-trackbar />}
            </li>
          ))}
        </ol>
        {!portrait && recap}
      </footer>
      <div className={s.promptWrap}>
        {toast}
        <div className={s.prompt} data-part="prompt-hint" data-dim={actionDim || undefined} data-wait={(done && mustWait(k)) || e.closed || undefined}>
          <span className={s.glyph}>
            <ActionGlyph action="confirm" device={device} size={portrait ? 64 : 44} />
          </span>
          <span className={s.promptText}>{action}</span>
          <svg className={s.lockRing} viewBox="0 0 40 40" aria-hidden>
            <circle cx="20" cy="20" r="15.9" pathLength={100} data-lock />
          </svg>
          {autoWaiting && (
            <span className={s.auto}>
              자동 진행
              <i className={s.autoTrack}>
                <i data-auto />
              </i>
            </span>
          )}
        </div>
      </div>
      {idleCard}
    </div>
  )
}

/** 패널에 보이는 정산 페이지: 현재 단계 이전(포함)의 마지막 정산·물자 단계. 아직 없으면 첫 정산 단계 */
function pageKindOf(e: Eng): StepKind {
  for (let i = e.si; i >= 0; i--) {
    const k = e.steps[i]
    if (k === 'exp' || k === 'credit' || k === 'ledger' || (k === 'items' && !e.steps.includes('ledger'))) return k
  }
  return e.steps.includes('ledger') ? 'ledger' : 'exp'
}
