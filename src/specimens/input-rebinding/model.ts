import { bindingLabel, keyLabel, sameBinding, type Binding } from '../../core/input'

/* 입력 재설정 표본의 데이터 — 행동 목록, 기본 입력, Unity 컨트롤 경로, 저장 JSON.
 * 화면(index.tsx)과 분리해 두면 Unity 쪽 RebindService 와 같은 일을 하는 것이 한눈에 보인다. */

export type Col = 'kb' | 'pad'
export type StickDir = 'up' | 'down' | 'left' | 'right'

export interface ActionDef {
  id: string
  label: string
  /** Unity 액션 경로 (SaveBindingOverridesAsJson 의 "action") */
  unity: string
  kb: Binding
  /** null = 패드는 스틱으로 고정 (stick 방향) */
  pad: Binding | null
  stick?: StickDir
}

export const ACTIONS: ActionDef[] = [
  { id: 'moveUp', label: '앞으로 이동', unity: 'Player/Move', kb: { kind: 'key', key: 'KeyW' }, pad: null, stick: 'up' },
  { id: 'moveDown', label: '뒤로 이동', unity: 'Player/Move', kb: { kind: 'key', key: 'KeyS' }, pad: null, stick: 'down' },
  { id: 'moveLeft', label: '왼쪽으로 이동', unity: 'Player/Move', kb: { kind: 'key', key: 'KeyA' }, pad: null, stick: 'left' },
  { id: 'moveRight', label: '오른쪽으로 이동', unity: 'Player/Move', kb: { kind: 'key', key: 'KeyD' }, pad: null, stick: 'right' },
  { id: 'jump', label: '점프', unity: 'Player/Jump', kb: { kind: 'key', key: 'Space' }, pad: { kind: 'face', face: 'bottom' } },
  { id: 'sprint', label: '달리기', unity: 'Player/Sprint', kb: { kind: 'key', key: 'ShiftLeft' }, pad: { kind: 'shoulder', side: 'L' } },
  { id: 'crouch', label: '웅크리기', unity: 'Player/Crouch', kb: { kind: 'key', key: 'KeyC' }, pad: { kind: 'face', face: 'right' } },
  { id: 'interact', label: '상호작용', unity: 'Player/Interact', kb: { kind: 'key', key: 'KeyE' }, pad: { kind: 'face', face: 'left' } },
  { id: 'repair', label: '수리 키트 사용', unity: 'Player/UseRepairKit', kb: { kind: 'key', key: 'KeyQ' }, pad: { kind: 'face', face: 'top' } },
  { id: 'scan', label: '스캐너', unity: 'Player/Scan', kb: { kind: 'mouse', button: 'right' }, pad: { kind: 'shoulder', side: 'R' } },
]

export const actionOf = (id: string) => ACTIONS.find(a => a.id === id)!

/** 지금 입력표. null = 비어 있음(다른 행에 키를 내주고 빈 칸) */
export type Cells = Record<string, Record<Col, Binding | null>>

export const defaultCells = (): Cells => Object.fromEntries(ACTIONS.map(a => [a.id, { kb: a.kb, pad: a.pad }]))

export const sameOrNull = (a: Binding | null, b: Binding | null) => (a && b ? sameBinding(a, b) : a === b)

/** 기본값과 다른가 (Unity: binding.overridePath != null) */
export const isChanged = (cells: Cells, id: string, col: Col) => {
  const a = actionOf(id)
  if (col === 'pad' && !a.pad) return false
  return !sameOrNull(cells[id][col], col === 'kb' ? a.kb : a.pad)
}

export const changedCount = (cells: Cells) => ACTIONS.reduce((n, a) => n + (isChanged(cells, a.id, 'kb') ? 1 : 0) + (isChanged(cells, a.id, 'pad') ? 1 : 0), 0)

/** 같은 열에서 이 입력을 이미 쓰는 행 (충돌 검사) */
export function findConflict(cells: Cells, id: string, col: Col, b: Binding): string | null {
  for (const a of ACTIONS) if (a.id !== id && sameOrNull(cells[a.id][col], b)) return a.id
  return null
}

/** 이 입력을 쓰는 행동들 (시험해 보기 · 나쁜 예에서는 둘 이상일 수 있다) */
export function actionsFor(cells: Cells, b: Binding): string[] {
  const col = colOf(b)
  return ACTIONS.filter(a => sameOrNull(cells[a.id][col], b)).map(a => a.id)
}

export const colOf = (b: Binding): Col => (b.kind === 'key' || b.kind === 'mouse' ? 'kb' : 'pad')

/** 짧은 이름 ('E 키' → 'E', '패드 아래 버튼' → '아래 버튼') — 칸 안 보조 글자 */
export function shortLabel(b: Binding | null): string {
  if (!b) return '비어 있음'
  if (b.kind === 'key') return keyLabel(b.key)
  return bindingLabel(b).replace(/^패드 /, '')
}

/* ───── 바꿀 수 없는 입력 ───── */

/** 고정 행: 메뉴 열기 · 대기 취소 */
export const FIXED_KEY: Binding = { kind: 'key', key: 'Escape' }
export const FIXED_PAD: Binding = { kind: 'start' }

/** 운영체제 · 브라우저가 먼저 가져가는 키 — 받으면 이유를 알리고 계속 기다린다 */
const OS_KEYS: Record<string, string> = {
  MetaLeft: '윈도 · 커맨드 키는 운영체제가 먼저 가져가는 키',
  MetaRight: '윈도 · 커맨드 키는 운영체제가 먼저 가져가는 키',
  OSLeft: '윈도 키는 운영체제가 먼저 가져가는 키',
  OSRight: '윈도 키는 운영체제가 먼저 가져가는 키',
  ContextMenu: '메뉴 키는 운영체제 메뉴를 여는 키',
  PrintScreen: 'PrtSc 는 운영체제의 화면 캡처 키',
  F11: 'F11 은 브라우저 · 운영체제의 전체 화면 키',
  F12: 'F12 는 개발 도구 키',
}
export const osKeyReason = (code: string): string | null => OS_KEYS[code] ?? null

/* ───── 게임패드 (브라우저 Gamepad API 표준 배치) ───── */

/** 표준 배치 버튼 번호 → Binding. null = 이 표본이 다루지 않는 버튼 */
export function padBindingFromIndex(i: number): Binding | null {
  switch (i) {
    case 0:
      return { kind: 'face', face: 'bottom' }
    case 1:
      return { kind: 'face', face: 'right' }
    case 2:
      return { kind: 'face', face: 'left' }
    case 3:
      return { kind: 'face', face: 'top' }
    case 4:
      return { kind: 'shoulder', side: 'L' }
    case 5:
      return { kind: 'shoulder', side: 'R' }
    case 9:
      return { kind: 'start' }
    case 12:
      return { kind: 'dpad', dir: 'up' }
    case 13:
      return { kind: 'dpad', dir: 'down' }
    case 14:
      return { kind: 'dpad', dir: 'left' }
    case 15:
      return { kind: 'dpad', dir: 'right' }
  }
  return null
}

/* ───── Unity 컨트롤 경로 · 저장 JSON ───── */

const KEY_PATHS: Record<string, string> = {
  Space: 'space',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Escape: 'escape',
  CapsLock: 'capsLock',
  ShiftLeft: 'leftShift',
  ShiftRight: 'rightShift',
  ControlLeft: 'leftCtrl',
  ControlRight: 'rightCtrl',
  AltLeft: 'leftAlt',
  AltRight: 'rightAlt',
  ArrowUp: 'upArrow',
  ArrowDown: 'downArrow',
  ArrowLeft: 'leftArrow',
  ArrowRight: 'rightArrow',
  Backquote: 'backquote',
  Minus: 'minus',
  Equal: 'equals',
  BracketLeft: 'leftBracket',
  BracketRight: 'rightBracket',
  Backslash: 'backslash',
  Semicolon: 'semicolon',
  Quote: 'quote',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash',
}

/** Binding → Unity Input System 컨트롤 경로 ('<Keyboard>/e', '<Gamepad>/buttonSouth'). 비어 있음 = "" */
export function unityPath(b: Binding | null): string {
  if (!b) return ''
  switch (b.kind) {
    case 'key': {
      const c = b.key
      if (KEY_PATHS[c]) return `<Keyboard>/${KEY_PATHS[c]}`
      const m = /^(?:Key|Digit)(.+)$/.exec(c)
      if (m) return `<Keyboard>/${m[1].toLowerCase()}`
      const n = /^Numpad(.+)$/.exec(c)
      if (n) return `<Keyboard>/numpad${n[1]}`
      return `<Keyboard>/${c.charAt(0).toLowerCase()}${c.slice(1)}`
    }
    case 'mouse':
      return `<Mouse>/${b.button === 'wheel' ? 'middleButton' : `${b.button}Button`}`
    case 'face':
      return `<Gamepad>/button${{ bottom: 'South', right: 'East', left: 'West', top: 'North' }[b.face]}`
    case 'shoulder':
      return `<Gamepad>/${b.side === 'L' ? 'left' : 'right'}Shoulder`
    case 'start':
      return '<Gamepad>/start'
    case 'dpad':
      return `<Gamepad>/dpad/${b.dir}`
  }
}

/** 바인딩마다 고정된 id (Unity 는 GUID). 미리보기라 앞 8자리만 */
function bindingId(id: string, col: Col): string {
  let h = 2166136261
  for (const ch of `${id}/${col}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** SaveBindingOverridesAsJson 와 같은 모양 — 바뀐 것만 담는다 (interactions · processors 는 줄임) */
export function overridesJson(cells: Cells): string[] {
  const rows: string[] = []
  for (const a of ACTIONS)
    for (const col of ['kb', 'pad'] as Col[]) {
      if (!isChanged(cells, a.id, col)) continue
      rows.push(`  {"action":"${a.unity}","id":"${bindingId(a.id, col)}…",`, `   "path":"${unityPath(cells[a.id][col])}"},`)
    }
  if (rows.length) rows[rows.length - 1] = rows[rows.length - 1].replace(/,$/, '')
  return ['{"bindings":[', ...rows, ']}']
}
