import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { easeInOutSine } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { damp, useGameLoop, useTrigger } from '../../core/hooks'
import { bool, num, str } from '../../core/params'
import type { SpecimenProps } from '../../core/types'
import {
  BUILDINGS,
  BUILD_ORDER,
  CELL,
  COLS,
  INITIAL,
  MAP_X,
  MAP_Y,
  PATH,
  PATH_LEN,
  PATH_PX,
  ROWS,
  WATER,
  findSpot,
  footprint,
  key,
  occupancy,
  pathInRange,
  pointOnPath,
  reasonText,
  snapOrigin,
  validate,
  type BuildingDef,
  type BuildingId,
  type Check,
  type Placed,
  type Reason,
} from './model'
import s from './style.module.css'

export { meta } from './meta'

const MAP_W = COLS * CELL
const MAP_H = ROWS * CELL
const PANEL_X = 1600
const PAL = { x: 1600, y: 150, w: 290, h: 168, gap: 18 }
const BTN = { w: 170, h: 76, gap: 12 }
const INCOME = 4
const MANUAL_PAUSE = 6
const DRONE_SPEED = 85
const START_SPOT: [number, number] = [8, 8]

interface Ghost {
  id: BuildingId
  rot: number
  /** 스냅한 원점 칸 */
  ox: number
  oy: number
  /** 겨누는 점 (무대 px, 터치는 손가락 위로 띄운 점) */
  mx: number
  my: number
  show: boolean
  owner: 'human' | 'script'
  /** 터치: 손을 뗐고 확인 · 취소를 기다린다 */
  pending: boolean
  drag: boolean
}

type Step =
  | { k: 'to'; x: number; y: number; dur: number }
  | { k: 'toCell'; id: BuildingId; x: number; y: number; dur: number; lift?: boolean }
  | { k: 'toBtn'; which: 'ok' | 'no'; dur: number }
  | { k: 'down' }
  | { k: 'up' }
  | { k: 'rot' }
  | { k: 'wait'; dur: number }
  | { k: 'call'; fn: () => void }
  | { k: 'plan' }

interface Sim {
  t: number
  version: number
  credits: number
  placed: Placed[]
  uidN: number
  ghost: Ghost | null
  ptr: { x: number; y: number }
  lastTouch: boolean
  forceTouch: boolean
  finger: { x: number; y: number } | null
  gx: number
  gy: number
  gInit: boolean
  shakeAt: number
  palShake: { id: BuildingId; at: number } | null
  pops: { id: number; x: number; y: number; text: string; at: number }[]
  popN: number
  note: { text: string; tone: 'ok' | 'bad' | 'info'; until: number } | null
  script: Step[] | null
  scriptEvent: boolean
  stepT: number
  stepFrom: { x: number; y: number } | null
  stepTo: { x: number; y: number } | null
  vp: { x: number; y: number; down: boolean } | null
  autoStep: number
  /** 나쁜 예의 검사 결과 칸: 마지막으로 놓아 본 결과 (놓기 전에는 모른다) */
  lastTry: boolean | null
}

const palRect = (i: number) => ({ x: PAL.x, y: PAL.y + i * (PAL.h + PAL.gap), w: PAL.w, h: PAL.h })
const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
const onMap = (x: number, y: number) => x >= MAP_X && x < MAP_X + MAP_W && y >= MAP_Y && y < MAP_Y + MAP_H
const bbox = (def: BuildingDef, rot: number) => {
  const fp = footprint(def, rot)
  const xs = fp.map(c => c.x)
  const ys = fp.map(c => c.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 }
}

/**
 * 건설 배치 미리보기 (2D 탑다운).
 * 포인터(화면) → 맵 좌표 → 칸 스냅 → 검사(사유 enum) → 고스트 색 · 무늬 · 사유 문구 · 사거리. 터치는 손가락 위로 띄워 끌고, 손을 뗀 뒤 확인 버튼으로 2단계 설치.
 */
export default function BuildPlacementPreview(p: SpecimenProps) {
  const juice = p.juice
  const cue = juice ? str(p.params, 'validityCue', 'full') : 'after'
  const rangeMode = juice ? str(p.params, 'rangeMode', 'cells') : 'none'
  const showAll = juice && bool(p.params, 'showAllRanges', true)
  const gridLines = str(p.params, 'gridLines', 'placing')
  const device = str(p.params, 'inputDevice', 'auto')
  const lift = num(p.params, 'touchLiftPx', 120)
  const lerpMs = num(p.params, 'snapLerpMs', 60)
  const startCredits = num(p.params, 'startCredits', 260)
  const reduced = prefersReducedMotion()
  const cfg = { juice, cue, lift, lerpMs: reduced ? 0 : lerpMs, device, playing: p.playing, reduced }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(startCredits, p.thumbnail ? 'thumb' : p.autoplay ? 'auto' : 'none')
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
  const note = (text: string, tone: 'ok' | 'bad' | 'info' = 'info') => {
    S.note = { text, tone, until: S.t + 2.8 }
    touch()
  }
  const rootRef = useRef<HTMLDivElement>(null)
  const realAt = useRef(-1e9)

  const isTouch = () => S.forceTouch || cfgRef.current.device === 'touch' || (cfgRef.current.device === 'auto' && S.lastTouch)
  /** 좋은 예의 터치만 고스트를 손가락 위로 띄운다 */
  const liftPx = () => (isTouch() && cfgRef.current.juice ? cfgRef.current.lift : 0)
  /**
   * 손가락 y 에서 실제로 띄울 거리. 화면 아래 가장자리에 가까우면 남은 높이만큼만 띄운다 —
   * 늘 lift 만큼 띄우면 맨 아래 줄은 손가락이 화면 밖에 있어야 닿는다 (1080 − 160 < 맨 아래 줄)
   */
  const liftAt = (fy: number) => Math.min(liftPx(), Math.max(0, p.height - fy))
  /** 고스트를 gy 에 두려면 손가락을 어디에 (liftAt 의 역함수 — 시연용) */
  const fingerFor = (gy: number) => {
    const L = liftPx()
    return gy + 2 * L <= p.height ? gy + L : (gy + p.height) / 2
  }

  /* ───── 고스트 ───── */
  const aim = (x: number, y: number) => {
    const g = S.ghost
    if (!g) return
    const def = BUILDINGS[g.id]
    const [ox, oy] = snapOrigin(def, x - MAP_X, y - MAP_Y)
    const show = x < PANEL_X - 8 && y > MAP_Y - CELL && y < MAP_Y + MAP_H + CELL && x > MAP_X - CELL
    g.mx = x
    g.my = y
    if (ox !== g.ox || oy !== g.oy || show !== g.show) {
      g.ox = ox
      g.oy = oy
      g.show = show
      touch()
    }
  }
  const setOrigin = (ox: number, oy: number) => {
    const g = S.ghost
    if (!g) return
    const def = BUILDINGS[g.id]
    g.ox = ox
    g.oy = oy
    g.mx = MAP_X + (ox + def.w / 2) * CELL
    g.my = MAP_Y + (oy + def.h / 2) * CELL
    g.show = true
    touch()
  }
  const pick = (id: BuildingId, owner: Ghost['owner'], fromKey = false) => {
    const def = BUILDINGS[id]
    if (cfgRef.current.juice && S.credits < def.cost) {
      // 좋은 예: 살 수 없으면 집기 상태로 들어가지 않는다 — 바로 이유
      S.palShake = { id, at: S.t }
      note(`${def.name}: 크레딧 ${def.cost - Math.floor(S.credits)} 부족 — 고르지 않는다`, 'bad')
      return
    }
    const prev = S.ghost
    S.ghost = { id, rot: 0, ox: 0, oy: 0, mx: 0, my: 0, show: false, owner, pending: false, drag: false }
    S.gInit = false
    S.lastTry = null
    if (isTouch()) {
      S.ghost.pending = true
      const at: [number, number] = prev ? [prev.ox, prev.oy] : [11, 6]
      setOrigin(at[0], at[1])
    } else if (onMap(S.ptr.x, S.ptr.y)) aim(S.ptr.x, S.ptr.y)
    else if (fromKey) setOrigin(...(prev ? ([prev.ox, prev.oy] as [number, number]) : START_SPOT))
    // 목록을 클릭해 골랐으면 포인터가 맵에 들어올 때 나타난다
    touch()
  }
  const cancel = (why?: string) => {
    if (!S.ghost) return
    S.ghost = null
    S.finger = null
    if (why) note(why)
    touch()
  }
  const rotate = () => {
    if (!S.ghost) return
    S.ghost.rot = (S.ghost.rot + 1) % 4
    touch()
  }
  const occNow = () => occupancy(S.placed)

  const tryPlace = () => {
    const g = S.ghost
    if (!g) return
    const c = cfgRef.current
    const def = BUILDINGS[g.id]
    let ox = g.ox
    let oy = g.oy
    if (!c.juice) {
      // 흔한 실수: 고스트는 포인터 가운데에 픽셀 그대로 그리고, 설치는 포인터가 있는 칸을 왼쪽 위로 — 2×2 는 반 칸씩 밀린다
      ox = Math.floor((g.mx - MAP_X) / CELL)
      oy = Math.floor((g.my - MAP_Y) / CELL)
    }
    const chk = validate(def, ox, oy, g.rot, Math.floor(S.credits), occNow())
    S.lastTry = chk.reason === 'ok'
    if (chk.reason !== 'ok') {
      S.shakeAt = S.t
      if (!c.juice) note('⚠ 설치할 수 없습니다 (놓은 뒤에야 · 이유 없음)', 'bad')
      else if (c.cue === 'after') note(`⚠ 놓은 뒤에야 알림: ${reasonText(chk, def)}`, 'bad')
      else if (c.cue === 'color') note('⚠ 빨간색 — 그런데 왜 안 되는지는 알 수 없다', 'bad')
      touch()
      return
    }
    S.placed.push({ uid: S.uidN++, id: g.id, x: ox, y: oy, rot: g.rot })
    S.credits -= def.cost
    S.pops.push({ id: S.popN++, x: MAP_X + (ox + def.w / 2) * CELL, y: MAP_Y + oy * CELL, text: `−${def.cost}`, at: S.t })
    if (!c.juice && (Math.abs(MAP_X + (ox + def.w / 2) * CELL - g.mx) > CELL / 2 || Math.abs(MAP_Y + (oy + def.h / 2) * CELL - g.my) > CELL / 2)) note('⚠ 고스트가 있던 자리와 다른 칸에 지어졌다', 'bad')
    S.ghost = null
    S.finger = null
    touch()
  }

  /* ───── 포인터 (사람 · 자동 데모가 같은 함수를 쓴다) ───── */
  const confirmRects = () => {
    const g = S.ghost
    if (!g) return null
    const b = bbox(BUILDINGS[g.id], g.rot)
    let x = S.gx + b.x1 * CELL + 22
    if (x + BTN.w > PANEL_X - 8) x = S.gx + b.x0 * CELL - 22 - BTN.w
    // 고스트 윗변부터 — 위쪽 사유 문구를 가리지 않게. 맨 아래 줄에서도 두 버튼이 화면 안에 들게 올린다
    const y = Math.min(S.gy + b.y0 * CELL, p.height - 2 * BTN.h - BTN.gap - 8)
    return { ok: { x, y, w: BTN.w, h: BTN.h }, no: { x, y: y + BTN.h + BTN.gap, w: BTN.w, h: BTN.h } }
  }
  const downCore = (x: number, y: number) => {
    S.ptr = { x, y }
    const c = cfgRef.current
    const i = BUILD_ORDER.findIndex((_, n) => inRect(x, y, palRect(n)))
    if (i >= 0) return pick(BUILD_ORDER[i], 'human')
    const g = S.ghost
    if (!g) return
    if (isTouch()) {
      const r = g.pending && c.juice ? confirmRects() : null
      if (r && inRect(x, y, r.ok)) return tryPlace()
      if (r && inRect(x, y, r.no)) return cancel('취소')
      if (!onMap(x, y)) return
      g.drag = true
      g.pending = false
      S.finger = { x, y }
      aim(x, y - liftAt(y))
      touch()
      return
    }
    if (!onMap(x, y)) return
    aim(x, y)
    tryPlace()
  }
  const moveCore = (x: number, y: number) => {
    S.ptr = { x, y }
    const g = S.ghost
    if (!g) return
    if (isTouch()) {
      if (!g.drag) return
      S.finger = { x, y }
      aim(x, y - liftAt(y))
    } else aim(x, y)
  }
  const upCore = () => {
    const g = S.ghost
    if (!g || !g.drag) return
    g.drag = false
    S.finger = null
    if (cfgRef.current.juice) g.pending = true
    else tryPlace() // 흔한 실수: 손을 떼는 순간 손가락 밑(보이지 않던 곳)에 설치
    touch()
  }

  const human = () => {
    realAt.current = S.t
    if (S.script || S.ghost?.owner === 'script') {
      S.script = null
      S.vp = null
      S.forceTouch = false
      if (S.ghost?.owner === 'script') cancel()
      touch()
    }
  }
  const toStage = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current?.getBoundingClientRect()
    if (!r || !r.width) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * p.width) / r.width, y: ((e.clientY - r.top) * p.height) / r.height }
  }
  const after = () => {
    if (!cfgRef.current.playing) paint(0)
    sync()
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    rootRef.current?.focus({ preventScroll: true })
    human()
    S.lastTouch = e.pointerType === 'touch'
    const { x, y } = toStage(e)
    if (e.button === 2) {
      cancel('취소 — 오른쪽 클릭')
      return after()
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 */
    }
    downCore(x, y)
    after()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || (S.script && S.scriptEvent)) return
    if (e.pointerType === 'touch' && !S.ghost?.drag) return
    human()
    const { x, y } = toStage(e)
    moveCore(x, y)
    after()
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || S.script) return
    S.ptr = toStage(e)
    upCore()
    after()
  }
  const onPointerLeave = () => {
    if (S.script || !S.ghost || isTouch() || !S.ghost.show) return
    S.ghost.show = false
    touch()
    after()
  }

  /* ───── 키보드 — 무대에 포커스가 있고 사람이 연 상태일 때만 가로챈다 ───── */
  useEffect(() => {
    if (p.thumbnail) return
    const onDown = (e: KeyboardEvent) => {
      const root = rootRef.current
      if (!root) return
      const t = e.target instanceof HTMLElement ? e.target : null
      const field = !!t && (t.matches('input, select, textarea') || t.isContentEditable)
      if (S.ghost?.owner === 'script') {
        // 자동 데모 · 시연이 연 고스트 — 사람이 넘겨받은 것으로 보고 닫는다. 키는 그대로 흘려보낸다 (Space · 1~9 …)
        human()
        return after()
      }
      if (field || !root.contains(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const g = S.ghost
      const bi = ['q', 'w', 'e'].indexOf(k)
      if (bi >= 0) {
        if (e.repeat) return
        human()
        pick(BUILD_ORDER[bi], 'human', true)
      } else if (!g) return
      else if (k === 'r') {
        if (!e.repeat) rotate()
      } else if (k === 'Escape') cancel('취소 — Esc')
      else if (k === 'Enter') {
        if (!e.repeat) tryPlace()
      } else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0
        const dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0
        setOrigin(Math.max(-1, Math.min(COLS - 1, g.ox + dx)), Math.max(-1, Math.min(ROWS - 1, g.oy + dy)))
        g.pending = isTouch()
      } else return
      e.preventDefault()
      e.stopPropagation()
      realAt.current = S.t
      touch()
      after()
    }
    addEventListener('keydown', onDown, true)
    return () => removeEventListener('keydown', onDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.thumbnail])

  /* ───── 시연 · 자동 데모 ───── */
  const palPt = (id: BuildingId) => {
    const r = palRect(BUILD_ORDER.indexOf(id))
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }
  const pickSteps = (id: BuildingId): Step[] => [{ k: 'to', ...palPt(id), dur: 0.6 }, { k: 'wait', dur: 0.15 }, { k: 'down' }, { k: 'up' }, { k: 'wait', dur: 0.3 }]
  const click: Step[] = [{ k: 'down' }, { k: 'up' }]
  const spot = (id: BuildingId, pref: [number, number], rot = 0) => findSpot(pref, (x, y) => validate(BUILDINGS[id], x, y, rot, 1e9, occNow()).reason === 'ok')
  const afford = (id: BuildingId) => {
    S.credits = Math.max(S.credits, BUILDINGS[id].cost + 10)
  }
  const resetMap = () => {
    S.placed = INITIAL.map(b => ({ ...b }))
    S.credits = startCreditsRef.current
    S.ghost = null
    S.finger = null
    touch()
  }

  const scenario = (id: string): Step[] => {
    // 터치 방식이면 같은 시연을 '끌어 놓기 → 확인 버튼' 으로 바꿔 만든다
    const T = isTouch()
    const go = (b: BuildingId, x: number, y: number, dur: number): Step[] =>
      T ? [{ k: 'toCell', id: b, x, y, dur, lift: true }, { k: 'down' }, { k: 'up' }] : [{ k: 'toCell', id: b, x, y, dur }]
    const put = (): Step[] => (!T ? click : cfgRef.current.juice ? [{ k: 'toBtn', which: 'ok', dur: 0.5 }, { k: 'wait', dur: 0.2 }, ...click] : [])
    if (id === 'overlap') {
      afford('turret')
      const ok = spot('turret', [5, 7]) ?? [8, 7]
      note('이미 있는 포탑 자리 → 드론 경로 → 빈 땅 순서로 대 본다')
      return [
        ...pickSteps('turret'),
        ...go('turret', 4, 5, 0.8),
        { k: 'wait', dur: 0.8 },
        ...put(),
        { k: 'wait', dur: 1.0 },
        ...go('turret', 6, 6, 0.6),
        { k: 'wait', dur: 1.3 },
        ...go('turret', ok[0], ok[1], 0.6),
        { k: 'wait', dur: 1.2 },
        ...put(),
        { k: 'wait', dur: 0.8 },
      ]
    }
    if (id === 'block-path') {
      afford('depot')
      const ok = spot('depot', [7, 6]) ?? [2, 7]
      note('수리 기지(2×2)를 드론 경로 위에 놓아 본다')
      return [
        ...pickSteps('depot'),
        ...go('depot', 9, 9, 0.9),
        { k: 'wait', dur: 0.9 },
        ...put(),
        { k: 'wait', dur: 1.1 },
        ...go('depot', ok[0], ok[1], 0.7),
        { k: 'wait', dur: 1.1 },
        ...put(),
        { k: 'wait', dur: 0.8 },
      ]
    }
    if (id === 'edge') {
      afford('depot')
      const fit = findSpot([15, 9], (x, y) => {
        const occ = occNow()
        return validate(BUILDINGS.depot, x, y, 0, 1e9, occ).reason === 'water' && validate(BUILDINGS.depot, x, y, 1, 1e9, occ).reason === 'ok'
      }) ?? [15, 9]
      note('맵 가장자리 → 물가. 착륙 패드가 물에 빠지면 R 로 돌린다')
      return [
        ...pickSteps('depot'),
        ...go('depot', COLS - 1, 2, 0.9),
        { k: 'wait', dur: 1.2 },
        ...go('depot', fit[0], fit[1], 0.8),
        { k: 'wait', dur: 1.3 },
        { k: 'rot' },
        { k: 'wait', dur: 1.2 },
        ...put(),
        { k: 'wait', dur: 0.8 },
      ]
    }
    if (id === 'no-credits') {
      S.credits = 40
      note('크레딧 40 — 수리 기지(150)를 골라 본다', 'info')
      const ok = spot('depot', [2, 8]) ?? [2, 8]
      return [...pickSteps('depot'), { k: 'wait', dur: 1.0 }, ...go('depot', ok[0], ok[1], 0.8), { k: 'wait', dur: 0.6 }, ...put(), { k: 'wait', dur: 0.8 }]
    }
    if (id === 'touch') {
      afford('sensor')
      S.forceTouch = true
      touch()
      const ok = findSpot([13, 8], (x, y) => validate(BUILDINGS.sensor, x, y, 0, 1e9, occNow()).reason === 'ok') ?? [13, 8]
      note(cfgRef.current.juice ? '터치: 끌면 고스트가 손가락 위에 뜬다 → 손을 떼고 확인' : '터치: 손가락 밑에 가려 보이지 않는 채로 손을 뗀다')
      return [
        ...pickSteps('sensor'),
        { k: 'to', x: MAP_X + 7 * CELL, y: MAP_Y + 12 * CELL, dur: 0.6 },
        { k: 'down' },
        { k: 'toCell', id: 'sensor', x: ok[0], y: ok[1], dur: 1.4, lift: true },
        { k: 'wait', dur: 0.5 },
        { k: 'up' },
        { k: 'wait', dur: 1.2 },
        // 나쁜 예는 손을 떼는 순간 이미 지었다 — 확인 버튼 단계가 없다
        ...(cfgRef.current.juice ? ([{ k: 'toBtn', which: 'ok', dur: 0.6 }, { k: 'wait', dur: 0.3 }, ...click] as Step[]) : []),
        { k: 'wait', dur: 1.0 },
        { k: 'call', fn: () => ((S.forceTouch = false), touch()) },
      ]
    }
    return []
  }
  const runEvent = (steps: Step[], event: boolean) => {
    S.script = steps
    S.scriptEvent = event
    S.stepT = 0
    S.stepFrom = null
    S.vp = S.vp ?? { x: S.ptr.x || 1200, y: S.ptr.y || 600, down: false }
    touch()
  }
  const handle = (id: string) => {
    cancel()
    S.forceTouch = false
    if (id === 'reset') {
      S.script = null
      S.vp = null
      resetMap()
      note('처음부터 — 건물 3채, 크레딧 ' + startCreditsRef.current)
      return
    }
    runEvent(scenario(id), true)
  }
  useTrigger(p.trigger, id => {
    human()
    handle(id)
    touch()
    after()
  })

  const AUTO = ['overlap', 'edge', 'touch', 'block-path', 'reset']
  const plan = (): Step[] => {
    const id = AUTO[S.autoStep++ % AUTO.length]
    if (id === 'reset') {
      resetMap()
      note('맵 정리 — 다시 처음 배치로')
      return [{ k: 'wait', dur: 1.2 }, { k: 'plan' }]
    }
    return [...scenario(id), { k: 'wait', dur: 0.6 }, { k: 'plan' }]
  }

  const runScript = (dt: number) => {
    const q = S.script
    if (!q) return
    if (!q.length) {
      S.script = null
      S.scriptEvent = false
      S.vp = null
      touch()
      return
    }
    const st = q[0]
    const vp = (S.vp = S.vp ?? { x: 1200, y: 600, down: false })
    const next = () => {
      q.shift()
      S.stepT = 0
      S.stepFrom = null
      S.stepTo = null
    }
    if (st.k === 'plan') {
      q.shift()
      q.push(...plan())
      return
    }
    if (st.k === 'down' || st.k === 'up') {
      vp.down = st.k === 'down'
      if (st.k === 'down') downCore(vp.x, vp.y)
      else upCore()
      if (S.ghost) S.ghost.owner = 'script'
      touch()
      return next()
    }
    if (st.k === 'rot') {
      rotate()
      return next()
    }
    if (st.k === 'call') {
      st.fn()
      return next()
    }
    S.stepT += dt
    if (st.k === 'wait') {
      if (S.stepT >= st.dur) next()
      return
    }
    if (!S.stepFrom) {
      S.stepFrom = { x: vp.x, y: vp.y }
      if (st.k === 'to') S.stepTo = { x: st.x, y: st.y }
      else if (st.k === 'toCell') {
        const def = BUILDINGS[st.id]
        const gy = MAP_Y + (st.y + def.h / 2) * CELL
        // 띄우는 것은 좋은 예의 터치뿐 — 나쁜 예는 손가락 바로 밑이 목표
        S.stepTo = { x: MAP_X + (st.x + def.w / 2) * CELL, y: st.lift ? fingerFor(gy) : gy }
      } else {
        const r = confirmRects()
        if (!r) return next()
        const b = r[st.which]
        S.stepTo = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      }
    }
    const k = easeInOutSine(Math.min(1, S.stepT / st.dur))
    vp.x = S.stepFrom.x + (S.stepTo!.x - S.stepFrom.x) * k
    vp.y = S.stepFrom.y + (S.stepTo!.y - S.stepFrom.y) * k
    moveCore(vp.x, vp.y)
    if (S.stepT >= st.dur) next()
  }

  const startCreditsRef = useRef(startCredits)
  startCreditsRef.current = startCredits
  const firstCredits = useRef(true)
  useEffect(() => {
    if (firstCredits.current) return void (firstCredits.current = false)
    S.credits = startCredits
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCredits])

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    if (p.autoplay && !p.thumbnail && !S.script && S.ghost?.owner !== 'human' && S.t - realAt.current > MANUAL_PAUSE) runEvent([{ k: 'plan' }], false)
    if (S.script && !S.scriptEvent && !p.autoplay) human()
    runScript(dt)
    const before = Math.floor(S.credits)
    S.credits = Math.min(990, S.credits + INCOME * dt)
    if (Math.floor(S.credits) !== before) touch()
    const n = S.pops.length
    S.pops = S.pops.filter(x => S.t - x.at < 1.1)
    if (S.pops.length !== n) touch()
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    paint(dt)
    sync()
  })

  /* ───── 그리기 (매 프레임 DOM 직접) ───── */
  const ghostRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const fingerRef = useRef<HTMLDivElement>(null)
  const leadRef = useRef<SVGLineElement>(null)
  const vpRef = useRef<SVGGElement>(null)
  const droneRefs = useRef<(SVGGElement | null)[]>([])
  const palRefs = useRef<(HTMLDivElement | null)[]>([])
  const popRefs = useRef(new Map<number, HTMLSpanElement>())
  const paint = (dt: number) => {
    const c = cfgRef.current
    droneRefs.current.forEach((el, i) => {
      const pt = pointOnPath(S.t * DRONE_SPEED + (i * PATH_LEN) / 3)
      el?.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${pt.deg})`)
    })
    palRefs.current.forEach((el, i) => {
      const sh = S.palShake && S.palShake.id === BUILD_ORDER[i] ? S.t - S.palShake.at : 9
      if (el) el.style.translate = sh < 0.35 ? `${Math.sin(sh * 55) * 12 * (1 - sh / 0.35)}px 0` : ''
    })
    for (const x of S.pops) {
      const el = popRefs.current.get(x.id)
      const k = (S.t - x.at) / 1.1
      if (el) {
        el.style.transform = `translate(-50%, ${-k * 60}px)`
        el.style.opacity = String(Math.min(1, (1 - k) * 3))
      }
    }
    const g = S.ghost
    const vis = (el: HTMLElement | SVGElement | null, on: boolean) => el && (el.style.visibility = on ? 'visible' : 'hidden')
    const fg = S.finger
    vis(fingerRef.current, !!fg && !p.thumbnail)
    if (fg && fingerRef.current) fingerRef.current.style.transform = `translate(${fg.x}px, ${fg.y}px)`
    if (vpRef.current) {
      const vp = S.vp
      vis(vpRef.current, !!vp && !fg && !p.thumbnail)
      if (vp) vpRef.current.setAttribute('transform', `translate(${vp.x} ${vp.y}) scale(${vp.down ? 0.85 : 1})`)
    }
    if (!g) {
      ;[ghostRef, rangeRef, labelRef, confirmRef].forEach(r => vis(r.current, false))
      vis(leadRef.current, false)
      return
    }
    const def = BUILDINGS[g.id]
    const tx = c.juice ? MAP_X + g.ox * CELL : g.mx - (def.w * CELL) / 2
    const ty = c.juice ? MAP_Y + g.oy * CELL : g.my - (def.h * CELL) / 2
    if (!S.gInit || !c.juice || c.lerpMs <= 0 || !c.playing) {
      S.gx = tx
      S.gy = ty
      S.gInit = true
    } else if (dt > 0) {
      const l = 3000 / c.lerpMs // 약 lerpMs 안에 95% 따라붙는다
      S.gx = damp(S.gx, tx, l, dt)
      S.gy = damp(S.gy, ty, l, dt)
    }
    const sk = S.t - S.shakeAt
    const shake = sk < 0.35 && !c.reduced ? Math.sin(sk * 60) * 10 * (1 - sk / 0.35) : 0
    if (ghostRef.current) ghostRef.current.style.transform = `translate(${S.gx + shake}px, ${S.gy}px)`
    vis(ghostRef.current, g.show)
    const cx = S.gx + (def.w * CELL) / 2
    const cy = S.gy + (def.h * CELL) / 2
    if (rangeRef.current) rangeRef.current.style.transform = `translate(${cx}px, ${cy}px)`
    vis(rangeRef.current, g.show && rangeOn(def))
    const b = bbox(def, g.rot)
    const lab = labelRef.current
    if (lab) {
      const below = S.gy + b.y0 * CELL < MAP_Y + 90
      lab.dataset.pin = below ? 'below' : 'top'
      const lx = Math.max(MAP_X + 250, Math.min(PANEL_X - 260, S.gx + ((b.x0 + b.x1) / 2) * CELL + shake))
      const ly = below ? S.gy + b.y1 * CELL + 14 : S.gy + b.y0 * CELL - 14
      lab.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, ${below ? 0 : -100}%)`
      vis(lab, g.show && c.juice && c.cue === 'full')
    }
    const r = confirmRects()
    if (confirmRef.current && r) confirmRef.current.style.transform = `translate(${r.ok.x}px, ${r.ok.y}px)`
    vis(confirmRef.current, g.show && g.pending && c.juice && isTouch())
    if (leadRef.current && fg) {
      leadRef.current.setAttribute('x1', String(fg.x))
      leadRef.current.setAttribute('y1', String(fg.y - 40))
      leadRef.current.setAttribute('x2', String(cx))
      leadRef.current.setAttribute('y2', String(cy))
    }
    vis(leadRef.current, !!fg && c.juice && liftPx() > 0)
  }
  const rangeOn = (def: BuildingDef) => rangeMode !== 'none' && def.range > 0
  useLayoutEffect(() => paint(0))

  /* ───── 렌더 ───── */
  const g = S.ghost
  const def = g ? BUILDINGS[g.id] : null
  const occ = occupancy(S.placed)
  const chk: Check | null = g && def ? validate(def, g.ox, g.oy, g.rot, Math.floor(S.credits), occ) : null
  const tint = !chk || cue === 'after' ? 'neutral' : chk.reason === 'ok' ? 'ok' : 'bad'
  const fp = g && def ? footprint(def, g.rot) : []
  const inRange = g && def && g.show && rangeMode === 'cells' ? pathInRange(def, g.ox, g.oy) : []
  const touchMode = (device === 'touch' || S.forceTouch || (device === 'auto' && S.lastTouch)) && !p.thumbnail
  const gridOn = gridLines === 'always' || (gridLines === 'placing' && !!g)
  const credits = Math.floor(S.credits)
  const hint = !g
    ? '건물을 고르세요 — 오른쪽 목록 클릭 또는 Q · W · E'
    : touchMode
      ? juice
        ? g.pending
          ? '확인을 눌러 설치 · 다시 끌어 위치 조정'
          : '끄는 중 — 고스트는 손가락 위에 뜬다'
        : '손을 떼는 순간 손가락 밑에 설치된다'
      : '클릭 설치 · R 회전 · 오른쪽 클릭 / Esc 취소 · 방향키 한 칸'

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="건설 배치 데모 (Q · W · E 건물, 클릭 설치, R 회전, Esc 취소, 방향키 한 칸, Enter 설치)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={e => e.preventDefault()}
    >
      <svg className={s.map} viewBox="0 0 1920 1080" aria-hidden>
        {STATIC_MAP}
        <rect x={MAP_X} y={MAP_Y} width={MAP_W} height={MAP_H} fill="url(#bpp-grid)" className={s.grid} data-on={gridOn || undefined} />
        {inRange.map(([x, y]) => (
          <rect key={key(x, y)} className={s.inRange} x={MAP_X + x * CELL + 4} y={MAP_Y + y * CELL + 4} width={CELL - 8} height={CELL - 8} rx="8" />
        ))}
        {g &&
          showAll &&
          rangeMode !== 'none' &&
          S.placed
            .filter(b => BUILDINGS[b.id].range > 0)
            .map(b => (
              <circle key={b.uid} className={s.otherRange} cx={MAP_X + (b.x + 0.5) * CELL} cy={MAP_Y + (b.y + 0.5) * CELL} r={BUILDINGS[b.id].range * CELL} />
            ))}
        {S.placed.map(b => (
          <g key={b.uid} transform={`translate(${MAP_X + b.x * CELL} ${MAP_Y + b.y * CELL})`}>
            <Art id={b.id} rot={b.rot} />
          </g>
        ))}
        {[0, 1, 2].map(i => (
          <g
            key={i}
            ref={el => {
              droneRefs.current[i] = el
            }}
            className={s.drone}
          >
            <path d="M18 0 L-12 -14 L-6 0 L-12 14 Z" />
          </g>
        ))}
      </svg>

      {/* 사거리 원 (본체 중심) */}
      <div ref={rangeRef} className={s.range} data-part="range" style={{ width: (def?.range || 3) * CELL * 2, height: (def?.range || 3) * CELL * 2 }}>
        <span>{def?.range ? `사거리 ${def.range}칸` + (rangeMode === 'cells' ? ` · 경로 ${inRange.length}칸` : '') : ''}</span>
      </div>

      {/* 고스트 */}
      <div ref={ghostRef} className={s.ghost} data-part="ghost" data-tint={tint} data-cue={cue} data-pin="left" style={{ width: (def?.w ?? 1) * CELL, height: (def?.h ?? 1) * CELL }}>
        <svg width={CELL * 2} height={CELL * 2} aria-hidden>
          <defs>
            <pattern id="bpp-hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="16" height="16" className={s.hatchBg} />
              <rect width="7" height="16" className={s.hatchLine} />
            </pattern>
          </defs>
          {fp.map(c => {
            const bad = !!chk && chk.bad.has(key(g!.ox + c.x, g!.oy + c.y)) && juice
            return <rect key={`${c.x},${c.y}`} className={s.cell} data-bad={bad || undefined} data-pad={c.pad || undefined} x={c.x * CELL + 2} y={c.y * CELL + 2} width={CELL - 4} height={CELL - 4} rx="6" />
          })}
          {g && <Art id={g.id} rot={g.rot} ghost />}
        </svg>
      </div>

      {/* 사유 문구 — 고스트 바로 위 (월드에 붙은 UI) */}
      <div ref={labelRef} className={s.reason} data-part="reason" data-ok={chk?.reason === 'ok' || undefined}>
        <ReasonIcon reason={chk?.reason ?? 'ok'} />
        <span>
          <b>{chk && def ? reasonText(chk, def) : '설치 가능'}</b>
          {chk && def && chk.reason === 'ok' && def.pad && <small>R 로 착륙 패드 방향 돌리기</small>}
          {chk && def && chk.reason === 'ok' && def.range > 0 && rangeMode !== 'none' && <small>{rangeMode === 'cells' ? `경로 ${inRange.length}칸이 사거리 안` : `사거리 ${def.range}칸`}</small>}
        </span>
      </div>

      {/* 터치 2단계: 확인 · 취소 */}
      <div ref={confirmRef} className={s.confirm} data-part="confirm" data-pin="right">
        <div className={s.btn} data-ok={chk?.reason === 'ok' || cue === 'after' || undefined}>
          <svg viewBox="-20 -20 40 40" aria-hidden>
            <path d={chk?.reason === 'ok' || cue === 'after' ? 'M-11 0 L-3 8 L12 -9' : 'M-8 -2 V-7 Q-8 -13 0 -13 Q8 -13 8 -7 V-2 M-11 -2 H11 V13 H-11 Z'} />
          </svg>
          {chk?.reason === 'ok' || cue === 'after' ? '확인' : '설치 불가'}
        </div>
        <div className={s.btn} data-no>
          <svg viewBox="-20 -20 40 40" aria-hidden>
            <path d="M-9 -9 L9 9 M9 -9 L-9 9" />
          </svg>
          취소
        </div>
      </div>

      <svg className={s.overlay} viewBox="0 0 1920 1080" aria-hidden>
        <line ref={leadRef} className={s.lead} />
        <g ref={vpRef} className={s.vp}>
          {touchMode ? <circle r="26" /> : <path d="M0 0 L0 40 L11 30 L19 48 L27 44 L19 27 L33 27 Z" />}
        </g>
      </svg>
      <div ref={fingerRef} className={s.finger} />

      {/* 상단 막대 */}
      <div className={s.top}>
        <div className={s.credits}>
          <svg viewBox="-20 -20 40 40" aria-hidden>
            <path d="M0 -16 L14 0 L0 16 L-14 0 Z" />
          </svg>
          <b>{credits}</b> 크레딧 <small>+{INCOME}/초</small>
        </div>
        <div className={s.mode} data-touch={touchMode || undefined}>
          {touchMode ? '터치 · 2단계' : '마우스 · 키보드'}
        </div>
        <div className={s.hint}>{hint}</div>
      </div>

      {/* 건물 목록 */}
      <div className={s.palette} data-part="palette">
        <span className={s.palTitle}>건설</span>
        {BUILD_ORDER.map((id, i) => {
          const d = BUILDINGS[id]
          const lock = juice && credits < d.cost
          return (
            <div
              key={id}
              ref={el => {
                palRefs.current[i] = el
              }}
              className={s.item}
              data-on={g?.id === id || undefined}
              data-lock={lock || undefined}
              style={{ top: palRect(i).y }}
            >
              <svg viewBox={id === 'depot' ? `-4 -4 ${CELL * 3 + 8} ${CELL * 3 + 8}` : `-4 -4 ${CELL + 8} ${CELL + 8}`} className={s.itemArt} aria-hidden>
                <Art id={id} rot={0} />
              </svg>
              <b>{d.name}</b>
              <span className={s.cost}>
                {lock ? (
                  <>
                    <svg viewBox="-12 -14 24 28" aria-hidden>
                      <path d="M-8 -2 V-7 Q-8 -12 0 -12 Q8 -12 8 -7 V-2 M-10 -2 H10 V12 H-10 Z" />
                    </svg>
                    {d.cost - credits} 부족
                  </>
                ) : (
                  d.cost
                )}
              </span>
              <span className={s.meta}>
                {d.w}×{d.h}
                {d.pad ? ' + 패드' : ''}
                {d.range ? ` · 사거리 ${d.range}칸` : ''}
              </span>
              <kbd>{d.key}</kbd>
            </div>
          )
        })}
      </div>

      {/* 검사 결과 — bool 이 아니라 사유 enum */}
      <div className={s.result}>
        <span className={s.palTitle}>검사 결과 {juice ? '(사유 enum)' : '(bool)'}</span>
        {juice ? (
          REASONS.map(([r, label]) => (
            <div key={r} className={s.row} data-on={chk?.reason === r || undefined}>
              <ReasonIcon reason={r} />
              {label}
            </div>
          ))
        ) : (
          <div className={s.row} data-on data-bool>
            canPlace = {S.lastTry === null ? '?' : String(S.lastTry)}
            <small>{S.lastTry === null ? '놓아 봐야 안다' : '마지막으로 놓아 본 결과'}</small>
          </div>
        )}
      </div>

      {S.pops.map(x => (
        <span
          key={x.id}
          ref={el => {
            if (el) popRefs.current.set(x.id, el)
            else popRefs.current.delete(x.id)
          }}
          className={s.pop}
          style={{ left: x.x, top: x.y }}
        >
          {x.text}
        </span>
      ))}
      {S.note && (
        <div className={s.note} data-tone={S.note.tone}>
          {S.note.text}
        </div>
      )}
    </div>
  )
}

const REASONS: [Reason, string][] = [
  ['ok', '설치 가능'],
  ['out-of-bounds', '맵 밖'],
  ['water', '지형 (물)'],
  ['overlap', '건물과 겹침'],
  ['on-path', '드론 경로'],
  ['no-credits', '크레딧 부족'],
]

/* ───── 처음 상태 ───── */
function initSim(credits: number, start: 'auto' | 'thumb' | 'none'): Sim {
  const [x, y] = START_SPOT
  const S: Sim = {
    t: 0,
    version: 0,
    credits,
    placed: INITIAL.map(b => ({ ...b })),
    uidN: 10,
    // 첫 화면부터 포탑 고스트를 경로 옆에 — 사거리 원 · 경로 칸 · 사유 문구가 보이게 (썸네일 · 해설 번호)
    ghost: { id: 'turret', rot: 0, ox: x, oy: y, mx: MAP_X + (x + 0.5) * CELL, my: MAP_Y + (y + 0.5) * CELL, show: true, owner: 'script', pending: false, drag: false },
    ptr: { x: MAP_X + (x + 0.5) * CELL, y: MAP_Y + (y + 0.5) * CELL },
    lastTouch: false,
    forceTouch: false,
    finger: null,
    gx: 0,
    gy: 0,
    gInit: false,
    shakeAt: -9,
    palShake: null,
    pops: [],
    popN: 0,
    note: null,
    script: null,
    scriptEvent: false,
    stepT: 0,
    stepFrom: null,
    stepTo: null,
    vp: null,
    autoStep: 0,
    lastTry: null,
  }
  if (start === 'auto') {
    S.vp = { x: S.ptr.x, y: S.ptr.y, down: false }
    S.script = [{ k: 'wait', dur: 1.6 }, { k: 'down' }, { k: 'up' }, { k: 'wait', dur: 0.8 }, { k: 'plan' }]
  }
  return S
}

/* ───── 고정 지형 (한 번만 만든다) ───── */
const STATIC_MAP = (
  <>
    <defs>
      <pattern id="bpp-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse" x={MAP_X} y={MAP_Y}>
        <path d={`M${CELL} 0 H0 V${CELL}`} fill="none" stroke="#ffffff2e" strokeWidth="2" />
      </pattern>
    </defs>
    <rect width="1920" height="1080" fill="#0b1119" />
    <rect x={MAP_X} y={MAP_Y} width={MAP_W} height={MAP_H} fill="#1b2a24" stroke="#4d6b5c" strokeWidth="3" />
    {[...WATER].map(k => {
      const [x, y] = k.split(',').map(Number)
      return <rect key={k} x={MAP_X + x * CELL} y={MAP_Y + y * CELL} width={CELL} height={CELL} fill="#17486b" />
    })}
    {[...WATER].map(k => {
      const [x, y] = k.split(',').map(Number)
      const X = MAP_X + x * CELL
      const Y = MAP_Y + y * CELL + 34
      return <path key={`w${k}`} d={`M${X + 12} ${Y} q10 -8 20 0 t20 0`} fill="none" stroke="#6fb7e8" strokeWidth="3" opacity="0.6" />
    })}
    {[...PATH].map(k => {
      const [x, y] = k.split(',').map(Number)
      return <rect key={k} x={MAP_X + x * CELL} y={MAP_Y + y * CELL} width={CELL} height={CELL} fill="#3b3326" />
    })}
    <polyline points={PATH_PX.map(q => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#e0a85a" strokeWidth="4" strokeDasharray="10 14" opacity="0.7" />
    <text x={MAP_X + 14} y={MAP_Y + 3 * CELL - 14} className={s.mapLabel}>
      드론 진입
    </text>
    <text x={MAP_X + 19 * CELL} y={MAP_Y + 13 * CELL + 46} className={s.mapLabel}>
      물 (지을 수 없음)
    </text>
  </>
)

/* ───── 작은 부품 ───── */
function Art({ id, rot, ghost }: { id: BuildingId; rot: number; ghost?: boolean }) {
  const def = BUILDINGS[id]
  const C = CELL
  const pad = footprint(def, rot).find(c => c.pad)
  return (
    <g className={ghost ? s.artGhost : s.art}>
      {id === 'turret' && (
        <>
          <rect x="8" y="8" width={C - 16} height={C - 16} rx="10" />
          <circle cx={C / 2} cy={C / 2} r="14" />
          <path d={`M${C / 2} ${C / 2} V8`} strokeWidth="7" />
        </>
      )}
      {id === 'sensor' && (
        <>
          <path d={`M${C / 2} 8 L${C - 10} ${C / 2} L${C / 2} ${C - 8} L10 ${C / 2} Z`} />
          <circle cx={C / 2} cy={C / 2} r="7" />
          <path d={`M${C / 2 - 16} 18 Q${C / 2} 6 ${C / 2 + 16} 18`} fill="none" />
        </>
      )}
      {id === 'depot' && (
        <>
          <rect x="8" y="8" width={C * 2 - 16} height={C * 2 - 16} rx="12" />
          <path d={`M${C - 10} ${C - 26} h20 v16 h16 v20 h-16 v16 h-20 v-16 h-16 v-20 h16 Z`} />
          {pad && (
            <>
              <circle cx={(pad.x + 0.5) * C} cy={(pad.y + 0.5) * C} r={C / 2 - 8} className={s.pad} />
              <path d={`M${(pad.x + 0.5) * C - 9} ${(pad.y + 0.5) * C - 11} v22 M${(pad.x + 0.5) * C + 9} ${(pad.y + 0.5) * C - 11} v22 M${(pad.x + 0.5) * C - 9} ${(pad.y + 0.5) * C} h18`} fill="none" />
            </>
          )}
        </>
      )}
    </g>
  )
}

/** 사유마다 다른 모양 — 색을 못 구분해도 아이콘과 글자로 안다 */
function ReasonIcon({ reason }: { reason: Reason }) {
  const d: Record<Reason, string> = {
    ok: 'M-10 0 L-3 8 L11 -9',
    'out-of-bounds': 'M-12 -12 H4 M-12 -12 V12 H4 M0 0 H13 M7 -6 L13 0 L7 6',
    water: 'M-13 -4 q6.5 -7 13 0 t13 0 M-13 7 q6.5 -7 13 0 t13 0',
    overlap: 'M-12 -12 H4 V4 H-12 Z M-4 -4 H12 V12 H-4 Z',
    'on-path': 'M-13 6 H13 M-13 -6 H13 M-4 -12 L8 0 L-4 12',
    'no-credits': 'M0 -12 L11 0 L0 12 L-11 0 Z M-13 13 L13 -13',
  }
  return (
    <svg className={s.icon} viewBox="-16 -16 32 32" aria-hidden>
      <path d={d[reason]} />
    </svg>
  )
}
