import type { ComponentType } from 'react'

/* ──────────────────────────────────────────────────────────────
 * 표본 계약 v1
 * 표본 1개 = src/specimens/<id>/ 폴더 1개.
 *   index.tsx  : `export { meta } from './meta'` + default HUD 컴포넌트 (+ 선택: `export const Scene`)
 *   meta.ts    : SpecimenMeta (해설·조절 값·프리셋·Unity 가이드 등 모든 텍스트)
 *   *.module.css
 * Unity 코드는 src/unity/<id>/ugui|uitk/ 에 실제 파일로 둔다 (자동 수집).
 * ────────────────────────────────────────────────────────────── */

export type GroupId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type Paradigm = 'diegetic' | 'non-diegetic' | 'spatial' | 'meta' | 'menu'
export type Principle = '가독성' | '시각 위계' | '즉각 피드백' | '일관성' | '어포던스' | '인지 부하' | '몰입' | '접근성'
export type Platform = 'pc' | 'console' | 'mobile'
export type InputKind = 'mouse' | 'keyboard' | 'gamepad' | 'touch'
/** 그룹을 가로지르는 주제 태그 (홈 '주제' 필터 · 카드 표시). 원리(principles)보다 좁다: 그 주제가 학습 목표에 들어 있는 표본만 */
export type SpecimenTag = 'accessibility'
export type Aspect = '16:9' | '9:16'
export type ParamValue = number | string | boolean
export type ParamValues = Record<string, ParamValue>

interface ParamBase {
  key: string
  label: string
  /** 이 값이 화면에서 무엇을 바꾸는지 (툴팁) */
  hint?: string
}
export type ParamDef =
  | (ParamBase & { type: 'range'; min: number; max: number; step: number; default: number; unit?: string })
  | (ParamBase & { type: 'select'; options: { value: string; label: string }[]; default: string })
  | (ParamBase & { type: 'toggle'; default: boolean })
  | (ParamBase & { type: 'color'; default: string })

export interface Preset {
  id: string
  /** 장르·원리 이름 (게임명 금지) */
  name: string
  look?: string
  values: ParamValues
}

export interface StageEvent {
  id: string
  label: string
}

export interface Hotspot {
  n: number
  /** HUD 안에서 data-part="<part>" 로 표시한 요소 */
  part: string
  title: string
  body: string
  principle: Principle
  /** 번호를 붙일 쪽 (기본 top). 상태에 따라 바꾸려면 요소에 data-pin="below|left|right|inside" */
  pin?: PinSide
}
export type PinSide = 'top' | 'below' | 'left' | 'right' | 'inside'

export interface Mistake {
  title: string
  body: string
}

export interface Timing {
  event: string
  ms: number
  easing: string
  note?: string
}

/** Unity UI 시스템: UGUI(Canvas) 또는 UI Toolkit. src/unity/<id>/ 아래 폴더 이름과 같다 */
export type UiSystem = 'ugui' | 'uitk'

export interface UnityGuide {
  /** 하이어라키 트리 (텍스트) */
  hierarchy: string
  steps: string[]
  pitfalls: string[]
}

export interface InspiredBy {
  title: string
  /** 예: © ATLUS © SEGA */
  credit: string
  /** 빌린 시각 축 — 최대 2개 */
  borrowed: string[]
  learned: string
  link?: string
}

export interface Reference {
  label: string
  url: string
}

export interface SpecimenMeta {
  /** 영구 불변 ID (kebab-case). URL과 파일명에 쓰인다 */
  id: string
  title: string
  titleEn: string
  group: GroupId
  order: number
  paradigms: Paradigm[]
  oneLiner: string
  goals: string[]
  principles: Principle[]
  platforms: Platform[]
  inputs: InputKind[]
  genres: string[]
  /** 주제 태그. 예: 접근성 기능 자체가 학습 목표인 표본은 ['accessibility'] */
  tags?: SpecimenTag[]
  difficulty: 1 | 2 | 3
  stage: {
    aspect: Aspect | 'both'
    /** 공유 three.js Canvas 위에 Scene 을 그린다 */
    three?: boolean
    /** 2D 무대 배경 프리셋 (three 가 꺼져 있거나 쓸 수 없을 때도 사용) */
    backdrop?: BackdropId
  }
  params: ParamDef[]
  presets: Preset[]
  events: StageEvent[]
  hotspots: Hotspot[]
  mistakes: Mistake[]
  /** '효과 끄기'(나쁜 예) 상태 설명 */
  juiceOff: string
  timings: Timing[]
  unity: { ugui: UnityGuide; uitk: UnityGuide }
  inspiredBy: InspiredBy[]
  /** 원작과 다르게 새로 만든 것 */
  original: string
  references: Reference[]
  /** 함께 보면 좋은 다른 표본 (id 와 이유 한 줄). 해설 문장 안에서는 [제목](#/s/<id>) 로도 링크할 수 있다 */
  related?: { id: string; why: string }[]
  /** 번쩍이는 효과 포함 (배지 표시, 제한기 사용 필수) */
  flashes?: boolean
}

export type BackdropId = 'field' | 'dungeon' | 'scifi' | 'menu' | 'night' | 'none'

export interface StageTrigger {
  id: string
  seq: number
}

/** 표본 하나가 마운트될 때마다 새로 만들어지는 공유 객체 (HUD ↔ Scene 통신용) */
export type SpecimenBus = Record<string, unknown>

export interface SpecimenProps {
  params: ParamValues
  /** false = '효과 끄기' (나쁜 예) */
  juice: boolean
  /** false 면 모든 애니메이션 정지 (일시정지 · 화면 밖 · 썸네일 대기) */
  playing: boolean
  /** 0.25 · 0.5 · 1 — 게임 시간 배속 */
  timeScale: number
  /** 이벤트 버튼 · 단축키로 발생. seq 가 바뀔 때마다 1회 처리 */
  trigger: StageTrigger | null
  /** 사용자 입력이 없을 때 표본이 스스로 데모 이벤트를 발생시킨다 */
  autoplay: boolean
  aspect: Aspect
  /** 논리 해상도 (16:9 → 1920×1080, 9:16 → 1080×1920). Unity Canvas Scaler 의 Reference Resolution 과 같은 개념 */
  width: number
  height: number
  /** 갤러리 카드 썸네일 (가볍게) */
  thumbnail: boolean
  /** three Scene 이 실제로 그려지는 중인가 (WebGL 불가·썸네일이면 false → HUD 가 2D 대체 배경을 그린다) */
  webgl: boolean
  bus: SpecimenBus
}

export interface SpecimenModule {
  meta: SpecimenMeta
  default: ComponentType<SpecimenProps>
  Scene?: ComponentType<SpecimenProps>
}

/** 아직 구현되지 않은 계획 표본 (갤러리에 '제작 중' 카드로 표시) */
export interface PlannedSpecimen {
  id: string
  title: string
  group: GroupId
  order: number
  paradigms: Paradigm[]
  oneLiner: string
}
