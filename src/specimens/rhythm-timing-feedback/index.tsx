import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { prefersReducedMotion, requestFlash } from '../../core/flash'
import { clamp, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import type { SpecimenProps } from '../../core/types'
import { BeatSynth, GRADE_SCORE, HIT, SongClock, attachTap, grade, robustMean, jitter, notesBetween, windowsFrames, windowsMs, type Grade, type Note, type Windows } from './model'
import s from './style.module.css'

export { meta } from './meta'

const LANE_W = 150
const TOP = 120
const JUDGE_Y = 800
const NOTE_H = 30
const NOTE_POOL = 40
const BAR_POOL = 6
const TICK_POOL = 16
const CALIB_TAPS = 8
const MANUAL_PAUSE = 6000
/** 처음 화면에서도 노트가 이미 내려오고 있게 짧은 준비 시간 */
const START = -0.75
/** 레인 키 — 갤러리 단축키 J 와 겹치므로 '무대에 포커스가 있을 때만' 가로챈다 */
const LANE_KEYS: Record<number, string[]> = {
  2: ['KeyF', 'KeyJ'],
  3: ['KeyF', 'KeyJ', 'KeyK'],
  4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
}
const GLYPH: Record<Grade, string> = {
  perfect: '◆',
  great: '●',
  good: '▲',
  miss: '✕',
  lost: '○',
}
const LABEL: Record<Grade, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
  lost: '놓침',
}

type Forced = 'early' | 'late' | 'skip'
interface Stats {
  perfect: number
  great: number
  good: number
  miss: number
  lost: number
  combo: number
  max: number
  score: number
  count: number
}
interface Calib {
  beat0: number
  /** 다음 탭을 붙일 박 */
  attach: number
  kept: boolean[]
  next: number
  taps: number[]
  bot: boolean
  done: boolean
  mean: number
  sd: number
  doneAt: number
}
interface Sim {
  t: number
  version: number
  clock: SongClock
  synth: BeatSynth | null
  sound: boolean
  phase: 'play' | 'calib' | 'fail'
  phaseAt: number
  chartFrom: number
  missCursor: number
  judged: Map<number, Grade>
  botDone: Set<number>
  forced: Map<number, Forced>
  stats: Stats
  life: number
  last: { g: Grade; err: number; at: number } | null
  meter: { err: number; g: Grade }[]
  offset: number
  calib: Calib | null
  lastCalibAt: number
  /** 나쁜 예의 시계: 프레임 시간(dt)을 더해 간다 (Time.time 식) */
  frameT: number
  badY: Map<number, { lane: number; y: number }>
  /** 나쁜 예: 키 입력은 다음 프레임에서야 처리한다 */
  queue: { lane: number; due: number }[]
  frameDur: number
  lastFrame: number
  fps: number
  fpsAt: number
  hitchUntil: number
  hitchAcc: number
  humanAt: number
  schedUntil: number
  beam: number[]
  press: number[]
  note: { text: string; bad: boolean; until: number } | null
  beatIdx: number
}

const freshStats = (): Stats => ({
  perfect: 0,
  great: 0,
  good: 0,
  miss: 0,
  lost: 0,
  combo: 0,
  max: 0,
  score: 0,
  count: 0,
})

function initSim(thumb: boolean): Sim {
  const pos = thumb ? 4.56 : START
  const S: Sim = {
    t: 0,
    version: 0,
    clock: new SongClock(pos),
    synth: null,
    sound: false,
    phase: 'play',
    phaseAt: 0,
    chartFrom: 0,
    missCursor: -1,
    judged: new Map(),
    botDone: new Set(),
    forced: new Map(),
    stats: freshStats(),
    life: 100,
    last: null,
    meter: [],
    offset: 0,
    calib: null,
    lastCalibAt: -99,
    frameT: pos,
    badY: new Map(),
    queue: [],
    frameDur: 1 / 60,
    lastFrame: 0,
    fps: 60,
    fpsAt: 0,
    hitchUntil: 0,
    hitchAcc: 0,
    humanAt: -1e9,
    schedUntil: pos,
    beam: [-9, -9, -9, -9],
    press: [-9, -9, -9, -9],
    note: null,
    beatIdx: -99,
  }
  if (thumb) {
    // 썸네일: 한 곡을 잘 치고 있는 정지 화면
    S.stats = {
      perfect: 17,
      great: 5,
      good: 1,
      miss: 0,
      lost: 0,
      combo: 23,
      max: 23,
      score: 17 + 3.5 + 0.4,
      count: 23,
    }
    S.last = { g: 'great', err: -0.052, at: 0 }
    S.meter = Array.from({ length: 14 }, (_, i) => ({
      err: jitter(i + 3) * 0.045,
      g: 'perfect' as Grade,
    }))
    S.life = 92
    S.t = 0.1
    for (const n of notesBetween(0, pos, 100, 4)) S.judged.set(n.id, 'perfect')
  }
  return S
}

/**
 * 박자 표시 · 판정 피드백.
 * 노트 위치 · 판정 · 소리 예약이 모두 곡 시계 하나(AudioContext.currentTime, 소리가 꺼져 있으면 performance.now)에서 나온다.
 * 나쁜 예는 노트를 프레임마다 y += 속도 × dt 로 움직이고, 판정 창을 프레임 수로 잡는다.
 */
export default function RhythmTimingFeedback(p: SpecimenProps) {
  const juice = p.juice
  const bpm = num(p.params, 'bpm', 100)
  const lanes = clamp(Math.round(num(p.params, 'laneCount', 4)), 2, 4)
  const approach = num(p.params, 'approachMs', 1300) / 1000
  const perfectMs = num(p.params, 'perfectMs', 40)
  const lenient = bool(p.params, 'lenient', false)
  const timingDisplay = str(p.params, 'timingDisplay', 'label')
  const showWindows = bool(p.params, 'showWindows', true)
  const latency = num(p.params, 'deviceLatencyMs', 0) / 1000
  const reduced = prefersReducedMotion()
  const ts = Math.max(0.05, p.timeScale)
  const cfg = {
    juice,
    bpm,
    lanes,
    approach,
    perfectMs,
    lenient,
    latency,
    reduced,
    ts,
    autoplay: p.autoplay && !p.thumbnail,
  }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(p.thumbnail)
  const S = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(S.version)
  const sync = () => {
    if (S.version !== shown.current && performance.now() >= S.hitchUntil) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const touch = () => S.version++
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 3 }
    touch()
  }
  const rootRef = useRef<HTMLDivElement>(null)

  /* ───── 시계 · 판정 ───── */
  const beatSec = () => 60 / cfgRef.current.bpm
  const notes = (t0: number, t1: number): Note[] => {
    const c = cfgRef.current
    return notesBetween(Math.max(t0, S.chartFrom), t1, c.bpm, c.lanes)
  }
  /** 지금 판정 창(초). 나쁜 예는 '프레임 수' 라 주사율 · 배속에 따라 달라진다 */
  const win = (): Windows => {
    const c = cfgRef.current
    if (c.juice) return windowsMs(c.perfectMs, c.lenient)
    const w = windowsFrames(S.frameDur * c.ts)
    const k = c.lenient ? 1.5 : 1
    return { perfect: w.perfect * k, great: w.great * k, good: w.good * k }
  }
  /** 좋은 예의 판정 시계 = 곡 위치 − 오프셋. 나쁜 예 = 프레임 누적 시간 */
  const judgeClock = () => (cfgRef.current.juice ? S.clock.pos() - S.offset : S.frameT)

  const record = (n: Note, g0: Grade, err: number) => {
    const c = cfgRef.current
    const g: Grade = g0 === 'miss' && c.lenient ? 'lost' : g0
    S.judged.set(n.id, g)
    const st = S.stats
    st[g]++
    st.count++
    if (HIT.includes(g)) {
      st.combo++
      st.max = Math.max(st.max, st.combo)
      st.score += GRADE_SCORE[g]
      S.life = Math.min(100, S.life + (g === 'perfect' ? 2 : g === 'great' ? 1 : 0))
      S.meter.push({ err, g })
      if (S.meter.length > TICK_POOL) S.meter.shift()
      if (c.juice && !c.reduced && requestFlash()) S.beam[n.lane] = S.t
    } else if (g === 'miss') {
      st.combo = 0
      S.life -= 10
      if (S.life <= 0) {
        S.life = 0
        S.phase = 'fail'
        S.phaseAt = S.t
        note('생명 0 — 공연 중단. 2초 뒤 처음부터', true)
      }
    }
    S.last = { g, err, at: S.t }
    touch()
  }
  /** 레인 하나의 판정: 창 안에서 가장 가까운 미판정 노트. 창 밖이면 아무 일도 없다 (빈 탭) */
  const judgeAt = (lane: number, t: number) => {
    const w = win()
    let best: Note | null = null
    for (const n of notes(t - w.good, t + w.good)) {
      if (n.lane !== lane || S.judged.has(n.id)) continue
      if (!best || Math.abs(n.t - t) < Math.abs(best.t - t)) best = n
    }
    if (best) record(best, grade(t - best.t, w) ?? 'good', t - best.t)
  }

  /** 입력 하나. songT = 이 입력이 '일어난' 곡 시각 (사람: 이벤트 시각 + 모형 기기 지연, 자동 연주: 정한 시각) */
  const press = (lane: number, songT: number, fromBot: boolean) => {
    const c = cfgRef.current
    S.press[lane] = S.t
    if (S.phase === 'calib') return calibTap(songT)
    if (S.phase !== 'play') return
    if (c.juice) judgeAt(lane, songT - S.offset)
    else if (fromBot) judgeAt(lane, S.frameT)
    else S.queue.push({ lane, due: performance.now() + c.latency * 1000 }) // 흔한 실수: Update 에서 다음 프레임 시각으로 판정
    touch()
  }

  /* ───── 오프셋 측정 (탭 테스트) ───── */
  const startCalib = (bot: boolean) => {
    if (S.phase === 'fail') restart()
    const pos = S.clock.pos()
    const b = beatSec()
    const beat0 = Math.ceil(pos / b) + 1
    S.phase = 'calib'
    S.calib = {
      beat0,
      next: beat0,
      attach: beat0,
      kept: [],
      taps: [],
      bot,
      done: false,
      mean: 0,
      sd: 0,
      doneAt: 0,
    }
    S.chartFrom = Infinity
    S.badY.clear()
    S.forced.clear()
    S.lastCalibAt = S.t
    note(bot ? '탭 테스트 — 자동 연주가 박자에 맞춰 8번 누른다' : `박자 불빛(소리)에 맞춰 레인 키나 화면을 ${CALIB_TAPS}번`)
  }
  const resumeChart = () => {
    const c = cfgRef.current
    S.phase = 'play'
    S.chartFrom = Math.max(S.clock.pos(), S.frameT) + c.approach + 0.3
    S.missCursor = Math.max(S.missCursor, S.chartFrom - 1)
    touch()
  }
  const calibTap = (songT: number) => {
    const k = S.calib
    if (!k || k.done) return
    const r = attachTap(songT, k.attach, beatSec())
    if (!r) return
    k.attach = r.next
    k.taps.push(r.err)
    if (k.taps.length >= CALIB_TAPS) finishCalib()
    touch()
  }
  const finishCalib = () => {
    const k = S.calib
    if (!k) return
    const r = robustMean(k.taps)
    k.mean = r.mean
    k.sd = r.sd
    k.kept = r.kept
    k.done = true
    k.doneAt = S.t
    const out = r.kept.filter(x => !x).length
    note(`측정 끝 — 평균 ${fmtMs(k.mean)} · 흩어짐 ±${Math.round(k.sd * 1000)} ms${out ? ` · 튀는 탭 ${out}개 제외` : ''}`)
    resumeChart()
  }
  const applyCalib = () => {
    const k = S.calib
    if (!k?.done) return
    if (!cfgRef.current.juice) {
      k.bot = false
      note('⚠ 보정 없음 — 측정만 하고 판정에는 쓰지 않는다', true)
      return
    }
    S.offset = k.mean
    S.calib = null
    note(`입력 오프셋 ${fmtMs(S.offset)} 적용 — 판정 중심이 그만큼 늦게`)
  }
  const cancelCalib = () => {
    if (S.phase === 'calib') {
      S.calib = null
      note('탭 테스트 그만')
      resumeChart()
    }
  }

  /* ───── 소리 ───── */
  const hush = () => {
    if (S.synth) S.synth.cancelAfter(S.synth.ctx.currentTime)
    S.schedUntil = S.clock.pos()
  }
  const toggleSound = async () => {
    if (S.sound) {
      S.sound = false
      hush()
      S.clock.useAudio(null)
      void S.synth?.ctx.suspend()
      note('소리 끔 — 기준 시계: performance.now()')
      sync()
      return
    }
    try {
      if (!S.synth) S.synth = new BeatSynth()
      // 사용자 조작 안에서만 풀린다. 브라우저가 막으면 resume 이 끝나지 않을 수 있어 1초만 기다린다
      await Promise.race([S.synth.ctx.resume(), new Promise(r => setTimeout(r, 1000))])
      if (S.synth.ctx.state !== 'running') throw new Error('suspended')
    } catch {
      note('이 브라우저에서는 소리를 낼 수 없다', true)
      sync()
      return
    }
    S.clock.useAudio(S.synth.ctx)
    S.sound = true
    S.schedUntil = S.clock.pos()
    note('소리 켬 — 기준 시계: AudioContext.currentTime')
    sync()
  }
  /** 곡 앞으로 0.15초 분량의 소리를 미리 예약한다 (Unity: AudioSource.PlayScheduled) */
  const schedule = (pos: number) => {
    const sy = S.synth
    if (!S.sound || !sy || S.clock.paused) return
    const horizon = pos + 0.15 * S.clock.rate
    if (horizon <= S.schedUntil) return
    const half = beatSec() / 2
    const now = sy.ctx.currentTime
    for (let k = Math.floor(S.schedUntil / half) + 1; k * half <= horizon; k++) {
      const at = S.clock.toRaw(k * half)
      if (at < now) continue
      const down = (((k / 2) % 4) + 4) % 4 === 0
      if (S.phase === 'calib') {
        if (k % 2 === 0) sy.click(at, down)
      } else if (k % 2 === 0) sy.kick(at, down)
      else sy.hat(at)
    }
    if (S.phase === 'play')
      for (const n of notes(S.schedUntil + 1e-6, horizon)) {
        const at = S.clock.toRaw(n.t)
        if (at >= now) sy.pluck(at, n.lane)
      }
    S.schedUntil = horizon
  }

  /* ───── 처음부터 ───── */
  const restart = () => {
    S.clock.seek(START)
    S.frameT = START
    S.judged.clear()
    S.botDone.clear()
    S.forced.clear()
    S.badY.clear()
    S.queue = []
    S.stats = freshStats()
    S.life = 100
    S.last = null
    S.meter = []
    S.phase = 'play'
    if (S.calib && !S.calib.done) S.calib = null
    S.chartFrom = 0
    S.missCursor = -1
    hush()
    touch()
  }

  /* ───── 사람 입력 ───── */
  const human = () => {
    S.humanAt = performance.now()
    if (S.calib?.bot) S.calib.bot = false // 사람이 넘겨받았다
  }
  const humanPress = (lane: number, timeStamp: number) => {
    human()
    if (S.clock.paused) {
      note('정지 중 — 입력을 판정하지 않는다')
      sync()
      return
    }
    const c = cfgRef.current
    press(lane, S.clock.posAt(timeStamp) + c.latency, false)
    sync()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (p.thumbnail || e.ctrlKey || e.metaKey || e.altKey) return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    const lane = LANE_KEYS[cfgRef.current.lanes].indexOf(e.code)
    if (lane < 0) return // Space · 1~9 · S · A · H 등은 갤러리로 흘려보낸다
    e.preventDefault()
    e.stopPropagation() // 무대에 포커스가 있을 때만 J 를 레인으로 쓴다 — 갤러리 '효과 끄기' 로 가지 않게
    if (e.repeat) return
    humanPress(lane, e.nativeEvent.timeStamp)
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || (e.target as Element).closest('button')) return
    const r = rootRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const x = ((e.clientX - r.left) * p.width) / r.width
    const y = ((e.clientY - r.top) * p.height) / r.height
    const c = cfgRef.current
    const left = 960 - (c.lanes * LANE_W) / 2
    const lane = Math.floor((x - left) / LANE_W)
    if (lane >= 0 && lane < c.lanes && y > TOP && y < 940) humanPress(lane, e.nativeEvent.timeStamp)
    else if (S.phase === 'calib') humanPress(0, e.nativeEvent.timeStamp)
  }
  const keepStageFocus = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    rootRef.current?.focus({ preventScroll: true })
  }
  const button = (fn: () => void) => () => {
    human()
    fn()
    sync()
  }

  /* ───── 이벤트 ───── */
  /** 이벤트 '일부러 이르게 · 늦게' 의 어긋남 — 지금 GREAT 창과 GOOD 창 사이라 늘 GOOD + EARLY/LATE 가 된다 */
  const nudge = () => {
    const w = win()
    return (w.great + w.good) / 2
  }
  const force = (kind: Forced, text: string) => {
    if (S.phase === 'calib') cancelCalib()
    if (S.phase === 'fail') restart()
    const pos = S.clock.pos()
    const next = notes(pos + 0.25, pos + 8).filter(n => !S.judged.has(n.id) && !S.botDone.has(n.id))
    const times = [...new Set(next.map(n => n.t))].slice(0, 4)
    for (const n of next) if (times.includes(n.t)) S.forced.set(n.id, kind)
    note(text)
  }
  useTrigger(p.trigger, id => {
    if (id === 'early') force('early', `다음 노트 4개를 ${Math.round(nudge() * 1000)} ms 이르게 친다 (GREAT 창과 GOOD 창 사이)`)
    else if (id === 'late') force('late', `다음 노트 4개를 ${Math.round(nudge() * 1000)} ms 늦게 친다 (GREAT 창과 GOOD 창 사이)`)
    else if (id === 'miss') force('skip', '다음 노트 4개를 놓친다')
    else if (id === 'hitch') {
      if (!p.playing) {
        note('정지 중 — 재생한 뒤에 끊김을 흉내 낼 수 있다')
        sync()
        return
      }
      S.hitchUntil = performance.now() + 500
      S.hitchAcc = 0
      note('프레임 끊김 0.5초 흉내 — 그동안 화면을 갱신하지 않는다')
      setVersion(++S.version)
      shown.current = S.version
      return
    } else if (id === 'calibrate') startCalib(true)
    else if (id === 'restart') {
      restart()
      note('처음부터 — 오프셋은 설정이라 그대로 둔다')
    }
    sync()
  })

  /* ───── 설정 변화 ───── */
  // 일시정지 · 탭 숨김: 곡 시계를 멈추고, 예약한 소리를 거둔다
  useEffect(() => {
    const apply = () => {
      if (p.playing && !p.thumbnail && !document.hidden) S.clock.resume()
      else S.clock.pause()
      hush()
    }
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => document.removeEventListener('visibilitychange', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.playing, p.thumbnail])
  // 배속: 좋은 예는 곡 재생 속도 자체를 바꾼다(연습 모드). 나쁜 예는 Time.timeScale 처럼 프레임 시간만 느려지고 음악은 1배
  const lastJuice = useRef(juice)
  useEffect(() => {
    hush()
    S.clock.setRate(juice ? ts : 1)
    if (lastJuice.current !== juice) {
      lastJuice.current = juice
      S.frameT = S.clock.pos()
      S.badY.clear()
      S.queue = []
      S.missCursor = judgeClock() - win().good
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts, juice])
  // BPM · 레인 수가 바뀌면 채보가 바뀌므로 처음부터
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!p.thumbnail) restart()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, lanes])
  useEffect(
    () => () => {
      void S.synth?.ctx.close()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /* ───── 매 프레임 ───── */
  const step = (dBad: number) => {
    const c = cfgRef.current
    const pos = S.clock.pos()
    const b = beatSec()
    // 나쁜 예의 노트: 나타날 때 맨 위에 두고, 프레임마다 y += 속도 × dt
    if (!c.juice) {
      const speed = (JUDGE_Y - TOP) / c.approach
      for (const [id, n] of S.badY) {
        n.y += speed * dBad
        if (n.y > JUDGE_Y + 260) S.badY.delete(id)
      }
      if (S.phase === 'play')
        for (const n of notes(S.frameT - 0.3, S.frameT + c.approach))
          if (!S.badY.has(n.id) && n.t - S.frameT > -0.3) {
            const late = S.frameT - (n.t - c.approach)
            S.badY.set(n.id, {
              lane: n.lane,
              y: late < 0.05 ? TOP : JUDGE_Y - ((n.t - S.frameT) / c.approach) * (JUDGE_Y - TOP),
            })
          }
      const now = performance.now()
      S.queue = S.queue.filter(q => {
        if (q.due > now) return true
        judgeAt(q.lane, S.frameT)
        return false
      })
    }
    // 자동 연주 — 음악(곡 시계)을 듣고 친다. 사람이 6초 안에 손댔으면 쉰다 (이벤트로 정한 노트는 친다)
    const botOn = c.autoplay && performance.now() - S.humanAt > MANUAL_PAUSE
    if (S.phase === 'play') {
      for (const n of notes(pos - 1, pos + 0.4)) {
        // 0.5초 끊김 뒤에도 그동안 친 노트를 놓치지 않게 1초 뒤까지
        if (S.botDone.has(n.id) || S.judged.has(n.id)) continue
        const f = S.forced.get(n.id)
        const wander = 0.025 * Math.sin(n.t * 0.45)
        const slip = Math.abs(jitter(n.id * 7)) > 0.9 ? Math.sign(jitter(n.id * 3)) * 0.05 : 0
        const mod = f === 'early' ? -nudge() : f === 'late' ? nudge() : wander + slip
        // 이벤트로 정한 노트는 판정 중심(곡 시각 + 오프셋) ± nudge 에 친다 — 보정 전후 모두 GOOD + EARLY/LATE
        const tap = f ? n.t + (c.juice ? S.offset : 0) + mod + jitter(n.id) * 0.006 : n.t + c.latency + mod + jitter(n.id) * 0.014
        if (tap > pos) continue
        S.botDone.add(n.id)
        if (f === 'skip' || (!botOn && !f)) continue
        press(n.lane, tap, true)
      }
    } else if (S.phase === 'calib' && S.calib && !S.calib.done && S.calib.bot) {
      const k = S.calib
      const tap = k.next * b + c.latency + jitter(k.next) * 0.012
      if (tap <= pos) {
        k.next++
        press(0, tap, true)
      }
    }
    // 창을 지나간 노트 = MISS (관대한 판정: 놓침)
    if (S.phase === 'play') {
      const limit = judgeClock() - win().good
      if (limit > S.missCursor) {
        for (const n of notes(S.missCursor + 1e-6, limit)) if (!S.judged.has(n.id)) record(n, 'miss', 0)
        S.missCursor = limit
      }
    }
    // 단계 타이머
    if (S.phase === 'fail' && S.t - S.phaseAt > 2) restart()
    if (S.phase === 'calib' && S.calib && pos > (S.calib.beat0 + 16) * b) {
      if (S.calib.taps.length >= 4) finishCalib()
      else {
        S.calib = null
        note('탭이 모자라 측정 취소', true)
        resumeChart()
      }
    }
    if (S.calib?.done && S.calib.bot && S.t - S.calib.doneAt > 1.4) applyCalib()
    if (S.calib?.done && !c.juice && S.t - S.calib.doneAt > 6) S.calib = null
    // 자동 데모: 기기 지연이 보정되지 않았으면 탭 테스트를 한다
    if (botOn && S.phase === 'play' && !S.calib && Math.abs(c.latency - S.offset) > 0.05 && S.t - S.lastCalibAt > 14 && pos > 5) startCalib(true)
    schedule(pos)
    // 정리
    if (S.judged.size > 400) {
      const minId = Math.floor((pos - 4) / (30 / c.bpm)) * 4
      for (const id of S.judged.keys()) if (id < minId) S.judged.delete(id)
      for (const id of S.botDone) if (id < minId) S.botDone.delete(id)
      for (const id of S.forced.keys()) if (id < minId) S.forced.delete(id)
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
  }

  useGameLoop(p.playing && !p.thumbnail, p.timeScale, dt => {
    const now = performance.now()
    const real = S.lastFrame ? Math.min(0.25, (now - S.lastFrame) / 1000) : 1 / 60
    S.lastFrame = now
    // 프레임 끊김 흉내: 이 동안은 아무것도 처리 · 그리지 않는다 (실제로 멈추지는 않는다)
    if (now < S.hitchUntil) {
      S.hitchAcc += real
      return
    }
    let dBad = dt
    if (S.hitchAcc > 0) {
      // 끊김 뒤 첫 프레임 — 엔진은 dt 를 0.1초로 자른다(Unity 는 maximumDeltaTime). 프레임 시계는 나머지를 잃는다
      dBad = Math.min(0.1, S.hitchAcc + real) * cfgRef.current.ts
      S.hitchAcc = 0
      const lost = Math.round((S.clock.pos() - (S.frameT + dBad)) * 1000)
      note(cfgRef.current.juice ? '끊김 뒤 — 노트가 곡 위치로 바로 돌아온다 (한 시계)' : `⚠ 끊김 뒤 — 노트가 음악보다 ${lost} ms 뒤처졌다 (프레임 시계)`, !cfgRef.current.juice)
    } else S.frameDur = S.frameDur * 0.95 + real * 0.05
    S.t += dt
    S.frameT += dBad
    step(dBad)
    paint()
    sync()
  })

  /* ───── 그리기 (매 프레임 DOM 직접) ───── */
  const noteEls = useRef<(HTMLDivElement | null)[]>([])
  const barEls = useRef<(HTMLDivElement | null)[]>([])
  const tickEls = useRef<(HTMLDivElement | null)[]>([])
  const beamEls = useRef<(HTMLDivElement | null)[]>([])
  const keyEls = useRef<(HTMLDivElement | null)[]>([])
  const lampEls = useRef<(HTMLSpanElement | null)[]>([])
  const judgeLineRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const meanRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const rawRef = useRef<HTMLElement>(null)
  const posRef = useRef<HTMLElement>(null)
  const driftRef = useRef<HTMLElement>(null)
  const driftBarRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLElement>(null)

  const paint = () => {
    const c = cfgRef.current
    const pos = S.clock.pos()
    const b = 60 / c.bpm
    const left = 960 - (c.lanes * LANE_W) / 2
    const dist = JUDGE_Y - TOP
    const yOf = (d: number) => JUDGE_Y - (d / c.approach) * dist
    // 노트 (풀)
    let i = 0
    const put = (lane: number, y: number, missed: boolean) => {
      const el = noteEls.current[i++]
      if (!el) return
      el.style.transform = `translate(${left + lane * LANE_W + 10}px, ${y - NOTE_H / 2}px)`
      el.style.visibility = 'visible'
      el.toggleAttribute('data-inner', lane > 0 && lane < c.lanes - 1)
      el.toggleAttribute('data-miss', missed)
    }
    if (S.phase !== 'calib') {
      if (c.juice) {
        for (const n of notes(pos - 0.35, pos + c.approach)) {
          const g = S.judged.get(n.id)
          if (!g || !HIT.includes(g)) put(n.lane, yOf(n.t - pos), !!g)
        }
      } else
        for (const [id, n] of S.badY) {
          const g = S.judged.get(id)
          if (!g || !HIT.includes(g)) put(n.lane, n.y, !!g)
        }
    }
    for (; i < NOTE_POOL; i++) {
      const el = noteEls.current[i]
      if (el) el.style.visibility = 'hidden'
    }
    // 마디선 — 노트와 같은 시계로
    const clk = c.juice ? pos : S.frameT
    const bar = 4 * b
    let k = Math.max(0, Math.ceil((clk - 0.3) / bar))
    barEls.current.forEach(el => {
      if (!el) return
      const t = k * bar
      const on = S.phase !== 'calib' && t <= clk + c.approach && t >= S.chartFrom
      el.style.visibility = on ? 'visible' : 'hidden'
      if (on) el.style.transform = `translateY(${c.juice ? yOf(t - pos) : yOf(t - S.frameT)}px)`
      k++
    })
    // 박자 — 판정선 맥동 · 박자 불빛은 늘 곡 시계(음악)를 따른다. 한 박에 한 번 = BPM/60 Hz (120 BPM 에서 2Hz)
    const ph = (((pos / b) % 1) + 1) % 1
    const pulse = c.reduced ? 0 : Math.max(0, 1 - ph * 4)
    judgeLineRef.current?.style.setProperty('--pulse', pulse.toFixed(3))
    ringRef.current?.style.setProperty('--pulse', pulse.toFixed(3))
    const beatIdx = Math.floor(pos / b)
    if (beatIdx !== S.beatIdx) {
      S.beatIdx = beatIdx
      const cur = ((beatIdx % 4) + 4) % 4
      lampEls.current.forEach((el, j) => el?.toggleAttribute('data-on', j === cur))
    }
    // 판정 창 띠 — 오프셋을 적용하면 판정 중심이 그만큼 아래(늦게)로 내려간다
    const w = win()
    if (bandRef.current) {
      const center = JUDGE_Y + ((c.juice ? S.offset : 0) / c.approach) * dist
      const px = (sec: number) => `${Math.max(2, (sec / c.approach) * dist * 2)}px`
      bandRef.current.style.top = `${center}px`
      bandRef.current.style.setProperty('--good', px(w.good))
      bandRef.current.style.setProperty('--great', px(w.great))
      bandRef.current.style.setProperty('--perfect', px(w.perfect))
    }
    // 레인 빛 · 키 눌림
    for (let l = 0; l < 4; l++) {
      const be = beamEls.current[l]
      if (be) be.style.opacity = String(Math.max(0, 1 - (S.t - S.beam[l]) / 0.15))
      keyEls.current[l]?.toggleAttribute('data-down', S.t - S.press[l] < 0.09)
    }
    // 판정 문구 — 나타날 때 살짝 커졌다가(0.12초) 0.7초 뒤 사라진다
    const fb = feedbackRef.current
    if (fb) {
      const age = S.last ? S.t - S.last.at : 99
      const op = p.thumbnail ? 1 : age < 0.7 ? 1 : Math.max(0, 1 - (age - 0.7) / 0.25)
      const pop = c.juice && !c.reduced ? 1 + 0.3 * Math.max(0, 1 - age / 0.12) : 1
      fb.style.setProperty('--op', op.toFixed(3))
      fb.style.setProperty('--pop', pop.toFixed(3))
    }
    // 오차 막대 — 최근 16개
    const half = 280
    tickEls.current.forEach((el, j) => {
      if (!el) return
      const m = S.meter[S.meter.length - 1 - j]
      el.style.visibility = m ? 'visible' : 'hidden'
      if (!m) return
      el.style.transform = `translateX(${clamp(m.err / w.good, -1, 1) * half}px) scaleY(${j === 0 ? 1.4 : 1})`
      el.style.opacity = String(Math.max(0.2, 1 - j / TICK_POOL))
      el.dataset.g = m.g
    })
    if (meanRef.current) {
      const mean = S.meter.length ? S.meter.reduce((a, m) => a + m.err, 0) / S.meter.length : 0
      meanRef.current.style.transform = `translateX(${clamp(mean / w.good, -1, 1) * half}px)`
      meanRef.current.dataset.v = fmtMs(mean)
    }
    // 시계 판
    if (rawRef.current) rawRef.current.textContent = `${S.clock.raw().toFixed(3)} s`
    if (posRef.current) {
      const bi = Math.floor(pos / b)
      posRef.current.textContent = pos < 0 ? `${pos.toFixed(2)} s · 준비` : `${pos.toFixed(2)} s · ${Math.floor(bi / 4) + 1}마디 ${(bi % 4) + 1}박`
    }
    const drift = c.juice ? 0 : S.frameT - pos
    if (driftRef.current) driftRef.current.textContent = `${drift >= 0 ? '+' : '−'}${Math.round(Math.abs(drift) * 1000)} ms`
    if (driftBarRef.current) driftBarRef.current.style.transform = `scaleX(${Math.min(1, Math.abs(drift) / 0.5)})`
    if (fpsRef.current && S.t - S.fpsAt > 0.5) {
      S.fpsAt = S.t
      fpsRef.current.textContent = `${Math.round(1 / S.frameDur)} fps`
    }
  }
  useLayoutEffect(() => paint())

  /* ───── 렌더 ───── */
  const left = 960 - (lanes * LANE_W) / 2
  const keys = LANE_KEYS[lanes]
  const st = S.stats
  const acc = st.count ? (st.score / st.count) * 100 : 100
  const w = win()
  const last = S.last
  const timing = juice && last && HIT.includes(last.g) && timingDisplay !== 'off' && (timingDisplay === 'ms' || last.g !== 'perfect') ? (last.err < 0 ? 'early' : 'late') : null
  const timingText = timing ? (timingDisplay === 'ms' ? fmtMs(last!.err) : timing === 'early' ? 'EARLY' : 'LATE') : ''
  const calib = S.calib
  const frameMs = (S.frameDur * 1000).toFixed(1)
  const winLabel = (x: number, f: number) => (juice ? `±${Math.round(x * 1000)} ms` : `±${f}F (${(x * 1000).toFixed(0)} ms)`)

  return (
    <div
      ref={rootRef}
      className={s.root}
      tabIndex={p.thumbnail ? -1 : 0}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-phase={S.phase}
      data-hitch={performance.now() < S.hitchUntil || undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      aria-label="리듬 판정 무대 — 클릭한 뒤 레인 키로 친다"
    >
      {/* ───── 가운데: 레인 ───── */}
      <div className={s.highway} style={{ left, width: lanes * LANE_W }}>
        {Array.from({ length: lanes }, (_, l) => (
          <div key={l} className={s.lane} style={{ left: l * LANE_W }}>
            <div
              className={s.beam}
              ref={el => {
                beamEls.current[l] = el
              }}
            />
          </div>
        ))}
      </div>
      {Array.from({ length: BAR_POOL }, (_, j) => (
        <div
          key={j}
          className={s.barLine}
          style={{ left, width: lanes * LANE_W }}
          ref={el => {
            barEls.current[j] = el
          }}
        />
      ))}
      {Array.from({ length: NOTE_POOL }, (_, j) => (
        <div
          key={j}
          className={s.note}
          ref={el => {
            noteEls.current[j] = el
          }}
        />
      ))}
      <div className={s.judgeLine} ref={judgeLineRef} style={{ left: left - 12, width: lanes * LANE_W + 24, top: JUDGE_Y }} />
      <div
        className={s.band}
        ref={bandRef}
        data-part="windows"
        style={{
          left: left - 12,
          width: lanes * LANE_W + 24,
          visibility: showWindows ? 'visible' : 'hidden',
        }}
      >
        <i data-w="good" />
        <i data-w="great" />
        <i data-w="perfect" />
        <ul className={s.bandLabels}>
          <li data-w="perfect">PERFECT {winLabel(w.perfect, 1)}</li>
          <li data-w="great">GREAT {winLabel(w.great, 2)}</li>
          <li data-w="good">GOOD {winLabel(w.good, 3)}</li>
        </ul>
      </div>
      <div className={s.keys} style={{ left, width: lanes * LANE_W }}>
        {keys.map((k, l) => (
          <div
            key={k}
            className={s.key}
            ref={el => {
              keyEls.current[l] = el
            }}
          >
            <KeyCap label={k.slice(3)} size={56} />
          </div>
        ))}
      </div>
      <div className={s.lamp} aria-label="박자">
        <b>박자</b>
        {[0, 1, 2, 3].map(j => (
          <span
            key={j}
            ref={el => {
              lampEls.current[j] = el
            }}
            data-down={j === 0 || undefined}
          >
            {j + 1}
          </span>
        ))}
      </div>
      <div className={s.ring} ref={ringRef} data-on={S.phase === 'calib' || undefined}>
        <span>박자에 맞춰 탭</span>
        <b>
          {calib?.taps.length ?? 0} / {CALIB_TAPS}
        </b>
      </div>

      {/* 판정 문구 · EARLY/LATE — 글자 + 위치(위 = 이르게, 아래 = 늦게) + 색 */}
      <div className={s.feedback} ref={feedbackRef} data-part="feedback">
        <div className={s.timing} data-t="early" data-on={timing === 'early' || undefined}>
          <span aria-hidden>▲</span> {timing === 'early' ? timingText : 'EARLY'}
        </div>
        <div className={s.word} data-g={last?.g ?? 'none'}>
          {last ? (
            <>
              {juice && <span className={s.glyph}>{GLYPH[last.g]}</span>}
              {LABEL[last.g]}
            </>
          ) : S.clock.pos() < 0 ? (
            '준비'
          ) : (
            ''
          )}
        </div>
        <div className={s.timing} data-t="late" data-on={timing === 'late' || undefined}>
          <span aria-hidden>▼</span> {timing === 'late' ? timingText : 'LATE'}
        </div>
        <div className={s.combo} data-on={st.combo >= 2 || undefined}>
          <b>{st.combo}</b> COMBO
        </div>
      </div>
      <div className={s.meter} style={{ opacity: juice ? 1 : 0 }}>
        <div
          className={s.meterZones}
          style={{
            ['--p' as string]: `${(w.perfect / w.good) * 100}%`,
            ['--g' as string]: `${(w.great / w.good) * 100}%`,
          }}
        />
        {Array.from({ length: TICK_POOL }, (_, j) => (
          <div
            key={j}
            className={s.tick}
            ref={el => {
              tickEls.current[j] = el
            }}
          />
        ))}
        <div className={s.mean} ref={meanRef} />
        <span className={s.meterL}>◀ 이르게</span>
        <span className={s.meterR}>늦게 ▶</span>
      </div>
      <p className={s.hint}>무대를 클릭한 뒤 {keys.map(k => k.slice(3)).join(' ')} · 레인을 눌러도 된다 — 무대 밖에서 J 는 갤러리 '효과 끄기'</p>

      {/* ───── 왼쪽: 곡 시계 ───── */}
      <section className={s.panel} data-part="clock" style={{ top: 40 }}>
        <header>
          <h3>곡 시계</h3>
          <button type="button" tabIndex={-1} className={s.btn} data-on={S.sound || undefined} onMouseDown={keepStageFocus} onClick={() => void toggleSound()} aria-pressed={S.sound}>
            <svg viewBox="0 0 24 24" aria-hidden className={s.icon}>
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {S.sound ? (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </svg>
            {S.sound ? '소리 끄기' : '소리 켜기'}
          </button>
        </header>
        <dl className={s.rows}>
          <dt>기준 시계</dt>
          <dd>
            <code>{S.sound ? 'AudioContext.currentTime' : 'performance.now()'}</code> <small ref={rawRef} />
          </dd>
          <dt>곡 위치</dt>
          <dd ref={posRef} />
          <dt>노트 위치</dt>
          <dd data-bad={!juice || undefined}>{juice ? '(노트 시각 − 곡 위치) ÷ 보이는 시간' : '프레임마다 y += 속도 × dt'}</dd>
          <dt>판정 시각</dt>
          <dd data-bad={!juice || undefined}>{juice ? '입력 이벤트가 일어난 순간' : '다음 프레임에서 (프레임 단위)'}</dd>
          <dt>재생 속도</dt>
          <dd data-bad={(!juice && ts !== 1) || undefined}>{juice ? `곡 ×${ts} · 노트 ×${ts}` : `음악 ×1 · 노트 ×${ts}`}</dd>
          <dt>노트 − 음악</dt>
          <dd className={s.drift} data-bad={!juice || undefined}>
            <b ref={driftRef}>+0 ms</b>
            <span className={s.driftBar}>
              <i ref={driftBarRef} />
            </span>
          </dd>
          <dt>화면 갱신</dt>
          <dd>
            <span ref={fpsRef}>60 fps</span> <small>실측 · 1프레임 {frameMs} ms</small>
          </dd>
        </dl>
      </section>

      {/* ───── 왼쪽 아래: 오프셋 보정 ───── */}
      <section className={s.panel} data-part="calib" style={{ top: 590 }} data-bad={!juice || undefined}>
        <header>
          <h3>입력 오프셋 보정</h3>
          <b className={s.offset}>{juice ? fmtMs(S.offset) : '보정 없음'}</b>
        </header>
        <div className={s.ruler}>
          <span className={s.zero} />
          {(calib?.taps ?? []).map((x, j) => (
            <i key={j} data-out={(calib?.done && !calib.kept[j]) || undefined} style={{ left: `${50 + clamp(x / 0.2, -1, 1) * 50}%` }} />
          ))}
          {calib?.done && <em style={{ left: `${50 + clamp(calib.mean / 0.2, -1, 1) * 50}%` }} />}
          <small data-x="l">−200</small>
          <small data-x="c">0 ms</small>
          <small data-x="r">+200</small>
        </div>
        <p className={s.status}>
          {calib?.done
            ? `평균 ${fmtMs(calib.mean)} · 흩어짐 ±${Math.round(calib.sd * 1000)} ms${juice ? '' : ' — 나쁜 예: 적용 안 함'}`
            : calib
              ? `${calib.taps.length} / ${CALIB_TAPS} — 박자 불빛(소리)에 맞춰 누른다${calib.bot ? ' (자동)' : ''}`
              : latency > 0
                ? `모형 기기 지연 ${Math.round(latency * 1000)} ms — 입력이 이만큼 늦게 도착한다`
                : '박자에 맞춰 8번 눌러 평균 오차를 잰다'}
        </p>
        <div className={s.btnRow}>
          {calib?.done ? (
            <>
              <button type="button" tabIndex={-1} className={s.btn} data-primary disabled={!juice} onMouseDown={keepStageFocus} onClick={button(applyCalib)}>
                {juice ? `${fmtMs(calib.mean)} 적용` : '적용 없음'}
              </button>
              <button type="button" tabIndex={-1} className={s.btn} onMouseDown={keepStageFocus} onClick={button(() => startCalib(false))}>
                다시
              </button>
            </>
          ) : calib ? (
            <button type="button" tabIndex={-1} className={s.btn} onMouseDown={keepStageFocus} onClick={button(cancelCalib)}>
              그만
            </button>
          ) : (
            <>
              <button type="button" tabIndex={-1} className={s.btn} data-primary onMouseDown={keepStageFocus} onClick={button(() => startCalib(false))}>
                탭 테스트
              </button>
              <button type="button" tabIndex={-1} className={s.btn} disabled={!juice || S.offset === 0} onMouseDown={keepStageFocus} onClick={button(() => ((S.offset = 0), note('오프셋 0 으로')))}>
                0 으로
              </button>
            </>
          )}
        </div>
      </section>

      {/* ───── 오른쪽: 점수 · 생명 ───── */}
      <section className={s.panel} data-right style={{ top: 40 }}>
        <header>
          <h3>정확도</h3>
          <b className={s.acc}>{acc.toFixed(1)}%</b>
        </header>
        <ul className={s.counts}>
          {(['perfect', 'great', 'good', 'miss', 'lost'] as Grade[]).map(g => (
            <li key={g} data-g={g} data-zero={st[g] === 0 || undefined}>
              <span className={s.glyph}>{GLYPH[g]}</span>
              {LABEL[g]}
              <b>{st[g]}</b>
            </li>
          ))}
        </ul>
        <p className={s.maxCombo}>
          최대 콤보 <b>{st.max}</b>
        </p>
      </section>
      <section className={s.panel} data-right data-part="gauge" style={{ top: 560 }} data-lenient={lenient || undefined}>
        <header>
          <h3>{lenient ? '관대한 판정' : '생명'}</h3>
          <b>{lenient ? '실패 없음' : `${Math.round(S.life)}%`}</b>
        </header>
        <div className={s.life} data-low={(!lenient && S.life <= 30) || undefined}>
          <i style={{ transform: `scaleX(${lenient ? 1 : S.life / 100})` }} />
        </div>
        <p className={s.status}>{lenient ? `판정 창 1.5배 · 놓친 노트는 '놓침' 으로 기록만 · 콤보 유지` : 'MISS 하나에 −10 · 0 이 되면 공연 중단 · 콤보 끊김'}</p>
      </section>
      <p className={s.toast} data-on={!!S.note || undefined} data-bad={S.note?.bad || undefined} aria-live="polite">
        {S.note?.text ?? ''}
      </p>
      <div className={s.fail} data-on={S.phase === 'fail' || undefined}>
        <b>공연 중단</b>
        <span>생명 0 — 2초 뒤 처음부터</span>
      </div>
      <div className={s.hitch}>프레임 끊김 흉내 중…</div>
    </div>
  )
}

function fmtMs(sec: number) {
  const ms = Math.round(sec * 1000)
  return `${ms > 0 ? '+' : ms < 0 ? '−' : '±'}${Math.abs(ms)} ms`
}
