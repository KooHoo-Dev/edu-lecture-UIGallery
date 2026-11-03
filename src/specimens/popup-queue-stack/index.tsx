import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import {
  DEFS,
  SHOP_ITEMS,
  back,
  buttonsOf,
  buy,
  closePopup,
  createSim,
  defaultFocus,
  dimTap,
  disconnect,
  dismantle,
  drawOrder,
  enterLobby,
  isBusy,
  isOpen,
  log,
  openPopup,
  quitApp,
  retry,
  step,
  toast,
  topPopup,
  zIndexOf,
  type Btn,
  type Cfg,
  type DimTap,
  type Kind,
  type QueueMode,
  type RootBack,
  type Sim,
} from './sim'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
const ALL_KINDS = Object.keys(DEFS) as Kind[]

/** 로비 버튼의 논리 좌표 (뒤 화면 탭 이벤트의 물결 표시용) */
const SORTIE_POS: Record<'16:9' | '9:16', [number, number]> = { '16:9': [1620, 895], '9:16': [800, 1670] }

/**
 * 팝업 관리자: 대기열 · 레이어 · 뒤로가기 규칙 · 딤 입력 차단 · 길게 눌러 확정.
 * 창은 모두 DOM 에 미리 두고 열림 상태만 바꾼다 (Unity 의 '프리로드 + SetActive 재사용' 과 같은 구조).
 * 창 상태는 드물게 바뀌므로 React 렌더, 길게 누르기 진행 링만 매 프레임 ref 로 직접 그린다.
 */
export default function PopupQueueStack(p: SpecimenProps) {
  const juice = p.juice
  const cfg: Cfg = {
    good: juice,
    queueMode: str(p.params, 'queueMode', 'queue') as QueueMode,
    dimTap: str(p.params, 'dimTap', 'by-type') as DimTap,
    rootBack: str(p.params, 'rootBack', 'confirm') as RootBack,
    holdMs: num(p.params, 'holdMs', 800),
    transitionMs: num(p.params, 'transitionMs', 180),
    queueGapMs: num(p.params, 'queueGapMs', 250),
    timeScale: p.timeScale,
  }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const dimOpacity = num(p.params, 'dimOpacity', 0.6)
  const showDebug = bool(p.params, 'showDebug', true)
  const aspect = p.aspect

  // 시뮬레이션은 마운트 때 한 번 — 첫 화면부터 '로비 진입 직후' (공지 + 대기 2개) 를 보여 준다
  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) {
    simRef.current = createSim()
    enterLobby(simRef.current, cfg)
  }
  const sim = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(sim.version)
  const sync = () => {
    if (sim.version !== shown.current) {
      shown.current = sim.version
      setVersion(sim.version)
    }
  }

  /* ───── 직접 조작 감지 → 자동 데모 잠시 멈춤 ───── */
  const realAt = useRef(-1e9)
  const real = () => {
    realAt.current = sim.t
  }

  /* ───── 동작 ───── */
  const act = (fn: (sm: Sim, c: Cfg) => void) => {
    fn(sim, cfgRef.current)
    sync()
  }
  const press = (kind: Kind, btn: Btn) => {
    const c = cfgRef.current
    if (isBusy(sim, c, kind)) {
      log(sim, `${DEFS[kind].title} 열리는 중 클릭 → 무시 (두 번 실행 방지)`, 'info')
      sync()
      return
    }
    switch (`${kind}:${btn.id}`) {
      case 'notice:ok':
        closePopup(sim, c, kind, '공지 확인')
        break
      case 'attend:claim':
        sim.credits += 500
        closePopup(sim, c, kind, '출석 보상 받기')
        toast(sim, '출석 보상 · 크레딧 +500')
        break
      case 'reward:claim':
        closePopup(sim, c, kind, '탐사 보상 받기')
        toast(sim, '탐사 보상 · 회로 조각 ×3')
        break
      case 'event:close':
        closePopup(sim, c, kind, '이벤트 닫기')
        break
      case 'event:go':
        closePopup(sim, c, kind, '이벤트 보기')
        toast(sim, '(데모) 이벤트 페이지로 이동')
        break
      case 'mail:claimAll':
        if (sim.mailCount) {
          toast(sim, `우편 ${sim.mailCount}개 수령 · 크레딧 +300`)
          sim.credits += 300
          sim.mailCount = 0
          log(sim, '우편 모두 받기', 'ok')
        }
        break
      case 'shop:close':
      case 'buy:cancel':
      case 'dismantle:cancel':
        closePopup(sim, c, kind, `${DEFS[kind].title} ${btn.label}`)
        break
      case 'buy:buy':
        buy(sim, c)
        break
      case 'dismantle:dismantle':
        // 길게 누르기는 pointerdown 에서 시작한다. 여기로 오는 건 즉시 확정(0ms·나쁜 예)일 때만
        if (!c.good || c.holdMs <= 0) dismantle(sim, c)
        break
      case 'offline:retry':
        retry(sim, c)
        break
      case 'quit:cancel':
        closePopup(sim, c, kind, '종료 취소')
        break
      case 'quit:quit':
        quitApp(sim, '종료 확정 (데모: 앱이 닫힘)')
        break
    }
    sync()
  }
  const closeX = (kind: Kind) => {
    if (isBusy(sim, cfgRef.current, kind)) return
    act((sm, c) => closePopup(sm, c, kind, `${DEFS[kind].title} 닫기(X)`))
  }
  const openFromLobby = (kind: Kind, viaEvent = false) => {
    const c = cfgRef.current
    if (!viaEvent && drawOrder(sim, c).length) {
      // 좋은 예에서는 딤이 이 클릭을 먼저 받는다. 여기까지 왔다면 딤이 입력을 막지 못한 것 (관통)
      log(sim, `⚠ 창이 열린 채 뒤 화면 '${DEFS[kind].title}' 버튼이 눌림 (클릭 관통)`, 'bad')
    }
    act((sm, cc) => openPopup(sm, cc, kind, `로비 → ${DEFS[kind].title}`))
  }
  const sortie = () => {
    if (drawOrder(sim, cfgRef.current).length) log(sim, "⚠ 창이 열린 채 뒤 화면 '출격' 버튼이 눌림 (클릭 관통)", 'bad')
    toast(sim, '출격 준비 중… (데모)')
    sync()
  }
  /** 이벤트 버튼 '뒤 화면 탭': 출격 버튼 자리를 누른다. 딤이 있으면 딤이 받는다 */
  const tapBehind = () => {
    const c = cfgRef.current
    const [x, y] = SORTIE_POS[aspect]
    const blocked = c.good && drawOrder(sim, c).length > 0
    sim.ripple = { x, y, at: sim.t, blocked }
    if (blocked) dimTap(sim, c)
    else sortie()
    sim.version++
    sync()
  }

  /** 창별 마지막 z-index (닫힘 연출용) */
  const lastZ = useRef<Partial<Record<Kind, number>>>({})

  /* ───── 길게 눌러 확정 ───── */
  const holdStart = () => {
    const c = cfgRef.current
    if (!isOpen(sim, 'dismantle') || isBusy(sim, c, 'dismantle')) return
    if (!c.good || c.holdMs <= 0) return // press() 가 즉시 처리
    sim.hold.active = true
  }
  const holdEnd = () => {
    if (sim.hold.active && sim.hold.p < 1) {
      sim.hold.active = false
      if (sim.hold.p > 0.05) {
        log(sim, '길게 누르기 중간에 뗌 → 취소', 'info')
        sync()
      }
    }
  }

  /* ───── 이벤트 버튼 · 자동 데모 ───── */
  /** 이벤트 버튼으로 로비 기능을 열 때: 그 흐름과 무관한 창은 먼저 정리한다 (로비에서 직접 누른 것처럼) */
  /** 일반 레이어만 정리한다 — 연결 끊김 같은 시스템 창은 남겨 둔다 (새 창은 그 아래 일반 레이어에 열린다) */
  const clearExcept = (keep: Kind[]) => {
    const c = cfgRef.current
    const drop = (o: { kind: Kind }) => DEFS[o.kind].layer === 'normal' && !keep.includes(o.kind)
    if (!sim.open.some(drop) && !sim.queue.length) return
    sim.queue = []
    sim.open = sim.open.filter(o => !drop(o))
    sim.hold = { active: false, p: 0 }
    log(sim, '(데모) 일반 창·대기열 정리', 'info')
    const top = topPopup(sim, c)
    if (top) sim.focus = defaultFocus(sim, c, top.kind)
  }
  const handle = (id: string) => {
    const c = cfgRef.current
    if (id === 'enter-lobby') act(enterLobby)
    else if (id === 'open-shop') {
      clearExcept(['shop', 'buy'])
      if (!isOpen(sim, 'shop')) openFromLobby('shop', true)
      else if (!isOpen(sim, 'buy')) {
        sim.buyItem = SHOP_ITEMS[(SHOP_ITEMS.indexOf(sim.buyItem) + 1) % SHOP_ITEMS.length]
        act((sm, cc) => openPopup(sm, cc, 'buy', `상점 → ${sm.buyItem.name} 구매 확인`))
      }
    } else if (id === 'dismantle') {
      clearExcept(['dismantle'])
      if (!isOpen(sim, 'dismantle')) openFromLobby('dismantle', true)
      else if (!c.good || c.holdMs <= 0) act(dismantle)
      else if (!isBusy(sim, c, 'dismantle')) autoHold.current = true
    } else if (id === 'disconnect') act(disconnect)
    else if (id === 'back') act(back)
    else if (id === 'tap-behind') tapBehind()
  }
  useTrigger(p.trigger, id => {
    real()
    handle(id)
  })

  /** 자동 데모가 길게 누르기를 흉내 내는 중 */
  const autoHold = useRef(false)
  const autoStep = useRef(0)
  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.6,
    () => {
      if (sim.t - realAt.current < MANUAL_PAUSE || sim.quitUntil > sim.t || autoHold.current) return
      const c = cfgRef.current
      const top = topPopup(sim, c)
      const k = autoStep.current++ % 17
      const btn = (kind: Kind, id: string) => buttonsOf(sim, kind).find(b => b.id === id)!
      if (k === 0) {
        if (!drawOrder(sim, c).length) handle('enter-lobby')
      } else if (k <= 2) {
        if (top?.kind === 'notice') press('notice', btn('notice', 'ok'))
        else if (top?.kind === 'attend') press('attend', btn('attend', 'claim'))
        else if (top) act(back)
      } else if (k === 3) {
        if (top) act(back)
      } else if (k === 4) {
        handle('open-shop')
      } else if (k === 5) handle('open-shop')
      else if (k === 6) tapBehind()
      else if (k === 7) {
        if (isOpen(sim, 'buy')) press('buy', btn('buy', 'buy'))
      } else if (k === 8) act(back)
      else if (k === 9) handle('dismantle')
      else if (k === 10) handle('dismantle')
      else if (k === 11) handle('disconnect')
      else if (k === 12) {
        // 나쁜 예에서는 늦게 온 보상 창이 재시도 버튼을 덮고 있다 → 먼저 받아서 치운다
        if (!c.good && isOpen(sim, 'reward')) press('reward', btn('reward', 'claim'))
        if (isOpen(sim, 'offline')) press('offline', btn('offline', 'retry'))
      } else if (k === 13) {
        // 연결 복구 → 간격 → 대기열에서 보상 창이 나오는 것을 보여 준다 (아무것도 하지 않음)
      } else if (k === 14) {
        if (isOpen(sim, 'reward')) press('reward', btn('reward', 'claim'))
      } else if (k === 15) {
        while (topPopup(sim, c)) closePopup(sim, c, topPopup(sim, c)!.kind)
        sim.queue = []
        act(back) // 창이 없을 때 뒤로 → 종료 확인
      } else if (k === 16) act(back)
      sync()
    },
    p.trigger?.seq,
  )

  /* ───── 게임 루프 ───── */
  const ringRef = useRef<SVGCircleElement>(null)
  const holdFillRef = useRef<HTMLDivElement>(null)
  useGameLoop(p.playing, p.timeScale, dt => {
    step(sim, dt)
    const h = sim.hold
    const c = cfgRef.current
    if (autoHold.current && (!c.good || c.holdMs <= 0)) autoHold.current = false
    if (autoHold.current) h.active = isOpen(sim, 'dismantle')
    if (h.active && c.holdMs > 0) {
      h.p += dt / (c.holdMs / 1000)
      if (h.p >= 1) {
        h.p = 1
        h.active = false
        autoHold.current = false
        dismantle(sim, c)
      }
    } else if (h.p > 0) {
      // 중간에 떼면 빠르게 되감는다 (확정 직전에 떼도 '취소' 로 읽힌다)
      h.p = Math.max(0, h.p - dt * 4)
      if (!isOpen(sim, 'dismantle')) h.p = 0
    }
    if (!isOpen(sim, 'dismantle')) autoHold.current = false
    paintHold()
    sync()
  })
  const paintHold = () => {
    const pr = sim.hold.p
    if (ringRef.current) ringRef.current.style.strokeDashoffset = String(100 - pr * 100)
    if (holdFillRef.current) holdFillRef.current.style.transform = `scaleX(${pr})`
  }
  useLayoutEffect(paintHold)

  /* ───── 키보드 (무대에 포커스가 있을 때) ───── */
  // Esc · Backspace(뒤로)는 늘 먹는다 — 창이 없을 때의 '뒤로' 가 이 표본의 주제다(종료 확인 · 바로 종료 · 무시).
  // ←/→ · Enter · Space 는 창이 맨 위에 떠 있을 때만 (아니면 갤러리 해설 넘김 · 재생으로)
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const c = cfgRef.current
    const top = topPopup(sim, c)
    const k = e.key
    if (k === 'Escape' || k === 'Backspace') {
      if (!e.repeat) act(back)
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && top) {
      const n = buttonsOf(sim, top.kind).length
      sim.focus = (sim.focus + (k === 'ArrowRight' ? 1 : n - 1)) % n
      sim.version++
      sync()
    } else if ((k === 'Enter' || k === ' ') && top) {
      const b = buttonsOf(sim, top.kind)[sim.focus]
      if (!b) return
      if (b.hold && c.good && c.holdMs > 0) {
        if (!e.repeat) holdStart()
      } else if (!e.repeat) press(top.kind, b)
    } else return
    real()
    return true
  })
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') holdEnd()
  }

  /* ───── 그리기 ───── */
  const order = drawOrder(sim, cfg)
  const top = order.at(-1)
  const ts = Math.max(0.05, p.timeScale)
  const reduce = prefersReducedMotion()
  const dur = juice && !reduce ? cfg.transitionMs / ts : 0
  const dimOn = juice && !!top
  const cascade = !juice || cfg.queueMode === 'all'
  const rootStyle = { '--dur': `${dur}ms`, '--dim': dimOpacity, '--ts': ts } as CSSProperties

  const popupStyle = (kind: Kind): CSSProperties => {
    const i = order.findIndex(o => o.kind === kind)
    // 닫히는 창은 페이드가 끝날 때까지 마지막 z-index 를 유지한다 (안 그러면 딤 아래로 숨어 닫힘 연출이 안 보인다)
    if (i >= 0) lastZ.current[kind] = zIndexOf(sim, cfg, kind)
    const normalRank = order.filter(o => DEFS[o.kind].layer === 'normal').findIndex(o => o.kind === kind)
    const off = cascade && i >= 0 ? (juice ? normalRank : i) * 44 : 0
    return {
      zIndex: lastZ.current[kind] ?? 0,
      width: Math.min(DEFS[kind].w, aspect === '9:16' ? 980 : 1400),
      '--off-x': `${off}px`,
      '--off-y': `${off * 0.8}px`,
    } as CSSProperties
  }

  const frame = (kind: Kind, body: ReactNode, opts: { closable?: boolean; tone?: 'system' } = {}) => {
    const openNow = isOpen(sim, kind)
    const isTop = top?.kind === kind
    const btns = buttonsOf(sim, kind)
    const bumped = sim.bump?.kind === kind && sim.t - sim.bump.at < 0.4
    const shaken = sim.shake?.kind === kind && sim.t - sim.shake.at < 0.5
    return (
      <section
        key={kind}
        className={s.popup}
        data-open={openNow || undefined}
        data-top={isTop || undefined}
        data-tone={opts.tone}
        data-layer={DEFS[kind].layer}
        style={popupStyle(kind)}
        aria-hidden={!openNow}
        aria-label={DEFS[kind].title}
        role="dialog"
      >
        <div
          key={`${bumped ? sim.bump?.at : 0}-${shaken ? sim.shake?.at : 0}`}
          className={s.shell}
          data-bump={(bumped && juice && !reduce) || undefined}
          data-shake={(shaken && juice && !reduce) || undefined}
        >
          <header className={s.head}>
            <span className={s.layerTag}>{DEFS[kind].layer === 'system' ? 'SYSTEM' : 'POPUP'}</span>
            <h3>{DEFS[kind].title}</h3>
            {opts.closable !== false && (
              <button className={s.x} aria-label="닫기" tabIndex={-1} onClick={() => (real(), closeX(kind))}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </header>
          <div className={s.body}>{body}</div>
          <footer className={s.foot}>
            {btns.map((b, bi) =>
              b.hold && juice && cfg.holdMs > 0 ? (
                <button
                  key={b.id}
                  className={s.btn}
                  data-kind="danger"
                  data-hold
                  data-focus={(isTop && sim.focus === bi) || undefined}
                  data-part="hold"
                  tabIndex={-1}
                  onPointerDown={e => {
                    real()
                    ;(e.target as Element).setPointerCapture?.(e.pointerId)
                    holdStart()
                  }}
                  onPointerUp={holdEnd}
                  onPointerCancel={holdEnd}
                  onLostPointerCapture={holdEnd}
                >
                  <div ref={holdFillRef} className={s.holdFill} />
                  <svg className={s.ring} viewBox="0 0 40 40" aria-hidden>
                    <circle cx="20" cy="20" r="15.9" className={s.ringTrack} />
                    <circle ref={ringRef} cx="20" cy="20" r="15.9" className={s.ringFill} pathLength={100} />
                  </svg>
                  <span>길게 눌러 {b.label}</span>
                </button>
              ) : (
                <button
                  key={b.id}
                  className={s.btn}
                  data-kind={b.hold || b.danger ? 'danger' : b.primary ? 'primary' : 'plain'}
                  data-focus={(isTop && sim.focus === bi) || undefined}
                  data-part={b.hold ? 'hold' : undefined}
                  disabled={kind === 'offline' && sim.retrying}
                  tabIndex={-1}
                  onClick={() => (real(), press(kind, b))}
                >
                  {kind === 'offline' && sim.retrying && <span className={s.spinner} aria-hidden />}
                  {b.label}
                </button>
              ),
            )}
          </footer>
        </div>
      </section>
    )
  }

  const credits = sim.credits.toLocaleString('ko-KR')
  const it = sim.buyItem
  const quitting = sim.quitUntil > sim.t
  const lastRipple = sim.ripple && sim.t - sim.ripple.at < 0.6 ? sim.ripple : null

  return (
    <div
      className={s.root}
      data-aspect={aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      style={rootStyle}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="팝업 관리자 데모 (클릭 · 터치, 키보드: Esc 뒤로 · ←/→ 버튼 이동 · Enter 누르기)"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDownCapture={() => real()}
    >
      {/* 1. 로비 (뒤 화면) */}
      <div className={s.lobby}>
        <LobbyArt />
        <div className={s.topbar}>
          <div className={s.base}>
            <b>외곽 탐사대</b>
            <span>궤도 정비 기지 · Lv.24</span>
          </div>
          <div className={s.res}>
            <span className={s.chip}>
              <i className={s.coin} aria-hidden />
              <b className={s.num}>{credits}</b>
            </span>
            <span className={s.chip}>
              <i className={s.cell} aria-hidden />
              <b className={s.num}>42</b>
            </span>
          </div>
        </div>
        <nav className={s.rail}>
          <LobbyBtn label="우편함" icon="mail" badge={sim.mailCount} onClick={() => openFromLobby('mail')} />
          <LobbyBtn label="상점" icon="shop" onClick={() => openFromLobby('shop')} />
          <LobbyBtn label="분해" icon="gear" onClick={() => openFromLobby('dismantle')} />
        </nav>
        <button className={s.sortie} tabIndex={-1} onClick={sortie}>
          <span>출격</span>
          <small>북쪽 통신탑 복구</small>
        </button>
      </div>

      {/* 2. 딤 — 맨 위 창 바로 아래 한 장. 뒤 화면 입력을 막는다 */}
      <div
        className={s.dim}
        data-on={dimOn || undefined}
        data-part="dim"
        data-pin="inside"
        style={{ zIndex: top ? zIndexOf(sim, cfg, top.kind) - 1 : 0 }}
        onPointerDown={e => {
          if (!dimOn) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const k = r.width / p.width || 1
          sim.ripple = { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, at: sim.t, blocked: true }
          act(dimTap)
        }}
      />

      {/* 3. 창들 (모두 미리 만들어 두고 열림 상태만 바꾼다) */}
      {frame(
        'notice',
        <>
          <p className={s.lead}>정기 점검 안내</p>
          <p>
            내일 <b className={s.num}>04:00 ~ 06:00</b> 동안 서버 점검이 있습니다. 점검 중에는 탐사 보상을 받을 수 없으니 미리 받아 두세요.
          </p>
        </>,
      )}
      {frame(
        'attend',
        <>
          <p className={s.lead}>7일 출석 · 오늘은 4일째</p>
          <div className={s.days}>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={s.day} data-state={i < 3 ? 'done' : i === 3 ? 'today' : 'next'}>
                <small>{i + 1}일</small>
                <i className={i === 6 ? s.cell : s.coin} aria-hidden />
                <b className={s.num}>{i === 6 ? '×5' : `${(i + 1) * 100 + 100}`}</b>
              </div>
            ))}
          </div>
        </>,
        { closable: false },
      )}
      {frame(
        'event',
        <>
          <div className={s.banner}>
            <svg viewBox="0 0 400 120" aria-hidden preserveAspectRatio="xMidYMid slice">
              <rect width="400" height="120" fill="#16324a" />
              <path d="M0 95 L80 70 L150 88 L230 52 L300 80 L400 40 L400 120 L0 120 Z" fill="#0d2233" />
              <circle cx="320" cy="34" r="16" fill="#ffd166" />
              <path d="M40 30 l14 -8 l14 8 l-14 8z" fill="#5ee6c9" />
            </svg>
            <div>
              <b>통신탑 복구 주간</b>
              <span>탐사 보상 2배 · 7일 남음</span>
            </div>
          </div>
          <label className={s.check}>
            <input
              type="checkbox"
              tabIndex={-1}
              onMouseDown={e => e.preventDefault()} // 눌러도 포커스는 무대에 남는다 — 체크 뒤에도 Esc · Enter 가 창으로 간다
              checked={sim.eventChecked}
              onChange={e => {
                sim.eventChecked = e.target.checked
                sim.version++
                sync()
              }}
            />
            오늘 하루 보지 않기
          </label>
        </>,
      )}
      {frame(
        'reward',
        <>
          <p className={s.lead}>끊기기 전에 끝난 탐사의 보상이 도착했습니다</p>
          <div className={s.delta}>
            <i className={s.cell} aria-hidden />
            <span>회로 조각</span>
            <b className={s.num}>×3</b>
          </div>
        </>,
        { closable: false },
      )}
      {frame(
        'mail',
        <ul className={s.list}>
          {['정비 지원금', '점검 보상', '탐사대 환영 선물'].map((t, i) => (
            <li key={t} data-done={i >= sim.mailCount || undefined}>
              <i className={s.coin} aria-hidden />
              <span>{t}</span>
              <b className={s.num}>+100</b>
            </li>
          ))}
        </ul>,
      )}
      {frame(
        'shop',
        <div className={s.goods}>
          {SHOP_ITEMS.map(g => (
            <button
              key={g.id}
              className={s.good}
              tabIndex={-1}
              onClick={() => {
                real()
                if (isBusy(sim, cfgRef.current, 'shop') || isOpen(sim, 'buy')) return
                sim.buyItem = g
                act((sm, c) => openPopup(sm, c, 'buy', `상점 → ${g.name} 구매 확인`))
              }}
            >
              <i className={g.id === 'cell' ? s.cell : s.coin} aria-hidden />
              <span>{g.name}</span>
              <b className={s.num}>{g.price.toLocaleString('ko-KR')}</b>
            </button>
          ))}
        </div>,
      )}
      {frame(
        'buy',
        <>
          <p className={s.lead}>{it.name}을(를) 구매할까요?</p>
          <div className={s.delta}>
            <span>크레딧</span>
            <b className={s.num}>{credits}</b>
            <span className={s.arrow}>→</span>
            <b className={s.num} data-neg>
              {(sim.credits - it.price).toLocaleString('ko-KR')}
            </b>
          </div>
        </>,
      )}
      {frame(
        'dismantle',
        <>
          <p className={s.lead}>회로 조각 ×12 를 분해합니다</p>
          <p className={s.warnText}>분해한 아이템은 되돌릴 수 없습니다.</p>
          <div className={s.delta}>
            <span>얻는 것</span>
            <b className={s.num}>크레딧 +360</b>
          </div>
        </>,
      )}
      {frame(
        'offline',
        <>
          <p className={s.lead}>서버와 연결이 끊겼습니다</p>
          <p>네트워크 상태를 확인한 뒤 다시 시도해 주세요. 진행 중이던 보상은 사라지지 않습니다.</p>
          <details className={s.code}>
            <summary>자세히</summary>
            오류 코드 NET-0412
          </details>
        </>,
        { closable: false, tone: 'system' },
      )}
      {frame(
        'quit',
        <p className={s.lead}>게임을 종료할까요?</p>,
        { tone: 'system' },
      )}

      {/* 4. 토스트 — 입력을 막지 않는 맨 위 레이어 */}
      <div className={s.toasts} aria-live="polite">
        {sim.toasts.map(t => (
          <div key={t.id} className={s.toast}>
            {t.text}
          </div>
        ))}
      </div>

      {/* 5. 탭 위치 표시 · 기기 뒤로 버튼 */}
      {lastRipple && (
        <div key={lastRipple.at} className={s.ripple} data-blocked={lastRipple.blocked || undefined} style={{ left: lastRipple.x, top: lastRipple.y }}>
          <span>{lastRipple.blocked ? '딤이 받음' : '뒤 화면에 닿음'}</span>
        </div>
      )}
      <button
        className={s.backBtn}
        data-part="back"
        tabIndex={-1}
        onClick={() => {
          real()
          act(back)
        }}
        aria-label="기기 뒤로가기"
      >
        <svg className={s.backIcon} viewBox="0 0 24 24" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        <span>뒤로</span>
        <KeyCap label="Esc" size={44} />
      </button>

      {/* 6. 상태 패널 (레이어 스택 · 대기열 · 기록) */}
      <aside className={s.debug} data-hidden={!showDebug || undefined} aria-hidden={!showDebug}>
        <h4>팝업 관리자 상태</h4>
        <div className={s.layers} data-part="layers">
          {juice ? (['toast', 'system', 'normal'] as const).map(layer => {
            const items =
              layer === 'toast'
                ? sim.toasts.map(t => t.text.slice(0, 10))
                : order.filter(o => DEFS[o.kind].layer === layer).map(o => DEFS[o.kind].title)
            return (
              <div key={layer} className={s.layerRow} data-layer={layer}>
                <span className={s.layerName}>{layer === 'toast' ? '토스트' : layer === 'system' ? '시스템' : '일반'}</span>
                <span className={s.stackItems}>
                  {items.length ? items.map((x, i) => <em key={i}>{x}</em>) : <i>비어 있음</i>}
                </span>
              </div>
            )
          }) : (
            <div className={s.layerRow}>
              <span className={s.layerName}>연 순서</span>
              <span className={s.stackItems}>{order.length ? order.map(o => <em key={o.kind}>{DEFS[o.kind].title}</em>) : <i>비어 있음</i>}</span>
            </div>
          )}
          {!juice && <div className={s.noLayer}>레이어 없음 — 나중에 연 창이 무조건 위</div>}
        </div>
        <div className={s.queue} data-part="queue">
          <span className={s.layerName}>대기열</span>
          <span className={s.stackItems}>
            {sim.queue.length ? sim.queue.map(k => <em key={k}>{DEFS[k].title}</em>) : <i>비어 있음</i>}
          </span>
          {sim.eventMuted && (
            <button
              className={s.miniBtn}
              tabIndex={-1}
              onClick={() => {
                sim.eventMuted = false
                log(sim, '날짜 넘기기 → 이벤트 창 다시 표시', 'info')
                sync()
              }}
            >
              날짜 넘기기
            </button>
          )}
        </div>
        <ol className={s.log}>
          {sim.log.map((l, i) => (
            <li key={`${sim.version}-${i}`} data-tone={l.tone}>
              {l.text}
            </li>
          ))}
        </ol>
      </aside>

      {/* 7. 앱 종료 데모 화면 */}
      {quitting && (
        <div className={s.quitScreen}>
          <b>앱이 종료되었습니다</b>
          <span>(데모 — 잠시 뒤 다시 실행)</span>
        </div>
      )}
      {/* 렌더 순서 확인용 숨은 목록 (스크린 리더) */}
      <span className={s.srOnly}>{ALL_KINDS.filter(k => isOpen(sim, k)).map(k => DEFS[k].title).join(', ') || '열린 창 없음'}</span>
    </div>
  )
}

function LobbyBtn({ label, icon, badge, onClick }: { label: string; icon: 'mail' | 'shop' | 'gear'; badge?: number; onClick: () => void }) {
  return (
    <button className={s.railBtn} tabIndex={-1} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden>
        {icon === 'mail' && <path d="M3 6h18v12H3z M3 7l9 6 9-6" />}
        {icon === 'shop' && <path d="M4 9h16l-1.5 10h-13z M8 9V7a4 4 0 0 1 8 0v2" />}
        {icon === 'gear' && <path d="M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1" />}
      </svg>
      <span>{label}</span>
      {!!badge && <b className={s.badge}>{badge}</b>}
    </button>
  )
}

/** 정비 기지 배경 (SVG) — 탐사선 실루엣과 격납고 */
function LobbyArt() {
  return (
    <svg className={s.art} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pqs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1626" />
          <stop offset="1" stopColor="#1c3348" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#pqs-sky)" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={120 + i * 200} y={180} width={14} height={640} fill="#132538" />
      ))}
      <rect x="0" y="800" width="1920" height="280" fill="#0e1b29" />
      <path d="M560 760 L1360 760 L1460 800 L460 800 Z" fill="#20384f" />
      <path d="M760 600 L1160 600 L1300 700 L1160 760 L760 760 L620 700 Z" fill="#2c4a66" />
      <path d="M820 620 L1100 620 L1180 690 L840 690 Z" fill="#3e6688" />
      <rect x="900" y="560" width="120" height="40" fill="#2c4a66" />
      <circle cx="1240" cy="700" r="18" fill="#5ee6c9" opacity="0.8" />
      <rect x="430" y="690" width="40" height="110" rx="20" fill="#5ee6c9" />
      <circle cx="450" cy="670" r="22" fill="#5ee6c9" />
    </svg>
  )
}
