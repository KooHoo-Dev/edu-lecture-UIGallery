/* 갤러리 단축키 가드 — 표본이 키보드를 쓸 때 갤러리 단축키(Space · 1~9 · J · S · A · H · P · ←/→ · Esc)와 부딪치지 않게 하는 규칙을 한곳에 둔다.
 * 규칙:
 *  1. 표본이 키를 먹는(preventDefault + stopPropagation) 것은 무대에 포커스가 있을 때, onKey 가 true 를 돌려준 키뿐이다.
 *     지금 상태의 조작 키만 true 를 돌려준다. 조작 키는 잠깐 할 일이 없어도(반복 입력 · 상대 턴 · 가장자리) 먹는다 — 같은 키가 상태에 따라 갤러리로 새지 않게.
 *     지금 상태에서 쓰지 않는 키(닫힌 휠의 WASD, 창이 없을 때의 ←/→)는 흘려보낸다.
 *  2. 자동 데모가 연 상태(autoOpen)에 키가 오면 사람이 넘겨받은 것으로 보고 takeOver 를 부른다. 무대 밖에서 온 키는 그 뒤 그대로 흘려보낸다.
 *  3. 입력 칸(input · select · textarea · contenteditable)에서 온 키는 절대 먹지 않는다.
 *  4. Ctrl · Alt · ⌘ 조합(새로고침 · 확대 · 복사)은 modifiers: true 일 때만 onKey 로 간다.
 * 두 가지로 쓴다:
 *  - stageKeyDown(onKey): 무대 루트의 onKeyDown. 자동 데모가 키를 쓰는 상태를 열지 않는 단순한 표본.
 *  - useStageKeys(rootRef, opts): window 캡처 단계. 자동 데모가 연 상태를 무대 밖 키로 넘겨받아야 하거나 keyup 이 필요할 때.
 *    갤러리 단축키(window 버블)보다 먼저, 무대 안 React 핸들러보다도 먼저 받는다.
 *    같은 window 캡처의 다른 듣기(useLastInput 의 장치 추적)는 stopPropagation 으로 막히지 않는다. */
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

export interface StageKeyInfo {
  /** 키가 무대 안(입력 칸 제외)에서 왔는가 = 무대에 포커스 */
  focused: boolean
}

export interface StageKeyOptions {
  /** false 면 듣지 않는다 (썸네일). 기본 true */
  enabled?: boolean
  /** 자동 데모가 연 상태가 열려 있는가 — 키가 오면 takeOver 를 부른다 */
  autoOpen?: (info: StageKeyInfo) => boolean
  /** 사람이 넘겨받았다: 그 상태를 닫거나 주인을 사람으로 바꾼다 */
  takeOver?: (e: KeyboardEvent, info: StageKeyInfo) => void
  /** Ctrl · Alt · ⌘ 조합도 onKey 로 보낸다 (키 바인딩 대기처럼 조합키 자체를 받을 때) */
  modifiers?: boolean
  /** 무대에 포커스가 있을 때의 keydown. true 를 돌려주면 이 키를 먹는다 */
  onKey: (e: KeyboardEvent) => boolean | void
  /** keyup — 포커스와 상관없이 부른다(누르는 동안 포커스가 옮겨도 길게 누르기를 풀 수 있게). 무대에 포커스가 있고 true 를 돌려주면 먹는다 */
  onKeyUp?: (e: KeyboardEvent, info: StageKeyInfo) => boolean | void
}

/** 입력 칸인가 — 슬라이더 · 선택 상자 · 검색창의 키는 가로채지 않는다 */
export function isFormField(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.matches('input, select, textarea') || t.isContentEditable)
}

/** 이 키가 무대에 포커스가 있을 때 온 것인가 */
export function stageKeyInfo(root: HTMLElement | null, e: KeyboardEvent): StageKeyInfo {
  const t = e.target
  return { focused: !!root && t instanceof Node && root.contains(t) && !isFormField(t) }
}

function eat(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/** 무대 루트의 onKeyDown 용 (자동 데모가 연 상태가 없는 단순한 표본). 루트에서 받으니 포커스는 이미 무대 안이다.
 * 입력 칸 · 조합키를 거르고, onKey 가 true 를 돌려준 키(지금 상태의 조작 키)만 먹는다 */
export function stageKeyDown<E extends Element>(onKey: (e: ReactKeyboardEvent<E>) => boolean | void, opts?: { modifiers?: boolean }) {
  return (e: ReactKeyboardEvent<E>) => {
    if (isFormField(e.target) || (!opts?.modifiers && (e.ctrlKey || e.metaKey || e.altKey))) return
    if (onKey(e) === true) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
}

/** 표본 무대의 키보드 입력 (window 캡처). opts 는 매 렌더 최신 값을 쓴다 (듣기는 한 번만 붙인다) */
export function useStageKeys(rootRef: RefObject<HTMLElement | null>, opts: StageKeyOptions) {
  const o = useRef(opts)
  o.current = opts
  const enabled = opts.enabled ?? true
  useEffect(() => {
    if (!enabled) return
    const onDown = (e: KeyboardEvent) => {
      const c = o.current
      const info = stageKeyInfo(rootRef.current, e)
      if (c.autoOpen?.(info)) c.takeOver?.(e, info)
      if (!info.focused) return
      if (!c.modifiers && (e.ctrlKey || e.metaKey || e.altKey)) return
      if (c.onKey(e) === true) eat(e)
    }
    const onUp = (e: KeyboardEvent) => {
      const c = o.current
      if (!c.onKeyUp) return
      const info = stageKeyInfo(rootRef.current, e)
      if (c.onKeyUp(e, info) === true && info.focused) eat(e)
    }
    addEventListener('keydown', onDown, true)
    addEventListener('keyup', onUp, true)
    return () => {
      removeEventListener('keydown', onDown, true)
      removeEventListener('keyup', onUp, true)
    }
  }, [enabled, rootRef])
}
