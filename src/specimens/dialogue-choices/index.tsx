import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { requestFlash } from '../../core/flash'
import { clamp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { DPad, KeyCap, MouseGlyph, PadButton, Shoulder, TouchGlyph, useLastInputDevice, type Device } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { Portrait, SceneBackdrop } from './Art'
import { CHOICE_NODE, CHOICES, DEFAULT_CHOICE, END_NODE, lineAt, LINES, PAUSE_CHARS, PREVIOUS, REPLY_NODE, SPEAKERS, type Line, type SpeakerId } from './script'
import s from './style.module.css'

export { meta } from './meta'

/* ──────────────────────────────────────────────────────────────
 * 대화창 + 선택지
 *  - 타자기 효과: 문장 전체를 미리 배치하고(뒷부분은 visibility: hidden) 보이는 글자 수만 늘린다 → 줄바꿈 위치가 튀지 않는다
 *  - 입력 소비: 타이핑 중 첫 입력 = 문장 완성, 다음 입력 = 다음 줄
 *  - 입력 잠금: 선택지가 열린 직후 inputLockMs 동안 확정 입력을 무시 (빨리감기 관통 방지)
 *  - 매 프레임 바뀌는 값(글자 수·타이머·잠금·자동 진행 대기)은 ref 로 DOM 을 직접 갱신한다
 * ────────────────────────────────────────────────────────────── */

type Phase = 'typing' | 'complete' | 'choices' | 'confirmed' | 'closed'

interface Entry {
  who: SpeakerId | 'me'
  unknown?: boolean
  text: string
  action?: boolean
}

interface Sim {
  node: number
  phase: Phase
  chosen: number | null
  chars: string[]
  count: number
  acc: number
  /** 패널 등장 연출 동안 타이핑 대기 (초) */
  delay: number
  autoWait: number
  focus: number
  lockLeft: number
  lockTotal: number
  timerLeft: number
  timerTotal: number
  confirmLeft: number
  /** 이벤트 버튼 '선택 확정' — 잠금이 풀리면 확정 */
  queued: boolean
  ff: boolean
  /** 빨리감기를 누르고 있는 남은 시간 (키·버튼을 직접 누르면 Infinity) */
  ffLeft: number
  ffStep: number
  log: boolean
  logSeq: number
  entries: Entry[]
  auto: boolean
  lineSeq: number
  convSeq: number
  choiceSeq: number
  flashSeq: number
  flashOk: boolean
  nudgeSeq: number
  toast: { seq: number; text: string; tone: 'info' | 'bad' }
}

const FF_STEP = 0.09
const PAUSE_S = 0.16
const CONFIRM_S = 0.32
const OPEN_DELAY = 0.24
/** 이벤트 버튼의 '누르고 있기' 흉내: 최대 2.5초, 선택지가 보이면 사람은 약 0.3초 뒤에 손을 뗀다 */
const FF_SIM_HOLD = 2.5
const FF_REACTION = 0.3

const autoNeed = (x: Sim) => 1.2 + 0.04 * x.chars.length

function freshSim(auto: boolean, juice = true): Sim {
  return {
    node: 0,
    phase: 'typing',
    chosen: null,
    chars: Array.from(LINES[0].text),
    count: 0,
    acc: 0,
    delay: juice ? OPEN_DELAY : 0,
    autoWait: 0,
    focus: 0,
    lockLeft: 0,
    lockTotal: 0,
    timerLeft: 0,
    timerTotal: 0,
    confirmLeft: 0,
    queued: false,
    ff: false,
    ffLeft: 0,
    ffStep: 0,
    log: false,
    logSeq: 0,
    entries: [toEntry(LINES[0])],
    auto,
    lineSeq: 1,
    convSeq: 1,
    choiceSeq: 0,
    flashSeq: 0,
    flashOk: false,
    nudgeSeq: 0,
    toast: { seq: 0, text: '', tone: 'info' },
  }
}

/** 썸네일: 선택지가 열린 장면을 정지 화면으로 */
function thumbSim(auto: boolean): Sim {
  const x = freshSim(auto)
  x.node = CHOICE_NODE
  x.chars = Array.from(LINES[CHOICE_NODE].text)
  x.count = x.chars.length
  x.delay = 0
  x.phase = 'choices'
  x.choiceSeq = 1
  x.entries = LINES.map(toEntry)
  return x
}

function toEntry(l: Line): Entry {
  return { who: l.who, unknown: l.unknown, text: l.text }
}

/** 강조색 위에 올릴 글자색 (밝으면 검정, 어두우면 흰색) */
function inkOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#0b0d10'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.22 ? '#0b0d10' : '#ffffff'
}

type Act = 'advance' | 'ff' | 'log' | 'auto' | 'move'
// Enter 는 글자 5개라 키캡 안 글씨가 22px 아래로 작아진다 → 널리 쓰이는 ↵ 기호 한 글자로
const KEY_LABEL: Record<Act, string> = { advance: '↵', ff: 'F', log: 'L', auto: 'R', move: '↑↓' }

/** 행동 → 현재 장치의 입력 글리프 (갤러리 공통 중립 글리프) */
function Glyph({ act, device, size = 34 }: { act: Act; device: Device; size?: number }) {
  if (device === 'gamepad') {
    if (act === 'advance') return <PadButton face="bottom" size={size} />
    if (act === 'ff') return <PadButton face="left" size={size} />
    if (act === 'log') return <PadButton face="top" size={size} />
    if (act === 'auto') return <Shoulder side="R" size={size} />
    return <DPad dirs={['up', 'down']} size={size} />
  }
  if (device === 'touch') return <TouchGlyph kind={act === 'ff' ? 'hold' : 'tap'} size={size} />
  if (device === 'mouse' && act === 'advance') return <MouseGlyph button="left" size={size} />
  // 두 글자(↑↓)는 키캡 안 글씨가 작아지지 않게 조금 키운다
  return <KeyCap label={KEY_LABEL[act]} size={KEY_LABEL[act].length > 1 ? Math.round(size * 1.15) : size} />
}

const Scene = memo(SceneBackdrop)

export default function DialogueChoices(p: SpecimenProps) {
  const cps = num(p.params, 'typeSpeedCps', 40)
  const autoParam = bool(p.params, 'autoAdvance', false)
  const layout = str(p.params, 'speakerLayout', 'tag-icon')
  const timerMs = num(p.params, 'choiceTimerMs', 0)
  const lockMs = num(p.params, 'inputLockMs', 300)
  const skew = num(p.params, 'skewDeg', 6)
  const accent = str(p.params, 'accentColor', '#FF6A3D')
  const textScale = num(p.params, 'textScale', 100)
  const juice = p.juice
  const portrait = p.aspect === '9:16'

  const [, setRev] = useState(0)
  // 상태 전환(줄 바뀜·선택지 열림 등)마다 다시 그린다. 루프 안에서는 모아 두었다가 프레임 끝에 한 번만
  const loopRef = useRef({ inLoop: false, dirty: false })
  const bump = () => {
    if (loopRef.current.inLoop) loopRef.current.dirty = true
    else setRev(r => r + 1)
  }
  const st = useRef<Sim | null>(null)
  if (!st.current) st.current = p.thumbnail ? thumbSim(autoParam) : freshSim(autoParam, p.juice)
  const x = st.current

  const rootRef = useRef<HTMLDivElement>(null)
  const shownRef = useRef<HTMLSpanElement>(null)
  const hiddenRef = useRef<HTMLSpanElement>(null)
  const timerFillRef = useRef<HTMLElement>(null)
  const timerNumRef = useRef<HTMLSpanElement>(null)
  const choicesRef = useRef<HTMLDivElement>(null)
  const autoFillRef = useRef<HTMLElement>(null)
  const logListRef = useRef<HTMLDivElement>(null)

  // 조절 패널의 '자동 진행' = 저장된 설정. 무대 안의 [자동] 버튼은 그 위에 덮어쓴다
  const firstAuto = useRef(true)
  useEffect(() => {
    if (firstAuto.current) {
      firstAuto.current = false
      return
    }
    st.current!.auto = autoParam
    bump()
  }, [autoParam])
  // 나쁜 예에는 입력 잠금이 없다
  useEffect(() => {
    if (!juice) st.current!.lockLeft = 0
  }, [juice])
  // 선택지가 열린 채로 제한시간을 바꾸면 곧바로 반영한다 (0 = 막대 숨김)
  const firstTimer = useRef(true)
  useEffect(() => {
    if (firstTimer.current) {
      firstTimer.current = false
      return
    }
    const x = st.current!
    if (x.phase !== 'choices') {
      if (timerMs > 0) {
        toast(`제한시간 ${(timerMs / 1000).toFixed(timerMs % 1000 ? 1 : 0)}초 — 다음 선택지부터 적용`)
        bump()
      }
      return
    }
    x.timerTotal = timerMs / 1000
    x.timerLeft = x.timerTotal
    bump()
  }, [timerMs])

  /* 마지막 입력 장치 — 세로(휴대폰) 화면은 패드가 아니면 터치 안내 */
  const last = useLastInputDevice(p.thumbnail ? 'keyboard' : 'auto')
  const device: Device = portrait && last !== 'gamepad' ? 'touch' : last

  /* ───── 상태 전환 ───── */
  const toast = (text: string, tone: 'info' | 'bad' = 'info') => {
    const t = st.current!.toast
    st.current!.toast = { seq: t.seq + 1, text, tone }
  }

  const startLine = (node: number, delay = 0) => {
    const x = st.current!
    const line = lineAt(node, x.chosen)
    x.node = node
    x.chars = Array.from(line.text)
    x.count = 0
    x.acc = 0
    x.delay = delay
    x.autoWait = 0
    x.ffStep = 0
    x.phase = 'typing'
    x.lineSeq++
    x.entries.push(toEntry(line))
    if (cps <= 0 && delay <= 0) {
      x.count = x.chars.length
      x.phase = 'complete'
    }
    bump()
  }

  const complete = () => {
    const x = st.current!
    x.count = x.chars.length
    x.phase = 'complete'
    x.autoWait = 0
    x.ffStep = 0
    bump()
  }

  const openChoices = () => {
    const x = st.current!
    x.phase = 'choices'
    x.focus = 0
    x.choiceSeq++
    x.lockTotal = juice ? lockMs / 1000 : 0
    x.lockLeft = x.lockTotal
    x.timerTotal = timerMs / 1000
    x.timerLeft = x.timerTotal
    x.ffStep = 0
    if (x.ff) {
      if (juice) {
        // 선택지에서는 빨리감기를 강제로 푼다 — 누르고 있던 버튼이 첫 항목을 고르지 않게
        x.ff = false
        toast('빨리감기 멈춤 — 선택은 직접 고른다')
      } else x.ffLeft = Math.min(x.ffLeft, FF_REACTION)
    }
    bump()
  }

  const close = () => {
    const x = st.current!
    x.phase = 'closed'
    x.ff = false
    bump()
  }

  const next = () => {
    const x = st.current!
    if (x.node === CHOICE_NODE) openChoices()
    else if (x.node >= END_NODE) close()
    else startLine(x.node + 1)
  }

  const restart = () => {
    const x = st.current!
    x.entries = []
    x.chosen = null
    x.log = false
    x.queued = false
    x.convSeq++
    startLine(0, juice ? OPEN_DELAY : 0)
  }

  const confirm = (i: number, why: 'input' | 'timeout' | 'pierce') => {
    const x = st.current!
    x.chosen = i
    x.focus = i
    x.phase = 'confirmed'
    x.queued = false
    x.confirmLeft = juice ? CONFIRM_S : 0.05
    x.entries.push({ who: 'me', text: CHOICES[i].text, action: CHOICES[i].action })
    // 확정한 항목 한 번 번쩍임 — 작은 영역이지만 공통 제한기를 거친다
    x.flashOk = juice && requestFlash()
    x.flashSeq++
    if (why === 'timeout') toast(juice ? '시간 초과 — 기본 선택(침묵)으로 확정' : '시간 초과 — 무엇이 골라졌는지 알 수 없다', juice ? 'info' : 'bad')
    if (why === 'pierce') toast(`빨리감기가 선택지를 관통 — '${CHOICES[i].text}' 자동 선택`, 'bad')
    bump()
  }

  /** 넘기기 · 확정 입력 하나 — 한 번에 한 단계만 처리한다 (입력 소비) */
  const press = () => {
    const x = st.current!
    if (x.log) return
    switch (x.phase) {
      case 'typing':
        x.delay = 0 // 패널이 올라오는 중에 눌러도 '문장 완성'으로 처리
        if (juice) complete()
        else {
          // 나쁜 예: 타이핑 중 입력이 곧바로 다음 줄로 → 읽지 못한 문장이 사라진다
          toast('읽기 전에 다음 줄로 넘어감 (입력 관통)', 'bad')
          next()
        }
        return
      case 'complete':
        next()
        return
      case 'choices':
        if (x.lockLeft > 0) {
          x.nudgeSeq++
          bump()
          return
        }
        confirm(x.focus, 'input')
        return
      case 'confirmed':
        return
      case 'closed':
        restart()
    }
  }

  const moveFocus = (d: number) => {
    const x = st.current!
    if (x.phase !== 'choices') return false
    x.focus = (x.focus + d + CHOICES.length) % CHOICES.length
    bump()
    return true
  }

  /** 이벤트 버튼용: 남은 줄을 기록에 넣고 선택 지점으로 건너뛴다 */
  const jumpToChoices = () => {
    const x = st.current!
    if (x.phase === 'choices') return
    x.log = false
    if (x.phase === 'closed' || x.phase === 'confirmed' || x.node > CHOICE_NODE) {
      x.entries = []
      x.chosen = null
      x.convSeq++
      x.node = -1
    }
    for (let n = x.node + 1; n <= CHOICE_NODE; n++) x.entries.push(toEntry(LINES[n]))
    if (x.node !== CHOICE_NODE) x.lineSeq++
    x.node = CHOICE_NODE
    x.chars = Array.from(LINES[CHOICE_NODE].text)
    x.count = x.chars.length
    x.delay = 0
    openChoices()
  }

  const toggleLog = () => {
    const x = st.current!
    if (!juice) {
      toast('대화 기록 없음 — 놓친 대사는 다시 볼 수 없다', 'bad')
      bump()
      return
    }
    x.log = !x.log
    x.logSeq++
    bump()
  }

  const toggleAuto = () => {
    const x = st.current!
    x.auto = !x.auto
    x.autoWait = 0
    if (juice) toast(x.auto ? '자동 진행 켬 — 문장 길이만큼 기다린 뒤 넘어간다' : '자동 진행 끔 — 넘길 때까지 문장이 남는다')
    bump()
  }

  const ffStart = (hold: number) => {
    const x = st.current!
    if (x.log) return
    if (x.phase === 'closed') restart()
    if (juice && x.phase === 'choices') {
      toast('선택지에서는 빨리감기가 멈춘다')
      bump()
      return
    }
    x.ff = true
    x.ffLeft = hold
    x.ffStep = 0
    bump()
  }
  const ffEnd = () => {
    const x = st.current!
    if (!x.ff) return
    x.ff = false
    bump()
  }

  /* ───── 이벤트 버튼 ───── */
  useTrigger(p.trigger, id => {
    const x = st.current!
    if (id === 'advance') press()
    else if (id === 'fast-forward') ffStart(FF_SIM_HOLD)
    else if (id === 'move-focus') {
      if (x.phase !== 'choices') jumpToChoices()
      moveFocus(1)
    } else if (id === 'confirm-choice') {
      if (x.phase !== 'choices') jumpToChoices()
      x.queued = true
      bump()
    } else if (id === 'toggle-log') toggleLog()
    else if (id === 'restart') restart()
  })

  /* ───── 자동 데모: 읽기 → 문장 완성 → 선택(포커스 이동·잠금) → 반응 → 기록 → 다시 ───── */
  const ap = useRef({ round: 0, planSeq: -1, plan: [] as number[], logDone: false, logTicks: 0, ffDone: false, cut: false })
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    1.0,
    () => {
      const x = st.current!
      const a = ap.current
      if (x.log) {
        if (++a.logTicks >= 3) {
          a.logTicks = 0
          toggleLog()
        }
        return
      }
      if (x.ff) return
      switch (x.phase) {
        case 'closed':
          if (juice && !a.logDone) {
            a.logDone = true
            toggleLog()
            return
          }
          a.round++
          a.logDone = false
          a.ffDone = false
          a.cut = false
          restart()
          return
        case 'typing':
          if (x.delay > 0) return
          if (a.round % 2 === 1 && !a.ffDone && x.node === 1) {
            a.ffDone = true
            ffStart(FF_SIM_HOLD)
            return
          }
          // 타이핑 중 첫 입력 = 문장 완성 (다음 줄로 넘어가지 않는다)
          if (x.node === 2 && !a.cut && x.count < x.chars.length * 0.7) {
            a.cut = true
            press()
          }
          return
        case 'complete':
          if (!x.auto) press()
          return
        case 'choices': {
          if (x.lockLeft > 0) return
          const target = a.round % 3
          if (x.timerTotal > 0 && target === DEFAULT_CHOICE) return // 시간 초과 → 기본 선택 시연
          if (a.planSeq !== x.choiceSeq) {
            a.planSeq = x.choiceSeq
            a.plan = target === 0 ? [1, -1] : target === 1 ? [1] : [1, 1]
          }
          const m = a.plan.shift()
          if (m !== undefined) moveFocus(m)
          else press()
          return
        }
      }
    },
    p.trigger?.seq,
  )

  /* ───── 게임 루프 ───── */
  // 대화 시간은 실제 경과 시간을 따른다: 프레임이 듬성듬성 와도(저사양·헤드리스 캡처) 글자 속도가 유지되도록
  // 공통 루프의 0.1초 상한 대신 1초까지 인정하고, 50ms 조각으로 나눠 상태 머신을 돌린다
  const clock = useRef(0)
  useEffect(() => {
    clock.current = 0
  }, [p.playing])
  useGameLoop(p.playing, p.timeScale, dt0 => {
    const now = performance.now()
    let rest = clock.current ? Math.min(1, (now - clock.current) / 1000) * p.timeScale : dt0
    clock.current = now
    const lp = loopRef.current
    lp.inLoop = true
    while (rest > 1e-6) {
      const h = Math.min(0.05, rest)
      rest -= h
      step(h)
    }
    lp.inLoop = false
    // 이 프레임에 상태가 바뀌었으면 React 화면(이름표·선택지)과 ref 로 그린 글자가 같은 프레임에 맞도록 즉시 반영
    if (lp.dirty) {
      lp.dirty = false
      flushSync(() => setRev(r => r + 1))
    }
    paint()
  })

  const step = (dt: number) => {
    const x = st.current!
    if (x.log) return // 기록을 보는 동안 타이핑·자동 진행·제한시간 모두 멈춘다
    if (x.ff && Number.isFinite(x.ffLeft)) {
      x.ffLeft -= dt
      if (x.ffLeft <= 0) {
        x.ff = false
        bump()
      }
    }
    switch (x.phase) {
      case 'typing': {
        if (x.delay > 0) {
          x.delay -= dt
          break
        }
        if (x.ff || cps <= 0) {
          complete()
          break
        }
        x.acc += dt
        const per = 1 / cps
        while (x.count < x.chars.length && x.acc >= per) {
          x.acc -= per
          x.count++
          // 문장부호 뒤 잠깐 멈춤 — 말하는 리듬 (나쁜 예는 일정한 속도로 기계적으로)
          if (juice && PAUSE_CHARS.has(x.chars[x.count - 1]) && x.count < x.chars.length) x.acc -= PAUSE_S
        }
        if (x.count >= x.chars.length) complete()
        break
      }
      case 'complete':
        if (x.ff) {
          x.ffStep += dt
          if (x.ffStep >= FF_STEP) next()
        } else if (x.auto) {
          x.autoWait += dt
          if (x.autoWait >= autoNeed(x)) next()
        }
        break
      case 'choices':
        if (x.lockLeft > 0) x.lockLeft = Math.max(0, x.lockLeft - dt)
        if (!juice && x.ff) {
          // 나쁜 예: 잠금이 없어 누르고 있던 빨리감기가 그대로 첫 항목을 확정한다
          x.ffStep += dt
          if (x.ffStep >= FF_STEP) {
            confirm(x.focus, 'pierce')
            break
          }
        }
        if (x.queued && x.lockLeft <= 0) {
          confirm(x.focus, 'input')
          break
        }
        if (x.timerTotal > 0) {
          x.timerLeft -= dt
          if (x.timerLeft <= 0) confirm(DEFAULT_CHOICE, 'timeout')
        }
        break
      case 'confirmed':
        x.confirmLeft -= dt
        if (x.confirmLeft <= 0) startLine(REPLY_NODE)
        break
    }
  }

  /* ───── 매 프레임 DOM 갱신 ───── */
  const paint = () => {
    const x = st.current!
    const shown = x.chars.slice(0, x.count).join('')
    const hidden = x.chars.slice(x.count).join('')
    if (shownRef.current && shownRef.current.textContent !== shown) shownRef.current.textContent = shown
    if (hiddenRef.current && hiddenRef.current.textContent !== hidden) hiddenRef.current.textContent = hidden
    const root = rootRef.current
    root?.toggleAttribute('data-done', x.phase === 'complete' && !x.ff)
    const r = x.timerTotal > 0 ? clamp(x.timerLeft / x.timerTotal, 0, 1) : 0
    if (timerFillRef.current) timerFillRef.current.style.transform = `scaleX(${r})`
    root?.toggleAttribute('data-hurry', x.phase === 'choices' && x.timerTotal > 0 && r < 0.3)
    if (timerNumRef.current) timerNumRef.current.textContent = String(Math.max(0, Math.ceil(x.timerLeft)))
    if (choicesRef.current) {
      choicesRef.current.style.setProperty('--lock', String(x.lockTotal > 0 ? x.lockLeft / x.lockTotal : 0))
      choicesRef.current.toggleAttribute('data-locked', x.phase === 'choices' && x.lockLeft > 0)
    }
    if (autoFillRef.current) autoFillRef.current.style.transform = `scaleX(${x.phase === 'complete' && x.auto && !x.ff ? clamp(x.autoWait / autoNeed(x), 0, 1) : 0})`
  }
  useLayoutEffect(() => paint())

  // 기록을 열면 최신 대사가 보이게 맨 아래로
  useLayoutEffect(() => {
    if (x.log && logListRef.current) logListRef.current.scrollTop = logListRef.current.scrollHeight
  }, [x.log, x.logSeq, x.entries.length])

  /* ───── 입력 (무대에 포커스가 있을 때만) ───── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    const x = st.current!
    const k = e.key
    let used = true
    if (x.log) {
      if (k === 'Escape' || k === 'Backspace' || k === 'l' || k === 'L') toggleLog()
      else if (k === 'ArrowUp' || k === 'ArrowDown') logListRef.current?.scrollBy({ top: k === 'ArrowUp' ? -140 : 140 })
      else if (k !== 'Enter') used = false
    } else if (k === 'Enter') {
      if (!e.repeat) press()
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      // 선택지가 닫혀 있어도 무대에 포커스가 있는 동안은 페이지를 스크롤하지 않는다
      moveFocus(k === 'ArrowDown' ? 1 : -1)
    }
    else if (k === 'f' || k === 'F') {
      if (!e.repeat) ffStart(Infinity)
    } else if (k === 'l' || k === 'L') toggleLog()
    else if (k === 'r' || k === 'R') toggleAuto()
    else used = false
    return used // 처리한 키만 먹는다 (core/stageKeys)
  })
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'f' || e.key === 'F') {
      ffEnd()
      e.stopPropagation()
    }
  }

  /** 무대 안 버튼을 마우스로 눌러도 포커스는 무대에 남긴다 — 버튼이 사라진 뒤 키 입력이 끊기지 않게 */
  const keepStageFocus = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    rootRef.current?.focus({ preventScroll: true })
  }

  const clickChoice = (i: number) => {
    const x = st.current!
    if (x.phase !== 'choices') return
    x.focus = i
    press()
  }
  const hoverChoice = (e: PointerEvent, i: number) => {
    const x = st.current!
    if (e.pointerType !== 'mouse' || x.phase !== 'choices' || x.focus === i) return
    x.focus = i
    bump()
  }
  const clickPanel = () => {
    if (st.current!.phase !== 'choices') press()
  }

  /* ───── 그리기 ───── */
  const line = lineAt(Math.max(0, x.node), x.chosen)
  const speaker = line.unknown ? { name: '???', role: '무전 · 신원 미확인' } : SPEAKERS[line.who]
  const speakerKey = `${x.convSeq}-${line.unknown ? 'unknown' : line.who}`
  const choicesOpen = x.phase === 'choices' || x.phase === 'confirmed'
  const k = textScale / 100
  const rootStyle = {
    '--ts': p.timeScale,
    '--accent': accent,
    '--ink': inkOn(accent),
    '--skew': `${skew}deg`,
    '--k': k,
  } as CSSProperties

  const common = {
    ref: rootRef,
    className: s.root,
    tabIndex: p.thumbnail ? -1 : 0,
    onKeyDown,
    onKeyUp,
    style: rootStyle,
    'data-aspect': portrait ? 'portrait' : 'land',
    'data-layout': layout,
    'data-paused': !p.playing || undefined,
    'data-thumb': p.thumbnail || undefined,
    'data-closed': x.phase === 'closed' || undefined,
    'aria-label': '대화창 (클릭 후 Enter(↵) 넘기기 · ↑↓ 선택 · F 빨리감기 · L 기록 · R 자동)',
  }

  const scene = <Scene portrait={portrait} speaking={x.phase !== 'closed' && !line.unknown ? line.who : null} />

  /* ───── 효과 끄기 = 흔한 실수 모음 ───── */
  if (!juice) {
    return (
      <div {...common} data-bad>
        {scene}
        <span className={s.badMenu} data-part="reading-controls">
          ≡ 메뉴
        </span>
        {x.phase === 'choices' && x.timerTotal > 0 && (
          <span className={s.badTimer}>
            남은 시간 <span ref={timerNumRef} />
          </span>
        )}
        {x.toast.seq > 0 && (
          <div key={x.toast.seq} className={s.toast} data-tone={x.toast.tone} role="status">
            {x.toast.text}
          </div>
        )}
        <div className={s.badStack}>
          {choicesOpen ? (
            <div className={s.badChoices} data-part="choice-focus">
              {CHOICES.map((c, i) => (
                <button key={i} type="button" tabIndex={-1} className={s.badChoice} onMouseDown={keepStageFocus} onClick={() => clickChoice(i)}>
                  {c.text}
                </button>
              ))}
            </div>
          ) : (
            // 닫혀 있어도 선택지 자리를 흐리게 보여 준다 (해설 3번이 가리킬 곳)
            <div className={s.badChoicesGhost} data-part="choice-focus">
              {CHOICES.map((_, i) => (
                <span key={i} className={s.badGhostBtn}>
                  {i === 1 ? '선택지가 열릴 자리' : ''}
                </span>
              ))}
            </div>
          )}
          {x.phase !== 'closed' ? (
            <div className={s.badPanel} onClick={clickPanel}>
              {/* 해설 5번: 통째로 기운 패널의 오른쪽 모서리 (선택지 번호와 겹치지 않게 아래쪽 작은 영역) */}
              <span className={s.badCorner} data-part="frame-skew" />
              <p className={s.badBody}>
                <span data-part="speaker-tag">{speaker.name}: </span>
                <span ref={shownRef} />
                <span ref={hiddenRef} className={s.hidden} />
              </p>
              <span className={s.badNext} data-part="next-indicator" />
            </div>
          ) : (
            <div className={s.badPanel} data-empty onClick={clickPanel}>
              <span className={s.badCorner} data-part="frame-skew" />
              <span data-part="speaker-tag" />
              <span data-part="next-indicator" />
            </div>
          )}
        </div>
      </div>
    )
  }

  // 키캡 글씨 = 크기 × 0.44 → 50 이상이어야 22px 최소 기준을 넘는다
  const glyph = portrait ? 56 : 50
  const showCtlGlyph = device !== 'touch'
  const lastIdx = x.entries.length - 1

  return (
    <div {...common} data-good>
      {scene}

      <div className={s.location}>
        <b>궤도 정비 기지</b>
        <span>격납고 B</span>
      </div>

      {/* 읽는 속도는 플레이어가 정한다: 자동 · 빨리감기 · 기록 */}
      <div className={s.controls} data-part="reading-controls">
        <button type="button" tabIndex={-1} className={s.ctl} data-on={x.auto || undefined} onMouseDown={keepStageFocus} onClick={toggleAuto} aria-pressed={x.auto}>
          <svg className={s.ctlIcon} viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M17.5 3v4.5H13M6.5 21v-4.5H11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          자동
          <span className={s.ctlState}>{x.auto ? '켬' : '끔'}</span>
          {showCtlGlyph && <Glyph act="auto" device={device} size={glyph} />}
          <i ref={autoFillRef} className={s.ctlFill} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={s.ctl}
          data-on={x.ff || undefined}
          onMouseDown={keepStageFocus}
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId)
            ffStart(Infinity)
          }}
          onPointerUp={ffEnd}
          onPointerCancel={ffEnd}
        >
          <svg className={s.ctlIcon} data-ff={x.ff || undefined} viewBox="0 0 24 24" aria-hidden>
            <path d="M3 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor" />
          </svg>
          빨리감기
          {showCtlGlyph && <Glyph act="ff" device={device} size={glyph} />}
        </button>
        <button type="button" tabIndex={-1} className={s.ctl} data-on={x.log || undefined} onMouseDown={keepStageFocus} onClick={toggleLog}>
          <svg className={s.ctlIcon} viewBox="0 0 24 24" aria-hidden>
            <path d="M5 5h14M5 10h14M5 15h9M5 20h6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          기록
          {showCtlGlyph && <Glyph act="log" device={device} size={glyph} />}
        </button>
      </div>

      {x.toast.seq > 0 && (
        <div key={x.toast.seq} className={s.toast} data-tone={x.toast.tone} role="status">
          {x.toast.text}
        </div>
      )}

      <div className={s.stack}>
        <div className={s.choiceArea}>
          {choicesOpen ? (
            <div key={x.choiceSeq} ref={choicesRef} className={s.choices} role="listbox" aria-label="선택지">
              <div className={s.timer} data-on={x.timerTotal > 0 || undefined} aria-hidden={x.timerTotal <= 0}>
                <svg className={s.hourglass} viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <span className={s.timerTrack}>
                  <i ref={timerFillRef} className={s.timerFill} />
                </span>
              </div>
              {CHOICES.map((c, i) => {
                const focus = i === x.focus
                return (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    role="option"
                    aria-selected={focus}
                    className={s.choice}
                    data-focus={focus || undefined}
                    data-action={c.action || undefined}
                    data-chosen={(x.phase === 'confirmed' && i === x.chosen) || undefined}
                    data-flash={(x.phase === 'confirmed' && i === x.chosen && x.flashOk) || undefined}
                    data-dim={(x.phase === 'confirmed' && i !== x.chosen) || undefined}
                    style={{ '--i': i } as CSSProperties}
                    onMouseDown={keepStageFocus}
                    onPointerEnter={e => hoverChoice(e, i)}
                    onClick={() => clickChoice(i)}
                  >
                    <span className={s.choiceFrame} />
                    {/* 해설 3번은 글자를 가리지 않게 ▶ 표시 자리(왼쪽 끝)에 붙인다 */}
                    <span className={s.choiceMarkSlot} data-part={focus ? 'choice-focus' : undefined} aria-hidden>
                      <span className={s.choiceMark} />
                    </span>
                    <span className={s.choiceText}>{c.action ? `( ${c.text} )` : c.text}</span>
                    {x.timerTotal > 0 && i === DEFAULT_CHOICE && <span className={s.defaultTag}>시간 초과 시</span>}
                    {focus && (
                      <span key={x.nudgeSeq} className={s.confirmGlyph} data-nudge={x.nudgeSeq > 0 || undefined}>
                        <Glyph act="advance" device={device} size={glyph} />
                        <i className={s.lockBar} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            // 닫혀 있을 때도 '선택지가 열릴 자리'를 흐리게 보여 준다 — 해설 3번이 허공을 가리키지 않게
            <div className={s.choiceGhost}>
              <div className={s.ghostCaption}>
                선택지가 열릴 자리
                <button type="button" tabIndex={-1} className={s.ghostJump} onMouseDown={keepStageFocus} onClick={() => jumpToChoices()}>
                  지금 열기
                </button>
              </div>
              {CHOICES.map((_, i) => (
                <div key={i} className={s.ghostRow} aria-hidden>
                  <span className={s.choiceFrame} />
                  {i === 0 && (
                    <span className={s.choiceMarkSlot} data-part="choice-focus">
                      <span className={s.choiceMark} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div key={x.convSeq} className={s.panelWrap}>
          {layout === 'side' && (
            <div key={speakerKey} className={s.bust}>
              <span className={s.bustPlate} />
              <span className={s.bustClip}>
                <Portrait who={line.who} unknown={line.unknown} variant="bust" className={s.bustArt} />
              </span>
            </div>
          )}
          <div className={s.panel} onClick={clickPanel}>
            <span className={s.frame} />
            <span className={s.edge} data-part="frame-skew" />
            <div className={s.tagRow} data-part="speaker-tag">
              {layout === 'tag-icon' && (
                <span key={speakerKey} className={s.face}>
                  <Portrait who={line.who} unknown={line.unknown} variant="icon" className={s.faceArt} />
                </span>
              )}
              <span key={`t${speakerKey}`} className={s.tag} data-unknown={line.unknown || undefined}>
                <span className={s.tagFrame} />
                <b>{speaker.name}</b>
                <small>{speaker.role}</small>
              </span>
            </div>
            <p className={s.body}>
              <span ref={shownRef} />
              <span ref={hiddenRef} className={s.hidden} />
            </p>
            <span className={s.next} data-part="next-indicator">
              <i className={s.nextArrow} />
              <Glyph act="advance" device={device} size={glyph} />
            </span>
          </div>
        </div>
      </div>

      {/* 무대에 포커스가 없을 때만 보이는 안내 (CSS :focus-within), 3초 뒤 흐려진다 */}
      {!p.thumbnail && device !== 'touch' && (
        <div className={s.focusHint} aria-hidden>
          무대를 클릭하면 키보드로 조작 — <KeyCap label="↵" size={50} /> 넘기기 · <KeyCap label="↑↓" size={52} /> 선택
        </div>
      )}

      {x.phase === 'closed' && (
        <div className={s.closedHint}>
          대화 종료
          <Glyph act="advance" device={device} size={glyph} />
          처음부터 다시 듣기
        </div>
      )}

      {x.log && (
        <div className={s.logScrim} onClick={toggleLog}>
          <div className={s.log} role="dialog" aria-label="대화 기록" onClick={e => e.stopPropagation()}>
            <header className={s.logHead}>
              <b>대화 기록</b>
              <span className={s.pauseChip}>
                <i aria-hidden />
                대화 일시정지 중
              </span>
              <span className={s.logClose}>
                {device !== 'touch' && <Glyph act="log" device={device} size={glyph} />}
                닫기
              </span>
            </header>
            <div className={s.logList} ref={logListRef}>
              <p className={s.logScene}>이전 장면 · 정비 구역</p>
              {PREVIOUS.map((e, i) => (
                <LogRow key={`p${i}`} e={toEntry(e)} old />
              ))}
              <p className={s.logScene}>지금 장면 · 격납고 B</p>
              {x.entries.map((e, i) => (
                <LogRow key={i} e={e} now={i === lastIdx && x.phase !== 'closed'} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LogRow({ e, now, old }: { e: Entry; now?: boolean; old?: boolean }) {
  if (e.who === 'me') {
    return (
      <div className={s.logMine}>
        <span className={s.logMineLabel}>나의 선택</span>
        <span>{e.action ? `( ${e.text} )` : e.text}</span>
      </div>
    )
  }
  const sp = e.unknown ? { name: '???', role: '무전' } : SPEAKERS[e.who]
  return (
    <div className={s.logEntry} data-now={now || undefined} data-old={old || undefined}>
      <span className={s.logIcon}>
        <Portrait who={e.who} unknown={e.unknown} variant="icon" className={s.faceArt} />
      </span>
      <span className={s.logWho}>
        {sp.name}
        <small>{sp.role}</small>
        {now && <em>지금</em>}
      </span>
      <span className={s.logText}>{e.text}</span>
    </div>
  )
}
