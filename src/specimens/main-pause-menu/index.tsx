import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { ActionGlyph, DPad, KeyCap, StartButton, useLastInput, type Device } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { getPanel, siblingsOf, STATUS, type Item } from './data'
import {
  clickEmpty,
  createSim,
  hover,
  hoverDialog,
  input,
  pathOf,
  schedule,
  tick,
  top,
  visible,
  type BusyMode,
  type Config,
  type Dev,
  type Input,
  type Sim,
  type Vis,
  log,
} from './menu'
import { Emblem, GameWorld, TitleWorld } from './World'
import s from './style.module.css'

export { meta } from './meta'

const DEVICE_LABEL: Record<Device, string> = { keyboard: '키보드', gamepad: '게임패드', mouse: '마우스', touch: '터치' }
const BUSY_LABEL: Record<BusyMode, string> = { buffer: '전환 중 입력: 버퍼', drop: '전환 중 입력: 버림', leak: '전환 중 입력: 이전 패널로 샘' }

type Step = () => Input | null | { input?: Input; gap: number }

/** 메뉴가 닫혀 있을 때 유도선 자리 (논리 좌표) — 메뉴를 열면 포커스가 놓이는 '이어하기' 오른쪽 → 미리보기 카드 */
const GUIDE_REST = 'M700 356 H744 L816 268 H862'

/** 마지막 실제 입력 뒤 자동 데모를 쉬는 시간 (실제 시간 ms) */
const MANUAL_HOLD_MS = 8000

/** 자동 데모 대본 — 하위 메뉴 진입 → 깊이 3 → 뒤로 → 단축키 → 빈 곳 클릭 → 타이틀 → 이어하기 → 닫기 → 열기 */
const SCRIPT: (Input | 'pad' | 'kb' | 'click')[] = [
  'confirm', 'down', 'confirm', 'down', 'confirm', 'back', 'pad', 'pageNext', 'pageNext', 'back', 'click', 'down',
  'confirm', 'right', 'confirm', 'kb', 'down', 'down', 'up', 'up', 'confirm', 'back', 'pause', 'down',
]

/**
 * 메인 · 일시정지 메뉴 — 메뉴 스택(push/pop/페이지 전환) + 포커스 하나 + 뒤로가기 일관성 + 입력 버퍼.
 * 키보드·게임패드 입력은 무대(이 요소)에 포커스가 있을 때만 받는다.
 */
export default function MainPauseMenu(p: SpecimenProps) {
  const juice = p.juice
  const styleParam = str(p.params, 'transitionStyle', 'slide') as Config['style']
  const rm = prefersReducedMotion()
  const cfg: Config = {
    juice,
    style: rm && styleParam === 'slide' ? 'fade' : styleParam,
    ms: num(p.params, 'transitionMs', 220),
    remember: bool(p.params, 'rememberFocus', true),
    busy: str(p.params, 'busyInput', 'buffer') as BusyMode,
  }
  const skew = juice ? num(p.params, 'skewDeg', 12) : 0
  const focusStyle = juice ? str(p.params, 'focusStyle', 'guide-line') : 'bad'
  const theme = juice ? str(p.params, 'panelTheme', 'dark') : 'bad'
  const accent = theme === 'mono' ? '#ffffff' : str(p.params, 'accentColor', '#c6ff3d')
  const devParam = str(p.params, 'inputDevice', 'auto') as Device | 'auto'

  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = createSim()
  const sim = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(-1)
  const sync = () => {
    if (sim.version !== shown.current) {
      shown.current = sim.version
      setVersion(sim.version)
    }
  }

  /* ───── 입력 장치 (마지막 입력 장치를 따른다) ─────
   * 무대에서 처리한 키는 갤러리 단축키로 번지지 않게 전파를 막는다(onKeyDown). 그러면 window 에서 듣는
   * useLastInput 이 그 키를 못 보므로, 무대 안 입력의 장치는 여기서 직접 추적한다(localDevice).
   * 무대 밖 입력(window 가 본 입력)이 들어오면 localDevice 를 풀고 useLastInput 을 따른다. */
  const last = useLastInput(p.thumbnail ? 'gamepad' : devParam)
  const [demoDevice, setDemoDevice] = useState<Device | null>(null)
  const [localDevice, setLocalDevice] = useState<Device | null>(null)
  const localRef = useRef<Device | null>(null)
  const firstSeq = useRef(true)
  useEffect(() => {
    if (firstSeq.current) {
      firstSeq.current = false
      return
    }
    setDemoDevice(null)
    localRef.current = null
    setLocalDevice(null)
  }, [last.seq])
  const device: Device = devParam !== 'auto' || p.thumbnail ? last.device : (demoDevice ?? localDevice ?? last.device)

  /* 직접 조작이 들어오면 자동 데모를 잠시 멈춘다 — 실제 입력과 데모 입력이 섞이면 시연이 망가진다 */
  const realAt = useRef(-1e9)
  const manualRef = useRef(false)
  const [manual, setManual] = useState(false)
  /** 실제 입력 기록 (게임 루프·타이머 안에서도 불리므로 ref 만 읽는다) */
  const real = (dev?: Device) => {
    if (p.thumbnail) return
    realAt.current = performance.now()
    if (!manualRef.current) {
      manualRef.current = true
      setManual(true)
    }
    setDemoDevice(null)
    if (dev && localRef.current !== dev) {
      localRef.current = dev
      setLocalDevice(dev)
    }
  }

  const feed = (inp: Input, dev: Dev) => {
    input(sim, cfgRef.current, inp, dev)
    sync()
  }
  const evDev = (): Dev => (device === 'gamepad' ? 'gamepad' : 'keyboard')

  /** 단계 실행기 — null 은 건너뛰고, 입력을 넣은 단계 뒤에는 gap 만큼 기다린다 */
  const run = (steps: Step[], gap: number) => {
    let i = 0
    const next = () => {
      while (i < steps.length) {
        const r = steps[i++]()
        if (r === null) continue
        if (typeof r === 'string') {
          feed(r, evDev())
          schedule(sim, gap, next)
        } else {
          if (r.input) feed(r.input, evDev())
          schedule(sim, r.gap, next)
        }
        return
      }
    }
    next()
  }
  const stepGap = () => Math.max(0.12, (cfgRef.current.ms * 1.5) / 1000 + 0.06)
  /** 지금 패널에서 id 항목으로 한 칸씩 (가까운 방향) */
  const toward = (pred: (it: Item) => boolean): Step => () => {
    if (sim.screen !== 'menu' || sim.dialog) return null
    const lv = top(sim)
    const items = getPanel(lv.panel, sim.values).items
    if (pred(items[lv.focus])) return null
    const n = items.length
    for (let d = 1; d < n; d++) {
      if (pred(items[(lv.focus + d) % n]) && !items[(lv.focus + d) % n].disabled) return 'down'
      if (pred(items[(lv.focus - d + n) % n]) && !items[(lv.focus - d + n) % n].disabled) return 'up'
    }
    return null
  }
  const nav = (pred: (it: Item) => boolean) => Array.from({ length: 5 }, () => toward(pred))
  const ensureOpen: Step = () => (sim.screen === 'game' ? 'pause' : null)
  const backTo = (depth: number): Step[] => Array.from({ length: 4 }, () => () => (sim.screen === 'menu' && !sim.dialog && sim.stack.length > depth ? 'back' : null))
  const hasTo = (it: Item) => !!it.to && !it.disabled

  /* ───── 이벤트 ───── */
  const handle = (id: string) => {
    const gap = stepGap()
    if (id === 'move_focus') run([ensureOpen, () => (sim.dialog ? 'right' : 'down')], gap)
    else if (id === 'confirm') run([ensureOpen, ...nav(it => hasTo(it) || it.action === 'pick'), () => 'confirm'], gap)
    else if (id === 'page_next')
      run([ensureOpen, () => (sim.dialog ? 'back' : null), ...nav(hasTo), () => (sim.stack.length < 2 ? 'confirm' : null), () => 'pageNext'], gap)
    else if (id === 'mash_back') {
      const deeper: Step = () => (sim.screen === 'menu' && !sim.dialog && sim.stack.length < 3 ? 'confirm' : null)
      run(
        [
          ensureOpen,
          () => (sim.dialog ? 'back' : null),
          ...nav(hasTo),
          deeper,
          ...nav(hasTo),
          deeper,
          () => ({ gap: 0.45 }),
          // 사람이 연타하듯 0.07초 간격으로 4번 — 전환(0.15초)보다 빠르다
          () => ({ input: 'back', gap: 0.07 }),
          () => ({ input: 'back', gap: 0.07 }),
          () => ({ input: 'back', gap: 0.07 }),
          () => ({ input: 'back', gap: 0.07 }),
        ],
        gap,
      )
    } else if (id === 'click_empty') {
      run(
        [
          ensureOpen,
          () => {
            clickEmpty(sim, cfgRef.current, 700, sim.ctx === 'title' ? 330 : 900)
            sync()
            return { gap: 0.45 }
          },
          () => 'down',
        ],
        gap,
      )
    } else if (id === 'to_title') {
      if (sim.dialog) run([() => 'right', () => 'confirm'], 0.2)
      else if (sim.ctx === 'title' && sim.screen === 'menu') run([...backTo(1), ...nav(it => it.action === 'continue'), () => 'confirm'], gap)
      else
        run(
          [
            ensureOpen,
            ...backTo(1),
            ...nav(it => it.action === 'toTitle'),
            () => ({ input: 'confirm', gap: 0.1 }),
            // 확인 버튼을 습관적으로 한 번 더 — 좋은 예는 입력 잠금 + 기본 포커스 '취소' 로 막힌다
            () => 'confirm',
          ],
          gap,
        )
    }
  }
  useTrigger(p.trigger, handle)

  const step = useRef(0)
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    1.15,
    () => {
      // 직접 조작 중이면(마지막 실제 입력 뒤 8초) 데모는 쉰다
      if (performance.now() - realAt.current < MANUAL_HOLD_MS) return
      if (manualRef.current) {
        manualRef.current = false
        setManual(false)
      }
      const a = SCRIPT[step.current % SCRIPT.length]
      step.current++
      if (a === 'pad') setDemoDevice('gamepad')
      else if (a === 'kb') setDemoDevice('keyboard')
      else if (a === 'click') {
        clickEmpty(sim, cfgRef.current, 700, sim.ctx === 'title' ? 330 : 900)
        sync()
      } else feed(a, demoDevice === 'gamepad' ? 'gamepad' : 'keyboard')
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임: 시간 · 버퍼 · 게임패드 · 유도선 · 게임 장면 ───── */
  const rootRef = useRef<HTMLDivElement>(null)
  const guideRef = useRef<SVGPathElement>(null)
  const guideDotRef = useRef<SVGCircleElement>(null)
  const guideEndRef = useRef<SVGPathElement>(null)
  const droneA = useRef<SVGGElement>(null)
  const droneB = useRef<SVGGElement>(null)
  const player = useRef<SVGGElement>(null)
  const game = useRef({ t: 0 })
  const pad = useRef({ prev: new Set<number>(), dirAt: 0, dir: null as Input | null })

  const paintGuide = () => {
    const root = rootRef.current
    const path = guideRef.current
    if (!root || !path) return
    if (sim.screen === 'game' && sim.t >= sim.closingUntil) {
      // 메뉴가 닫혀 있으면 '메뉴를 열면 선이 나타날 자리'(루트 패널 첫 항목 → 미리보기)에 고정해 둔다.
      // 마지막 열림 좌표를 유지하면 해설 번호가 게임 화면의 엉뚱한 곳(행성 위)을 가리킨다
      path.setAttribute('d', GUIDE_REST)
      return
    }
    const rr = root.getBoundingClientRect()
    const k = rr.width / 1920 || 1
    const a = root.querySelector('[data-gl="from"]')
    const b = root.querySelector('[data-gl="to"]')
    if (!a) {
      path.setAttribute('d', 'M0 0')
      return
    }
    const ra = a.getBoundingClientRect()
    const sx = (ra.right - rr.left) / k + 10
    const sy = (ra.top + ra.bottom) / 2 / k - rr.top / k
    if (!b) {
      // 다음 볼 곳이 없을 때(효과 끄기 등): 해설 번호가 포커스 항목 옆을 가리키도록 짧은 선만
      path.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} H${(sx + 60).toFixed(1)}`)
      return
    }
    const rb = b.getBoundingClientRect()
    const ex = (rb.left - rr.left) / k - 16
    const ey = (rb.top + rb.bottom) / 2 / k - rr.top / k
    const kx = Math.min(sx + 44, ex - 30)
    path.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} H${kx.toFixed(1)} L${(ex - 46).toFixed(1)} ${ey.toFixed(1)} H${ex.toFixed(1)}`)
    guideDotRef.current?.setAttribute('cx', sx.toFixed(1))
    guideDotRef.current?.setAttribute('cy', sy.toFixed(1))
    guideEndRef.current?.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`)
  }

  const paintWorld = () => {
    const t = game.current.t
    droneA.current?.setAttribute('transform', `translate(${Math.sin(t * 0.7) * 40} ${Math.sin(t * 2.1) * 14})`)
    droneB.current?.setAttribute('transform', `translate(${Math.cos(t * 0.55) * 52} ${Math.sin(t * 1.7 + 1) * 12})`)
    player.current?.setAttribute('transform', `translate(${Math.sin(t * 0.5) * 30} 0)`)
  }

  const pollPad = () => {
    const root = rootRef.current
    if (!root || p.thumbnail || typeof navigator.getGamepads !== 'function') return
    if (!root.contains(document.activeElement)) return
    const gp = [...navigator.getGamepads()].find(g => g)
    if (!gp) return
    const now = performance.now()
    const st = pad.current
    const pressed = new Set<number>()
    gp.buttons.forEach((b, i) => b.pressed && pressed.add(i))
    const padFeed = (inp: Input) => {
      real('gamepad')
      feed(inp, 'gamepad')
    }
    const map: Record<number, Input> = { 0: 'confirm', 1: 'back', 4: 'pagePrev', 5: 'pageNext', 9: 'pause' }
    for (const [i, inp] of Object.entries(map)) if (pressed.has(+i) && !st.prev.has(+i)) padFeed(inp)
    // 방향: 십자키 또는 왼쪽 스틱 — 누르는 순간 1번, 0.4초 뒤부터 0.12초마다 반복
    const ax = gp.axes[0] ?? 0
    const ay = gp.axes[1] ?? 0
    const dir: Input | null = pressed.has(12) || ay < -0.5 ? 'up' : pressed.has(13) || ay > 0.5 ? 'down' : pressed.has(14) || ax < -0.5 ? 'left' : pressed.has(15) || ax > 0.5 ? 'right' : null
    if (dir !== st.dir) {
      st.dir = dir
      st.dirAt = now + 400
      if (dir) padFeed(dir)
    } else if (dir && now >= st.dirAt) {
      st.dirAt = now + 120
      padFeed(dir)
    }
    st.prev = pressed
  }

  const stepFrame = (dt: number) => {
    tick(sim, cfgRef.current, dt)
    // 메뉴가 열리면 게임 시간이 멈춘다 (메뉴 연출은 계속 — Unity 의 unscaledDeltaTime)
    if (sim.screen === 'game' && sim.t >= sim.closingUntil) {
      game.current.t += dt
      paintWorld()
    }
    pollPad()
    sync()
    paintGuide()
  }
  // 논리 시계는 실제 경과 시간 × 배속. 그리기는 useGameLoop(매 프레임)에서, 로직은 프레임이 드문 환경
  // (헤드리스 캡처 등)에서도 진행되도록 짧은 타이머로도 함께 진행한다 — 어느 쪽이 불러도 경과 시간만큼만 간다
  const tsRef = useRef(p.timeScale)
  tsRef.current = p.timeScale
  const clock = useRef(0)
  const advance = () => {
    const now = performance.now()
    const dt = clock.current ? Math.min(0.25, Math.max(0, (now - clock.current) / 1000)) * tsRef.current : 0
    clock.current = now
    stepFrame(dt)
  }
  useGameLoop(p.playing, p.timeScale, advance)
  useEffect(() => {
    clock.current = 0
    if (!p.playing) return
    const id = window.setInterval(advance, 50)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.playing])
  useLayoutEffect(() => {
    paintWorld()
    paintGuide()
  })

  /* ───── 키보드 · 포인터 (무대에 포커스가 있을 때만) ───── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key
    const inp: Input | null =
      k === 'ArrowUp'
        ? 'up'
        : k === 'ArrowDown'
          ? 'down'
          : k === 'ArrowLeft'
            ? 'left'
            : k === 'ArrowRight'
              ? 'right'
              : k === 'Enter'
                ? 'confirm'
                : k === 'Escape' || k === 'Backspace'
                  ? 'back'
                  : k === 'q' || k === 'Q'
                    ? 'pagePrev'
                    : k === 'e' || k === 'E'
                      ? 'pageNext'
                      : null
    if (!inp) return
    // 처리한 키는 갤러리 단축키(←/→ 해설 넘김, Esc 발표 모드 해제)로 번지지 않게 먹는다 (core/stageKeys)
    real('keyboard')
    // 길게 눌러 생기는 반복 입력은 방향키만 — 확정·뒤로는 한 번 누름에 한 번
    if (!e.repeat || inp === 'up' || inp === 'down') feed(inp, 'keyboard')
    return true
  })
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const rr = rootRef.current!.getBoundingClientRect()
    const k = rr.width / 1920 || 1
    return [(e.clientX - rr.left) / k, (e.clientY - rr.top) / k]
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    real(e.pointerType === 'touch' ? 'touch' : 'mouse')
    if (e.button !== 0) return
    if ((e.target as Element).closest('[data-item],[data-dlg]')) return
    const [x, y] = toLogical(e)
    clickEmpty(sim, cfgRef.current, x, y)
    sync()
  }
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    e.preventDefault()
    real('mouse')
    feed('back', 'mouse')
  }
  /** 항목 클릭 — 전환 중이면 무시한다. hover 는 전환 중 무시되므로, 확정만 버퍼에 넣으면
   *  연출 뒤 '누른 항목'이 아니라 '그전 포커스 항목'이 실행된다 */
  const clickItem = (i: number) => {
    real()
    if (sim.screen !== 'menu' || sim.dialog) return
    if (sim.t < sim.busyUntil) {
      log(sim, '클릭', '전환 중 클릭 — 무시 (다른 항목이 실행되지 않게)', 'drop')
      sync()
      return
    }
    const it = getPanel(top(sim).panel, sim.values).items[i]
    if (!it || it.disabled) return
    hover(sim, cfgRef.current, i)
    feed('confirm', 'mouse')
  }

  /* ───── 그리기 ───── */
  const menuOn = sim.screen === 'menu'
  const closing = !menuOn && sim.t < sim.closingUntil
  const vis = visible(sim)
  const depth = sim.stack.length
  const lv = top(sim)
  const activePanel = getPanel(lv.panel, sim.values)
  const focusedItem = activePanel.items[lv.focus]
  const ts = Math.max(0.05, p.timeScale)
  const anim = sim.anim

  const rootStyle = {
    '--ts': ts,
    '--accent': accent,
    '--skew': skew,
    '--dur': `${anim.dur / ts}ms`,
    '--ease': anim.kind === 'pop' || anim.kind === 'close' ? 'cubic-bezier(.32,0,.67,0)' : 'cubic-bezier(.33,1,.68,1)',
  } as CSSProperties

  // 나쁜 예: 맨 위 패널 하나만 (어디서 왔는지 공간 단서 없음)
  const shownVis: (Vis & { ghost?: string })[] = juice
    ? [...sim.ghosts.map(g => ({ ...g, ghost: g.mode })), ...vis]
    : vis.filter(v => v.role === 'active' || (depth === 1 && v.index === 0)).map(v => ({ ...v, slot: 'L' as const }))

  const tabsShown = juice && vis.some(v => (v.role === 'active' || v.role === 'preview') && v.panel && tabsFor(sim, v) !== null)

  const hint = hintsFor(sim, device)

  return (
    <div
      ref={rootRef}
      className={s.root}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="일시정지 메뉴 (클릭 후 방향키 · Enter · Esc · Q/E, 게임패드도 가능)"
      data-juice={juice || undefined}
      data-style={cfg.style}
      data-theme={theme}
      data-focus-style={focusStyle}
      data-paused={!p.playing || undefined}
      data-screen={sim.screen}
      data-ctx={sim.ctx}
      data-device={device}
      style={rootStyle}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onFocus={() => real()}
    >
      {/* 1. 게임 화면 (메뉴가 열리면 멈추고 흐려진다) */}
      <div className={s.worldWrap} data-frozen={menuOn || closing || undefined}>
        {sim.ctx === 'title' ? <TitleWorld /> : <GameWorld droneA={droneA} droneB={droneB} player={player} />}
        {sim.ctx === 'pause' && <GameHud />}
      </div>

      {/* 2. 감광막 — 입력한 프레임에 바로 */}
      {sim.ctx === 'pause' && <div key={`dim-${sim.openSeq}`} className={s.dim} data-on={menuOn || undefined} data-closing={closing || undefined} />}

      {/* 3. 메뉴 */}
      <div className={s.menu} data-open={menuOn || undefined} data-closing={closing || undefined} aria-hidden={!menuOn}>
        {sim.ctx === 'title' && (
          <div key={`logo-${sim.screenSeq}`} className={s.logo}>
            <p>변방 행성 지표 탐사 기록</p>
            <h1>외곽 탐사대</h1>
          </div>
        )}
        <Breadcrumb sim={sim} juice={juice} />
        {juice && (
          <div key={`em-${sim.openSeq}-${sim.screenSeq}`} className={s.emblem} aria-hidden>
            <Emblem />
          </div>
        )}
        <div className={s.panels}>
          {shownVis.map(v => (
            <PanelView
              key={(v.ghost ? 'g-' : '') + v.key}
              v={v}
              sim={sim}
              juice={juice}
              enter={v.ghost ? undefined : sim.enter[v.key]}
              leave={v.ghost}
              tabsPart={!v.ghost && (v.role === 'active' || (v.role === 'preview' && depth === 1))}
              onHover={i => {
                // 포커스를 바꾸는 입력이므로 직접 조작으로 친다 (데모가 멈춤)
                real()
                hover(sim, cfgRef.current, i)
                sync()
              }}
              onClick={clickItem}
            />
          ))}
          {!tabsShown && <div className={s.tabsGhost} data-part="page-tabs" aria-hidden />}
        </div>
        {juice && <InfoColumn sim={sim} item={depth > 1 ? focusedItem : null} panelTitle={activePanel.title} />}
        <svg className={s.guide} viewBox="0 0 1920 1080" aria-hidden data-hide={!juice || focusStyle !== 'guide-line' || !!sim.dialog || undefined}>
          <path ref={guideRef} className={s.guidePath} data-part="guide-line" d="M0 0" />
          <circle ref={guideDotRef} className={s.guideDot} r="8" />
          <path ref={guideEndRef} className={s.guideEnd} d="M0 -11 L11 0 L0 11 L-11 0 Z" />
        </svg>
        {sim.dialog && (
          <div className={s.scrim}>
            <div className={s.dialog} role="dialog" aria-label="타이틀로 돌아가기 확인">
              <h3>타이틀로 돌아갈까요?</h3>
              <p>마지막 저장 이후의 진행(4분)은 사라집니다.</p>
              <div className={s.dlgBtns}>
                {(['취소', '타이틀로'] as const).map((label, i) => (
                  <div
                    key={label}
                    data-dlg
                    className={s.dlgBtn}
                    data-focus={sim.dialog!.focus === i || undefined}
                    data-danger={i === 1 || undefined}
                    onPointerEnter={() => {
                      real()
                      hoverDialog(sim, i as 0 | 1)
                      sync()
                    }}
                    onClick={() => {
                      hoverDialog(sim, i as 0 | 1)
                      feed('confirm', 'mouse')
                    }}
                  >
                    {i === 1 && <WarnIcon />}
                    {label}
                  </div>
                ))}
              </div>
              {juice && <p className={s.dlgNote}>기본 선택은 &lsquo;취소&rsquo; · 뜬 직후 0.3초는 확정 입력 잠금</p>}
            </div>
          </div>
        )}
      </div>

      {/* 4. 디버그 오버레이 (교육용) */}
      <Debug sim={sim} device={device} busy={cfg.busy} juice={juice} paused={p.autoplay && manual} />

      {/* 5. 하단 입력 안내 */}
      <div className={s.hintBar}>
        <div className={s.hints} data-part="hint-bar">
          {juice ? (
            hint.map(h => (
              <span key={h.id} className={s.hint}>
                <span key={device} className={s.glyphSlot} style={{ minWidth: h.w }}>
                  {h.icon}
                </span>
                {h.text}
              </span>
            ))
          ) : (
            <span className={s.badHint}>Enter: 확인&nbsp;&nbsp;&nbsp;Esc: 뒤로</span>
          )}
        </div>
        {sim.ctx === 'pause' && (
          <span className={s.timeState} data-run={!menuOn || undefined}>
            <i aria-hidden />
            {menuOn ? '게임 시간 정지' : '게임 진행 중'}
          </span>
        )}
      </div>

      {/* 6. 화면 전환 (타이틀 ↔ 게임) */}
      {juice && anim.kind === 'screen' && anim.dur > 0 && sim.t < sim.busyUntil + 0.05 && <div key={`wipe-${sim.screenSeq}`} className={s.wipe} />}
      {sim.ripple && <span key={`rp-${sim.ripple.seq}`} className={s.ripple} style={{ left: sim.ripple.x, top: sim.ripple.y }} aria-hidden />}
    </div>
  )
}

/* ───────── 패널 ───────── */

function tabsFor(sim: Sim, v: Vis): { items: Item[]; current: number } | null {
  if (!v.panel) return null
  const parentIndex = v.role === 'preview' ? 0 : v.index - 1
  if (parentIndex < 0) return null
  const parentLv = sim.stack[parentIndex]
  if (!parentLv) return null
  const parent = getPanel(parentLv.panel, sim.values)
  const sibs = siblingsOf(parent)
  if (sibs.length < 2) return null
  const current = sibs.findIndex(x => x.item.to === v.panel)
  if (current < 0) return null
  return { items: sibs.map(x => x.item), current }
}

function PanelView({
  v,
  sim,
  juice,
  enter,
  leave,
  tabsPart,
  onHover,
  onClick,
}: {
  v: Vis
  sim: Sim
  juice: boolean
  enter?: string
  leave?: string
  tabsPart: boolean
  onHover: (i: number) => void
  onClick: (i: number) => void
}) {
  const live = !leave
  const active = live && v.role === 'active'
  const depth = sim.stack.length

  if (v.card) {
    const it = v.card
    return (
      <div className={s.slot} data-slot={v.slot} data-role={v.role} data-enter={enter} data-leave={leave}>
        <div className={s.panel} data-kind="card">
          <div className={s.panelBg} />
          <div className={s.body}>
          <div className={s.card} data-gl={live && juice && depth === 1 ? 'to' : undefined}>
            <span className={s.cardKicker}>{it.disabled ? '사용할 수 없음' : it.action === 'toTitle' ? '확인이 필요한 항목' : '바로 실행'}</span>
            <b>{it.label}</b>
            <p>{it.desc}</p>
          </div>
          </div>
        </div>
      </div>
    )
  }

  const panel = getPanel(v.panel!, sim.values)
  const kind = panel.root ? (panel.id === 'title' ? 'title' : 'root') : 'sub'
  const tabs = juice ? tabsFor(sim, v) : null
  const pickId = sim.pick.id
  return (
    <div className={s.slot} data-slot={v.slot} data-role={v.role} data-enter={enter} data-leave={leave}>
      <div className={s.panel} data-kind={kind}>
        <div className={s.panelBg} />
        <div className={s.body}>
        <div className={s.head} data-gl={live && juice && v.role === 'preview' ? 'to' : undefined}>
          {tabs ? (
            <div className={s.tabs} data-part={tabsPart ? 'page-tabs' : undefined}>
              <span className={s.tabKey}>
                <TabGlyph side="L" />
              </span>
              {tabs.items.map((t, i) => (
                <span key={t.id} className={s.tab} data-on={i === tabs.current || undefined}>
                  {t.label}
                </span>
              ))}
              <span className={s.tabKey}>
                <TabGlyph side="R" />
              </span>
            </div>
          ) : (
            <span className={s.headTitle} data-part={!juice && active ? 'breadcrumb' : undefined}>
              {panel.title}
              {kind === 'root' && juice && <small>시간 정지</small>}
            </span>
          )}
          {v.role === 'preview' && <span className={s.previewTag}>미리보기</span>}
        </div>
        <div className={s.items} style={{ '--focus': v.focus } as CSSProperties}>
          <div className={s.bar} data-part={active ? 'focus-indicator' : undefined} />
          {panel.items.map((it, i) => {
            const focus = i === v.focus && (v.role === 'active' || v.role === 'parent') && !(active && sim.focusLost)
            return (
              <div
                key={it.id}
                className={s.item}
                style={{ '--i': i } as CSSProperties}
                data-item={active || undefined}
                data-focus={focus || undefined}
                data-disabled={it.disabled || undefined}
                data-gl={active && focus ? 'from' : undefined}
                onPointerEnter={active ? () => onHover(i) : undefined}
                onClick={active ? () => onClick(i) : undefined}
              >
                <span className={s.label}>
                  {it.disabled && <LockIcon />}
                  {it.label}
                </span>
                {it.value && (
                  <span className={s.value} data-using={it.value === '사용 중' || undefined}>
                    {it.value}
                  </span>
                )}
                {it.to && kind !== 'sub' && juice && <span className={s.chev} aria-hidden />}
                {active && pickId === it.id && sim.pick.seq > 0 && <span key={sim.pick.seq} className={s.pickFlash} aria-hidden />}
              </div>
            )
          })}
        </div>
        </div>
        <span className={s.spineLabel} aria-hidden>
          {panel.title}
        </span>
      </div>
    </div>
  )
}

function TabGlyph({ side }: { side: 'L' | 'R' }) {
  return (
    <span className={s.tabGlyph} data-side={side}>
      <span className={s.forPad}>
        <ShoulderMini side={side} />
      </span>
      <span className={s.forKey}>
        <KeyCap label={side === 'L' ? 'Q' : 'E'} size={36} />
      </span>
    </span>
  )
}

function ShoulderMini({ side }: { side: 'L' | 'R' }) {
  return <ActionGlyph action={side === 'L' ? 'tabPrev' : 'tabNext'} device="gamepad" size={34} />
}

/* ───────── 위치 표시 ───────── */

function Breadcrumb({ sim, juice }: { sim: Sim; juice: boolean }) {
  const path = pathOf(sim)
  if (!juice) return null
  return (
    <div className={s.crumbs} data-part="breadcrumb">
      <div className={s.depth} aria-label={`스택 깊이 ${path.length}`}>
        {Array.from({ length: 3 }, (_, i) => (
          <i key={i} data-on={i < path.length || undefined} />
        ))}
      </div>
      {path.map((t, i) => (
        <span key={`${i}-${t}`} className={s.crumb} data-last={i === path.length - 1 || undefined}>
          {i > 0 && <span className={s.sep} aria-hidden />}
          {t}
        </span>
      ))}
      {sim.dialog && (
        <span className={s.crumb} data-last>
          <span className={s.sep} aria-hidden />
          확인 창
        </span>
      )}
    </div>
  )
}

/* ───────── 오른쪽 정보 ───────── */

function InfoColumn({ sim, item, panelTitle }: { sim: Sim; item: Item | null; panelTitle: string }) {
  if (!item) {
    return (
      <div className={s.info}>
        <div className={s.infoCard} data-kind="status">
          <span className={s.infoKicker}>{sim.ctx === 'title' ? '저장 기록 1' : '탐사 현황'}</span>
          {STATUS.map(([k, v]) => (
            <div key={k} className={s.statusRow}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className={s.info}>
      <div key={item.id} className={s.infoCard} data-kind="item">
        <span className={s.infoKicker}>{panelTitle}</span>
        <b className={s.infoTitle} data-gl="to">
          {item.label}
        </b>
        {item.value && <span className={s.infoValue}>{item.value}</span>}
        <p>{item.desc}</p>
        <span className={s.infoAct}>{item.disabled ? '잠김 — 포커스 이동에서 건너뜀' : item.to ? '확인: 한 칸 더 들어가기' : item.action === 'pick' ? '확인: 이것으로 바꾸기' : ''}</span>
      </div>
    </div>
  )
}

/* ───────── 디버그 ───────── */

function Debug({ sim, device, busy, juice, paused }: { sim: Sim; device: Device; busy: BusyMode; juice: boolean; paused: boolean }) {
  const depth = sim.screen === 'menu' ? sim.stack.length : 0
  const lv = top(sim)
  const panel = getPanel(lv.panel, sim.values)
  const focus =
    sim.screen !== 'menu'
      ? '— (메뉴 닫힘)'
      : sim.dialog
        ? `확인 창 · ${sim.dialog.focus === 0 ? '취소' : '타이틀로'}`
        : sim.focusLost
          ? '없음 (null)'
          : `${panel.title} › ${panel.items[lv.focus]?.label ?? ''}`
  const busyNow = sim.t < sim.busyUntil
  return (
    // 해설 3번 핀은 상자 전체에 붙인다 — 줄에 붙이면 핀이 바로 위 줄(머리말·큐 칩)을 가린다
    <div className={s.debug} aria-live="polite" data-part="input-buffer">
      {paused && <div className={s.dbgPaused}>자동 데모 멈춤 (직접 조작 중)</div>}
      <div className={s.dbgHead}>
        상태 디버그<small>{juice ? BUSY_LABEL[busy] : '효과 끔: 잠금·버퍼 없음'}</small>
      </div>
      <div className={s.dbgRow}>
        <span>입력 버퍼</span>
        <span className={s.queue}>
          {busyNow && <em className={s.busy}>전환 중</em>}
          {sim.queue.length === 0 ? <i className={s.qEmpty}>비어 있음</i> : sim.queue.map((q, i) => <kbd key={i}>{q.input === 'back' ? '뒤로' : q.input === 'confirm' ? '확인' : q.input === 'pageNext' ? '다음' : q.input === 'pagePrev' ? '이전' : q.input === 'up' ? '↑' : q.input === 'down' ? '↓' : q.input}</kbd>)}
        </span>
      </div>
      <div className={s.dbgRow}>
        <span>스택 깊이</span>
        <span className={s.dbgVal}>
          <span className={s.dbgPips}>
            {Array.from({ length: 3 }, (_, i) => (
              <i key={i} data-on={i < depth || undefined} />
            ))}
          </span>
          <b>
            {depth}
            {sim.dialog ? ' + 확인 창' : ''}
          </b>
        </span>
      </div>
      <div className={s.dbgRow}>
        <span>포커스</span>
        <b data-bad={sim.focusLost || undefined}>{focus}</b>
      </div>
      <div className={s.dbgRow}>
        <span>입력 장치</span>
        <b>{DEVICE_LABEL[device]}</b>
      </div>
      <ul className={s.log}>
        {sim.log.slice(0, 3).map(l => (
          <li key={l.id} data-tone={l.tone}>
            <i aria-hidden>{l.tone === 'ok' ? '✓' : l.tone === 'buf' ? '⏸' : l.tone === 'drop' ? '–' : '!'}</i>
            <kbd>{l.key}</kbd>
            <span>{l.text}</span>
          </li>
        ))}
        {sim.log.length === 0 && <li data-tone="ok" className={s.logHint}>무대를 클릭한 뒤 방향키 · Enter · Esc · Q/E</li>}
      </ul>
    </div>
  )
}

/* ───────── 하단 안내 ───────── */

function hintsFor(sim: Sim, device: Device): { id: string; icon: ReactNode; text: string; w: number }[] {
  const pad = device === 'gamepad'
  // 논리 해상도 기준 54px — 키캡 글자가 22px 이상이 되게 (40px 이면 'Enter' 가 13px 로 읽히지 않는다)
  const g = 54
  const move = pad ? <DPad dirs={['up', 'down']} size={g} /> : (
    <>
      <KeyCap label="↑" size={g} />
      <KeyCap label="↓" size={g} />
    </>
  )
  const glyph = (a: 'confirm' | 'back' | 'tabPrev' | 'tabNext') =>
    device === 'keyboard' && a === 'confirm' ? <WideKey label="Enter" size={g} /> : <ActionGlyph action={a} device={device} size={g} />
  const close = pad ? [{ id: 'close', icon: <StartButton size={g} />, text: '닫기', w: g }] : []
  if (sim.screen === 'game') return [{ id: 'pause', icon: pad ? <StartButton size={g} /> : <KeyCap label="Esc" size={g} />, text: '일시정지', w: 70 }]
  if (sim.dialog)
    return [
      { id: 'move', icon: pad ? <DPad dirs={['left', 'right']} size={g} /> : <><KeyCap label="←" size={g} /><KeyCap label="→" size={g} /></>, text: '고르기', w: 112 },
      { id: 'ok', icon: glyph('confirm'), text: '확인', w: 106 },
      { id: 'back', icon: glyph('back'), text: '취소', w: 70 },
    ]
  const depth = sim.stack.length
  const list = [
    { id: 'move', icon: move, text: '이동', w: 112 },
    { id: 'ok', icon: glyph('confirm'), text: '확인', w: 106 },
  ]
  if (depth > 1) {
    list.push({ id: 'back', icon: glyph('back'), text: '뒤로', w: 70 })
    // 옆 카테고리가 있을 때만 단축키 안내 (없는 기능은 안내하지 않는다)
    const parent = getPanel(sim.stack[depth - 2].panel, sim.values)
    if (siblingsOf(parent).length > 1) list.push({ id: 'page', icon: <>{glyph('tabPrev')}{glyph('tabNext')}</>, text: '옆 카테고리', w: 146 })
    return [...list, ...close]
  }
  if (sim.ctx === 'pause') return [...list, { id: 'back', icon: glyph('back'), text: '게임으로', w: 70 }, ...close]
  return list
}

/** 긴 이름 키캡 — 공통 KeyCap 은 4글자 이상이면 글자를 0.34배로 줄여 'Enter' 가 작아진다. 폭을 넓혀 글자 크기를 지킨다 */
function WideKey({ label, size }: { label: string; size: number }) {
  const fs = Math.round(size * 0.42)
  const w = Math.round(size * 0.5 + label.length * fs * 0.62)
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} role="img" aria-label={`${label} 키`} style={{ verticalAlign: 'middle' }}>
      <rect x="1.5" y="1.5" width={w - 3} height={size - 3} rx={size * 0.18} fill="rgba(10,14,22,0.75)" stroke="#f4f7fb" strokeWidth="2.5" />
      <rect x="1.5" y={size - 8} width={w - 3} height="6.5" rx="3" fill="#f4f7fb" opacity="0.25" />
      <text x={w / 2} y={size / 2 + fs * 0.34} textAnchor="middle" fontSize={fs} fontWeight="700" fill="#f4f7fb" fontFamily="'Chakra Petch', sans-serif">
        {label}
      </text>
    </svg>
  )
}

/* ───────── 게임 화면 HUD (메뉴 뒤에서 함께 멈춘다) ───────── */

function GameHud() {
  return (
    <div className={s.gameHud} aria-hidden>
      <div className={s.objective}>
        <span>목표</span>
        <b>북쪽 통신탑 복구</b>
        <em>2 / 3</em>
      </div>
      <div className={s.vitals}>
        <b>하린</b>
        <span className={s.hp}>
          <i />
        </span>
      </div>
      <div className={s.res}>
        <span>냉각 셀 3</span>
        <span>크레딧 1,240</span>
      </div>
    </div>
  )
}

const LockIcon = () => (
  <svg className={s.lock} viewBox="0 0 24 24" aria-label="잠김">
    <rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" />
  </svg>
)

const WarnIcon = () => (
  <svg className={s.warn} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3 L22 20 H2 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M12 9v5M12 16.5v1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)
