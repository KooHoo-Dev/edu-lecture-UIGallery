import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useGameLoop, useTrigger } from '../../core/hooks'
import { createInputLock, type InputLock } from '../../core/inputLock'
import { ActionGlyph, KeyCap, useLastInputDevice } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { ACTIVATE_S, LOAD_CAP, SCENARIOS, TIPS, isReady, predictReady, realAt, scriptSteps, stageAt, stepDisplay, type Scenario } from './model'
import s from './style.module.css'

export { meta } from './meta'

/** 자동 모드: 이 시간이 지나도 안 끝나면 스피너 → 퍼센트 바 */
const AUTO_BAR_S = 2
/** 자동 모드: 이 시간이 지나면 단계 문구까지 */
const AUTO_STAGES_S = 6
/** 실제 진행률이 이만큼 그대로면 '오래 걸리는 중' 을 알린다 */
const STALL_S = 1
/** 나쁜 예: 팁이 바뀌는 간격 (읽기 전에 사라진다) */
const BAD_TIP_S = 1.5
/** 준비 완료 직후 입력을 막는 시간 — 로딩 중 연타가 바로 넘기지 않게 */
const LOCK_MS = 400
/** 도착 직후 입력을 버리는 시간 — '계속' 을 누른 손이 한 번 더 눌러 다시 불러오지 않게 */
const ARRIVE_LOCK_MS = 800
/** 준비 완료 뒤 그래프에 기다림을 기록하는 최대 길이 (이 뒤로는 가로축을 고정한다) */
const WAIT_REC_S = 3
/** 자동 데모가 '아무 키' 를 누르기까지 (좋은 예 · 나쁜 예) */
const AUTO_PRESS_S = 1.8
const BAD_AUTO_PRESS_S = 4
const AUTO_NEXT_S = 2.6
const AUTO_ORDER = ['fast', 'hitch', 'slow', 'normal']
/** 첫 화면을 '불러오는 중간' 으로 시작 (썸네일 · 해설 번호가 가리킬 것이 보이게) */
const PREROLL_S = 3

/* 그래프 좌표 (패널 안 px) */
const GW = 800
const GH = 440
const PX0 = 70
const PX1 = 770
const PY1 = 78 // 값 1.0
const PY0 = 352 // 값 0
const yOf = (v: number) => PY0 - v * (PY0 - PY1)

type Phase = 'loading' | 'ready' | 'activating' | 'arrived'
type Mode = 'auto' | 'spinner' | 'percent' | 'stages'

interface Cfg {
  juice: boolean
  speed: number
  minShow: number
  tipInterval: number
  mode: Mode
  wait: boolean
  auto: boolean
}

interface Sim {
  sc: Scenario
  t: number
  phase: Phase
  real: number
  disp: number
  readyAt: number
  actAt: number
  arriveAt: number
  lastRealT: number
  hist: { t: number; r: number; d: number }[]
  autoBar: boolean
  autoStages: boolean
  stalled: boolean
  tip: number
  tipT: number
  tipSeq: number
  tipDir: 1 | -1
  lock: InputLock
  /** 도착 직후 입력 잠금 */
  arriveLock: InputLock
  /** 자동 데모 · 사람이 '계속' 을 누른 시각 (프롬프트 눌림 표시) */
  pressAt: number
  flash: { text: string; bad: boolean; until: number } | null
  autoIdx: number
  pred: { key: string; t: number }
}

function newSim(id: string, autoIdx = 0): Sim {
  return {
    sc: SCENARIOS[id] ?? SCENARIOS.normal,
    t: 0,
    phase: 'loading',
    real: 0,
    disp: 0,
    readyAt: -1,
    actAt: -1,
    arriveAt: -1,
    lastRealT: 0,
    hist: [{ t: 0, r: 0, d: 0 }],
    autoBar: false,
    autoStages: false,
    stalled: false,
    tip: 0,
    tipT: 0,
    tipSeq: 0,
    tipDir: 1,
    lock: createInputLock(LOCK_MS),
    arriveLock: createInputLock(ARRIVE_LOCK_MS),
    pressAt: -9,
    flash: null,
    autoIdx,
    pred: { key: '', t: 0 },
  }
}

const activate = (S: Sim) => {
  S.phase = 'activating'
  S.actAt = S.t
  S.flash = null // '입력 잠금' 같은 지난 알림이 남지 않게
}

/** 한 프레임 진행 (사람 · 자동 데모 · 처음 미리 돌리기가 같은 함수를 쓴다) */
function tick(S: Sim, c: Cfg, dt: number) {
  S.t += dt
  if (S.phase === 'loading' || S.phase === 'ready') {
    const r = realAt(S.sc, S.t)
    if (r !== S.real) {
      S.real = r
      S.lastRealT = S.t
    }
    S.disp = stepDisplay(S.disp, S.real, S.t, c, dt)
    if (S.phase === 'loading' && isReady(S.real, S.disp, c.juice)) {
      S.phase = 'ready'
      S.readyAt = S.t
      S.lock.open(S.t * 1000)
    }
  }
  if (S.phase === 'ready') {
    if (!c.wait) {
      // 기다리지 않는 설정: 좋은 예는 100% 를 잠깐 보여 주고, 나쁜 예는 90% 에서 바로 넘어간다
      if (!c.juice || S.t - S.readyAt >= 0.25) activate(S)
    } else if (c.auto && S.t - S.readyAt >= (c.juice ? AUTO_PRESS_S : BAD_AUTO_PRESS_S)) {
      S.pressAt = S.t
      activate(S)
    }
  }
  if (S.phase === 'activating') {
    S.real = Math.min(1, LOAD_CAP + ((S.t - S.actAt) / ACTIVATE_S) * (1 - LOAD_CAP))
    S.disp = c.juice ? 1 : S.real
    if (S.t - S.actAt >= ACTIVATE_S) {
      S.phase = 'arrived'
      S.arriveAt = S.t
      S.real = 1
      S.arriveLock.open(S.t * 1000)
    }
  }
  if (S.phase === 'loading') {
    // 실제 불러오기가 그 시간 안에 끝났으면 바꾸지 않는다 (빠른 로딩은 끝까지 스피너)
    if (S.t >= AUTO_BAR_S && S.real < LOAD_CAP) S.autoBar = true
    if (S.t >= AUTO_STAGES_S && S.real < LOAD_CAP) S.autoStages = true
  }
  S.stalled = c.juice && S.phase === 'loading' && S.real < LOAD_CAP && S.t - S.lastRealT > STALL_S
  // 팁 순환 — 좋은 예는 읽을 시간, 나쁜 예는 1.5초마다
  if (S.phase !== 'arrived') {
    S.tipT += dt
    if (S.tipT >= (c.juice ? c.tipInterval : BAD_TIP_S)) {
      S.tip = (S.tip + 1) % TIPS.length
      S.tipT = 0
      S.tipSeq++
      S.tipDir = 1
    }
  }
  // 그래프 기록
  const last = S.hist[S.hist.length - 1]
  // 준비 완료 뒤 오래 기다리면 기록을 멈춘다 (가로축 고정 · 기록 수 제한) — 활성화가 시작되면 다시 기록
  const recording = S.phase === 'ready' ? S.t - S.readyAt <= WAIT_REC_S : S.phase !== 'arrived' || last.t < S.arriveAt
  if (recording && (S.real !== last.r || S.t - last.t >= 1 / 30) && S.hist.length < 4000) S.hist.push({ t: S.t, r: S.real, d: S.disp })
}

/** 그래프 가로축 길이(초) — 준비 완료 예측 + 기다림 + 활성화. 불러오는 동안만 늘리고, 준비 완료 뒤에는 고정한다 */
function spanOf(S: Sim, c: Cfg): number {
  const key = `${S.sc.id}|${c.juice}|${c.speed}|${c.minShow}`
  if (S.pred.key !== key) S.pred = { key, t: predictReady(S.sc, c) }
  const plan = S.pred.t + (c.wait ? (c.juice ? AUTO_PRESS_S : BAD_AUTO_PRESS_S) : 0.25) + ACTIVATE_S + 0.6
  const end = S.phase === 'loading' ? S.t : S.readyAt + Math.min(WAIT_REC_S, (S.phase === 'ready' ? S.t : S.actAt) - S.readyAt) + ACTIVATE_S
  return Math.max(4, Math.ceil(Math.max(plan, end + 0.4)))
}

/** 해설용 알림 (게임 화면 밖의 설명). 나쁜 예는 상태를 보고 '흔한 실수' 를 짚는다 */
function noteOf(S: Sim, c: Cfg): { text: string; bad: boolean } | null {
  if (S.flash && S.flash.until > S.t) return S.flash
  if (c.juice) return null
  if (S.phase === 'ready' && c.wait && S.t - S.readyAt > 1.5) return { text: '⚠ 90% 에서 멈춘 화면 — 사실은 키 입력을 기다리는 중인데 아무 안내가 없다', bad: true }
  if (S.phase === 'loading' && S.t - S.lastRealT > 1.2) return { text: '⚠ 진행 바가 꼼짝 않는다 — 멈춘 걸까? 움직이는 것이 하나도 없다', bad: true }
  if (S.phase === 'arrived' && S.arriveAt < 2) return { text: `⚠ 로딩 화면이 ${S.arriveAt.toFixed(1)}초 만에 번쩍 지나감 — 팁을 읽을 틈이 없다`, bad: true }
  return null
}

/**
 * 로딩 화면 · 진행률.
 * 실제 op.progress(계단식, 0.9 에서 멈춤)와 화면에 보이는 진행률(0.9 로 나눠 늘리고 MoveTowards 로 보간, 최소 노출 시간)을
 * 오른쪽 위 그래프에 겹쳐 그린다. 팁 순환 · 대기 길이에 따른 스피너 / 퍼센트 바 / 단계 문구 · '아무 키나 눌러 계속'.
 */
export default function LoadingScreen(p: SpecimenProps) {
  const juice = p.juice
  const cfg: Cfg = {
    juice,
    speed: num(p.params, 'smoothSpeed', 60) / 100,
    minShow: num(p.params, 'minShowMs', 2500) / 1000,
    tipInterval: num(p.params, 'tipIntervalMs', 6000) / 1000,
    mode: str(p.params, 'indicatorMode', 'auto') as Mode,
    wait: bool(p.params, 'waitForInput', true),
    auto: p.autoplay && !p.thumbnail,
  }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) {
    const S0 = newSim('normal')
    for (let i = 0; i < PREROLL_S * 60; i++) tick(S0, { ...cfg, auto: false }, 1 / 60)
    simRef.current = S0
  }
  const S = simRef.current
  const [, setVersion] = useState(0)
  const device = useLastInputDevice()

  /* ───── 화면에 보일 이산 상태 (바뀔 때만 다시 그린다) ───── */
  const signature = () => {
    const S = simRef.current!
    const c = cfgRef.current
    const n = noteOf(S, c)
    return [S.sc.id, S.phase, S.tipSeq, S.autoBar, S.autoStages, S.stalled, n?.text ?? '', spanOf(S, c), stageAt(S.sc, S.t), S.t - S.pressAt < 0.5].join('|')
  }
  const shown = useRef('')
  const sync = (force = false) => {
    const sig = signature()
    if (force || sig !== shown.current) {
      shown.current = sig
      setVersion(v => v + 1)
    }
  }

  const restart = (id: string) => {
    const idx = simRef.current!.autoIdx
    simRef.current = newSim(id, idx)
    sync(true)
  }

  const flipTip = (dir: 1 | -1) => {
    const S = simRef.current!
    if (!cfgRef.current.juice || S.phase === 'arrived') return
    S.tip = (S.tip + dir + TIPS.length) % TIPS.length
    S.tipT = 0 // 손으로 넘기면 타이머를 처음부터 — 넘기자마자 또 바뀌지 않게
    S.tipSeq++
    S.tipDir = dir
  }

  /** kind: 키 · 클릭 · 이벤트 버튼. 도착한 뒤에는 클릭으로만 다시 불러온다 (키는 다음 화면의 것 — 입력 소비) */
  /** 무언가 했으면(안내 문구 · 다시 불러오기 · 활성화) true — 키 핸들러가 이 키를 먹을지 정한다 */
  const press = (kind: 'key' | 'click' | 'event'): boolean => {
    const S = simRef.current!
    const c = cfgRef.current
    if (S.phase === 'arrived') {
      if (kind === 'click' && !S.arriveLock.blocks(S.t * 1000)) restart(S.sc.id)
      else if (kind !== 'click') S.flash = { text: '이미 도착 — 남은 키 입력은 버린다 (다시 하려면 클릭이나 ‘처음부터’)', bad: false, until: S.t + 2 }
      return true
    }
    if (S.phase === 'loading') {
      if (c.juice) S.flash = { text: '아직 불러오는 중 — 키 입력은 준비 완료 뒤에만 받는다', bad: false, until: S.t + 2 }
      return c.juice
    }
    if (S.phase !== 'ready' || !c.wait) return false
    if (c.juice && S.lock.blocks(S.t * 1000)) {
      S.flash = { text: `입력 잠금 ${LOCK_MS / 1000}초 — 로딩 중 연타가 바로 넘기지 않게 막았다`, bad: false, until: S.t + 1.6 }
      return true
    }
    S.pressAt = S.t
    activate(S)
    return true
  }

  useTrigger(p.trigger, id => {
    if (id === 'continue') press('event')
    else restart(id === 'restart' ? 'normal' : id)
    sync(true)
  })

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    const c = cfgRef.current
    const sim = simRef.current!
    tick(sim, c, dt)
    if (c.auto && sim.phase === 'arrived' && sim.t - sim.arriveAt > AUTO_NEXT_S) {
      const next = AUTO_ORDER[sim.autoIdx % AUTO_ORDER.length]
      simRef.current = newSim(next, sim.autoIdx + 1)
    }
    paint()
    sync()
  })

  /* ───── 그리기 (매 프레임 DOM 직접) ───── */
  const fillRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const tipBarRef = useRef<HTMLDivElement>(null)
  const realPathRef = useRef<SVGPathElement>(null)
  const dispPathRef = useRef<SVGPathElement>(null)
  const realHeadRef = useRef<SVGGElement>(null)
  const dispHeadRef = useRef<SVGGElement>(null)
  const nowRef = useRef<SVGLineElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)

  const paint = () => {
    const sim = simRef.current!
    const c = cfgRef.current
    const shownValue = c.juice ? sim.disp : sim.real
    if (fillRef.current) fillRef.current.style.width = `${shownValue * 100}%`
    if (pctRef.current) pctRef.current.textContent = `${c.juice ? Math.floor(sim.disp * 100 + 1e-6) : Math.round(sim.real * 100)}%`
    if (tipBarRef.current) tipBarRef.current.style.width = `${Math.min(1, sim.tipT / c.tipInterval) * 100}%`
    if (clockRef.current) clockRef.current.textContent = `${(sim.phase === 'arrived' ? sim.arriveAt : sim.t).toFixed(1)}초`

    const sp = spanOf(sim, c)
    const xOf = (t: number) => PX0 + (Math.min(t, sp) / sp) * (PX1 - PX0)
    const h = sim.hist
    let dr = ''
    let dd = ''
    for (let i = 0; i < h.length; i++) {
      const x = xOf(h[i].t).toFixed(1)
      if (i === 0) {
        dr = `M${x} ${yOf(h[i].r).toFixed(1)}`
        dd = `M${x} ${yOf(h[i].d).toFixed(1)}`
      } else {
        // 실제 진행률은 계단 — 가로로 간 다음 세로로 뛴다
        dr += ` H${x} V${yOf(h[i].r).toFixed(1)}`
        dd += ` L${x} ${yOf(h[i].d).toFixed(1)}`
      }
    }
    realPathRef.current?.setAttribute('d', dr)
    dispPathRef.current?.setAttribute('d', dd)
    const last = h[h.length - 1]
    const hx = xOf(last.t)
    const realY = yOf(last.r)
    const dispY = yOf(last.d)
    // 두 머리표가 겹치지 않게: 실제 값은 아래, 표시 값은 위로 비켜 쓴다
    const gap = Math.max(0, 34 - (realY - dispY))
    realHeadRef.current?.setAttribute('transform', `translate(${Math.min(hx, PX1 - 150).toFixed(1)} ${Math.min(PY0 + 2, realY + gap / 2 + 26).toFixed(1)})`)
    dispHeadRef.current?.setAttribute('transform', `translate(${Math.min(hx, PX1 - 150).toFixed(1)} ${Math.max(PY1 - 10, dispY - gap / 2 - 12).toFixed(1)})`)
    const rt = realHeadRef.current?.querySelector('text')
    if (rt) rt.textContent = `실제 ${last.r.toFixed(2)}`
    const dtx = dispHeadRef.current?.querySelector('text')
    if (dtx) dtx.textContent = c.juice ? `표시 ${Math.floor(last.d * 100 + 1e-6)}%` : `표시 ${Math.round(last.d * 100)}% (= 실제)`
    nowRef.current?.setAttribute('x1', hx.toFixed(1))
    nowRef.current?.setAttribute('x2', hx.toFixed(1))
  }
  useLayoutEffect(() => paint())

  /* ───── 입력 ───── */
  /* '아무 키' 에서 뺀다: 갤러리 단축키(1~9 · J S A H P · Esc · Tab)와 브라우저 키(F1~F12 · 페이지 이동 · 방향키 위아래) · 조합 보조키.
   * Space 는 키를 기다리는 '준비 완료' 에서만 아무 키로 쓴다 — 그 밖에는 갤러리 재생/정지로 */
  const NOT_ANY_KEY = /^([0-9]|[jsahp]|escape|tab|f\d{1,2}|page(up|down)|home|end|arrow(up|down|left|right)|shift|control|alt|meta|capslock|numlock|scrolllock|contextmenu|dead|process|unidentified)$/
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key.toLowerCase()
    if (k === 'arrowleft' || k === 'q' || k === 'arrowright' || k === 'e') {
      // 팁 넘기기 — 효과를 켰고 아직 도착 전일 때만 (먼저 눌린 키가 갤러리 ←/→ 를 가리지 않게)
      if (!cfgRef.current.juice || simRef.current!.phase === 'arrived') return
      flipTip(k === 'arrowleft' || k === 'q' ? -1 : 1)
      sync(true)
      return true
    }
    if (NOT_ANY_KEY.test(k) || e.repeat) return // 갤러리 · 브라우저 키는 그대로 흘려보낸다
    if (k === ' ' && simRef.current!.phase !== 'ready') return
    if (!press('key')) return
    sync(true)
    return true
  })
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || e.button !== 0 || (e.target as Element).closest('button')) return
    press('click')
    sync(true)
  }

  /* ───── 렌더 ───── */
  const c = cfg
  const sc = S.sc
  const stage = stageAt(sc, S.t)
  const n = sc.segments.length
  const ready = S.phase === 'ready'
  const done = S.phase === 'activating' || S.phase === 'arrived'
  // 어떤 표시기를 보이나
  let showBar: boolean
  let showPct: boolean
  let showStages: boolean
  let bigSpinner: boolean
  if (!juice) {
    showBar = true
    showPct = true
    showStages = false
    bigSpinner = false
  } else if (c.mode === 'spinner') {
    showBar = showPct = showStages = false
    bigSpinner = true
  } else if (c.mode === 'percent') {
    showBar = showPct = true
    showStages = bigSpinner = false
  } else if (c.mode === 'stages') {
    showBar = showStages = true
    showPct = bigSpinner = false
  } else {
    showBar = showPct = S.autoBar
    showStages = S.autoStages
    bigSpinner = !S.autoBar
  }
  // 실제 값이 멈춘 동안에는 어떤 모드든 '무엇을 하는 중인지' 를 글로 알린다
  if (juice && S.stalled) showStages = true
  const stageText = done
    ? '입장하는 중…'
    : ready || S.real >= LOAD_CAP
      ? '모든 단계 완료'
      : `단계 ${Math.min(stage + 1, n)}/${n} · ${sc.segments[Math.min(stage, n - 1)].label} 불러오는 중${S.stalled ? ' · 조금 오래 걸리는 중' : ''}`
  const spinnerText = done ? '입장하는 중…' : ready ? '준비 완료' : S.stalled ? '조금 오래 걸리는 중…' : '불러오는 중'
  const ts = Math.max(0.05, p.timeScale)
  const span = spanOf(S, c)
  const note = noteOf(S, c)
  const xOf = (t: number) => PX0 + (Math.min(t, span) / span) * (PX1 - PX0)
  const ghost = scriptSteps(sc)
    .map(([t, v], i) => `${i ? 'L' : 'M'}${xOf(t).toFixed(1)} ${yOf(v).toFixed(1)}`)
    .join(' ')
  const tickStep = span <= 8 ? 1 : span <= 20 ? 2 : 5
  const ticks = Array.from({ length: Math.floor(span / tickStep) + 1 }, (_, i) => i * tickStep)
  const pressedRecently = S.t - S.pressAt < 0.5

  return (
    <div
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-phase={S.phase}
      style={{ '--ts': ts } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="로딩 화면 데모 (←/→ 팁 넘기기, 준비 완료 뒤 아무 키(갤러리 단축키 제외) · 클릭으로 계속)"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      {/* 도착한 곳 (로딩 화면 뒤) */}
      <div className={s.arrival} aria-hidden={S.phase !== 'arrived'}>
        <Backdrop arrived />
        <div className={s.arrivalText}>
          <span>도착</span>
          <b>북쪽 통신탑</b>
          <em>하린: 전원부터 살리자. 세라, 주파수 맞춰 줘.</em>
          {!c.auto && <small>클릭하거나 ‘처음부터’ 로 다시 불러오기</small>}
        </div>
      </div>

      {/* 로딩 화면 */}
      <div className={s.screen}>
        <Backdrop arrived={false} />
        <div className={s.dest}>
          <span>다음 지역</span>
          <b>북쪽 통신탑</b>
          <em>지표 탐사 구역 · 외곽 탐사대 3번 경로</em>
        </div>

        {/* 팁 */}
        <div className={s.tip} data-part="tip">
          <div className={s.tipHead}>
            <span className={s.tipBadge}>팁</span>
            <span className={s.tipIndex}>
              {S.tip + 1} / {TIPS.length}
            </span>
            {juice && (
              <span className={s.tipNav}>
                <button tabIndex={-1} aria-label="이전 팁" onClick={() => (flipTip(-1), sync(true))}>
                  ‹
                </button>
                <KeyCap label="Q" size={44} />
                <KeyCap label="E" size={44} />
                <button tabIndex={-1} aria-label="다음 팁" onClick={() => (flipTip(1), sync(true))}>
                  ›
                </button>
              </span>
            )}
          </div>
          <p key={S.tipSeq} className={s.tipText} data-dir={S.tipDir}>
            {TIPS[S.tip]}
          </p>
          <div className={s.tipTimer}>
            <div ref={tipBarRef} />
          </div>
        </div>

        {/* 아래 띠: 단계 문구 · 퍼센트 · 스피너 · 진행 바 */}
        <div className={s.status}>
          <span className={s.stageText} data-show={showStages || undefined} data-stalled={S.stalled || undefined}>
            {stageText}
          </span>
          <span className={s.pctBox}>
            <span className={s.spinnerSlot} data-part="indicator" data-big={bigSpinner || undefined} data-off={!juice || (done && !bigSpinner) || (ready && !bigSpinner) || undefined}>
              <span className={s.spinner} data-stop={ready || done || undefined} aria-hidden />
              {bigSpinner && <span className={s.spinnerText}>{spinnerText}</span>}
            </span>
            <span ref={pctRef} className={s.pct} data-show={showPct || undefined}>
              0%
            </span>
          </span>
        </div>
        <div className={s.bar} data-show={showBar || undefined} data-part="bar">
          <div ref={fillRef} className={s.fill}>
            <i className={s.ribs} />
          </div>
        </div>

        {/* 준비 완료 → 아무 키나 */}
        <div className={s.prompt} data-part="prompt" data-show={(juice && c.wait && (ready || S.phase === 'activating')) || undefined} data-pressed={pressedRecently || undefined}>
          <span className={s.promptCheck} aria-hidden>
            ✓
          </span>
          준비 완료 · <ActionGlyph action="confirm" device={device} size={48} /> {device === 'touch' ? '화면을 눌러 계속' : device === 'gamepad' ? '아무 버튼이나 눌러 계속' : device === 'mouse' ? '클릭하거나 아무 키나 눌러 계속' : '아무 키나 눌러 계속'}
        </div>
      </div>

      {/* 개발자 보기: 실제 vs 표시 */}
      <div className={s.graph}>
        <div className={s.graphHead}>
          <b>개발자 보기 · 실제 vs 표시</b>
          <span>
            {sc.name} · <span ref={clockRef}>0.0초</span>
          </span>
        </div>
        <svg viewBox={`0 0 ${GW} ${GH}`} className={s.plot} aria-hidden>
          <rect x={PX0} y={PY1} width={PX1 - PX0} height={PY0 - PY1} className={s.plotBg} />
          {ticks.map(t => (
            <g key={t}>
              <line x1={xOf(t)} x2={xOf(t)} y1={PY1} y2={PY0} className={s.grid} />
              <text x={xOf(t)} y={PY0 + 28} className={s.axis} textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          <text x={PX1} y={PY0 + 56} className={s.axis} textAnchor="end">
            초
          </text>
          <text x={PX0 - 10} y={yOf(0) + 8} className={s.axis} textAnchor="end">
            0
          </text>
          <text x={PX0 - 10} y={yOf(1) + 8} className={s.axis} textAnchor="end">
            1
          </text>
          <line x1={PX0} x2={PX1} y1={yOf(1)} y2={yOf(1)} className={s.capLine} />
          <line x1={PX0} x2={PX1} y1={yOf(LOAD_CAP)} y2={yOf(LOAD_CAP)} className={s.capLine} data-strong />
          <g data-part="graph">
            <text x={PX0 - 10} y={yOf(LOAD_CAP) + 8} className={s.axis} data-strong textAnchor="end">
              0.9
            </text>
          </g>
          <text x={PX0 + 10} y={yOf(LOAD_CAP) - 10} className={s.capLabel}>
            allowSceneActivation = false → 여기서 멈춤
          </text>
          {juice && c.minShow > 0 && (
            <g>
              <line x1={xOf(c.minShow)} x2={xOf(c.minShow)} y1={PY1 - 6} y2={PY0} className={s.minLine} />
              <text x={xOf(c.minShow) + 6} y={PY0 - 12} className={s.minLabel}>
                최소 노출
              </text>
            </g>
          )}
          {S.readyAt >= 0 && <line x1={xOf(S.readyAt)} x2={xOf(S.readyAt)} y1={PY1} y2={PY0} className={s.readyLine} />}
          <path d={ghost} className={s.ghost} />
          <line ref={nowRef} y1={PY1} y2={PY0} className={s.now} />
          <path ref={realPathRef} className={s.realLine} />
          <path ref={dispPathRef} className={s.dispLine} />
          <g ref={realHeadRef} className={s.headReal}>
            <rect x="-2" y="-22" width="150" height="30" rx="6" />
            <text x="6" y="1">
              실제
            </text>
          </g>
          <g ref={dispHeadRef} className={s.headDisp}>
            <rect x="-2" y="-22" width="150" height="30" rx="6" />
            <text x="6" y="1">
              표시
            </text>
          </g>
        </svg>
        <div className={s.legend}>
          <span className={s.legReal}>
            <svg viewBox="0 0 40 20" aria-hidden>
              <path d="M2 17 H14 V10 H26 V3 H38" />
            </svg>
            실제 op.progress
          </span>
          <span className={s.legDisp}>
            <svg viewBox="0 0 40 20" aria-hidden>
              <path d="M2 17 Q20 14 38 3" />
            </svg>
            화면에 보이는 값
          </span>
          <span className={s.legGhost}>
            <svg viewBox="0 0 40 20" aria-hidden>
              <path d="M2 17 H14 V10 H26 V3 H38" />
            </svg>
            각본
          </span>
        </div>
      </div>

      {note && (
        <div className={s.note} data-bad={note.bad || undefined}>
          {note.text}
        </div>
      )}
    </div>
  )
}

/** 배경 — 궤도에서 내려다본 행성 지평선과 통신탑 실루엣 (직접 그린 SVG) */
function Backdrop({ arrived }: { arrived: boolean }) {
  const id = arrived ? 'ls-sky-a' : 'ls-sky-l'
  return (
    <svg className={s.backdrop} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={arrived ? '#1b2f45' : '#070d18'} />
          <stop offset="1" stopColor={arrived ? '#3c5a6e' : '#132538'} />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill={`url(#${id})`} />
      {!arrived &&
        [
          [160, 120],
          [420, 260],
          [760, 90],
          [980, 300],
          [1300, 520],
          [620, 470],
          [1640, 620],
          [260, 520],
          [1120, 160],
          [880, 560],
        ].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#ffffff66" />)}
      <path d={arrived ? 'M0 780 Q480 700 960 760 T1920 730 V1080 H0 Z' : 'M-200 1080 Q960 610 2120 1080 Z'} fill={arrived ? '#22303a' : '#0e1c2a'} />
      <g fill={arrived ? '#0f171e' : '#0a141f'} stroke={arrived ? 'none' : '#5ee6c933'} strokeWidth="3">
        <path d="M1460 790 L1500 420 L1540 790 Z" />
        <path d="M1470 600 H1530 M1480 520 H1520" stroke={arrived ? '#0f171e' : '#5ee6c955'} strokeWidth="6" />
        <circle cx="1500" cy="408" r="16" />
      </g>
      {arrived && <circle cx="1500" cy="408" r="10" fill="#ffd166" />}
    </svg>
  )
}
