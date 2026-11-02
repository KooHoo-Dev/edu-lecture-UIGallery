/* 로딩 시뮬레이션 — 실제 씬 없이 SceneManager.LoadSceneAsync 의 progress 를 흉내 낸다.
 * 실제 진행률(op.progress)은 에셋 묶음마다 계단식으로 오르고, allowSceneActivation = false 면 0.9 에서 멈춘다.
 * 화면에 보이는 값은 progress / 0.9 로 0~1 로 늘린 뒤 MoveTowards 로 따라가고, 최소 노출 시간으로 위를 막는다. */

export interface Segment {
  /** 화면의 단계 문구 */
  label: string
  /** 이 묶음이 끝나면 progress 가 얼마나 오르나 (모두 더하면 0.9) */
  weight: number
  /** 걸리는 시간(초) */
  dur: number
  /** 몇 번에 나눠 오르나 — 1 이면 끝날 때 한 번에 (그동안은 멈춘 것처럼 보인다) */
  steps: number
}

export interface Scenario {
  id: string
  name: string
  segments: Segment[]
  /** 불러오기(0 → 0.9)에 걸리는 시간 */
  total: number
}

/** allowSceneActivation = false 일 때 progress 가 멈추는 값 */
export const LOAD_CAP = 0.9
/** 활성화(0.9 → 1, 씬의 Awake · Start)에 걸리는 시간 */
export const ACTIVATE_S = 0.5

const seg = (label: string, weight: number, dur: number, steps: number): Segment => ({ label, weight, dur, steps })
const make = (id: string, name: string, segments: Segment[]): Scenario => ({ id, name, segments, total: segments.reduce((a, s) => a + s.dur, 0) })

export const SCENARIOS: Record<string, Scenario> = {
  normal: make('normal', '보통 로딩', [
    seg('지형 데이터', 0.16, 0.9, 3),
    seg('텍스처 묶음', 0.3, 1.6, 4),
    seg('오디오', 0.1, 0.6, 2),
    seg('셰이더 준비', 0.1, 1.0, 1),
    seg('오브젝트 배치', 0.24, 1.1, 3),
  ]),
  fast: make('fast', '빠른 로딩 (SSD)', [
    seg('지형 데이터', 0.16, 0.25, 2),
    seg('텍스처 묶음', 0.3, 0.4, 2),
    seg('오디오', 0.1, 0.15, 1),
    seg('셰이더 준비', 0.1, 0.2, 1),
    seg('오브젝트 배치', 0.24, 0.3, 2),
  ]),
  slow: make('slow', '느린 디스크', [
    seg('지형 데이터', 0.16, 2.2, 4),
    seg('텍스처 묶음', 0.3, 4.6, 6),
    seg('오디오', 0.1, 1.4, 2),
    seg('셰이더 준비', 0.1, 2.4, 2),
    seg('오브젝트 배치', 0.24, 2.6, 4),
  ]),
  hitch: make('hitch', '중간 멈칫', [
    seg('지형 데이터', 0.16, 0.9, 3),
    seg('텍스처 묶음', 0.3, 1.4, 4),
    seg('셰이더 준비 (멈칫)', 0.1, 3.6, 1),
    seg('오디오', 0.1, 0.5, 2),
    seg('오브젝트 배치', 0.24, 1.0, 3),
  ]),
}

/** t 초에 op.progress 가 얼마인가 (계단식, 최대 0.9) */
export function realAt(sc: Scenario, t: number): number {
  let acc = 0
  let rest = t
  for (const s of sc.segments) {
    if (rest >= s.dur) {
      acc += s.weight
      rest -= s.dur
      continue
    }
    return acc + (s.weight * Math.floor((rest / s.dur) * s.steps)) / s.steps
  }
  return LOAD_CAP
}

/** t 초에 몇 번째 단계를 불러오는 중인가 */
export function stageAt(sc: Scenario, t: number): number {
  let rest = t
  for (let i = 0; i < sc.segments.length; i++) {
    if (rest < sc.segments[i].dur) return i
    rest -= sc.segments[i].dur
  }
  return sc.segments.length
}

/** 그래프에 미리 그려 두는 '각본' — 실제 진행률의 계단 꼭짓점 [t, progress] */
export function scriptSteps(sc: Scenario): [number, number][] {
  const out: [number, number][] = [[0, 0]]
  let t = 0
  let acc = 0
  for (const s of sc.segments) {
    for (let k = 1; k <= s.steps; k++) {
      const at = t + (s.dur * k) / s.steps
      out.push([at, acc + (s.weight * (k - 1)) / s.steps], [at, acc + (s.weight * k) / s.steps])
    }
    t += s.dur
    acc += s.weight
  }
  return out
}

export interface DisplayCfg {
  juice: boolean
  /** 표시 진행률이 따라가는 최대 속도 (1/초) — Mathf.MoveTowards 의 maxDelta = speed × dt */
  speed: number
  /** 최소 노출 시간(초) */
  minShow: number
}

export const moveTowards = (cur: number, target: number, maxDelta: number) =>
  Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta

/** 한 프레임 진행. 나쁜 예는 op.progress 를 그대로 보인다 (0.9 = 90% 에서 멈춘다) */
export function stepDisplay(disp: number, real: number, elapsed: number, c: DisplayCfg, dt: number): number {
  if (!c.juice) return real
  const loaded = Math.min(1, real / LOAD_CAP)
  const timeCap = c.minShow > 0 ? Math.min(1, elapsed / c.minShow) : 1
  return moveTowards(disp, Math.min(loaded, timeCap), c.speed * dt)
}

/** 화면이 '준비 완료' 가 되는가 */
export const isReady = (real: number, disp: number, juice: boolean) => real >= LOAD_CAP - 1e-6 && (!juice || disp >= 1 - 1e-6)

/** 준비 완료까지 걸릴 시간 예측 (그래프 가로축 길이용) */
export function predictReady(sc: Scenario, c: DisplayCfg): number {
  const dt = 1 / 60
  let disp = 0
  for (let t = 0; t < 60; t += dt) {
    const real = realAt(sc, t)
    disp = stepDisplay(disp, real, t, c, dt)
    if (isReady(real, disp, c.juice)) return t
  }
  return 60
}

/** 팁 — 공통 세계관 (외곽 탐사대) */
export const TIPS = [
  '수리 키트는 전투가 끝난 뒤에 쓰면 2초 더 빨리 끝난다.',
  '잔해 드론은 등 뒤의 냉각구가 약점이다. 옆으로 돌아 들어가자.',
  '세라에게 통신탑 위치를 물으면 지도에 표시해 준다.',
  '냉각 셀 3개를 모으면 도윤의 정비소에서 회로 조각으로 바꿀 수 있다.',
  '산소 캔은 지표 탐사 구역에서만 줄어든다. 기지 안에서는 안심.',
  '하린의 탐사 기록은 기지 터미널에서 다시 읽을 수 있다.',
]
