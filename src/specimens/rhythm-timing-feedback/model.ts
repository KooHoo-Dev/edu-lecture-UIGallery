/* 박자 표시 · 판정 피드백 — 순수 로직 (곡 시계 · 채보 · 판정 창 · 합성음).
 * 화면 코드(index.tsx)와 나눠 두면 Unity 의 Conductor · NoteChart · Judge 와 한 줄씩 맞춰 읽을 수 있다. */

export type Grade = 'perfect' | 'great' | 'good' | 'miss' | 'lost'
export const HIT: Grade[] = ['perfect', 'great', 'good']
/** 정확도 가중치 — 놓침(관대한 판정)은 정확도에서 빼지 않고 0 으로만 센다 */
export const GRADE_SCORE: Record<Grade, number> = {
  perfect: 1,
  great: 0.7,
  good: 0.4,
  miss: 0,
  lost: 0,
}

/** 판정 창(± 초). GREAT = PERFECT × 2, GOOD = PERFECT × 3. 관대한 판정은 모두 1.5배 */
export interface Windows {
  perfect: number
  great: number
  good: number
}
export const windowsMs = (perfectMs: number, lenient: boolean): Windows => {
  const k = (lenient ? 1.5 : 1) / 1000
  return {
    perfect: perfectMs * k,
    great: perfectMs * 2 * k,
    good: perfectMs * 3 * k,
  }
}
/** 흔한 실수: 판정 창을 '프레임 수' 로 — 주사율이 바뀌면 창도 바뀐다 */
export const windowsFrames = (frameSec: number): Windows => ({
  perfect: frameSec,
  great: frameSec * 2,
  good: frameSec * 3,
})

/** 오차(초, − = 이르게) → 등급. 창 밖이면 null (판정하지 않는다) */
export function grade(err: number, w: Windows): Grade | null {
  const a = Math.abs(err)
  if (a <= w.perfect) return 'perfect'
  if (a <= w.great) return 'great'
  if (a <= w.good) return 'good'
  return null
}

/* ───── 채보: 8마디 × 8분음표 8칸을 반복한다. 숫자 = 레인(0~3), x = 가운데 두 레인 동시 ───── */
const BARS = ['0.1.2.3.', '3.2.1.0.', '0.2.1.3.', '1.2.0.23', '0.1.2.3.', '3.1.2.0.', 'x...x...', '0.3.12.3']
export interface Note {
  id: number
  t: number
  lane: number
}
const laneMap = (l: number, n: number) => (n >= 4 ? l : Math.min(n - 1, Math.floor((l * n) / 4)))

/** 곡 시각 [t0, t1] 사이의 노트 (시간순). 노트 id = 8분음표 번호 × 4 + 레인 — 몇 바퀴를 돌아도 겹치지 않는다 */
export function notesBetween(t0: number, t1: number, bpm: number, lanes: number): Note[] {
  const slot = 30 / bpm
  const out: Note[] = []
  const k0 = Math.max(0, Math.ceil(t0 / slot - 1e-9))
  const k1 = Math.floor(t1 / slot + 1e-9)
  for (let k = k0; k <= k1; k++) {
    const ch = BARS[Math.floor(k / 8) % BARS.length][k % 8]
    if (ch === '.') continue
    const raw = ch === 'x' ? [1, 2] : [Number(ch)]
    const seen = new Set<number>()
    for (const r of raw) {
      const lane = laneMap(r, lanes)
      if (seen.has(lane)) continue
      seen.add(lane)
      out.push({ id: k * 4 + lane, t: k * slot, lane })
    }
  }
  return out
}

/* ───── 탭 테스트 ───── */
const TAP_MAX_LATE = 0.45
const TAP_MAX_EARLY = 0.25
/**
 * 탭을 '다음에 올 박(next)' 에 차례로 붙인다. 가장 가까운 박으로 반올림하지 않는다 —
 * 지연이 반 박을 넘으면(120 BPM 에서 250ms) 부호가 뒤집혀 평균이 망가진다. 박 하나에 탭 하나.
 * 돌려주는 값: 오차(초)와 다음 탭을 붙일 박. 너무 이르면(같은 박을 두 번 누름 등) null
 */
export function attachTap(songT: number, next: number, beat: number): { err: number; next: number } | null {
  let err = songT - next * beat
  while (err > TAP_MAX_LATE) {
    next++ // 박을 건너뛰었다
    err -= beat
  }
  if (err < -TAP_MAX_EARLY) return null
  return { err, next: next + 1 }
}
/** 중앙값 ± 3 × MAD(최소 20ms) 밖의 탭을 빼고 평균 · 흩어짐 */
export function robustMean(taps: number[]): { mean: number; sd: number; kept: boolean[] } {
  const mid = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
  const med = mid(taps)
  const limit = 3 * Math.max(0.02, mid(taps.map(x => Math.abs(x - med))))
  const kept = taps.map(x => Math.abs(x - med) <= limit)
  const ok = taps.filter((_, i) => kept[i])
  const mean = ok.reduce((a, x) => a + x, 0) / ok.length
  const sd = Math.sqrt(ok.reduce((a, x) => a + (x - mean) ** 2, 0) / ok.length)
  return { mean, sd, kept }
}

/** 노트마다 정해진 의사 난수 (−1 ~ 1) — 자동 연주의 손 떨림 */
export const jitter = (id: number) => {
  const x = Math.sin(id * 12.9898 + 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * 곡 시계 — 기준 시계 하나(소리 켬: AudioContext.currentTime, 꺼짐: performance.now)에서 곡 위치를 직선으로 얻는다.
 * 곡 위치 = (기준 시각 − 시작 기준) × 재생 속도. 일시정지 · 배속 · 소리 켜고 끄기는 '시작 기준' 만 다시 잡는다.
 * Unity 의 Conductor 와 같다: songPosition = (AudioSettings.dspTime − startDsp) × pitch.
 */
export class SongClock {
  private ctx: AudioContext | null = null
  private anchor = 0
  private ctxLast = -1
  private ctxPerf = 0
  private lastRaw = 0
  private held: number | null
  rate = 1
  constructor(pos: number) {
    this.held = pos
  }
  get source(): 'audio' | 'perf' {
    return this.ctx ? 'audio' : 'perf'
  }
  get paused() {
    return this.held !== null
  }
  /**
   * 기준 시각(초). AudioContext.currentTime 은 오디오 콜백 단위(수 ms~10ms 남짓)로 뛴다 — 그대로 그리면 노트가 떨리고,
   * 입력 시각 계산이 이르게 치우친다. 그래서 값이 바뀐 뒤 흐른 시간으로 사이를 메운다(최대 30ms 앞까지, 뒤로 가지 않음).
   * 같은 시계를 메울 뿐 다른 시계를 섞지 않는다 — Unity Conductor.VisualPosition 과 같은 생각.
   */
  raw() {
    const now = performance.now()
    if (!this.ctx) return now / 1000
    const ct = this.ctx.currentTime
    if (ct !== this.ctxLast) {
      this.ctxLast = ct
      this.ctxPerf = now
    }
    this.lastRaw = Math.max(this.lastRaw, ct + Math.min(0.03, (now - this.ctxPerf) / 1000))
    return this.lastRaw
  }
  pos() {
    return this.held ?? (this.raw() - this.anchor) * this.rate
  }
  /** 입력 이벤트가 일어난 시각(performance.now 기준 ms)의 곡 위치 — 처리가 늦어도 누른 순간으로 판정한다 */
  posAt(perfMs: number) {
    if (this.held !== null) return this.held
    return this.pos() - (Math.max(0, performance.now() - perfMs) / 1000) * this.rate
  }
  /** 곡 시각 → 기준 시계 시각 (소리 예약용) */
  toRaw(songT: number) {
    return this.anchor + songT / this.rate
  }
  seek(p: number) {
    if (this.held !== null) this.held = p
    else this.anchor = this.raw() - p / this.rate
  }
  pause() {
    if (this.held === null) this.held = this.pos()
  }
  resume() {
    if (this.held === null) return
    const p = this.held
    this.held = null
    this.anchor = this.raw() - p / this.rate
  }
  setRate(r: number) {
    const p = this.pos()
    this.rate = r
    this.seek(p)
  }
  useAudio(ctx: AudioContext | null) {
    const p = this.pos()
    this.ctx = ctx
    this.ctxLast = -1
    this.lastRaw = 0
    this.seek(p)
  }
}

/** WebAudio 합성음 — 외부 파일 없이 킥 · 하이햇 · 멜로디 · 메트로놈을 만든다. 모두 미리 예약(start(at))한다 */
export class BeatSynth {
  readonly ctx: AudioContext
  private out: GainNode
  private noise: AudioBuffer
  private live: { node: AudioScheduledSourceNode; at: number }[] = []
  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new AC()
    this.out = this.ctx.createGain()
    this.out.gain.value = 0.45
    this.out.connect(this.ctx.destination)
    const len = Math.floor(this.ctx.sampleRate * 0.08)
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  private env(at: number, peak: number, dur: number) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(peak, at + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    g.connect(this.out)
    return g
  }
  private play(node: AudioScheduledSourceNode, at: number, dur: number) {
    node.start(at)
    node.stop(at + dur + 0.02)
    const rec = { node, at }
    this.live.push(rec)
    node.onended = () => (this.live = this.live.filter(x => x !== rec))
  }
  kick(at: number, accent: boolean) {
    const o = this.ctx.createOscillator()
    o.frequency.setValueAtTime(150, at)
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12)
    o.connect(this.env(at, accent ? 0.9 : 0.6, 0.18))
    this.play(o, at, 0.18)
  }
  hat(at: number) {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    s.connect(f)
    f.connect(this.env(at, 0.12, 0.05))
    this.play(s, at, 0.06)
  }
  pluck(at: number, lane: number) {
    const o = this.ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = [392, 440, 523.25, 587.33][lane] ?? 440
    o.connect(this.env(at, 0.22, 0.25))
    this.play(o, at, 0.25)
  }
  click(at: number, accent: boolean) {
    const o = this.ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = accent ? 1500 : 1000
    o.connect(this.env(at, 0.16, 0.04))
    this.play(o, at, 0.05)
  }
  /** 일시정지 · 배속 · 처음부터 — 이미 예약했지만 아직 울리지 않은 소리를 거둔다 */
  cancelAfter(t: number) {
    for (const x of this.live)
      if (x.at > t) {
        try {
          x.node.stop()
        } catch {
          /* 이미 멈춤 */
        }
      }
    this.live = this.live.filter(x => x.at <= t)
  }
}
