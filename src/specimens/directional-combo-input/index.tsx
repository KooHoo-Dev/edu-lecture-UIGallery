import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, useGameLoop, useTrigger } from '../../core/hooks'
import { DPad, KeyCap, TouchGlyph } from '../../core/input'
import { num, str } from '../../core/params'
import { useStageKeys } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { COMMANDS, ComboMatcher, nextFor, prefixOf, quantize, suffixMatch, type Dir, type MatchConfig, type PushResult } from './combo'
import s from './style.module.css'

export { meta } from './meta'

type Owner = 'human' | 'script' | 'preview'
type OpenMode = 'hold' | 'toggle'

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
const AUTO_LEN = 11.5
/** 스와이프 한 칸으로 치는 거리 (논리 px) */
const SWIPE_PX = 70
/** 오른쪽 장면의 가운데 x */
const CX = 1410
const N = COMMANDS.length
const idx = (id: string) => COMMANDS.findIndex(c => c.id === id)
const SCOUT = idx('scout')
const WING = idx('wing')
const SUPPLY = idx('supply')
/** 다른 커맨드의 접두사인 커맨드 / 접두사가 따로 있는 커맨드 */
const PREFIX = COMMANDS.map((_, i) => prefixOf(COMMANDS, i))
const SHADOW = COMMANDS.map((c, i) => COMMANDS.some((o, j) => j !== i && o.seq.length < c.seq.length && o.seq.every((d, k) => c.seq[k] === d)))
const KEY_DIR: Record<string, Dir> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R' }
const dirOf = (e: KeyboardEvent): Dir | undefined => KEY_DIR[e.key] ?? KEY_DIR[e.code]
const isOpenKey = (e: KeyboardEvent) => e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q'

/** 자동 데모 두 가지를 번갈아 — [시각, 동작]. 동작: open · close · 커맨드 id(그 커맨드의 다음 칸) · !방향(일부러 넣는 입력) */
const SCRIPTS: [number, string][][] = [
  [
    [0.3, 'open'],
    [0.8, 'scout'], [1.2, 'scout'], [1.6, 'scout'], // 편대의 접두사 — 기다렸다가 발동
    [3.0, 'supply'], [3.4, 'supply'], [3.8, '!R'], // ↑ ← 다음에 → : 틀림
    [4.6, 'supply'], [5.0, 'supply'], [5.4, 'supply'], [5.8, 'supply'],
    [7.0, 'repair'], [7.4, 'repair'], [7.8, 'repair'], [8.2, 'repair'],
    [9.8, 'close'],
  ],
  [
    [0.3, 'open'],
    [0.8, 'coolant'], [1.2, 'coolant'], [1.6, 'coolant'], [2.0, 'coolant'],
    [3.2, 'wing'], [3.6, 'wing'], [4.0, 'wing'], [4.3, 'wing'], [4.6, 'wing'], // 접두사를 지나 이어 넣기
    [6.0, 'shield'], [6.4, 'shield'], [6.8, 'shield'], [7.2, 'shield'],
    [8.4, 'relay'], [8.8, 'relay'], [9.2, 'relay'], [9.6, 'relay'], [10.0, 'relay'],
    [11.0, 'close'],
  ],
]

interface Sim {
  t: number
  version: number
  open: boolean
  owner: Owner | null
  /** 누르고 있기에서 열림을 붙잡고 있는 입력 — 떼면 닫는다 */
  heldBy: 'key' | 'pointer' | null
  /** 나쁜 예(효과 끄기)의 버퍼 — 끝없이 쌓인다 */
  raw: Dir[]
  /** 첫 화면 · 미리보기: 사람이 손대기 전까지 버퍼를 그대로 둔다 (제한 시간 정지) */
  freeze: boolean
  wrong: { dir: Dir; slot: number; t: number } | null
  fire: { cmd: number; t: number } | null
  bannerOn: boolean
  note: { text: string; tone: 'ok' | 'bad' | 'info'; until: number } | null
  auto: number
  loop: number
  previewUntil: number
  coolMask: number
  drones: { x: number; y: number; v: number }[]
}

/**
 * 방향 커맨드 입력 HUD.
 * Q 를 누르고 있는 동안(또는 눌러 켠 동안) 지원 요청 목록이 열리고, 방향 시퀀스를 넣으면 접두사가 맞는 후보만 남는다.
 * 판정은 combo.ts 의 ComboMatcher(화면을 모르는 순수 로직)가 하고, 이 컴포넌트는 입력을 넘기고 결과를 그린다.
 */
export default function DirectionalComboInput(p: SpecimenProps) {
  const juice = p.juice
  const openMode = str(p.params, 'openMode', 'hold') as OpenMode
  const stepTimeoutMs = num(p.params, 'stepTimeoutMs', 1500)
  const errorMode = str(p.params, 'errorMode', 'reset')
  const prefixWaitMs = num(p.params, 'prefixWaitMs', 450)
  const mismatch = str(p.params, 'mismatchStyle', 'dim')
  const reduce = prefersReducedMotion()
  const match: MatchConfig = { prefixWait: prefixWaitMs / 1000, stepTimeout: stepTimeoutMs / 1000, lenient: errorMode === 'retry' }
  const cfg = { juice, openMode, match, reduce }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const playRef = useRef({ playing: p.playing, ts: p.timeScale })
  playRef.current = { playing: p.playing, ts: p.timeScale }

  const mRef = useRef<ComboMatcher | null>(null)
  if (!mRef.current) {
    mRef.current = new ComboMatcher(COMMANDS)
    mRef.current.buffer = ['L', 'U'] // 첫 화면: 후보가 둘로 줄어든 모습 (썸네일 · 해설 번호가 가리킬 것이 보이게)
  }
  const M = mRef.current
  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) {
    simRef.current = {
      t: 0,
      version: 0,
      open: true,
      owner: 'script',
      heldBy: null,
      raw: ['L', 'U'],
      freeze: true,
      wrong: null,
      fire: null,
      bannerOn: false,
      note: null,
      auto: 0,
      loop: 0,
      previewUntil: 0,
      coolMask: 0,
      drones: Array.from({ length: 4 }, (_, i) => ({ x: 940 + i * 260, y: 170 + (i % 2) * 110, v: 50 + (i % 3) * 25 })),
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
  const note = (text: string, tone: 'ok' | 'bad' | 'info' = 'info') => {
    S.note = { text, tone, until: S.t + 2 }
    touch()
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const gaugeRefs = useRef<(HTMLElement | null)[]>([])
  const cdRefs = useRef<(HTMLElement | null)[]>([])
  const timerRef = useRef<HTMLDivElement>(null)
  const timerFillRef = useRef<HTMLElement>(null)
  const timerTextRef = useRef<HTMLSpanElement>(null)
  const droneRefs = useRef<(SVGPathElement | null)[]>([])
  const realAt = useRef(-1e9)
  const autoActive = useRef(false)

  /* ───── 연출: Web Animations API (React key 로 다시 마운트하지 않는다 — 포커스가 빠진다) ───── */
  const anims = useRef(new Set<Animation>())
  const play = (el: Element | null, frames: Keyframe[], ms: number) => {
    const c = cfgRef.current
    if (!el || !c.juice || c.reduce || typeof el.animate !== 'function') return
    const a = el.animate(frames, { duration: ms, easing: 'ease-out' })
    a.playbackRate = Math.max(0.05, playRef.current.ts)
    if (!playRef.current.playing) a.pause()
    anims.current.add(a)
    a.onfinish = a.oncancel = () => anims.current.delete(a)
  }
  useEffect(() => {
    for (const a of anims.current) {
      a.playbackRate = Math.max(0.05, p.timeScale)
      if (p.playing) a.play()
      else a.pause()
    }
  }, [p.playing, p.timeScale])

  /* ───── 열기 · 닫기 ───── */
  const openPanel = (owner: Owner) => {
    S.open = true
    S.owner = owner
    S.heldBy = null
    S.wrong = null
    M.clear()
    S.raw = []
    touch()
  }
  const closePanel = () => {
    if (!S.open) return
    // 이미 완성해서 기다리던 커맨드는 닫을 때 발동 (손을 뗀 것은 '더 넣지 않겠다' 는 뜻)
    if (cfgRef.current.juice && M.pending >= 0) {
      const i = M.pending
      M.fire(i, S.t)
      onFired(i)
    }
    M.clear()
    S.raw = []
    S.open = false
    S.owner = null
    S.heldBy = null
    S.wrong = null
    S.freeze = false
    touch()
  }

  const onFired = (i: number) => {
    S.fire = { cmd: i, t: S.t }
    S.bannerOn = true
    if (S.note?.tone === 'info') S.note = null // '기다리는 중' 안내는 발동으로 끝났다
    touch()
    play(bannerRef.current, [{ transform: 'scale(0.8)', opacity: 0.3 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.4 }, { transform: 'scale(1)' }], 380)
    play(rowRefs.current[i], [{ backgroundColor: '#5ee6c9aa' }, { backgroundColor: '#ffffff08' }], 600)
    play(ringRef.current, [{ transform: 'scale(0.2)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0 }], 650)
  }

  const onResult = (r: PushResult, d: Dir, slot: number) => {
    const c = cfgRef.current
    if (r.kind === 'fired') onFired(r.cmd)
    else if (r.kind === 'pending') {
      note(`${COMMANDS[r.cmd].name} 완성 — ${+c.match.prefixWait.toFixed(2)}초 안에 이어 넣으면 더 긴 커맨드`, 'info')
    } else if (r.kind === 'wrong') {
      S.wrong = { dir: d, slot, t: S.t }
      play(stripRef.current, [0, -18, 16, -12, 8, -4, 0].map(x => ({ transform: `translateX(${x}px)` })), 360) // 가운데 맞춤은 CSS translate 라 겹치지 않는다
      if (r.cooling >= 0) note(`${COMMANDS[r.cooling].name} — 재사용 대기 ${Math.ceil(M.cooldownLeft(r.cooling, S.t))}초`, 'bad')
      else note(r.kept ? `${slot + 1}번째 칸이 아니다 — 그 칸만 다시` : `${slot + 1}번째 칸에서 틀림 — 처음부터`, 'bad')
    }
  }

  /** 방향 하나 — 입력 하나는 한 칸만 (키 반복 · 스와이프 한 번 = 한 칸) */
  const input = (d: Dir) => {
    if (!S.open) return
    S.freeze = false
    const c = cfgRef.current
    if (!c.juice) {
      // 나쁜 예: 버퍼 끝부분만 본다. 틀려도 아무 일 없이 쌓인다
      S.raw = [...S.raw, d].slice(-60)
      const i = suffixMatch(S.raw, M, S.t)
      if (i >= 0) {
        M.fire(i, S.t)
        S.raw = []
        onFired(i)
      }
      touch()
      return
    }
    const slot = M.buffer.length
    for (const r of M.push(d, S.t, c.match)) onResult(r, d, slot)
    touch()
  }

  /** 사람이 조작했다 — 자동 데모를 멈춘다 */
  const human = () => {
    realAt.current = S.t
    autoActive.current = false
    S.auto = 0
    S.freeze = false
  }

  /* ───── 키보드 (갤러리 단축키 가드) ───── */
  useStageKeys(rootRef, {
    enabled: !p.thumbnail,
    autoOpen: () => S.open && S.owner !== 'human',
    takeOver: (e, info) => {
      human()
      if (info.focused && !isOpenKey(e) && (dirOf(e) || e.key === 'Escape')) {
        // 자동 데모가 연 목록에 방향키가 왔다: 사람이 이어받는다 (닫아 버리면 그 ←/→ 가 갤러리로 새어 표본이 바뀐다)
        S.owner = 'human'
        M.clear()
        S.raw = []
      } else closePanel() // Q 는 새로 연다 · 무대 밖에서 온 키는 닫고 흘려보낸다
      sync()
    },
    onKey: e => {
      const d = dirOf(e)
      // 닫혀 있으면 방향키 · WASD · Esc 는 할 일이 없다 — 갤러리(←/→ · S · A · Esc)로 흘려보낸다
      if (!isOpenKey(e) && !(S.open && (d || e.key === 'Escape'))) return false
      human()
      const c = cfgRef.current
      if (isOpenKey(e)) {
        if (!e.repeat) {
          if (c.openMode === 'toggle') {
            if (S.open) closePanel()
            else openPanel('human')
          } else {
            if (!S.open) openPanel('human')
            S.owner = 'human'
            S.heldBy = 'key'
          }
        }
      } else if (e.key === 'Escape') closePanel()
      else if (d && !e.repeat) input(d) // 꾹 눌러 생기는 반복 입력은 먹기만 하고 넣지 않는다
      touch()
      sync()
      return true
    },
    onKeyUp: e => {
      if (isOpenKey(e) && S.heldBy === 'key' && cfgRef.current.openMode === 'hold') {
        closePanel()
        sync()
        return true
      }
      return false
    },
  })
  const onBlur = () => {
    if (S.heldBy && cfgRef.current.openMode === 'hold') closePanel()
    sync()
  }

  /* ───── 포인터 · 터치: 누른 채 밀기 (스와이프 한 번 = 한 칸) ───── */
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; wasOpen: boolean } | null>(null)
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect()
    const k = r.width / p.width || 1
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k] as const
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || (e.pointerType === 'mouse' && e.button !== 0)) return
    rootRef.current?.focus({ preventScroll: true })
    human()
    const wasOpen = S.open && S.owner === 'human'
    if (!wasOpen) openPanel('human')
    if (cfgRef.current.openMode === 'hold') S.heldBy = 'pointer'
    const [x, y] = toLogical(e)
    drag.current = { id: e.pointerId, x, y, moved: false, wasOpen }
    try {
      rootRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 */
    }
    sync()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g || g.id !== e.pointerId || !S.open) return
    const [x, y] = toLogical(e)
    const d = quantize(x - g.x, y - g.y, SWIPE_PX)
    if (!d) return
    g.x = x
    g.y = y
    g.moved = true
    realAt.current = S.t
    input(d)
    sync()
  }
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g || g.id !== e.pointerId) return
    drag.current = null
    const mode = cfgRef.current.openMode
    if (mode === 'hold' && S.heldBy === 'pointer') closePanel()
    else if (mode === 'toggle' && g.wasOpen && !g.moved) closePanel() // 토글: 밀지 않고 톡 치면 닫기
    sync()
  }

  /* ───── param 이 바뀌면: 남은 상태를 맞추고, 닫혀 있으면 목록을 잠깐 열어 바뀐 값을 보여 준다 ───── */
  const sig = `${openMode}|${stepTimeoutMs}|${errorMode}|${prefixWaitMs}|${mismatch}`
  const prevSig = useRef(sig)
  useEffect(() => {
    if (prevSig.current === sig) return
    prevSig.current = sig
    if (p.thumbnail) return
    const using = S.open && S.owner === 'human' && (openMode === 'toggle' || S.heldBy !== null)
    if (!using) {
      if (!S.open) openPanel('preview')
      S.owner = 'preview'
      S.heldBy = null
      autoActive.current = false
      S.auto = 0
      realAt.current = S.t
      M.clear()
      M.readyAt[SCOUT] = M.readyAt[WING] = 0
      M.buffer = ['L', 'U']
      M.lastAt = S.t
      S.raw = ['L', 'U']
      S.freeze = true
      S.previewUntil = S.t + 3
    }
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  // 효과 끄기를 바꾸면 버퍼 방식이 달라진다 — 남은 입력을 비운다
  const prevJuice = useRef(juice)
  useEffect(() => {
    if (prevJuice.current === juice) return
    prevJuice.current = juice
    M.clear()
    S.raw = []
    S.wrong = null
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juice])

  /* ───── 이벤트 버튼 ───── */
  const ensureOpen = () => {
    if (!S.open) openPanel('human')
    S.owner = 'human'
    S.heldBy = null
    M.clear()
    S.raw = []
  }
  useTrigger(p.trigger, id => {
    human()
    if (id === 'demo') {
      closePanel()
      M.readyAt.fill(0)
      S.loop = 0
      autoActive.current = true
    } else if (id === 'open') {
      if (S.open && S.owner === 'human') closePanel()
      else ensureOpen()
    } else if (id === 'wrong') {
      // 보급 투하(↑ ← ↓ ↓)를 넣다가 세 번째에 → — 틀림
      ensureOpen()
      M.readyAt[SUPPLY] = 0
      input('U')
      input('L')
      input('R')
    } else if (id === 'ambiguous') {
      // ← ↑ → : 정찰 드론 완성이지만 편대(← ↑ → ↑ ↓)의 앞부분이기도 하다
      ensureOpen()
      M.readyAt[SCOUT] = M.readyAt[WING] = 0
      input('L')
      input('U')
      input('R')
    }
    touch()
    sync()
  })

  /* ───── 자동 데모 ───── */
  const runScript = (prev: number, now: number) => {
    const list = SCRIPTS[S.loop % SCRIPTS.length]
    for (const [at, a] of list) {
      if (!(prev < at && now >= at)) continue
      if (S.open && S.owner === 'human') return // 사람이 연 목록은 건드리지 않는다
      if (a === 'open') {
        if (!S.open) openPanel('script')
        else {
          S.owner = 'script'
          M.clear()
          S.raw = []
        }
        S.freeze = false
      } else if (a === 'close') {
        if (S.owner === 'script') closePanel()
      } else if (S.open && S.owner === 'script') {
        if (a.startsWith('!')) input(a.slice(1) as Dir)
        else {
          const i = idx(a)
          // 재사용 대기 중이면 건너뛴다 (방금 발동한 커맨드를 다시 넣지 않게)
          if (M.ready(i, S.t)) input(nextFor(COMMANDS[i].seq, cfgRef.current.juice ? M.buffer : S.raw))
        }
      }
    }
  }

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = cfgRef.current
    const idle = p.autoplay && !p.thumbnail && S.t - realAt.current > MANUAL_PAUSE && !(S.open && S.owner === 'human')
    if (idle || autoActive.current) {
      const prev = S.auto
      S.auto += dt
      runScript(prev, S.auto)
      if (S.auto >= AUTO_LEN) {
        S.auto = 0
        S.loop++
        autoActive.current = false
      }
    }
    if (c.juice && !S.freeze) {
      const r = M.tick(S.t, c.match)
      if (r?.kind === 'fired') onFired(r.cmd)
      else if (r?.kind === 'timeout') note('입력 사이가 너무 길다 — 처음부터', 'bad')
      if (r) touch()
    }
    if (S.owner === 'preview' && S.t > S.previewUntil) closePanel()
    if (S.wrong && S.t - S.wrong.t > 0.7) {
      S.wrong = null
      touch()
    }
    if (S.note && S.t > S.note.until) {
      S.note = null
      touch()
    }
    if (S.bannerOn && S.fire && S.t - S.fire.t > 2.2) {
      S.bannerOn = false
      touch()
    }
    let mask = 0
    for (let i = 0; i < N; i++) if (!M.ready(i, S.t)) mask |= 1 << i
    if (mask !== S.coolMask) {
      S.coolMask = mask
      touch()
    }
    for (const d of S.drones) {
      d.x += d.v * dt
      if (d.x > 1980) d.x = 900
    }
    paint()
    sync()
  })

  const paint = () => {
    const c = cfgRef.current
    const tm = c.match.stepTimeout
    let k = 1
    let label: string
    if (!c.juice) {
      k = 0
      label = '제한 없음'
    } else if (tm <= 0) label = '제한 시간 끔'
    else if (M.buffer.length && M.pending < 0 && !S.freeze) {
      k = clamp(1 - (S.t - M.lastAt) / tm, 0, 1)
      label = `${(k * tm).toFixed(1)}초 남음`
    } else label = `입력 사이 ${+tm.toFixed(2)}초`
    if (timerFillRef.current) timerFillRef.current.style.transform = `scaleX(${k})`
    if (timerTextRef.current) timerTextRef.current.textContent = label
    timerRef.current?.toggleAttribute('data-low', c.juice && tm > 0 && k < 0.35)
    for (let i = 0; i < N; i++) {
      const g = gaugeRefs.current[i]
      const pend = i === M.pending && c.match.prefixWait > 0
      g?.style.setProperty('--p', pend ? String(clamp((S.t - M.pendingAt) / c.match.prefixWait, 0, 1)) : '0')
      const cd = cdRefs.current[i]
      if (cd) {
        const left = M.cooldownLeft(i, S.t)
        cd.textContent = left > 0 ? `${Math.ceil(left)}초` : ''
        cd.style.setProperty('--c', String(left / COMMANDS[i].cooldown))
      }
    }
    S.drones.forEach((d, i) => droneRefs.current[i]?.setAttribute('transform', `translate(${d.x.toFixed(1)} ${d.y})`))
  }
  useLayoutEffect(paint)

  /* ───── 렌더 ───── */
  const filtering = juice && M.buffer.length > 0
  const cand = COMMANDS.map((_, i) => M.isCandidate(i, S.t))
  const candCount = cand.filter(Boolean).length
  const focusRow = Math.max(0, cand.findIndex(Boolean))
  const lit = juice ? M.buffer.length : 0
  const shadowed = !juice || prefixWaitMs === 0
  const waitText = `${+(prefixWaitMs / 1000).toFixed(2)}초`
  const maxLen = juice ? Math.max(3, M.buffer.length + 1, ...COMMANDS.filter((_, i) => cand[i]).map(c => c.seq.length)) : 5
  const slots = Math.min(5, maxLen)
  const fired = S.fire ? COMMANDS[S.fire.cmd] : COMMANDS[0]
  const wrongOn = juice && S.wrong !== null

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-open={S.open || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale), '--dur': `${juice && !reduce ? 140 / Math.max(0.05, p.timeScale) : 0}ms` } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="방향 커맨드 입력 데모 (Q 누르고 있기 또는 눌러 켜기 = 목록 열기, 방향키 · WASD · 누른 채 밀기 = 방향 입력, Esc = 닫기)"
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 장면 */}
      <svg className={s.field} viewBox="0 0 1920 1080" aria-hidden>
        <rect width="1920" height="1080" fill="#101d26" />
        <rect y="430" width="1920" height="650" fill="#16271f" />
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d={`M${880 + i * 120} 1080 L${1010 + i * 100} 430`} stroke="#ffffff0b" strokeWidth="3" />
        ))}
        <path d="M900 430 Q1150 360 1400 420 T1920 400 V430 H900 Z" fill="#1c3128" />
        {S.drones.map((_, i) => (
          <path
            key={i}
            ref={el => {
              droneRefs.current[i] = el
            }}
            d="M0 -20 L18 14 L-18 14 Z"
            fill="#ff6b5e"
            opacity="0.85"
          />
        ))}
        <circle ref={ringRef} cx={CX} cy={640} r={90} className={s.ring} />
        <ellipse cx={CX} cy={668} rx={60} ry={14} fill="#00000055" />
        <rect x={CX - 22} y={566} width={44} height={100} rx={22} fill="#5ee6c9" />
        <circle cx={CX} cy={546} r={22} fill="#5ee6c9" />
      </svg>
      <div className={s.dimmer} />

      {/* 닫혀 있을 때의 안내 */}
      <div className={s.tab} data-on={!S.open || undefined}>
        <KeyCap label="Q" size={44} />
        <span>{openMode === 'hold' ? '누르고 있는 동안 지원 요청' : '눌러서 지원 요청 열기'}</span>
      </div>

      {/* 커맨드 목록 */}
      <div className={s.panel} data-hide={(mismatch === 'hide' && juice) || undefined} aria-hidden={!S.open}>
        <div className={s.head}>
          <b>지원 요청</b>
          <span className={s.count} data-part="count" data-narrow={filtering || undefined}>
            {juice ? (
              <>
                남은 후보 <em>{candCount}</em> / {N}
              </>
            ) : (
              <>커맨드 {N}개</>
            )}
          </span>
        </div>
        <div className={s.list}>
          {COMMANDS.map((c, i) => {
            const cool = !M.ready(i, S.t)
            const out = filtering && !cand[i]
            const isCand = filtering && cand[i] // 아무것도 넣기 전에는 모든 줄이 후보 — 강조하지 않는다
            const pend = juice && M.pending === i
            const shadow = SHADOW[i] && shadowed
            let title: string
            let sub: string
            let warn = false
            if (cool) {
              title = '재사용 대기'
              sub = ''
            } else if (pend) {
              title = '완성 · 기다리는 중'
              sub = '이어 넣으면 긴 쪽'
            } else if (PREFIX[i]) {
              title = '접두사 커맨드'
              sub = juice && prefixWaitMs > 0 ? `완성 후 ${waitText} 대기` : '완성 즉시 발동'
            } else if (shadow) {
              title = '가려짐'
              sub = '짧은 쪽이 먼저 발동'
              warn = true
            } else {
              title = `재사용 ${c.cooldown}초`
              sub = ''
            }
            return (
              <div
                key={c.id}
                ref={el => {
                  rowRefs.current[i] = el
                }}
                className={s.row}
                data-out={out || undefined}
                data-cool={cool || undefined}
                data-cand={isCand || undefined}
                data-pending={pend || undefined}
                style={{ order: mismatch === 'hide' && out ? 100 + i : i }}
              >
                <svg className={s.icon} viewBox="-24 -24 48 48" aria-hidden>
                  <CmdIcon id={c.id} />
                </svg>
                <div className={s.name}>
                  <b>{c.name}</b>
                  <small>{c.desc}</small>
                </div>
                <div className={s.arrows} data-part={i === focusRow ? 'row' : undefined} aria-label={c.seq.join(' ')}>
                  {c.seq.map((d, k) => (
                    <span key={k} className={s.arrow} data-lit={(isCand && k < lit) || undefined} data-next={(isCand && !pend && k === lit) || undefined}>
                      <ArrowGlyph d={d} />
                    </span>
                  ))}
                </div>
                <div className={s.status} data-part={i === SCOUT ? 'prefix' : undefined} data-warn={warn || undefined}>
                  <b>{title}</b>
                  {sub && <small>{sub}</small>}
                  <span
                    className={s.cd}
                    ref={el => {
                      cdRefs.current[i] = el
                    }}
                  />
                  <i
                    className={s.gauge}
                    ref={el => {
                      gaugeRefs.current[i] = el
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className={s.access}>
          <span>{openMode === 'hold' ? 'Q 누르고 있기' : 'Q 눌러 켜기 · 끄기'}</span>
          <span>{stepTimeoutMs > 0 ? `입력 사이 ${+(stepTimeoutMs / 1000).toFixed(2)}초` : '제한 시간 없음'}</span>
          <span>{errorMode === 'retry' ? '틀린 칸만 다시' : '틀리면 처음부터'}</span>
        </div>
      </div>

      {/* 넣은 방향 + 제한 시간 */}
      <div ref={stripRef} className={s.strip} data-part="buffer" style={{ left: CX }}>
        <div className={s.slots}>
          {juice
            ? Array.from({ length: slots }, (_, k) => {
                const d = M.buffer[k]
                const bad = wrongOn && S.wrong!.slot === k && !d
                return (
                  <span key={k} className={s.slot} data-lit={d ? true : undefined} data-wrong={bad || undefined} data-next={(!d && k === M.buffer.length && !bad) || undefined}>
                    {d ? <ArrowGlyph d={d} /> : bad ? <ArrowGlyph d={S.wrong!.dir} cross /> : null}
                  </span>
                )
              })
            : (
              <span className={s.raw}>
                {S.raw.length ? S.raw.slice(-14).map((_, k) => <i key={k} />) : <small>입력 대기</small>}
                {S.raw.length > 14 && <small>+{S.raw.length - 14}</small>}
              </span>
            )}
        </div>
        <div ref={timerRef} className={s.timer} data-part="timer" data-off={(!juice || stepTimeoutMs === 0) || undefined}>
          <span className={s.track}>
            <i ref={timerFillRef} />
          </span>
          <span ref={timerTextRef} className={s.timerText} />
        </div>
      </div>

      {/* 발동 */}
      <div ref={bannerRef} className={s.banner} data-on={S.bannerOn || undefined} style={{ left: CX }}>
        <svg viewBox="-24 -24 48 48" aria-hidden>
          <CmdIcon id={fired.id} />
        </svg>
        <small>발동</small>
        <b>{fired.name}</b>
      </div>
      <div className={s.note} data-tone={S.note?.tone} data-on={(S.note !== null && juice) || undefined} style={{ left: CX }} role="status">
        {S.note?.text ?? ''}
      </div>

      <div className={s.hint}>
        <KeyCap label="Q" size={40} />
        <span>{openMode === 'hold' ? '누르고 있기' : '눌러 켜기'}</span>
        <DPad size={40} />
        <span>방향키 · WASD</span>
        <TouchGlyph kind="swipe" size={40} />
        <span>누른 채 밀기</span>
        <KeyCap label="Esc" size={40} />
        <span>닫기</span>
      </div>
    </div>
  )
}

/** 화살표 — 위를 기준으로 그리고 돌린다 (글꼴의 화살표 글자는 기기마다 모양 · 굵기가 달라서) */
function ArrowGlyph({ d, cross }: { d: Dir; cross?: boolean }) {
  const deg = { U: 0, R: 90, D: 180, L: 270 }[d]
  return (
    <svg viewBox="-16 -16 32 32" aria-hidden>
      <path d="M0 -13 L12 0 H5 V13 H-5 V0 H-12 Z" transform={`rotate(${deg})`} />
      {cross && <path d="M-13 -13 L13 13 M13 -13 L-13 13" className={s.cross} />}
    </svg>
  )
}

/** 커맨드 아이콘 — 직접 그린 단순한 도형 */
function CmdIcon({ id }: { id: string }) {
  switch (id) {
    case 'scout':
      return <path d="M0 -8 L10 0 L0 8 L-10 0 Z M-18 -10 h8 M10 -10 h8 M-14 -10 V-4 M14 -10 V-4" />
    case 'wing':
      return <path d="M0 -16 L6 -10 L0 -4 L-6 -10 Z M-12 2 L-6 8 L-12 14 L-18 8 Z M12 2 L18 8 L12 14 L6 8 Z" />
    case 'supply':
      return <path d="M-14 -6 H14 V16 H-14 Z M-14 -6 L-8 -14 H8 L14 -6 M0 -6 V16 M-6 4 H6" />
    case 'coolant':
      return <path d="M-8 -16 H8 V16 H-8 Z M-4 -20 H4 M-8 -2 H8 M0 -10 V6" />
    case 'repair':
      return <path d="M-16 -10 H16 V14 H-16 Z M-6 -14 H6 V-10 M0 -4 V10 M-7 3 H7" />
    case 'shield':
      return <path d="M0 -18 L15 -11 V1 C15 10 8 15 0 18 C-8 15 -15 10 -15 1 V-11 Z" />
    case 'relay':
      return <path d="M0 -4 V18 M-8 18 H8 M-10 -14 A14 14 0 0 0 -10 6 M10 -14 A14 14 0 0 1 10 6 M-4 -9 A6 6 0 0 0 -4 1 M4 -9 A6 6 0 0 1 4 1" />
    default:
      return <circle r="10" />
  }
}
