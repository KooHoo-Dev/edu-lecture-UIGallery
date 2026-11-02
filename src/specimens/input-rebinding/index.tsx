import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useGameLoop, useTrigger } from '../../core/hooks'
import { BindingGlyph, bindingFromKeyboard, bindingLabel, sameBinding, useLastInput, type Binding, type Device } from '../../core/input'
import { createInputLock } from '../../core/inputLock'
import { bool, num, str } from '../../core/params'
import type { SpecimenProps } from '../../core/types'
import {
  ACTIONS,
  FIXED_KEY,
  FIXED_PAD,
  actionOf,
  actionsFor,
  changedCount,
  defaultCells,
  findConflict,
  isChanged,
  osKeyReason,
  overridesJson,
  padBindingFromIndex,
  sameOrNull,
  shortLabel,
  type Cells,
  type Col,
  type StickDir,
} from './model'
import s from './style.module.css'

export { meta } from './meta'

type Policy = 'swap' | 'unbind' | 'reject'
type Tone = 'ok' | 'info' | 'warn' | 'bad'

/** 사람이 손을 뗀 뒤 자동 데모가 다시 시작하기까지 (게임 시간 초) */
const MANUAL_PAUSE = 6
/** 전체 복원 — 길게 누르기 (초) */
const HOLD_S = 1
/** 충돌 창이 뜬 직후 확정을 막는 시간 (ms) */
const LOCK_MS = 300
const FIXED_ROW = ACTIONS.length
/** 표 좌표 (해설 · 충돌 창 위치 계산용) */
const TABLE_TOP = 166
const HEAD_H = 52
const ROW_H = 64
const rowTop = (i: number) => TABLE_TOP + HEAD_H + i * ROW_H

interface Listen {
  id: string
  col: Col
  t0: number
  /** 대기를 시작한 키 — 뗄 때까지 무시한다 (누른 채인 시작 키가 바로 들어가는 실수 방지) */
  ignore: string | null
  /** 거절 정책: 방금 거절한 입력 */
  reject: { b: Binding; other: string } | null
}
interface Pending {
  id: string
  col: Col
  b: Binding
  other: string
  prev: Binding | null
  /** 0 = 바꾸기, 1 = 취소 */
  choice: 0 | 1
}
type Step = { wait: number } | { fn: () => void }

interface Sim {
  t: number
  version: number
  cells: Cells
  focus: { row: number; col: Col }
  listen: Listen | null
  pending: Pending | null
  note: { id: number; text: string; tone: Tone }
  noteN: number
  test: { id: number; b: Binding; ids: string[] } | null
  hold: { t: number; by: 'human' | 'script' | 'key' } | null
  flash: { id: string; col: Col; n: number } | null
  savedN: number
  script: Step[] | null
  stepT: number
  demoDevice: Col | null
  padPrev: boolean[]
  swallowClick: boolean
  /** 지금 열린 상태(대기 · 충돌 창 · 길게 누르기)를 누가 열었나 — 자동 데모가 연 상태는 사람 입력이 오면 바로 넘겨받는다 */
  by: Owner
}
type Owner = 'human' | 'event' | 'auto'

/**
 * 입력 재설정(키 리바인딩) 메뉴.
 * 칸을 고르면 '키 입력 대기' — 실제 키보드 · 마우스 · 게임패드(Gamepad API) 또는 화면의 가상 패드 입력을 받는다.
 * 이미 쓰는 입력이면 충돌 창(맞바꾸기 · 비우기 · 거절), Esc 는 대기 취소, 시간이 지나면 그대로 둔다.
 * 바뀐 것만 Unity 의 SaveBindingOverridesAsJson 모양으로 미리 보여 준다.
 */
export default function InputRebinding(p: SpecimenProps) {
  const juice = p.juice
  const timeoutMs = num(p.params, 'timeoutMs', 5000)
  const policy = str(p.params, 'conflictPolicy', 'swap') as Policy
  const devParam = str(p.params, 'inputDevice', 'auto') as Device | 'auto'
  const showJson = bool(p.params, 'showSaveJson', true)
  const cfg = { juice, timeoutMs, policy }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(p.thumbnail, juice)
  const S = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(S.version)
  const sync = () => {
    if (S.version !== shown.current) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const touch = () => S.version++
  const lock = useRef(createInputLock(LOCK_MS)).current
  const rootRef = useRef<HTMLDivElement>(null)
  const realAt = useRef(-1e9)

  /* ───── 장치 (마지막 입력 장치) ───── */
  const last = useLastInput(p.thumbnail ? 'keyboard' : devParam)
  /** 가상 패드를 누른 뒤로 다른 입력이 없으면 '패드' 로 본다 (가상 패드 클릭도 window 에는 마우스 입력으로 보이므로) */
  const padUntilSeq = useRef(-1)
  let device: Col = last.device === 'gamepad' ? 'pad' : 'kb'
  if (devParam === 'auto' && !p.thumbnail) {
    if (S.demoDevice) device = S.demoDevice
    else if (last.seq <= padUntilSeq.current) device = 'pad'
  }

  const note = (text: string, tone: Tone = 'info') => {
    S.note = { id: ++S.noteN, text, tone }
    touch()
  }
  const label = (id: string) => actionOf(id).label
  const human = () => {
    realAt.current = S.t
    if (S.script) {
      S.script = null
      if (S.hold?.by === 'script') S.hold = null
    }
    S.demoDevice = null
    touch()
  }

  /* ───── 바꾸기 ───── */
  const apply = (id: string, col: Col, b: Binding | null) => {
    S.cells = { ...S.cells, [id]: { ...S.cells[id], [col]: b } }
    S.flash = { id, col, n: (S.flash?.n ?? 0) + 1 }
    S.savedN++ // 바뀔 때마다 PlayerPrefs 에 저장
  }
  const endListen = () => {
    S.listen = null
    touch()
  }

  const startListen = (id: string, col: Col, startCode: string | null = null) => {
    const row = ACTIONS.findIndex(a => a.id === id)
    S.pending = null
    S.focus = { row, col }
    if (col === 'pad' && !actionOf(id).pad) {
      S.listen = null
      note('패드 이동은 왼쪽 스틱으로 고정 — 스틱 좌우 바꾸기는 다른 설정에서', 'info')
      return
    }
    S.listen = { id, col, t0: S.t, ignore: cfgRef.current.juice ? startCode : null, reject: null }
    note(`${label(id)} — ${col === 'kb' ? '키보드 키나 마우스 버튼' : '패드 버튼'}을 누르세요`, 'info')
    if (!cfgRef.current.juice && startCode) {
      // 흔한 실수: 대기를 시작한 Enter 가 아직 눌린 채라 그대로 새 키가 된다
      resolve(id, col, { kind: 'key', key: startCode })
      note(`⚠ 대기를 시작한 ${shortLabel({ kind: 'key', key: startCode })} 가 그대로 ${label(id)}에 들어갔다`, 'bad')
    }
  }

  const cancelListen = (why: string) => {
    const L = S.listen
    if (!L) return
    endListen()
    note(`${why} — 바뀐 것 없음 (${label(L.id)}: ${shortLabel(S.cells[L.id][L.col])})`, 'info')
  }

  const resolve = (id: string, col: Col, b: Binding) => {
    const c = cfgRef.current
    const cur = S.cells[id][col]
    if (sameOrNull(cur, b)) {
      endListen()
      note(`바뀐 것 없음 — ${label(id)}: 이미 ${bindingLabel(b)}`, 'info')
      return
    }
    if (c.juice) {
      const other = findConflict(S.cells, id, col, b)
      if (other) {
        if (c.policy === 'reject') {
          // 거절: 이유를 보이고 계속 기다린다 (남은 시간도 다시 채운다)
          if (S.listen) {
            S.listen.reject = { b, other }
            S.listen.t0 = S.t
          }
          note(`✕ ${bindingLabel(b)} — 이미 '${label(other)}'에 쓰는 입력. 다른 입력을 누르세요`, 'bad')
          return
        }
        S.listen = null
        S.pending = { id, col, b, other, prev: cur, choice: 0 }
        lock.open(performance.now())
        note(`⚠ ${bindingLabel(b)} — 이미 '${label(other)}'에 쓰는 입력`, 'warn')
        return
      }
    }
    apply(id, col, b)
    endListen()
    note(`✓ ${label(id)} ← ${bindingLabel(b)}`, 'ok')
  }

  /** 충돌 창에서 고르기. pressedAt = 누른 시각 (입력 잠금 판정) */
  const choose = (choice: 0 | 1, pressedAt = Number.POSITIVE_INFINITY) => {
    const P = S.pending
    if (!P) return
    if (lock.blocks(pressedAt)) return
    S.pending = null
    if (choice === 1) {
      note(`취소 — 바뀐 것 없음 (${label(P.id)}: ${shortLabel(P.prev)})`, 'info')
      return
    }
    apply(P.id, P.col, P.b)
    if (cfgRef.current.policy === 'unbind') {
      apply(P.other, P.col, null)
      note(`✓ ${label(P.id)} ← ${shortLabel(P.b)} · ‘${label(P.other)}’ 칸은 비었다 (키 없음)`, 'warn')
    } else {
      apply(P.other, P.col, P.prev)
      note(`✓ 맞바꿈 — ${label(P.id)} ← ${shortLabel(P.b)} · ${label(P.other)} ← ${shortLabel(P.prev)}`, 'ok')
    }
    S.flash = { id: P.id, col: P.col, n: (S.flash?.n ?? 0) + 1 }
  }

  /** 행 하나를 기본값으로. 되돌린 키를 다른 행이 쓰고 있으면 그 칸도 기본값으로 (기본값끼리는 겹치지 않는다) */
  const resetRow = (id: string) => {
    const queue: { id: string; col: Col }[] = [
      { id, col: 'kb' },
      { id, col: 'pad' },
    ]
    const also = new Set<string>()
    while (queue.length) {
      const q = queue.shift()!
      if (!isChanged(S.cells, q.id, q.col)) continue
      const def = q.col === 'kb' ? actionOf(q.id).kb : actionOf(q.id).pad
      apply(q.id, q.col, def)
      for (const a of ACTIONS)
        if (a.id !== q.id && def && sameOrNull(S.cells[a.id][q.col], def)) {
          queue.push({ id: a.id, col: q.col })
          also.add(a.id)
        }
    }
    note(`↺ ${label(id)} 기본값${also.size ? ` · 같은 키를 쓰던 ${[...also].map(label).join(' · ')}도 기본값으로` : ''}`, 'ok')
  }
  const resetAll = (quiet = false) => {
    const n = changedCount(S.cells)
    S.cells = defaultCells()
    S.savedN++
    S.listen = null
    S.pending = null
    if (!quiet) note(`↺ 전체 기본값 — 바뀐 ${n}개를 되돌리고 저장도 지웠다`, 'ok')
    touch()
  }

  const testInput = (b: Binding) => {
    if (sameBinding(b, FIXED_KEY) || sameBinding(b, FIXED_PAD)) S.test = { id: (S.test?.id ?? 0) + 1, b, ids: ['__menu'] }
    else S.test = { id: (S.test?.id ?? 0) + 1, b, ids: actionsFor(S.cells, b) }
    touch()
  }

  /* ───── 입력 하나 처리 (사람 · 자동 데모 공통) ───── */
  const keyInput = (code: string) => {
    const L = S.listen
    const c = cfgRef.current
    if (!L) return
    if (!c.juice) return resolve(L.id, L.col, { kind: 'key', key: code }) // 흔한 실수: Esc 도, 패드 칸에도 그대로
    if (L.ignore === code) return
    if (code === 'Escape') return cancelListen('취소 (Esc)')
    const os = osKeyReason(code)
    if (os) return note(`✕ ${os} — 다른 키를 누르세요`, 'bad')
    if (L.col === 'pad') return note('패드 칸 — 패드 버튼을 누르세요 (키보드 키는 받지 않는다)', 'info')
    resolve(L.id, L.col, { kind: 'key', key: code })
  }
  const padInput = (b: Binding | null, raw = '') => {
    const L = S.listen
    const c = cfgRef.current
    if (S.pending) {
      if (b?.kind === 'face' && b.face === 'bottom') choose(S.pending.choice, performance.now())
      else if ((b?.kind === 'face' && b.face === 'right') || b?.kind === 'start') choose(1)
      else if (b?.kind === 'dpad' && (b.dir === 'left' || b.dir === 'right')) {
        S.pending.choice = S.pending.choice ? 0 : 1
        touch()
      }
      return
    }
    if (!L) {
      if (b) testInput(b)
      return
    }
    if (!b) return note(`✕ ${raw || '이 버튼'} — 이 화면은 받지 않는다 (트리거 · 스틱 누르기는 글리프가 없어서, 보기 · 홈은 플랫폼 버튼이라)`, 'bad')
    if (!c.juice) return resolve(L.id, L.col, b)
    if (b.kind === 'start') return cancelListen('취소 (패드 메뉴 버튼)')
    if (L.col === 'kb') return note('키보드 칸 — 키보드 키나 마우스 버튼을 누르세요 (패드 버튼은 받지 않는다)', 'info')
    resolve(L.id, L.col, b)
  }

  const startHold = (by: 'human' | 'script' | 'key') => {
    if (!cfgRef.current.juice) {
      note('⚠ 복원 기능이 없다 — 바꾼 키를 하나씩 기억해 다시 눌러야 한다', 'bad')
      return
    }
    if (S.listen || S.pending) return
    S.hold = { t: 0, by }
    touch()
  }
  const releaseHold = () => {
    if (!S.hold) return
    if (S.hold.t < HOLD_S) note('끝까지 누르지 않아 전체 복원 취소', 'info')
    S.hold = null
    touch()
  }

  /** 사람이 넘겨받는다: 자동 데모 · 이벤트가 연 상태(또는 무대를 떠난 뒤 남은 상태)를 닫고 자동 데모를 멈춘다 */
  const takeOver = () => {
    if (S.listen) cancelListen('사람 입력 — 대기 닫음')
    else if (S.pending) {
      S.pending = null
      note('사람 입력 — 충돌 창 닫음 · 바뀐 것 없음', 'info')
    }
    S.hold = null
    human()
  }
  const busy = () => !!(S.listen || S.pending || S.hold)

  /* ───── 키보드: window 캡처 단계에서 받는다 ─────
   * 무대에 포커스가 있을 때만 가로챈다: 대기 · 충돌 창 중에는 모든 키, 평소에는 ↑↓←→ 칸 이동 · Enter 대기 시작 ·
   * Backspace 행 복원 · Delete 길게 = 전체 복원 · 묶인 키는 '시험해 보기'. 묶이지 않은 키(숫자 · J · S …)는 갤러리 단축키로 그대로.
   * 무대 밖에서 온 키, 또는 자동 데모가 연 상태에 들어온 키는 사람이 넘겨받은 것으로 보고 그 상태를 닫는다(무대 밖 키는 그대로 흘려보낸다).
   * 무대 밖 입력 칸(조절 패널의 슬라이더 · 선택 상자 · 검색창)은 절대 가로채지 않는다.
   * stopPropagation 만 쓴다 — window 캡처의 다른 듣기(useLastInput 의 장치 추적)는 그대로 돌게 */
  useEffect(() => {
    if (p.thumbnail) return
    const eat = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const onDown = (e: KeyboardEvent) => {
      const root = rootRef.current
      const target = e.target instanceof HTMLElement ? e.target : null
      const inStage = !!root && !!target && root.contains(target)
      const field = !inStage && !!target && (target.matches('input, select, textarea') || target.isContentEditable)
      const focused = !!root && root.contains(document.activeElement) && !field
      if (busy() && (!focused || S.by === 'auto')) {
        takeOver()
        sync()
        if (!focused) return
      }
      if (!focused) return
      if (S.listen) {
        // 대기 중에는 Ctrl · Alt · Shift 같은 키 하나도 그대로 받는다
        eat(e)
        human()
        const b = bindingFromKeyboard(e)
        if (!e.repeat && b.kind === 'key') keyInput(b.key)
        sync()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (S.pending) {
        eat(e)
        human()
        const k = e.key
        if (k === 'Escape') choose(1)
        else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Tab') {
          S.pending.choice = S.pending.choice ? 0 : 1
          touch()
        } else if ((k === 'Enter' || k === ' ') && !e.repeat) choose(S.pending.choice, e.timeStamp)
        sync()
        return
      }
      if (S.hold) {
        eat(e)
        return
      }
      // 평소 (무대 포커스)
      const k = e.key
      const f = S.focus
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        f.row = (f.row + (k === 'ArrowUp' ? -1 : 1) + FIXED_ROW + 1) % (FIXED_ROW + 1)
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        f.col = f.col === 'kb' ? 'pad' : 'kb'
      } else if (k === 'Enter') {
        if (e.repeat) return eat(e)
        S.by = 'human'
        if (f.row === FIXED_ROW) fixedNote()
        else startListen(ACTIONS[f.row].id, f.col, 'Enter')
      } else if (k === 'Backspace') {
        if (f.row < FIXED_ROW && cfgRef.current.juice) resetRow(ACTIONS[f.row].id)
      } else if (k === 'Delete') {
        if (!e.repeat) {
          S.by = 'human'
          startHold('key')
        }
      } else {
        // 시험해 보기: 묶인 키만 (나머지 · Esc 는 갤러리 단축키로 그대로)
        const b = bindingFromKeyboard(e)
        if (sameBinding(b, FIXED_KEY)) {
          testInput(b)
          sync()
          return
        }
        if (!actionsFor(S.cells, b).length) return
        human()
        testInput(b)
        sync()
        eat(e)
        return
      }
      eat(e)
      human()
      touch()
      sync()
    }
    const onUp = (e: KeyboardEvent) => {
      if (S.listen && S.listen.ignore === e.code) {
        S.listen.ignore = null
        e.stopPropagation()
      }
      if (S.hold?.by === 'key' && e.key === 'Delete') {
        releaseHold()
        sync()
      }
    }
    addEventListener('keydown', onDown, true)
    addEventListener('keyup', onUp, true)
    return () => {
      removeEventListener('keydown', onDown, true)
      removeEventListener('keyup', onUp, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.thumbnail])

  const fixedNote = () => note('메뉴 열기 · 대기 취소는 바꿀 수 없다 — 다른 키를 어떻게 바꿔도 Esc · 패드 메뉴 버튼으로 늘 빠져나올 수 있게', 'info')

  /* ───── 포인터 ───── */
  const onRootPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    rootRef.current?.focus({ preventScroll: true })
    if (busy() && S.by === 'auto') {
      // 자동 데모가 연 대기에 사람 클릭 — 넘겨받고, 이 클릭은 평소처럼 처리한다
      takeOver()
      sync()
      return
    }
    const L = S.listen
    if (!L) return
    const t = e.target as Element
    const onCell = t.closest(`[data-cell="${L.id}:${L.col}"]`)
    if (t.closest('[data-ui]') && !onCell) return // 가상 패드 · 취소 버튼은 각자 처리
    human()
    const btn = e.button === 2 ? 'right' : e.button === 1 ? 'wheel' : 'left'
    if (onCell || !cfgRef.current.juice) {
      if (L.col === 'kb' || !cfgRef.current.juice) {
        // click 은 왼쪽 버튼에만 온다 — 오른쪽 · 휠로 바꾼 뒤 다음 왼쪽 클릭을 삼키지 않게
        S.swallowClick = e.button === 0
        e.preventDefault()
        resolve(L.id, L.col, { kind: 'mouse', button: btn })
      }
    } else cancelListen('바깥을 눌러 취소')
    sync()
  }
  const onCellClick = (id: string, col: Col) => {
    if (p.thumbnail) return
    if (S.swallowClick) {
      S.swallowClick = false
      return
    }
    human()
    if (S.pending) return
    S.by = 'human'
    startListen(id, col)
    sync()
  }
  const onVirtualPad = (b: Binding) => (e: ReactPointerEvent) => {
    if (p.thumbnail) return
    e.stopPropagation()
    padUntilSeq.current = last.seq + 1
    if (busy() && S.by === 'auto') takeOver()
    else if (!busy()) S.by = 'human'
    human()
    padInput(b)
    sync()
  }

  /* ───── 이벤트 · 자동 데모 ───── */
  const ensure = (id: string, col: Col) => {
    const def = col === 'kb' ? actionOf(id).kb : actionOf(id).pad
    if (!sameOrNull(S.cells[id][col], def)) apply(id, col, def)
    // 기본 키를 다른 행이 가져갔다면 그 행도 기본값으로
    for (const a of ACTIONS) if (a.id !== id && def && sameOrNull(S.cells[a.id][col], def)) apply(a.id, col, col === 'kb' ? a.kb : a.pad)
  }
  const freePad = (b: Binding) => {
    for (const a of ACTIONS) if (sameOrNull(S.cells[a.id].pad, b)) apply(a.id, 'pad', a.pad)
  }
  const DPAD_UP: Binding = { kind: 'dpad', dir: 'up' }
  const handle = (id: string) => {
    S.listen = null
    S.pending = null
    S.hold = null
    if (id === 'conflict') {
      ensure('jump', 'kb')
      ensure('interact', 'kb')
      startListen('jump', 'kb')
      keyInput('KeyE')
      if (!cfgRef.current.juice) testInput({ kind: 'key', key: 'KeyE' }) // 나쁜 예: 경고 없이 겹친 결과를 바로 보여 준다
    } else if (id === 'escape') {
      ensure('scan', 'kb')
      startListen('scan', 'kb')
      keyInput('Escape')
    } else if (id === 'listen') {
      startListen('sprint', 'kb')
    } else if (id === 'pad') {
      S.demoDevice = 'pad'
      ensure('interact', 'pad')
      freePad(DPAD_UP)
      startListen('interact', 'pad')
      padInput(DPAD_UP)
    } else if (id === 'reset') {
      if (cfgRef.current.juice && changedCount(S.cells) < 2) {
        apply('repair', 'kb', { kind: 'key', key: 'KeyR' })
        apply('crouch', 'pad', { kind: 'dpad', dir: 'down' })
      }
      startHold('script')
    }
    touch()
  }
  useTrigger(p.trigger, id => {
    human()
    S.by = 'event'
    handle(id)
    // '키 입력 대기' 는 다음 키를 받으려는 것 — 무대에 포커스를 줘서 그 키가 무대로 오게 한다
    if (id === 'listen' && !p.thumbnail) rootRef.current?.focus({ preventScroll: true })
    sync()
  })

  /** 자동 데모 한 바퀴 — 지금 설정(효과 · 충돌 정책 · 대기 시간)을 보고 정한다 */
  const plan = (): Step[] => {
    const c = cfgRef.current
    const fn = (f: () => void): Step => ({ fn: f })
    const w = (sec: number): Step => ({ wait: sec })
    const steps: Step[] = [
      w(0.6),
      fn(() => {
        ensure('jump', 'kb')
        ensure('interact', 'kb')
        startListen('jump', 'kb')
      }),
      w(1.3),
      fn(() => keyInput('KeyE')),
      w(1.8),
    ]
    if (!c.juice) steps.push(fn(() => testInput({ kind: 'key', key: 'KeyE' })), w(1.8))
    else if (c.policy === 'reject') steps.push(fn(() => keyInput('KeyG')), w(1.4))
    else steps.push(fn(() => choose(0)), w(1.6))
    steps.push(
      fn(() => {
        ensure('scan', 'kb')
        startListen('scan', 'kb')
      }),
      w(1.2),
      fn(() => keyInput('Escape')),
      w(1.8),
      fn(() => {
        S.demoDevice = 'pad'
        freePad(DPAD_UP)
        startListen('interact', 'pad')
      }),
      w(1.2),
      fn(() => padInput(DPAD_UP)),
      w(1.2),
      fn(() => testInput(DPAD_UP)),
      w(1.6),
      fn(() => {
        S.demoDevice = null
        startListen('sprint', 'kb')
      }),
    )
    if (c.juice && c.timeoutMs > 0) steps.push(w(c.timeoutMs / 1000 + 0.9))
    else steps.push(w(2.6), fn(() => keyInput(c.juice ? 'Escape' : 'KeyF')), w(1.4))
    steps.push(fn(() => startHold('script')), w(c.juice ? HOLD_S + 1.6 : 1.8))
    if (!c.juice) steps.push(fn(() => resetAll(true)))
    steps.push(w(0.6))
    return steps
  }

  const runScript = (dt: number) => {
    const q = S.script
    if (!q) return
    if (!q.length) {
      S.script = null
      return
    }
    const st = q[0]
    if ('fn' in st) {
      q.shift()
      S.by = 'auto'
      st.fn()
      touch()
      return
    }
    S.stepT += dt
    if (S.stepT >= st.wait) {
      S.stepT = 0
      q.shift()
    }
  }

  /* ───── 실제 게임패드 (Gamepad API) ───── */
  const pollPad = () => {
    if (typeof navigator.getGamepads !== 'function') return
    let pads: (Gamepad | null)[] = []
    try {
      pads = navigator.getGamepads()
    } catch {
      return
    }
    const gp = pads.find(x => x && x.connected)
    if (!gp) return
    gp.buttons.forEach((btn, i) => {
      const was = S.padPrev[i] ?? false
      if (btn.pressed && !was) {
        if (busy() && S.by === 'auto') takeOver()
        else if (!busy()) S.by = 'human'
        human()
        padUntilSeq.current = -1
        const b = padBindingFromIndex(i)
        padInput(b, `${i}번 버튼`)
      }
      S.padPrev[i] = btn.pressed
    })
  }

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    const c = cfgRef.current
    S.t += dt
    if (!p.thumbnail) pollPad()
    if (p.autoplay && !p.thumbnail && !S.script && !S.listen && !S.pending && !S.hold && S.t - realAt.current > MANUAL_PAUSE) {
      S.script = plan()
      S.stepT = 0
    }
    if (S.script && !p.autoplay) S.script = null
    runScript(dt)
    // 대기 시간 초과 (좋은 예만 — 나쁜 예는 끝없이 기다린다)
    const L = S.listen
    if (L && c.juice && c.timeoutMs > 0 && S.t - L.t0 >= c.timeoutMs / 1000) cancelListen('⏱ 시간 초과')
    paint()
    sync()
  })

  /* ───── 매 프레임 그리기 (남은 시간 · 길게 누르기 · 입력 잠금) ───── */
  const timeBarRef = useRef<HTMLDivElement>(null)
  const timeNumRef = useRef<HTMLElement>(null)
  const cellBarRef = useRef<HTMLDivElement>(null)
  const holdRef = useRef<HTMLDivElement>(null)
  const lockRef = useRef<HTMLDivElement>(null)
  const paint = () => {
    const c = cfgRef.current
    const L = S.listen
    const total = c.timeoutMs / 1000
    const left = L && c.juice && total > 0 ? Math.max(0, total - (S.t - L.t0)) : 0
    const k = total > 0 ? left / total : 0
    if (timeBarRef.current) timeBarRef.current.style.transform = `scaleX(${k})`
    if (cellBarRef.current) cellBarRef.current.style.transform = `scaleX(${k})`
    if (timeNumRef.current) timeNumRef.current.textContent = `${left.toFixed(1)}초`
    if (holdRef.current) holdRef.current.style.transform = `scaleX(${S.hold ? Math.min(1, S.hold.t / HOLD_S) : 0})`
    if (lockRef.current) lockRef.current.style.transform = `scaleX(${S.pending ? lock.progress(performance.now()) : 1})`
  }
  useLayoutEffect(() => paint())

  /* 길게 누르기는 실제 시간으로 센다 — 메뉴 확인 동작이라 일시정지 · 배속과 무관하게 1초 */
  const holding = !!S.hold
  useEffect(() => {
    if (!holding) return
    let raf = 0
    let prev = performance.now()
    const tick = (now: number) => {
      const h = S.hold
      if (!h) return
      h.t += Math.min(0.1, Math.max(0, now - prev) / 1000)
      prev = now
      if (h.t >= HOLD_S) {
        S.hold = null
        resetAll()
        sync()
        return
      }
      paint()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding])

  /* ───── 렌더 ───── */
  const L = S.listen
  const P = S.pending
  const cells = S.cells
  const nChanged = changedCount(cells)
  const firstChanged = Math.max(
    0,
    ACTIONS.findIndex(a => isChanged(cells, a.id, 'kb') || isChanged(cells, a.id, 'pad')),
  )
  const json = overridesJson(cells)
  const policyText = { swap: '맞바꾸기를 물어본다', unbind: '다른 행을 비울지 물어본다', reject: '거절하고 계속 기다린다' }[policy]
  const conflictInfo = P ? { b: P.b, other: P.other, id: P.id } : L?.reject ? { b: L.reject.b, other: L.reject.other, id: L.id } : null
  // 충돌 창은 바꾸려는 행과 이미 쓰는 행 둘 다의 아래에 — 두 행이 늘 보이게
  const rowOf = (id: string) => ACTIONS.findIndex(a => a.id === id)
  const conflictLow = conflictInfo ? Math.max(rowOf(conflictInfo.id), rowOf(conflictInfo.other)) : 4
  const conflictTop = Math.min(rowTop(conflictLow) + ROW_H + 4, 1076 - 210)
  // 나쁜 예: 안내가 기본 키를 하드코딩 — 바꿔도, 패드를 잡아도 그대로
  const promptCol: Col = juice ? device : 'kb'
  const promptOf = (id: string): Binding | null => (juice ? cells[id][promptCol] : actionOf(id).kb)
  const ts = Math.max(0.05, p.timeScale)

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-listening={L ? L.col : undefined}
      style={{ '--ts': ts } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="조작 재설정 메뉴 (↑↓←→ 칸 이동, Enter 새 키 입력, Esc 취소, Backspace 행 복원, Delete 길게 전체 복원)"
      onPointerDown={onRootPointerDown}
      onContextMenu={e => e.preventDefault()}
    >
      <div className={s.bg} aria-hidden />

      {/* 머리 */}
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>설정 · 조작</p>
          <h2 className={s.title}>조작 재설정</h2>
        </div>
        <div className={s.headRight}>
          <span className={s.deviceChip} data-dev={device}>
            <i aria-hidden />
            마지막 입력 · {device === 'pad' ? '게임패드' : '키보드 · 마우스'}
          </span>
          <div
            className={s.holdBtn}
            role="button"
            data-ui
            data-off={!juice || undefined}
            data-holding={S.hold ? true : undefined}
            onPointerDown={e => {
              if (p.thumbnail) return
              e.stopPropagation()
              if (busy() && S.by === 'auto') takeOver()
              human()
              S.by = 'human'
              startHold('human')
              sync()
            }}
            onPointerUp={() => {
              if (S.hold?.by === 'human') releaseHold()
              sync()
            }}
            onPointerLeave={() => {
              if (S.hold?.by === 'human') releaseHold()
              sync()
            }}
          >
            <div ref={holdRef} className={s.holdFill} aria-hidden />
            <span>↺ 전체 기본값 (길게 누르기)</span>
          </div>
        </div>
      </header>

      {/* 입력표 */}
      <div className={s.table} role="grid" aria-label="행동별 입력">
        <div className={s.thead} role="row">
          <span className={s.thAction}>행동</span>
          <span className={s.th} data-now={device === 'kb' || undefined}>
            키보드 · 마우스{device === 'kb' && <em>지금 장치</em>}
          </span>
          <span className={s.th} data-now={device === 'pad' || undefined}>
            게임패드{device === 'pad' && <em>지금 장치</em>}
          </span>
          <span className={s.thRestore}>{juice ? '복원' : ''}</span>
        </div>
        {ACTIONS.map((a, row) => {
          const changedRow = juice && (isChanged(cells, a.id, 'kb') || isChanged(cells, a.id, 'pad'))
          return (
            <div key={a.id} className={s.tr} role="row" data-active={L?.id === a.id || P?.id === a.id || undefined} data-other={conflictInfo?.other === a.id || undefined}>
              <span className={s.tdAction}>
                {a.label}
                {conflictInfo?.other === a.id && <em className={s.otherTag}>이미 쓰는 행</em>}
                {juice && (!cells[a.id].kb || (a.pad && !cells[a.id].pad)) && <em className={s.empty}>⚠ 키 없음</em>}
              </span>
              {(['kb', 'pad'] as Col[]).map(col => {
                const b = cells[a.id][col]
                const listening = L?.id === a.id && L.col === col
                const locked = col === 'pad' && !a.pad
                return (
                  <div
                    key={col}
                    className={s.cell}
                    role="gridcell"
                    aria-label={`${a.label} ${col === 'kb' ? '키보드' : '패드'}: ${locked ? '왼쪽 스틱 (고정)' : b ? bindingLabel(b) : '비어 있음'}`}
                    data-cell={`${a.id}:${col}`}
                    data-focus={(S.focus.row === row && S.focus.col === col) || undefined}
                    data-listening={listening || undefined}
                    data-locked={locked || undefined}
                    data-empty={(!locked && !b) || undefined}
                    data-now={col === device || undefined}
                    onClick={() => onCellClick(a.id, col)}
                  >
                    {listening ? (
                      <span className={s.waitText}>
                        {juice ? (col === 'kb' ? '키나 마우스 버튼…' : '패드 버튼…') : '입력 대기…'}
                        <div ref={juice && timeoutMs > 0 ? cellBarRef : undefined} className={s.cellBar} data-on={(juice && timeoutMs > 0) || undefined} />
                      </span>
                    ) : locked ? (
                      <>
                        <StickGlyph dir={a.stick ?? 'up'} />
                        <span className={s.cellText}>왼쪽 스틱</span>
                        <LockIcon />
                      </>
                    ) : b ? (
                      <>
                        <BindingGlyph binding={b} size={40} />
                        {(b.kind !== 'key' || shortLabel(b).length > 1) && <span className={s.cellText}>{shortLabel(b)}</span>}
                      </>
                    ) : (
                      <span className={s.cellText}>— 비어 있음</span>
                    )}
                    {juice && isChanged(cells, a.id, col) && !listening && <span className={s.mark}>바뀜</span>}
                    {S.flash && S.flash.id === a.id && S.flash.col === col && <span key={S.flash.n} className={s.flashRing} aria-hidden />}
                  </div>
                )
              })}
              <span className={s.tdRestore} data-part={row === firstChanged ? 'changed' : undefined} data-hide={!juice || undefined}>
                <span
                  className={s.restoreBtn}
                  role="button"
                  data-ui
                  aria-label={`${a.label} 기본값으로`}
                  data-off={!changedRow || undefined}
                  onClick={() => {
                    if (p.thumbnail || !juice || !changedRow) return
                    human()
                    resetRow(a.id)
                    sync()
                  }}
                >
                  ↺
                </span>
              </span>
            </div>
          )
        })}
        {/* 고정 행 — 바꿀 수 없는 이유를 보여 준다 */}
        <div className={s.tr} role="row" data-fixed>
          <span className={s.tdAction}>
            메뉴 열기 · 대기 취소
            <em className={s.fixedTag}>고정</em>
          </span>
          {(['kb', 'pad'] as Col[]).map(col => (
            <div
              key={col}
              className={s.cell}
              role="gridcell"
              data-locked
              data-focus={(S.focus.row === FIXED_ROW && S.focus.col === col) || undefined}
              data-now={col === device || undefined}
              onClick={() => {
                if (p.thumbnail) return
                human()
                S.focus = { row: FIXED_ROW, col }
                fixedNote()
                sync()
              }}
            >
              <BindingGlyph binding={col === 'kb' ? FIXED_KEY : FIXED_PAD} size={40} />
              <span className={s.cellText}>{col === 'kb' ? 'Esc' : '메뉴 버튼'}</span>
              <LockIcon />
            </div>
          ))}
          <span className={s.tdRestore} />
        </div>
      </div>

      {/* 충돌 창 — 바꾸려던 행 바로 아래(또는 위)에 */}
      <div
        className={s.conflict}
        data-part="conflict"
        data-show={conflictInfo ? true : undefined}
        data-reject={(!P && !!L?.reject) || undefined}
        style={{ top: conflictTop }}
        role="alertdialog"
        aria-live="assertive"
      >
        {conflictInfo && (
          <>
            <p className={s.conflictHead}>
              <WarnIcon /> 이미 쓰는 입력
            </p>
            <p className={s.conflictBody}>
              <BindingGlyph binding={conflictInfo.b} size={36} /> <b>{bindingLabel(conflictInfo.b)}</b> — 지금 <b>‘{label(conflictInfo.other)}’</b>에 쓰고 있다.
            </p>
            {P ? (
              <div className={s.choices}>
                <span className={s.choice} role="button" data-ui data-on={P.choice === 0 || undefined} onClick={() => (human(), choose(0, performance.now()), sync())}>
                  {policy === 'unbind' ? `바꾸고 ‘${label(P.other)}’ 비우기` : `맞바꾸기 · ${label(P.other)} ← ${shortLabel(P.prev)}`}
                </span>
                <span className={s.choice} role="button" data-ui data-on={P.choice === 1 || undefined} onClick={() => (human(), choose(1), sync())}>
                  취소 · 그대로 {shortLabel(P.prev)}
                </span>
                <div className={s.lockBar} aria-hidden>
                  <div ref={lockRef} />
                </div>
              </div>
            ) : (
              <div className={s.choices}>
                <span className={s.rejectText}>다른 입력을 누르세요 · 대기 계속</span>
                <span className={s.choice} role="button" data-ui onClick={() => (human(), cancelListen('취소'), sync())}>
                  대기 취소
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 입력 안내 (장치별 글리프) */}
      <div className={s.prompts} data-part="glyph">
        <span className={s.promptDev}>{promptCol === 'pad' ? '패드' : '키보드'}</span>
        {(['jump', 'interact', 'repair', 'scan'] as const).map(id => {
          const b = promptOf(id)
          const hit = S.test?.ids.includes(id)
          return (
            <span key={id} className={s.prompt} data-hit={hit || undefined}>
              {b ? <BindingGlyph binding={b} size={40} /> : <span className={s.noKey}>키 없음</span>}
              {label(id)}
            </span>
          )
        })}
      </div>

      {/* 상태 · 키 입력 대기 */}
      <section className={s.status} data-part="listen" data-mode={L ? 'listen' : P ? 'conflict' : 'idle'}>
        <p className={s.cardHead}>{L ? '키 입력 대기' : P ? '확인 필요' : S.hold ? '전체 기본값 복원' : '바꿀 칸을 고르세요'}</p>
        {L ? (
          <>
            <p className={s.listenTitle}>
              <b>{label(L.id)}</b> · {L.col === 'kb' ? '키보드 · 마우스' : '게임패드'}
            </p>
            <div className={s.timeRow} data-off={!juice || timeoutMs <= 0 || undefined}>
              {juice && timeoutMs > 0 ? (
                <>
                  <b ref={timeNumRef} className={s.timeNum}>
                    {(timeoutMs / 1000).toFixed(1)}초
                  </b>
                  <div className={s.timeTrack}>
                    <div ref={timeBarRef} className={s.timeBar} />
                  </div>
                </>
              ) : (
                <span className={s.noLimit}>{juice ? '시간 제한 없음' : '시간 제한 · 취소 키 없음 — 무언가 눌러야 끝난다'}</span>
              )}
            </div>
            <p className={s.hint}>
              {juice ? (
                <>
                  <BindingGlyph binding={FIXED_KEY} size={34} /> · <BindingGlyph binding={FIXED_PAD} size={34} /> 취소{timeoutMs > 0 ? ' · 시간이 지나면 그대로' : ''}
                </>
              ) : (
                '(아무 안내 없음)'
              )}
            </p>
          </>
        ) : S.hold ? (
          <>
            <p className={s.listenTitle}>
              바뀐 <b>{nChanged}</b>개를 모두 기본값으로
            </p>
            <p className={s.policy}>
              {HOLD_S}초 동안 누르고 있으면 복원 · 중간에 떼면 취소
              <br />
              실수로 한 번 눌러 모든 설정을 잃지 않게
            </p>
          </>
        ) : P ? (
          <>
            <p className={s.listenTitle}>
              <b>{label(P.id)}</b> ← {shortLabel(P.b)} ?
            </p>
            <p className={s.policy}>
              충돌 창에서 고르세요 · ←→ 고르기 · Enter 확정 · Esc 취소
              <br />
              창이 뜬 직후 0.3초는 확정을 막는다 (입력 잠금)
            </p>
          </>
        ) : (
          <>
            <p className={s.idleText}>칸을 클릭하거나 ↑↓←→ 로 골라 Enter</p>
            <p className={s.policy}>
              충돌하면 · <b>{juice ? policyText : '그냥 둔다 (경고 없음)'}</b>
              <br />
              대기 시간 · <b>{juice ? (timeoutMs > 0 ? `${timeoutMs / 1000}초` : '제한 없음') : '끝없음'}</b>
            </p>
          </>
        )}
        <p key={S.note.id} className={s.note} data-tone={S.note.tone} aria-live="polite">
          {S.note.id === 0 && !juice ? '키를 바꿔 보세요' : S.note.text}
        </p>
      </section>

      {/* 시험해 보기 + 가상 패드 */}
      <section className={s.tester}>
        <p className={s.cardHead}>시험해 보기</p>
        <p key={S.test?.id ?? 0} className={s.testLine} data-dup={(S.test && S.test.ids.length > 1) || undefined}>
          {S.test ? (
            <>
              <BindingGlyph binding={S.test.b} size={38} /> →{' '}
              {S.test.ids[0] === '__menu' ? (
                '메뉴 열기 (고정)'
              ) : S.test.ids.length ? (
                <>
                  <b>{S.test.ids.map(label).join(' + ')}</b>
                  {S.test.ids.length > 1 && <em> ⚠ 한 입력에 행동 {S.test.ids.length}개</em>}
                </>
              ) : (
                <span className={s.muted}>묶인 행동 없음</span>
              )}
            </>
          ) : (
            <span className={s.muted}>무대를 클릭하고 키를 누르거나, 가상 패드를 눌러 보세요</span>
          )}
        </p>
        <div className={s.vpad} data-wait={L?.col === 'pad' || undefined} aria-label="가상 게임패드">
          <div className={s.vpCross}>
            {(['up', 'left', 'right', 'down'] as const).map(dir => (
              <VBtn key={dir} b={{ kind: 'dpad', dir }} onDown={onVirtualPad} area={dir} />
            ))}
          </div>
          <div className={s.vpMid}>
            <div className={s.vpShoulders}>
              {(['L', 'R'] as const).map(side => (
                <VBtn key={side} b={{ kind: 'shoulder', side }} onDown={onVirtualPad} />
              ))}
            </div>
            <VBtn b={FIXED_PAD} onDown={onVirtualPad} />
            <span className={s.vpLabel}>가상 패드</span>
          </div>
          <div className={s.vpCross}>
            {(['top', 'left', 'right', 'bottom'] as const).map(face => (
              <VBtn key={face} b={{ kind: 'face', face }} onDown={onVirtualPad} area={face === 'top' ? 'up' : face === 'bottom' ? 'down' : face} />
            ))}
          </div>
        </div>
      </section>

      {/* 저장 JSON */}
      <JsonCard lines={json} count={nChanged} savedN={S.savedN} open={showJson} />
    </div>
  )
}

/* ───── 처음 상태 ───── */
function initSim(thumbnail: boolean, juice: boolean): Sim {
  const cells = defaultCells()
  // 첫 화면부터 '바뀐 행' 과 저장 JSON 이 보이게 두 칸을 바꿔 둔다
  cells.repair = { ...cells.repair, kb: { kind: 'key', key: 'KeyR' } }
  cells.crouch = { ...cells.crouch, pad: { kind: 'dpad', dir: 'down' } }
  const S: Sim = {
    t: 0,
    version: 0,
    cells,
    focus: { row: 4, col: 'kb' },
    listen: null,
    pending: null,
    note: { id: 0, text: '바꾼 칸에는 ‘바뀜’ 표시 · ↺ 로 그 행만 기본값', tone: 'info' },
    noteN: 0,
    test: null,
    hold: null,
    flash: null,
    savedN: 0,
    script: null,
    stepT: 0,
    demoDevice: null,
    padPrev: [],
    swallowClick: false,
    by: 'human',
  }
  // 썸네일: 핵심 장면(충돌 경고와 맞바꾸기)을 정지 화면으로
  if (thumbnail && juice) {
    S.pending = { id: 'jump', col: 'kb', b: { kind: 'key', key: 'KeyE' }, other: 'interact', prev: { kind: 'key', key: 'Space' }, choice: 0 }
    S.note = { id: 1, text: '⚠ E 키 — 이미 ‘상호작용’에 쓰는 입력', tone: 'warn' }
  }
  return S
}

/* ───── 작은 부품 ───── */
function VBtn({ b, onDown, area }: { b: Binding; onDown: (b: Binding) => (e: ReactPointerEvent) => void; area?: string }) {
  return (
    <span className={s.vbtn} role="button" data-ui aria-label={`가상 ${bindingLabel(b)}`} style={area ? ({ gridArea: area } as CSSProperties) : undefined} onPointerDown={onDown(b)}>
      <BindingGlyph binding={b} size={44} />
    </span>
  )
}

function JsonCard({ lines, count, savedN, open: openParam }: { lines: string[]; count: number; savedN: number; open: boolean }) {
  const [open, setOpen] = useState(openParam)
  useEffect(() => setOpen(openParam), [openParam])
  const preRef = useRef<HTMLPreElement>(null)
  useLayoutEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
  })
  return (
    <section className={s.json} data-part="json" data-open={open || undefined}>
      <div
        className={s.jsonHead}
        role="button"
        data-ui
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
      >
        <span className={s.caret} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        저장 데이터 · 바뀐 {count}개
        <span key={savedN} className={s.saved} data-fresh={savedN > 0 || undefined}>
          PlayerPrefs 저장됨
        </span>
      </div>
      {open && (
        <>
          <pre ref={preRef} className={s.pre}>
            {lines.join('\n')}
          </pre>
          <p className={s.jsonFoot}>바뀐 것만 담는다 · interactions · processors 줄임</p>
        </>
      )}
    </section>
  )
}

function StickGlyph({ dir, size = 40 }: { dir: StickDir; size?: number }) {
  const c = size / 2
  const o = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]
  const d = size * 0.17
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`왼쪽 스틱 ${dir}`} style={{ verticalAlign: 'middle' }}>
      <circle cx={c} cy={c} r={c - 1.5} fill="rgba(10,14,22,0.75)" stroke="#f4f7fb" strokeWidth="2" />
      <circle cx={c + o[0] * d} cy={c + o[1] * d} r={size * 0.2} fill="#f4f7fb" />
      <text x={c + o[0] * d} y={c + o[1] * d + size * 0.1} textAnchor="middle" fontSize={size * 0.28} fontWeight="700" fill="#10141c" fontFamily="'Chakra Petch', sans-serif">
        L
      </text>
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className={s.lock} viewBox="0 0 20 24" role="img" aria-label="고정">
      <path d="M5 10 V7 a5 5 0 0 1 10 0 V10" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="2" y="10" width="16" height="12" rx="2.5" fill="currentColor" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg className={s.warnIcon} viewBox="0 0 24 22" aria-hidden>
      <path d="M12 1 L23 21 H1 Z" fill="currentColor" />
      <path d="M12 8 V14 M12 16.5 V18" stroke="#1b1300" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}
