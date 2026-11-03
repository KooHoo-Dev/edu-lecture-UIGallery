import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { damp, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap, MouseGlyph, Shoulder } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { ITEMS, angleOf, sectorOf, sectorPath } from './wheel'
import s from './style.module.css'

export { meta } from './meta'

type Device = 'mouse' | 'stick'
type OpenMode = 'hold' | 'toggle'

/** 사람이 직접 조작하면 자동 데모를 이만큼(실제 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
const CX = 960
const CY = 500
const R_OUT = 330
const AUTO_LEN = 8

interface Sim {
  t: number
  open: boolean
  device: Device
  vx: number
  vy: number
  sel: number
  equipped: number
  equipAt: number
  /** 세계 시간 배율 (휠이 열리면 느려진다) — 부드럽게 따라간다 */
  world: number
  drones: { x: number; y: number; v: number }[]
  note: { text: string; bad: boolean; until: number } | null
  auto: number
  /** 휠을 연 쪽 — 사람이 연 휠은 자동 데모가 건드리지 않는다 */
  owner: 'human' | 'script' | null
  /** 장착 표시 튐이 진행 중 (끝나면 한 번 다시 그린다) */
  popping: boolean
  /** 마지막 포인터 위치 (조금이라도 움직였을 때만 마우스로 전환) */
  px: number
  py: number
  version: number
}

/**
 * 방사형 선택 휠.
 * 열린 동안 방향(마우스 = 가운데에서의 위치, 스틱 = 기울기)을 각도로 바꿔 칸을 고르고, 놓거나 누르면 확정한다.
 * 휠과 안내는 '실제 시간', 세계(드론)는 느려진 '게임 시간' 으로 움직인다 — Unity 의 unscaledDeltaTime 과 deltaTime 의 구분.
 */
export default function RadialQuickSelect(p: SpecimenProps) {
  const juice = p.juice
  const n = Math.round(num(p.params, 'slots', 8))
  const deadzone = juice ? num(p.params, 'deadzonePct', 30) / 100 : 0
  const hysteresis = juice ? num(p.params, 'hysteresisDeg', 6) : 0
  const slowmo = juice ? num(p.params, 'slowmo', 0.3) : 1
  const openMode = str(p.params, 'openMode', 'hold') as OpenMode
  const showGuides = bool(p.params, 'showGuides', true)
  const reduce = prefersReducedMotion()
  const items = ITEMS.slice(0, n)
  const step = 360 / n
  const R_IN = Math.max(70, deadzone * R_OUT)

  const cfg = { juice, n, deadzone, hysteresis, slowmo, openMode }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) {
    simRef.current = {
      t: 0,
      open: true, // 첫 화면부터 열린 휠 (썸네일 · 해설 번호가 가리킬 것이 보이게) — 자동 데모 소유라 사람이 만지면 닫힌다
      device: 'stick',
      vx: Math.sin((2 * step * Math.PI) / 180) * 0.8,
      vy: -Math.cos((2 * step * Math.PI) / 180) * 0.8,
      sel: 2,
      equipped: 0,
      equipAt: -9,
      world: 1,
      drones: Array.from({ length: 5 }, (_, i) => ({ x: 200 + i * 360, y: 180 + (i % 3) * 90, v: 140 + (i % 2) * 90 })),
      note: null,
      auto: 0,
      owner: 'script',
      popping: false,
      px: -1,
      py: -1,
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
    S.note = { text, bad, until: S.t + 2.2 }
    touch()
  }

  const realAt = useRef(-1e9)
  const autoActive = useRef(false)

  /* ───── 선택 ───── */
  const updateSel = () => {
    if (!S.open) return
    const c = cfgRef.current
    const mag = Math.hypot(S.vx, S.vy)
    let next = S.sel
    if (mag < c.deadzone || mag === 0) {
      // 가운데: 마우스는 '취소', 스틱은 손을 떼면 저절로 가운데로 오므로 마지막 선택 유지
      if (S.device === 'mouse') next = -1
    } else next = sectorOf(angleOf(S.vx, S.vy), c.n, c.juice ? S.sel : -1, c.hysteresis)
    if (next !== S.sel) {
      S.sel = next
      touch()
    }
  }
  const setVec = (x: number, y: number, device: Device) => {
    S.vx = x
    S.vy = y
    S.device = device
    updateSel()
  }

  const openWheel = (owner: 'human' | 'script' = 'human') => {
    if (S.open) return
    S.open = true
    S.owner = owner
    // 열 때는 지금 장착한 칸을 먼저 가리킨다 — 그대로 놓으면 아무것도 바뀌지 않게 (스틱 기준)
    S.sel = cfgRef.current.juice && S.device === 'stick' ? S.equipped : -1
    S.vx = S.vy = 0
    touch()
  }
  const closeWheel = (confirm: boolean) => {
    if (!S.open) return
    S.open = false
    S.owner = null
    if (confirm && S.sel >= 0) {
      if (S.sel !== S.equipped) {
        S.equipped = S.sel
        S.equipAt = S.t
        S.popping = true
        note(`${ITEMS[S.sel].name} 장착`)
      } else note('같은 도구 — 그대로')
    } else note('취소 — 장착 유지')
    S.sel = -1
    touch()
  }

  /* ───── 입력 ───── */
  const rootRef = useRef<HTMLDivElement>(null)
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect()
    const k = r.width / p.width || 1
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k] as const
  }
  /** 사람이 조작했다: 자동 데모를 멈추고, 자동 데모가 열어 둔 휠은 확정하지 않고 닫는다 */
  const human = () => {
    realAt.current = S.t
    autoActive.current = false
    S.auto = 0
    if (S.open && S.owner === 'script') {
      S.open = false
      S.owner = null
      S.sel = -1
      touch()
    }
  }
  const keyVec = useRef(new Set<string>())
  const applyKeyVec = () => {
    const k = keyVec.current
    const x = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0)
    const y = (k.has('ArrowDown') || k.has('s') ? 1 : 0) - (k.has('ArrowUp') || k.has('w') ? 1 : 0)
    const len = Math.hypot(x, y) || 1
    setVec(x / len, y / len, 'stick')
    if (!x && !y) setVec(0, 0, 'stick')
  }
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const c = cfgRef.current
    const wasOpen = S.open // human() 이 자동 데모의 휠을 닫기 전의 상태
    const dir = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)
    // 휠이 닫혀 있으면 방향키 · W A S D · Esc · Enter 는 할 일이 없다 — 갤러리로 흘려보낸다
    if (k !== 'q' && !(wasOpen && (dir || k === 'Escape' || k === 'Enter'))) return
    human()
    if (k === 'q') {
      if (!e.repeat) {
        if (c.openMode === 'toggle' && S.open) closeWheel(true)
        else openWheel()
      }
    } else if (k === 'Escape') {
      if (S.open) closeWheel(false)
    } else if (k === 'Enter') {
      if (S.open) closeWheel(true)
    } else {
      // 자동 데모가 연 휠이었다면 human() 이 이미 닫았다 — 방향 입력은 사람이 연 휠에만
      if (!S.open) {
        sync()
        return true
      }
      keyVec.current.add(k)
      applyKeyVec()
    }
    sync()
    return true
  })
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (k === 'q' && cfgRef.current.openMode === 'hold' && S.owner === 'human') closeWheel(true)
    if (keyVec.current.delete(k)) applyKeyVec()
    sync()
  }
  const onBlur = () => {
    keyVec.current.clear()
    if (S.open && cfgRef.current.openMode === 'hold') closeWheel(false)
    sync()
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    rootRef.current?.focus({ preventScroll: true })
    human()
    const c = cfgRef.current
    const isTouch = e.pointerType === 'touch'
    if (e.button === 2 || isTouch) {
      // 마우스 오른쪽 · 터치: 누르고 있는 동안 열림 (토글이면 한 번 눌러 열고, 다시 눌러 확정)
      if (c.openMode === 'toggle' && S.open) closeWheel(true)
      else {
        openWheel()
        const [x, y] = toLogical(e)
        S.px = x
        S.py = y
        if (isTouch) setVec((x - CX) / R_OUT, (y - CY) / R_OUT, 'mouse')
      }
      try {
        rootRef.current?.setPointerCapture(e.pointerId)
      } catch {
        /* 합성 이벤트 */
      }
    } else if (e.button === 0 && S.open) closeWheel(true) // 왼쪽 클릭으로 확정
    sync()
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    // 자동 데모가 연 휠은 마우스가 지나가도 건드리지 않는다
    if (!S.open || p.thumbnail || S.owner !== 'human') return
    const [x, y] = toLogical(e)
    // 책상 위 마우스가 살짝 밀린 정도로 스틱(방향키) 선택을 덮어쓰지 않게 3px 이상 움직였을 때만
    if (S.device === 'stick' && Math.hypot(x - S.px, y - S.py) < 3) return
    S.px = x
    S.py = y
    realAt.current = S.t // 누르고 있는 동안은 자동 데모가 다시 시작되지 않게
    setVec((x - CX) / R_OUT, (y - CY) / R_OUT, 'mouse')
    sync()
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.button === 2 || e.pointerType === 'touch') && cfgRef.current.openMode === 'hold' && S.owner === 'human') closeWheel(true)
    sync()
  }
  /** 터치가 취소되거나 포인터를 잃으면 확정하지 않고 닫는다 */
  const onPointerCancel = () => {
    if (S.open && S.owner === 'human' && cfgRef.current.openMode === 'hold') closeWheel(false)
    sync()
  }
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => e.preventDefault()

  /* ───── 자동 데모 (스틱 흉내) ───── */
  const script = (prev: number, now: number) => {
    const c = cfgRef.current
    const at = (t: number) => prev < t && now >= t
    const stickTo = (deg: number, mag = 0.85) => setVec(Math.sin((deg * Math.PI) / 180) * mag, -Math.cos((deg * Math.PI) / 180) * mag, 'stick')
    if (at(0.4)) openWheel('script')
    if (S.open && S.owner === 'human') return // 사람이 연 휠은 건드리지 않는다
    if (now > 0.6 && now < 2.6) stickTo(30 + (now - 0.6) * 60) // 시계 방향으로 훑기
    // 칸 경계 위에서 손 떨림 ±4° (약 1.6Hz) — 그 도중에 놓는다: 좋은 예는 칸이 유지되고, 나쁜 예는 놓는 순간의 칸이 확정된다
    if (now >= 2.6 && now < 4.6) stickTo(3.5 * step + Math.sin(now * 10) * 4)
    if (at(4.6)) closeWheel(true)
    if (at(5.4)) openWheel('script')
    if (at(5.6)) stickTo((6 * step) % 360)
    // 스틱을 놓으면 가운데로 튕겨 돌아오며 반대쪽으로 아주 조금 넘어간다 — 데드존이 없으면 그 방향 칸이 골라진다
    if (at(6.4)) setVec(c.juice ? 0 : -Math.sin((6 * step * Math.PI) / 180) * 0.08, c.juice ? 0 : Math.cos((6 * step * Math.PI) / 180) * 0.08, 'stick')
    if (at(7.2)) closeWheel(true)
  }
  const handle = (id: string) => {
    if (id === 'demo') {
      if (S.open) closeWheel(false)
      S.auto = 0
      autoActive.current = true
    } else if (id === 'open') {
      if (S.open) closeWheel(true)
      else openWheel('human')
    } else if (id === 'cancel') {
      // 마우스를 가운데에 두고 놓기 (손 떨림 1px 정도 포함) — 좋은 예는 데드존이라 취소, 나쁜 예는 그 방향 칸이 확정된다
      if (!S.open) openWheel()
      setVec(0.01, -0.006, 'mouse')
      closeWheel(true)
    }
    touch()
    sync()
  }
  useTrigger(p.trigger, id => {
    realAt.current = S.t
    autoActive.current = false
    handle(id)
  })

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = cfgRef.current
    const idle = p.autoplay && !p.thumbnail && S.t - realAt.current > MANUAL_PAUSE
    if (idle || autoActive.current) {
      const prev = S.auto
      S.auto += dt
      script(prev, S.auto)
      if (S.auto >= AUTO_LEN) {
        S.auto = 0
        autoActive.current = false
      }
    }
    // 세계 시간: 휠이 열리면 slowmo 로 (0.15초 안에 부드럽게)
    const target = S.open ? c.slowmo : 1
    S.world = damp(S.world, target, 14, dt)
    if (S.popping && S.t - S.equipAt > 0.6) {
      S.popping = false
      touch()
    }
    const wdt = dt * S.world
    for (const d of S.drones) {
      d.x += d.v * wdt
      if (d.x > 1980) d.x = -60
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    paint()
    sync()
  })

  const droneRefs = useRef<(SVGPathElement | null)[]>([])
  const arrowRef = useRef<SVGLineElement>(null)
  const tipRef = useRef<SVGCircleElement>(null)
  const angleRef = useRef<SVGTextElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const paint = () => {
    S.drones.forEach((d, i) => droneRefs.current[i]?.setAttribute('transform', `translate(${d.x} ${d.y})`))
    const mag = Math.min(1.05, Math.hypot(S.vx, S.vy))
    const ang = Math.atan2(S.vy, S.vx)
    const ex = CX + Math.cos(ang) * mag * R_OUT
    const ey = CY + Math.sin(ang) * mag * R_OUT
    arrowRef.current?.setAttribute('x2', String(mag ? ex : CX))
    arrowRef.current?.setAttribute('y2', String(mag ? ey : CY))
    tipRef.current?.setAttribute('cx', String(mag ? ex : CX))
    tipRef.current?.setAttribute('cy', String(mag ? ey : CY))
    if (angleRef.current) angleRef.current.textContent = mag ? `${Math.round(angleOf(S.vx, S.vy))}°` : '—'
  }
  useLayoutEffect(paint)

  /* ───── 렌더 ───── */
  const sel = S.sel
  const bandCenter = (sel >= 0 ? sel : 0) * step
  const sideA = bandCenter - step / 2
  const sideB = bandCenter + step / 2
  const eq = ITEMS[S.equipped]
  const labelItem = sel >= 0 ? ITEMS[sel] : null
  const dur = juice && !reduce ? 160 : 0

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-open={S.open || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale), '--dur': `${dur / Math.max(0.05, p.timeScale)}ms` } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="방사형 휠 데모 (Q 또는 마우스 오른쪽 길게 = 열기, 방향(마우스 · 방향키) = 고르기, 놓기 = 확정, Esc 취소)"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onContextMenu={onContextMenu}
    >
      {/* 세계 (느려지는 쪽) */}
      <div ref={worldRef} className={s.world}>
        <svg viewBox="0 0 1920 1080" className={s.field} aria-hidden>
          <rect width="1920" height="1080" fill="#14271f" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M${i * 170} 1080 L${i * 170 + 120} 760`} stroke="#ffffff0c" strokeWidth="3" />
          ))}
          {S.drones.map((_, i) => (
            <path
              key={i}
              ref={el => {
                droneRefs.current[i] = el
              }}
              d="M0 -26 L24 18 L-24 18 Z"
              fill="#ff6b5e"
            />
          ))}
          <rect x="940" y="830" width="40" height="110" rx="20" fill="#5ee6c9" />
          <circle cx="960" cy="810" r="24" fill="#5ee6c9" />
        </svg>
      </div>
      <div className={s.dimmer} />
      <div className={s.slowmo} data-part="slowmo" data-on={(S.open && slowmo < 1) || undefined}>
        시간 {Math.round(slowmo * 100)}% — 휠과 손은 그대로, 세계만 느리게
      </div>

      {/* 휠 */}
      <svg className={s.wheel} viewBox="0 0 1920 1080" aria-hidden={!S.open}>
        <g className={s.ring}>
          {items.map((it, i) => {
            const a0 = i * step - step / 2 + 1.2
            const a1 = i * step + step / 2 - 1.2
            const mid = (i * step * Math.PI) / 180
            const push = i === sel && juice ? 14 : 0
            const ir = (R_IN + R_OUT) / 2
            return (
              <g key={it.id} style={{ transform: `translate(${Math.sin(mid) * push}px, ${-Math.cos(mid) * push}px)` }} className={s.sector} data-sel={i === sel || undefined} data-eq={i === S.equipped || undefined}>
                <path d={sectorPath(CX, CY, R_IN, R_OUT, a0, a1)} data-part={i === (sel >= 0 ? sel : 0) ? 'sector' : undefined} />
                <ItemIcon id={it.id} x={CX + Math.sin(mid) * ir} y={CY - Math.cos(mid) * ir} big={i === sel && juice} />
              </g>
            )
          })}
          {/* 히스테리시스 띠: 지금 칸의 경계를 이만큼 넘어야 옆 칸으로 바뀐다 */}
          <g className={s.band} data-part="hysteresis" data-on={(showGuides && juice && sel >= 0 && hysteresis > 0) || undefined}>
            <path d={sectorPath(CX, CY, R_IN, R_OUT + 24, sideA - Math.max(0.5, hysteresis), sideA)} />
            <path d={sectorPath(CX, CY, R_IN, R_OUT + 24, sideB, sideB + Math.max(0.5, hysteresis))} />
          </g>
          {/* 가운데: 데드존 + 이름 */}
          <circle cx={CX} cy={CY} r={R_IN - 6} className={s.hub} />
          {/* 실제 데드존 (가운데 판은 이름 자리 때문에 최소 70px) */}
          <circle cx={CX} cy={CY} r={Math.max(1, deadzone * R_OUT)} className={s.dz} data-part="deadzone" data-guide={(showGuides && juice) || undefined} />
          <line ref={arrowRef} x1={CX} y1={CY} x2={CX} y2={CY} className={s.arrow} data-on={showGuides || undefined} />
          <circle ref={tipRef} cx={CX} cy={CY} r={10} className={s.tip} data-on={showGuides || undefined} />
          <text ref={angleRef} x={CX + R_OUT + 40} y={CY - R_OUT + 20} className={s.angle} data-on={showGuides || undefined}>
            —
          </text>
        </g>
      </svg>
      <div className={s.label} data-part="label" style={{ left: CX, top: CY }}>
        {labelItem ? (
          <>
            <b>{labelItem.name}</b>
            <span>{labelItem.desc}</span>
          </>
        ) : (
          <>
            <b>{S.device === 'mouse' ? '취소' : '—'}</b>
            <span>{S.device === 'mouse' ? '가운데에서 놓으면 그대로' : '방향을 기울여 고르기'}</span>
          </>
        )}
      </div>

      {/* 장착 중 + 조작 안내 */}
      <div className={s.equip} key={`eq-${S.equipAt}`} data-new={(juice && S.t - S.equipAt < 0.6) || undefined}>
        <svg viewBox="-40 -40 80 80" aria-hidden>
          <ItemIcon id={eq.id} x={0} y={0} big={false} />
        </svg>
        <div>
          <small>장착</small>
          <b>{eq.name}</b>
        </div>
      </div>
      <div className={s.hint}>
        <KeyCap label="Q" size={40} />
        <span>·</span>
        <MouseGlyph button="right" size={40} />
        <span>·</span>
        <Shoulder side="L" size={40} />
        <span>{openMode === 'hold' ? '누르고 있기 → 방향 → 놓기' : '한 번 눌러 열기 → 방향 → 다시 눌러 확정'}</span>
      </div>
      {S.note && (
        <div className={s.note} data-bad={S.note.bad || undefined}>
          {S.note.text}
        </div>
      )}
    </div>
  )
}

/** 도구 아이콘 — 직접 그린 단순한 도형 */
function ItemIcon({ id, x, y, big }: { id: string; x: number; y: number; big: boolean }) {
  const k = big ? 1.25 : 1
  const shapes: Record<string, ReactElement> = {
    laser: <path d="M-22 10 L14 -22 L22 -14 L-14 18 Z M14 -22 L26 -30" />,
    kit: <path d="M-20 -14 H20 V18 H-20 Z M-6 -2 H6 M0 -8 V4" />,
    cell: <path d="M-10 -22 H10 V22 H-10 Z M-4 -26 H4" />,
    lamp: <path d="M-14 -8 A14 14 0 1 1 14 -8 L8 10 H-8 Z M-6 16 H6" />,
    cable: <path d="M-22 14 C-22 -24 22 -24 22 0 C22 14 6 14 6 2" />,
    scan: <path d="M-22 0 A22 22 0 0 1 22 0 M-12 0 A12 12 0 0 1 12 0 M0 0 L14 -16" />,
    oxy: <path d="M-12 -14 A12 12 0 0 1 12 -14 V20 H-12 Z M-4 -26 H4" />,
    flare: <path d="M0 -24 L6 -6 L22 -6 L9 4 L14 22 L0 11 L-14 22 L-9 4 L-22 -6 L-6 -6 Z" />,
    shield: <path d="M0 -24 L20 -14 V2 C20 14 10 20 0 24 C-10 20 -20 14 -20 2 V-14 Z" />,
    decoy: <path d="M0 -22 L20 14 H-20 Z M0 -6 V4" />,
    chip: <path d="M-14 -14 H14 V14 H-14 Z M-20 -6 H-14 M-20 6 H-14 M14 -6 H20 M14 6 H20" />,
    sos: <path d="M-22 -10 H22 V12 H-22 Z M-16 1 H-8 M-4 1 H4 M8 1 H16" />,
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} className={s.icon}>
      {shapes[id]}
    </g>
  )
}
