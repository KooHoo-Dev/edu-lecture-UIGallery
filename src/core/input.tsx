import { useEffect, useState } from 'react'

/* ──────────────────────────────────────────────────────────────
 * 입력 장치 글리프 (상표 없는 중립 디자인) + 마지막 입력 장치 추적
 * 특정 콘솔의 버튼 기호(A/B, ○/×)나 로고는 쓰지 않는다 — 위치(아래/오른쪽…)로 표현한다.
 * ────────────────────────────────────────────────────────────── */

export type Device = 'keyboard' | 'mouse' | 'gamepad' | 'touch'
export type PadFace = 'bottom' | 'right' | 'left' | 'top'

/** 갤러리 공통 행동 → 장치별 입력 */
export type Action = 'confirm' | 'back' | 'tabPrev' | 'tabNext' | 'option' | 'menu' | 'skip' | 'interact'

/**
 * 입력 하나 (키 재설정 · 임의 키 표시용). 키는 KeyboardEvent.code(배열 기준: 'KeyQ', 'Space', 'ShiftLeft')나 그대로 보일 라벨('Q').
 * 패드는 위치로만 — 특정 콘솔의 기호를 쓰지 않는다.
 */
export type Binding =
  | { kind: 'key'; key: string }
  | { kind: 'mouse'; button: 'left' | 'right' | 'wheel' }
  | { kind: 'face'; face: PadFace }
  | { kind: 'shoulder'; side: 'L' | 'R' }
  | { kind: 'start' }
  | { kind: 'dpad'; dir: 'up' | 'down' | 'left' | 'right' }

const KEYS: Record<Action, string> = {
  confirm: 'Enter',
  back: 'Esc',
  tabPrev: 'Q',
  tabNext: 'E',
  option: 'R',
  menu: 'Tab',
  skip: 'Space',
  interact: 'F',
}
const PAD: Record<Action, Extract<Binding, { kind: 'face' | 'shoulder' | 'start' }>> = {
  confirm: { kind: 'face', face: 'bottom' },
  back: { kind: 'face', face: 'right' },
  tabPrev: { kind: 'shoulder', side: 'L' },
  tabNext: { kind: 'shoulder', side: 'R' },
  option: { kind: 'face', face: 'left' },
  menu: { kind: 'start' },
  skip: { kind: 'face', face: 'top' },
  interact: { kind: 'face', face: 'left' },
}
const TOUCH: Record<Action, 'tap' | 'hold' | 'swipe'> = {
  confirm: 'tap',
  back: 'swipe',
  tabPrev: 'swipe',
  tabNext: 'swipe',
  option: 'hold',
  menu: 'tap',
  skip: 'tap',
  interact: 'tap',
}

interface GlyphProps {
  size?: number
  /** 밝은 배경용이면 'dark' */
  tone?: 'light' | 'dark'
}

const ink = (tone: GlyphProps['tone']) => (tone === 'dark' ? '#10141c' : '#f4f7fb')
const paper = (tone: GlyphProps['tone']) => (tone === 'dark' ? '#f4f7fb' : 'rgba(10,14,22,0.75)')

/** 행동 하나를 현재 장치에 맞는 글리프로 */
export function ActionGlyph({ action, device, size = 40, tone }: GlyphProps & { action: Action; device: Device }) {
  if (device === 'gamepad') return <BindingGlyph binding={PAD[action]} size={size} tone={tone} />
  if (device === 'touch') return <TouchGlyph kind={TOUCH[action]} size={size} tone={tone} />
  if (device === 'mouse' && action === 'confirm') return <MouseGlyph button="left" size={size} tone={tone} />
  if (device === 'mouse' && action === 'back') return <MouseGlyph button="right" size={size} tone={tone} />
  return <KeyCap label={KEYS[action]} size={size} tone={tone} />
}

/** 입력 하나를 글리프로 — 행동 이름 없이 '어떤 키인지' 만 보여 줄 때 (키 재설정 목록, 스킬 칸 등) */
export function BindingGlyph({ binding, size = 40, tone }: GlyphProps & { binding: Binding }) {
  switch (binding.kind) {
    case 'key':
      return <KeyCap label={keyLabel(binding.key)} size={size} tone={tone} />
    case 'mouse':
      return <MouseGlyph button={binding.button} size={size} tone={tone} />
    case 'face':
      return <PadButton face={binding.face} size={size} tone={tone} />
    case 'shoulder':
      return <Shoulder side={binding.side} size={size} tone={tone} />
    case 'start':
      return <StartButton size={size} tone={tone} />
    case 'dpad':
      return <DPad dirs={[binding.dir]} size={size} tone={tone} />
  }
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: '⌫',
  Tab: 'Tab',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

/** KeyboardEvent.code → 키캡 라벨 ('KeyQ' → 'Q', 'Digit1' → '1', 'ShiftLeft' → 'Shift'). 코드가 아니면 그대로 */
export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code)
  if (m) return m[1]
  const side = /^(Shift|Control|Alt|Meta)(?:Left|Right)$/.exec(code)
  if (side) return side[1] === 'Control' ? 'Ctrl' : side[1]
  return code
}

const PAD_WORDS: Record<PadFace, string> = { bottom: '아래', right: '오른쪽', left: '왼쪽', top: '위' }
const DIR_WORDS = { up: '위', down: '아래', left: '왼쪽', right: '오른쪽' } as const

/** 글로 읽는 이름 (스크린 리더 · 충돌 경고 문구용) */
export function bindingLabel(b: Binding): string {
  switch (b.kind) {
    case 'key':
      return `${keyLabel(b.key)} 키`
    case 'mouse':
      return b.button === 'wheel' ? '마우스 휠' : `마우스 ${b.button === 'left' ? '왼쪽' : '오른쪽'} 버튼`
    case 'face':
      return `패드 ${PAD_WORDS[b.face]} 버튼`
    case 'shoulder':
      return `패드 ${b.side} 숄더`
    case 'start':
      return '패드 메뉴 버튼'
    case 'dpad':
      return `방향 패드 ${DIR_WORDS[b.dir]}`
  }
}

/** 키 입력 하나를 Binding 으로 (키 재설정의 '키 입력 대기'). 배열 기준인 code 를 쓴다 — 한/영 · 자판 배열이 바뀌어도 같은 키 */
export const bindingFromKeyboard = (e: KeyboardEvent): Binding => ({ kind: 'key', key: e.code })

/** 같은 입력인가 (충돌 확인). 'KeyQ' 와 'Q' 는 같은 키, 왼쪽 · 오른쪽 Shift 도 같은 키로 본다 */
export function sameBinding(a: Binding, b: Binding): boolean {
  return a.kind === b.kind && bindingLabel(a) === bindingLabel(b)
}

export function KeyCap({ label, size = 40, tone }: GlyphProps & { label: string }) {
  // 긴 라벨(Enter, Shift)은 글자를 줄이지 않고 키를 넓힌다 — 글자는 키 높이의 40% 아래로 작아지지 않는다
  const font = size * (label.length > 3 ? 0.4 : 0.44)
  const w = Math.max(size, label.length > 1 ? size * 0.5 + label.length * font * 0.66 : size)
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} aria-label={`${label} 키`} role="img" style={{ verticalAlign: 'middle' }}>
      <rect x="1.5" y="1.5" width={w - 3} height={size - 3} rx={size * 0.18} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2.5" />
      <rect x="1.5" y={size - 8} width={w - 3} height="6.5" rx="3" fill={ink(tone)} opacity="0.25" />
      <text x={w / 2} y={size / 2 + size * 0.14} textAnchor="middle" fontSize={font} fontWeight="700" fill={ink(tone)} fontFamily="'Chakra Petch', sans-serif">
        {label}
      </text>
    </svg>
  )
}

/** 마름모 배치 네 버튼 중 하나를 채운다 — 위치로 버튼을 가리키는 중립 표기 */
export function PadButton({ face, size = 40, tone }: GlyphProps & { face: PadFace }) {
  const c = size / 2
  const r = size * 0.15
  const d = size * 0.3
  const pos: Record<PadFace, [number, number]> = { bottom: [c, c + d], right: [c + d, c], left: [c - d, c], top: [c, c - d] }
  const label = { bottom: '아래', right: '오른쪽', left: '왼쪽', top: '위' }[face]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`게임패드 ${label} 버튼`} style={{ verticalAlign: 'middle' }}>
      <circle cx={c} cy={c} r={c - 1.5} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2" />
      {(Object.keys(pos) as PadFace[]).map(f => (
        <circle key={f} cx={pos[f][0]} cy={pos[f][1]} r={r} fill={f === face ? ink(tone) : 'none'} stroke={ink(tone)} strokeWidth="2" opacity={f === face ? 1 : 0.55} />
      ))}
    </svg>
  )
}

export function Shoulder({ side, size = 40, tone }: GlyphProps & { side: 'L' | 'R' }) {
  const w = size * 1.3
  const path = side === 'L' ? `M4 ${size - 6} Q4 6 ${w * 0.45} 6 H${w - 4} V${size - 6} Z` : `M${w - 4} ${size - 6} Q${w - 4} 6 ${w * 0.55} 6 H4 V${size - 6} Z`
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} role="img" aria-label={`게임패드 ${side === 'L' ? '왼쪽' : '오른쪽'} 숄더 버튼`} style={{ verticalAlign: 'middle' }}>
      <path d={path} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2.5" strokeLinejoin="round" />
      <text x={w / 2} y={size / 2 + size * 0.16} textAnchor="middle" fontSize={size * 0.42} fontWeight="700" fill={ink(tone)} fontFamily="'Chakra Petch', sans-serif">
        {side}
      </text>
    </svg>
  )
}

export function StartButton({ size = 40, tone }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="게임패드 메뉴 버튼" style={{ verticalAlign: 'middle' }}>
      <rect x="2" y={size * 0.22} width={size - 4} height={size * 0.56} rx={size * 0.28} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2" />
      {[0.38, 0.5, 0.62].map(y => (
        <line key={y} x1={size * 0.32} x2={size * 0.68} y1={size * y} y2={size * y} stroke={ink(tone)} strokeWidth="2.2" strokeLinecap="round" />
      ))}
    </svg>
  )
}

export function MouseGlyph({ button, size = 40, tone }: GlyphProps & { button: 'left' | 'right' | 'wheel' }) {
  const w = size * 0.72
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} role="img" aria-label={`마우스 ${button === 'left' ? '왼쪽' : button === 'right' ? '오른쪽' : '휠'} 버튼`} style={{ verticalAlign: 'middle' }}>
      <rect x="2" y="2" width={w - 4} height={size - 4} rx={w * 0.45} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2.2" />
      <line x1={w / 2} y1="2" x2={w / 2} y2={size * 0.42} stroke={ink(tone)} strokeWidth="2" />
      <line x1="2" y1={size * 0.42} x2={w - 2} y2={size * 0.42} stroke={ink(tone)} strokeWidth="2" />
      {button !== 'wheel' && (
        <path
          d={button === 'left' ? `M${w / 2 - 1} 4 Q4 4 4 ${size * 0.4} H${w / 2 - 1} Z` : `M${w / 2 + 1} 4 Q${w - 4} 4 ${w - 4} ${size * 0.4} H${w / 2 + 1} Z`}
          fill={ink(tone)}
        />
      )}
      {button === 'wheel' && <rect x={w / 2 - 3} y={size * 0.12} width="6" height={size * 0.2} rx="3" fill={ink(tone)} />}
    </svg>
  )
}

export function TouchGlyph({ kind, size = 40, tone }: GlyphProps & { kind: 'tap' | 'hold' | 'swipe' }) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={{ tap: '탭', hold: '길게 누르기', swipe: '밀기' }[kind]} style={{ verticalAlign: 'middle' }}>
      <circle cx={c} cy={c} r={c - 1.5} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2" />
      <circle cx={c} cy={c} r={size * 0.14} fill={ink(tone)} />
      {kind === 'hold' && <circle cx={c} cy={c} r={size * 0.28} fill="none" stroke={ink(tone)} strokeWidth="2" strokeDasharray="4 3" />}
      {kind === 'tap' && <circle cx={c} cy={c} r={size * 0.28} fill="none" stroke={ink(tone)} strokeWidth="2" opacity="0.5" />}
      {kind === 'swipe' && <path d={`M${size * 0.2} ${c} H${size * 0.8} M${size * 0.66} ${c - 6} L${size * 0.8} ${c} L${size * 0.66} ${c + 6}`} stroke={ink(tone)} strokeWidth="2.2" fill="none" strokeLinecap="round" />}
    </svg>
  )
}

/** 십자 방향키 — 강조할 방향(들)만 채운다 */
export function DPad({ dirs = ['up', 'down', 'left', 'right'], size = 40, tone }: GlyphProps & { dirs?: ('up' | 'down' | 'left' | 'right')[] }) {
  const s = size
  const a = s * 0.34
  const b = s * 0.66
  const arm = (d: 'up' | 'down' | 'left' | 'right') =>
    ({
      up: `M${a} 2 H${b} V${a} H${a} Z`,
      down: `M${a} ${b} H${b} V${s - 2} H${a} Z`,
      left: `M2 ${a} H${a} V${b} H2 Z`,
      right: `M${b} ${a} H${s - 2} V${b} H${b} Z`,
    })[d]
  const all = ['up', 'down', 'left', 'right'] as const
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={`방향키 ${dirs.join('·')}`} style={{ verticalAlign: 'middle' }}>
      <path d={`M${a} 2 H${b} V${a} H${s - 2} V${b} H${b} V${s - 2} H${a} V${b} H2 V${a} H${a} Z`} fill={paper(tone)} stroke={ink(tone)} strokeWidth="2" strokeLinejoin="round" />
      {all.map(d => (dirs.includes(d) ? <path key={d} d={arm(d)} fill={ink(tone)} /> : null))}
    </svg>
  )
}

/**
 * 마지막 입력 장치 + 입력 순번(seq). seq 는 어떤 입력이든 들어올 때마다 1씩 늘어난다
 * (같은 장치로 다시 입력해도 알 수 있어서, 자동 데모의 '강제 장치'를 풀 때 쓴다).
 * forced 를 주면 그 장치를 그대로 돌려준다 (조절 패널의 '입력 장치' 선택용).
 * 게임패드는 Gamepad API 를 0.25초마다 확인한다 (보안 컨텍스트에서만 동작 — file:// 와 https 는 OK).
 */
export function useLastInput(forced?: Device | 'auto'): { device: Device; seq: number } {
  const [state, setState] = useState<{ device: Device; seq: number }>({ device: 'keyboard', seq: 0 })
  useEffect(() => {
    if (forced && forced !== 'auto') return
    const set = (device: Device) => setState(s => ({ device, seq: s.seq + 1 }))
    const onKey = () => set('keyboard')
    const onPointer = (e: PointerEvent) => set(e.pointerType === 'touch' ? 'touch' : 'mouse')
    // 캡처 단계에서 듣는다 — 표본이 갤러리 단축키와 겹치지 않게 stopPropagation 해도 장치 추적은 유지된다
    addEventListener('keydown', onKey, true)
    addEventListener('pointerdown', onPointer, true)
    let timer = 0
    if (typeof navigator.getGamepads === 'function') {
      let wasActive = false
      timer = window.setInterval(() => {
        let active = false
        for (const gp of navigator.getGamepads()) {
          if (gp && (gp.buttons.some(b => b.pressed) || gp.axes.some(v => Math.abs(v) > 0.5))) active = true
        }
        if (active && !wasActive) set('gamepad')
        wasActive = active
      }, 250)
    }
    return () => {
      removeEventListener('keydown', onKey, true)
      removeEventListener('pointerdown', onPointer, true)
      clearInterval(timer)
    }
  }, [forced])
  return forced && forced !== 'auto' ? { device: forced, seq: state.seq } : state
}

/** 마지막으로 쓴 입력 장치만 필요할 때 */
export function useLastInputDevice(forced?: Device | 'auto'): Device {
  return useLastInput(forced).device
}
