import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useGameLoop, useTrigger } from '../../core/hooks'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { DEFAULT_LAYOUT, DEVICES, LABEL, centerOf, clamp, safeRect, shape, toPixelLayout, type DeviceId, type ItemId, type LayoutItem, type Rect } from './layout'
import s from './style.module.css'

export { meta } from './meta'

type Mode = 'fixed' | 'floating' | 'dynamic'
type Role = 'stick' | ItemId | 'edit' | 'none'
type Item = LayoutItem & { px?: number; py?: number }

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
const COOLDOWN: Record<'skill1' | 'skill2' | 'dodge', number> = { skill1: 3, skill2: 5, dodge: 1.2 }
const SPEED = 560
/** 버튼 최소 지름 — 이 무대의 노치 폰(약 13px/mm)에서 약 9mm */
const MIN_BTN = 120
/** 화면에 그릴 손가락 표시 수 (동시 터치) */
const FINGERS = 3
/** 키보드 · 자동 데모가 쓰는 가상 포인터 id — 실제 pointerId(0 이상)와 겹치지 않게 음수 */
const KEY_PID = -900
const AUTO_L = -101
const AUTO_R = -102

interface Sim {
  t: number
  player: { x: number; y: number; fx: number; fy: number; dash: number; slash: number; burst: number }
  stick: { pid: number | null; bx: number; by: number; kx: number; ky: number; rx: number; ry: number; ox: number; oy: number; mag: number; raw: number }
  pointers: Map<number, { role: Role; x: number; y: number; n: number }>
  fingerNo: number
  cooldown: Record<'skill1' | 'skill2' | 'dodge', number>
  pressed: Partial<Record<ItemId, number>>
  layout: Item[]
  editing: boolean
  drag: { pid: number; id: ItemId; mode: 'move' | 'resize'; dx: number; dy: number } | null
  note: { text: string; bad: boolean; until: number } | null
  /** 자동 데모 대본 시간 */
  auto: number
  keys: Set<string>
  version: number
}

const freshLayout = (): Item[] => toPixelLayout(DEFAULT_LAYOUT.map(it => ({ ...it })))

/**
 * 가상 조이스틱 + 터치 HUD 배치.
 * 손가락(pointerId)마다 역할(조이스틱 · 버튼 · 편집)을 따로 기억해서, 왼손으로 움직이며 오른손으로 공격할 수 있게 한다.
 * 매 프레임 바뀌는 것(손잡이 · 캐릭터 · 손가락 표시 · 수치)은 ref 로 직접 그리고, 배치가 바뀔 때만 React 렌더.
 */
export default function VirtualJoystickTouchLayout(p: SpecimenProps) {
  const juice = p.juice
  const mode = (juice ? str(p.params, 'stickMode', 'floating') : 'fixed') as Mode
  const deadzone = juice ? num(p.params, 'deadzonePct', 12) / 100 : 0
  const radius = num(p.params, 'radius', 120)
  const curve = (juice ? str(p.params, 'curve', 'fine') : 'linear') as 'linear' | 'fine'
  const idleOpacity = num(p.params, 'idleOpacity', 0.45)
  const useSafe = juice && bool(p.params, 'useSafeArea', true)
  const deviceId = str(p.params, 'device', 'phone') as DeviceId
  const showGuides = bool(p.params, 'showGuides', true)
  const device = DEVICES[deviceId] ?? DEVICES.phone
  const safe = safeRect(device, useSafe)
  const W = p.width

  const cfg = { juice, mode, deadzone, radius, curve, safe, device, idleOpacity }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) {
    const scr = device.screen
    simRef.current = {
      t: 0,
      player: { x: scr.x + scr.w * 0.5, y: scr.y + scr.h * 0.5, fx: 1, fy: 0, dash: 0, slash: 0, burst: 0 },
      stick: { pid: null, bx: 0, by: 0, kx: 0, ky: 0, rx: 0, ry: 0, ox: 0, oy: 0, mag: 0, raw: 0 },
      pointers: new Map(),
      fingerNo: 0,
      cooldown: { skill1: 0, skill2: 0, dodge: 0 },
      pressed: {},
      layout: freshLayout(),
      editing: false,
      drag: null,
      note: null,
      auto: 0,
      keys: new Set(),
      version: 0,
    }
  }
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
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 2.4 }
    touch()
  }

  const realAt = useRef(-1e9)
  const autoActive = useRef(false)
  /** 사람이 조작하면 자동 데모의 가상 손가락을 즉시 뗀다 (안 그러면 대본이 조이스틱을 쥐고 놓지 않는다) */
  const cancelScript = () => {
    realAt.current = S.t
    if (S.pointers.has(AUTO_L)) up(AUTO_L)
    if (S.pointers.has(AUTO_R)) up(AUTO_R)
    S.auto = 0
    autoActive.current = false
  }

  /* ───── 배치 ───── */
  const itemOf = (id: ItemId) => S.layout.find(it => it.id === id)!
  const center = (id: ItemId) => centerOf(itemOf(id), cfgRef.current.device, cfgRef.current.safe, cfgRef.current.juice)
  const home = () => center('stick')

  /** 이 점을 누르면 조이스틱이 시작되는가 */
  const inStickZone = (x: number, y: number) => {
    const c = cfgRef.current
    const h = home()
    if (!c.juice) return Math.hypot(x - h.x, y - h.y) <= c.radius // 나쁜 예: 그려진 원 안을 정확히 눌러야
    if (c.mode === 'fixed') return Math.hypot(x - h.x, y - h.y) <= c.radius * 1.5
    const z = zoneRect()
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
  }
  /** 플로팅 · 따라오는 조이스틱이 시작될 수 있는 왼쪽 아래 영역 */
  const zoneRect = (): Rect => {
    const sf = cfgRef.current.safe
    return { x: sf.x, y: sf.y + sf.h * 0.3, w: sf.w * 0.45, h: sf.h * 0.7 }
  }
  const hitButton = (x: number, y: number): ItemId | null => {
    for (const it of S.layout) {
      if (it.id === 'stick') continue
      const c = center(it.id)
      if (Math.hypot(x - c.x, y - c.y) <= it.size / 2 + (cfgRef.current.juice ? 12 : 0)) return it.id
    }
    return null
  }

  /* ───── 손가락 처리 (진짜 터치 · 자동 데모 · 키보드가 모두 여기로) ───── */
  const releaseStick = () => {
    const st = S.stick
    st.pid = null
    st.rx = st.ry = st.ox = st.oy = st.mag = st.raw = 0
  }

  const down = (pid: number, x: number, y: number) => {
    const c = cfgRef.current
    if (!c.juice && S.pointers.size > 0) {
      // 나쁜 예: 손가락 하나만 기억한다 — 새 손가락이 이전 손가락을 덮어쓴다
      if (S.stick.pid !== null) note('⚠ 두 번째 손가락이 조이스틱 입력을 빼앗음 → 캐릭터가 멈춘다', true)
      S.pointers.clear()
      releaseStick()
    }
    const n = ++S.fingerNo
    if (S.editing) {
      S.pointers.set(pid, { role: 'edit', x, y, n })
      startEdit(pid, x, y)
      return
    }
    const btn = hitButton(x, y)
    if (btn) {
      S.pointers.set(pid, { role: btn, x, y, n })
      press(btn)
      return
    }
    if (inStickZone(x, y) && S.stick.pid === null) {
      S.pointers.set(pid, { role: 'stick', x, y, n })
      const h = home()
      const st = S.stick
      st.pid = pid
      if (c.juice && c.mode !== 'fixed') {
        // 엄지가 닿은 곳에 받침을 놓는다 (받침이 화면 밖으로 잘리지 않게 안쪽으로)
        st.bx = clamp(x, c.safe.x + c.radius, c.safe.x + c.safe.w - c.radius)
        st.by = clamp(y, c.safe.y + c.radius, c.safe.y + c.safe.h - c.radius)
      } else {
        st.bx = h.x
        st.by = h.y
      }
      move(pid, x, y)
      return
    }
    S.pointers.set(pid, { role: 'none', x, y, n })
    if (!c.juice) note('조이스틱 원 바깥을 눌러 아무 반응 없음', true)
  }

  const move = (pid: number, x: number, y: number) => {
    const ptr = S.pointers.get(pid)
    if (!ptr) return
    ptr.x = x
    ptr.y = y
    if (ptr.role === 'edit') return dragEdit(pid, x, y)
    if (ptr.role !== 'stick' || S.stick.pid !== pid) return
    const c = cfgRef.current
    const st = S.stick
    let dx = x - st.bx
    let dy = y - st.by
    let d = Math.hypot(dx, dy)
    if (c.juice && c.mode === 'dynamic' && d > c.radius) {
      // 따라오는 조이스틱: 반경을 넘으면 받침이 손가락 쪽으로 끌려온다
      const pull = (d - c.radius) / d
      st.bx += dx * pull
      st.by += dy * pull
      dx = x - st.bx
      dy = y - st.by
      d = Math.hypot(dx, dy)
    }
    if (c.juice) {
      const k = d > c.radius ? c.radius / d : 1
      st.kx = st.bx + dx * k
      st.ky = st.by + dy * k
      st.rx = dx / c.radius
      st.ry = dy / c.radius
      const o = shape(st.rx, st.ry, c.deadzone, c.curve)
      st.ox = o.x
      st.oy = o.y
      st.mag = o.mag
      st.raw = o.raw
    } else {
      // 나쁜 예: 손잡이가 받침을 벗어나고, 출력도 정규화하지 않아 멀리 끌수록 계속 빨라진다
      st.kx = x
      st.ky = y
      st.rx = dx / c.radius
      st.ry = dy / c.radius
      st.ox = st.rx
      st.oy = st.ry
      st.raw = st.mag = Math.hypot(st.rx, st.ry)
    }
  }

  const up = (pid: number) => {
    const ptr = S.pointers.get(pid)
    S.pointers.delete(pid)
    if (!ptr) return
    if (ptr.role === 'stick' && S.stick.pid === pid) releaseStick()
    if (ptr.role === 'edit') endEdit()
  }

  const press = (id: ItemId) => {
    const pl = S.player
    S.pressed[id] = S.t
    if (id === 'attack') pl.slash = 0.18
    else if (id === 'skill1' || id === 'skill2' || id === 'dodge') {
      if (S.cooldown[id] > 0) {
        note(`${LABEL[id]} 재사용 대기 중`)
        return
      }
      S.cooldown[id] = COOLDOWN[id]
      if (id === 'dodge') pl.dash = 0.18
      else pl.burst = id === 'skill1' ? 0.35 : 0.5
    }
  }

  /* ───── 배치 편집 ───── */
  const startEdit = (pid: number, x: number, y: number) => {
    for (const it of [...S.layout].reverse()) {
      const c = center(it.id)
      const isStick = it.id === 'stick'
      const r = isStick ? cfgRef.current.radius : it.size / 2
      // 오른쪽 아래 손잡이 = 크기(버튼만 — 조이스틱 크기는 '반경' 값), 원 안 = 이동
      if (!isStick && Math.hypot(x - (c.x + r * 0.71), y - (c.y + r * 0.71)) <= 34) {
        S.drag = { pid, id: it.id, mode: 'resize', dx: 0, dy: 0 }
        return
      }
      if (Math.hypot(x - c.x, y - c.y) <= r) {
        S.drag = { pid, id: it.id, mode: 'move', dx: x - c.x, dy: y - c.y }
        return
      }
    }
  }
  const dragEdit = (pid: number, x: number, y: number) => {
    const dr = S.drag
    if (!dr || dr.pid !== pid) return
    const c = cfgRef.current
    const it = itemOf(dr.id)
    const sf = c.safe
    if (dr.mode === 'resize') {
      const cc = center(dr.id)
      it.size = Math.round(clamp(Math.hypot(x - cc.x, y - cc.y) * 2, MIN_BTN, 340))
    } else {
      const r = dr.id === 'stick' ? c.radius : it.size / 2
      const cx = clamp(x - dr.dx, sf.x + r, sf.x + sf.w - r)
      const cy = clamp(y - dr.dy, sf.y + r, sf.y + sf.h - r)
      // 두 방식으로 함께 적어 둔다: 비율(좋은 예) · 지금 화면 왼쪽 위 기준 픽셀(나쁜 예)
      it.nx = (cx - sf.x) / sf.w
      it.ny = (cy - sf.y) / sf.h
      it.px = cx - c.device.screen.x
      it.py = cy - c.device.screen.y
    }
    touch()
    sync()
  }
  const endEdit = () => {
    if (S.drag) {
      const it = itemOf(S.drag.id)
      note(cfgRef.current.juice ? `${LABEL[it.id]} 저장: 비율 (${it.nx.toFixed(2)}, ${it.ny.toFixed(2)}) · 지름 ${it.size}` : `${LABEL[it.id]} 저장: 픽셀 (${Math.round(it.px ?? 0)}, ${Math.round(it.py ?? 0)})`, !cfgRef.current.juice)
    }
    S.drag = null
  }

  /* ───── 실제 포인터 ───── */
  const rootRef = useRef<HTMLDivElement>(null)
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect()
    const k = r.width / W || 1
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k] as const
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    if ((e.target as Element).closest('[data-ui]')) return // 편집 도구 버튼
    e.preventDefault() // 터치 스크롤 · 텍스트 선택 방지 (대신 포커스는 직접 준다 — 키보드 조작용)
    rootRef.current?.focus({ preventScroll: true })
    cancelScript()
    try {
      rootRef.current?.setPointerCapture(e.pointerId) // 손가락이 무대 밖으로 나가도 이동을 받는다
    } catch {
      // 이미 떼어진 포인터(또는 합성 이벤트)면 붙잡지 못한다 — 그래도 처리는 계속
    }
    const [x, y] = toLogical(e)
    down(e.pointerId, x, y)
    touch()
    sync()
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!S.pointers.has(e.pointerId)) return
    realAt.current = S.t // 누르고 있는 동안은 자동 데모가 다시 시작되지 않게
    const [x, y] = toLogical(e)
    move(e.pointerId, x, y)
    if (!p.playing) paint() // 정지 중에도 손잡이는 따라온다
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!S.pointers.has(e.pointerId)) return
    up(e.pointerId)
    touch()
    sync()
  }

  /* ───── 키보드 (데스크톱에서 확인용): 방향키 = 조이스틱, Space = 공격, Q · E · Shift = 스킬 · 회피 ───── */
  const keyStick = () => {
    const k = S.keys
    const dx = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0)
    const dy = (k.has('ArrowDown') || k.has('s') ? 1 : 0) - (k.has('ArrowUp') || k.has('w') ? 1 : 0)
    const h = home()
    const r = cfgRef.current.radius * 0.9
    const len = Math.hypot(dx, dy) || 1
    if (!dx && !dy) {
      if (S.pointers.has(KEY_PID)) up(KEY_PID)
      return
    }
    if (!S.pointers.has(KEY_PID)) down(KEY_PID, h.x, h.y)
    move(KEY_PID, h.x + (dx / len) * r, h.y + (dy / len) * r)
  }
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail || S.editing) return // 편집 중에는 입력을 끈다 (Unity 판도 편집 중 입력 컴포넌트를 끈다)
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']
    if (dirs.includes(k)) {
      S.keys.add(k)
      keyStick()
    } else if (k === ' ' || k === 'q' || k === 'e' || k === 'Shift') {
      if (e.repeat) return true // 길게 눌러도 한 번만 — 반복 키는 먹기만 한다 (Space 가 갤러리 재생/정지로 새지 않게)
      press(k === ' ' ? 'attack' : k === 'q' ? 'skill1' : k === 'e' ? 'skill2' : 'dodge')
    } else return
    cancelScript()
    return true
  })
  /** 무대 밖을 누르는 등 포커스를 잃으면 keyup 이 오지 않는다 → 눌린 키를 모두 놓는다 */
  const onBlur = () => {
    if (!S.keys.size) return
    S.keys.clear()
    keyStick()
  }
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (S.keys.delete(k)) keyStick()
  }

  /* ───── 이벤트 · 자동 데모 ───── */
  /** 대본: 0~3초 왼손이 원을 그리며 이동, 그 사이 오른손이 공격 3번 · 스킬 · 회피 */
  const AUTO_LEN = 5.5
  const scriptStep = (prev: number, now: number) => {
    const c = cfgRef.current
    const h = home()
    const L = AUTO_L
    const R = AUTO_R
    const crossed = (at: number) => prev < at && now >= at
    // 왼손
    if (crossed(0.2)) down(L, h.x + (c.juice && c.mode !== 'fixed' ? 40 : 0), h.y + (c.juice && c.mode !== 'fixed' ? 30 : 0))
    if (now > 0.2 && now < 3.4 && S.pointers.get(L)?.role === 'stick') {
      const a = (now - 0.2) * 2.2
      const st = S.stick
      move(L, st.bx + Math.cos(a) * c.radius * 0.85, st.by + Math.sin(a) * c.radius * 0.6)
    }
    if (crossed(3.4)) up(L)
    // 오른손
    const tap = (at: number, id: ItemId) => {
      if (crossed(at)) {
        const cc = center(id)
        down(R, cc.x, cc.y)
      }
      if (crossed(at + 0.12)) up(R)
    }
    tap(0.9, 'attack')
    tap(1.5, 'attack')
    tap(2.1, 'attack')
    tap(2.7, 'skill1')
    tap(4.2, 'dodge')
  }
  const handle = (id: string) => {
    if (id === 'demo') {
      if (S.editing) S.editing = false
      for (const pid of [...S.pointers.keys()]) up(pid)
      S.auto = 0
      autoActive.current = true
    } else if (id === 'edit') {
      S.editing = !S.editing
      for (const pid of [...S.pointers.keys()]) up(pid)
      note(S.editing ? '배치 편집: 끌어서 옮기고, 오른쪽 아래 손잡이로 크기 조절' : '배치 편집 끝')
    } else if (id === 'reset-layout') {
      S.layout = freshLayout()
      note('기본 배치로 되돌림')
    }
    touch()
    sync()
  }
  useTrigger(p.trigger, id => {
    cancelScript()
    handle(id)
  })

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = cfgRef.current
    // 자동 데모: 사람이 만지지 않을 때 대본을 반복 ('시연' 이벤트는 바로 한 번)
    const humanHolding = [...S.pointers.keys()].some(pid => pid >= 0 || pid === KEY_PID)
    const idle = p.autoplay && !p.thumbnail && !S.editing && !humanHolding && S.t - realAt.current > MANUAL_PAUSE
    if (idle || autoActive.current) {
      const prev = S.auto
      S.auto += dt
      scriptStep(prev, S.auto)
      if (S.auto >= AUTO_LEN) {
        S.auto = 0
        autoActive.current = false
      }
    }
    // 캐릭터
    const pl = S.player
    const st = S.stick
    if (st.mag > 0.01) {
      const len = Math.hypot(st.ox, st.oy) || 1
      pl.fx = st.ox / len
      pl.fy = st.oy / len
    }
    const dashV = pl.dash > 0 ? 1600 : 0
    pl.x += (st.ox * SPEED + pl.fx * dashV) * dt
    pl.y += (st.oy * SPEED + pl.fy * dashV) * dt
    const scr = c.device.screen
    pl.x = clamp(pl.x, scr.x + 70, scr.x + scr.w - 70)
    pl.y = clamp(pl.y, scr.y + 70, scr.y + scr.h - 70)
    pl.dash = Math.max(0, pl.dash - dt)
    pl.slash = Math.max(0, pl.slash - dt)
    pl.burst = Math.max(0, pl.burst - dt)
    for (const k of ['skill1', 'skill2', 'dodge'] as const) S.cooldown[k] = Math.max(0, S.cooldown[k] - dt)
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    paint()
    sync()
  })

  /* ───── 그리기 (ref) ───── */
  const playerRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const fingerRefs = useRef<(HTMLDivElement | null)[]>([])
  const btnRefs = useRef<Partial<Record<ItemId, HTMLDivElement | null>>>({})
  const readRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const touchListRef = useRef<HTMLDivElement>(null)

  const paint = () => {
    const c = cfgRef.current
    const st = S.stick
    const pl = S.player
    if (playerRef.current) {
      playerRef.current.style.transform = `translate(${pl.x}px, ${pl.y}px) rotate(${Math.atan2(pl.fy, pl.fx)}rad)`
      playerRef.current.toggleAttribute('data-slash', pl.slash > 0)
      playerRef.current.toggleAttribute('data-burst', pl.burst > 0)
      playerRef.current.toggleAttribute('data-dash', pl.dash > 0)
    }
    const h = home()
    const active = st.pid !== null
    const bx = active ? st.bx : h.x
    const by = active ? st.by : h.y
    if (baseRef.current) {
      baseRef.current.style.transform = `translate(${bx}px, ${by}px)`
      baseRef.current.style.width = baseRef.current.style.height = `${c.radius * 2}px`
      baseRef.current.style.opacity = String(active ? 1 : c.idleOpacity)
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${active ? st.kx : bx}px, ${active ? st.ky : by}px)`
      knobRef.current.style.opacity = String(active ? 1 : c.idleOpacity)
    }
    // 손가락 표시: 역할과 순번
    const list = [...S.pointers.entries()].filter(([pid]) => pid !== KEY_PID).slice(0, FINGERS)
    fingerRefs.current.forEach((el, i) => {
      if (!el) return
      const f = list[i]
      el.toggleAttribute('data-on', !!f)
      if (f) {
        el.style.transform = `translate(${f[1].x}px, ${f[1].y}px)`
        el.dataset.n = `#${f[1].n}`
      }
    })
    for (const it of S.layout) {
      const el = btnRefs.current[it.id]
      if (!el) continue
      const cd = it.id === 'skill1' || it.id === 'skill2' || it.id === 'dodge' ? S.cooldown[it.id] / COOLDOWN[it.id] : 0
      el.style.setProperty('--cd', String(cd))
      el.toggleAttribute('data-pressed', S.t - (S.pressed[it.id] ?? -9) < 0.12)
    }
    if (readRef.current) {
      readRef.current.textContent = `입력 ${st.raw.toFixed(2)} → 출력 ${st.mag.toFixed(2)}`
    }
    if (dotRef.current) {
      // 반응 곡선 그래프 (가로 = 입력 0~1, 세로 = 출력 0~1)
      dotRef.current.setAttribute('cx', String(10 + Math.min(1.4, st.raw) * 200))
      dotRef.current.setAttribute('cy', String(110 - Math.min(1.4, st.mag) * 100))
    }
    if (touchListRef.current) {
      const names = [...S.pointers.values()].map(f => `#${f.n} ${f.role === 'stick' ? '조이스틱' : f.role === 'edit' ? '편집' : f.role === 'none' ? '빈 곳' : LABEL[f.role as ItemId]}`)
      touchListRef.current.textContent = names.length ? names.join(' · ') : '손가락 없음'
    }
  }
  useLayoutEffect(paint)

  /* ───── 렌더 ───── */
  const scr = device.screen
  const zone = zoneRect()
  const curvePath = (() => {
    const pts: string[] = []
    for (let i = 0; i <= 40; i++) {
      const raw = (i / 40) * 1.0
      const o = shape(raw, 0, deadzone, curve)
      pts.push(`${10 + raw * 200},${110 - o.mag * 100}`)
    }
    if (!juice) pts.push(`${10 + 1.4 * 200},${110 - 1.4 * 100}`)
    return `M${pts.join(' L')}`
  })()

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-editing={S.editing || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="가상 조이스틱 데모 (터치 · 마우스 드래그, 키보드: 방향키 이동 · Space 공격 · Q/E 스킬 · Shift 회피)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
    >
      {/* 기기 화면 */}
      <div className={s.screen} style={{ left: scr.x, top: scr.y, width: scr.w, height: scr.h, borderRadius: device.corner }}>
        <div className={s.grid} />
      </div>
      {device.notch > 0 && <div className={s.notch} style={{ left: scr.x - 4, top: scr.y + scr.h / 2 - device.notch / 2, height: device.notch }} />}

      {/* 안내선: 세이프 에어리어 · 시작 영역 · 엄지 영역 */}
      <div className={s.safe} data-show={showGuides || undefined} data-part="safe" style={{ left: safe.x, top: safe.y, width: safe.w, height: safe.h }}>
        <span>{useSafe ? '세이프 에어리어' : '세이프 에어리어 무시 (화면 전체)'}</span>
      </div>
      <div
        className={s.zone}
        data-show={(showGuides && juice && mode !== 'fixed') || undefined}
        data-part="zone"
        style={{ left: zone.x, top: zone.y, width: zone.w, height: zone.h }}
      >
        <span>여기 어디든 누르면 조이스틱</span>
      </div>
      {showGuides && (
        <svg className={s.thumb} viewBox="0 0 1920 1080" aria-hidden>
          <circle cx={scr.x} cy={scr.y + scr.h} r={560} />
          <circle cx={scr.x + scr.w} cy={scr.y + scr.h} r={560} />
        </svg>
      )}

      {/* 화면 안의 것들 — 기기 화면 밖으로 나간 부분은 잘린다 (나쁜 예의 태블릿에서 버튼이 사라지는 것처럼) */}
      <div className={s.hud} style={{ clipPath: `inset(${scr.y}px ${W - scr.x - scr.w}px ${p.height - scr.y - scr.h}px ${scr.x}px round ${device.corner}px)` }}>
      {/* 캐릭터 */}
      <div ref={playerRef} className={s.player}>
        <i className={s.body} />
        <i className={s.slash} />
        <i className={s.burst} />
      </div>

      {/* 조이스틱 */}
      <div ref={baseRef} className={s.base} data-part="stick" />
      <div ref={knobRef} className={s.knob} />

      {/* 버튼 */}
      {S.layout
        .filter(it => it.id !== 'stick')
        .map(it => {
          const c = centerOf(it, device, safe, juice)
          return (
            <div
              key={it.id}
              ref={el => {
                btnRefs.current[it.id] = el
              }}
              className={s.btn}
              data-id={it.id}
              data-part={it.id === 'attack' ? 'buttons' : undefined}
              // 위치는 translate 속성으로 — transform 으로 두면 눌림 표시(scale 0.9)가 위치까지 0.9배로 줄여 버튼이 튄다
              style={{ translate: `${c.x}px ${c.y}px`, width: it.size, height: it.size, marginLeft: -it.size / 2, marginTop: -it.size / 2 }}
            >
              <span>{LABEL[it.id]}</span>
              {S.editing && <i className={s.handle} />}
            </div>
          )
        })}
      {S.editing && (
        <div className={s.stickEdit} style={{ transform: `translate(${home().x}px, ${home().y}px)`, width: radius * 2, height: radius * 2, marginLeft: -radius, marginTop: -radius }}>
          <span>이동 (크기 = 반경 값)</span>
        </div>
      )}
      </div>

      {/* 손가락 표시 */}
      {Array.from({ length: FINGERS }, (_, i) => (
        <div
          key={i}
          ref={el => {
            fingerRefs.current[i] = el
          }}
          className={s.finger}
        />
      ))}

      {/* 수업용 패널: 입력 → 출력, 반응 곡선, 손가락 목록 */}
      <aside className={s.panel} data-part="touches" style={{ left: safe.x + 24, top: safe.y + 20 }}>
        <div ref={readRef} className={s.read} />
        <svg className={s.graph} viewBox="0 -50 300 170" aria-hidden>
          <path d="M10 110 H290 M10 10 V110" className={s.axis} />
          <line x1={10 + deadzone * 200} y1={10} x2={10 + deadzone * 200} y2={110} className={s.dz} />
          <path d={curvePath} className={s.curve} />
          <circle ref={dotRef} r={7} cx={10} cy={110} className={s.dot} />
        </svg>
        <div ref={touchListRef} className={s.touches} />
        {S.note && (
          <div className={s.note} data-bad={S.note.bad || undefined}>
            {S.note.text}
          </div>
        )}
      </aside>

      {S.editing && (
        <div className={s.toolbar} data-ui style={{ left: safe.x + safe.w / 2, top: safe.y + 24 }}>
          <span>배치 편집 — {juice ? '비율로 저장' : '픽셀로 저장'}</span>
          <button tabIndex={-1} onClick={() => handle('reset-layout')}>
            기본 배치
          </button>
          <button tabIndex={-1} data-primary onClick={() => handle('edit')}>
            완료
          </button>
        </div>
      )}
    </div>
  )
}
