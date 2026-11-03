import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { bool, num, str } from '../../core/params'
import { placeFloating, type Rect } from '../../core/placement'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { SHOP_ITEMS, STEPS, resolveShape, type HoleShape, type TargetId } from './steps'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
const TOTAL = STEPS.length

type Drawer = 'none' | 'mail' | 'shop'
type Finished = 'none' | 'done' | 'skipped'

interface Sim {
  t: number
  step: number
  drawer: Drawer
  credits: number
  mailCount: number
  cells: number
  finished: Finished
  skipAsk: boolean
  /** 피드백 한 줄 (말풍선 아래) */
  note: { text: string; bad: boolean; until: number } | null
  toast: { text: string; until: number } | null
  /** 화면에 그려진 구멍 (논리 좌표) — 목표를 향해 보간된다 */
  hole: Rect
  holeInit: boolean
  /** 단계 시작 때 한 번 잰 대상 위치 (추적을 끄면 이 자리에 머문다) */
  frozen: Rect | null
  idle: number
  hint: boolean
  wrongAt: number
  scrollGoal: number | null
  /** 스크롤 위치(소수) — scrollTop 은 정수로 반올림되므로 따로 들고 보간한다 */
  scrollPos: number
  ripple: { x: number; y: number; at: number; blocked: boolean } | null
  demoWrong: boolean
  doneTicks: number
  version: number
}

const initial = (): Sim => ({
  t: 0,
  step: 0,
  drawer: 'none',
  credits: 12400,
  mailCount: 3,
  cells: 0,
  finished: 'none',
  skipAsk: false,
  note: null,
  toast: null,
  hole: { x: 0, y: 0, w: 0, h: 0 },
  holeInit: false,
  frozen: null,
  idle: 0,
  hint: false,
  wrongAt: -1e9,
  scrollGoal: null,
  scrollPos: 0,
  ripple: null,
  demoWrong: false,
  doneTicks: 0,
  version: 0,
})

/**
 * 튜토리얼 스포트라이트 + 코치마크.
 * 화면 전체를 어둡게 덮고 지금 눌러야 할 대상만 구멍으로 보여 준다. 구멍 바깥은 투명한 차단막 4장이 입력을 받고,
 * 구멍 안의 클릭은 진짜 버튼에 그대로 닿는다 ('해 보며 배우기' — 튜토리얼 전용 가짜 버튼을 만들지 않는다).
 * 구멍·말풍선·손가락 힌트는 매 프레임 대상 위치를 재서 ref 로 직접 그린다 (서랍이 미끄러져 들어와도 따라간다).
 */
export default function TutorialSpotlight(p: SpecimenProps) {
  const juice = p.juice
  const holeShape = str(p.params, 'holeShape', 'auto') as HoleShape
  const holePadding = num(p.params, 'holePadding', 14)
  const dimOpacity = num(p.params, 'dimOpacity', 0.72)
  const trackTarget = bool(p.params, 'trackTarget', true)
  const idleHintMs = num(p.params, 'idleHintMs', 4000)
  const outsideTap = str(p.params, 'outsideTap', 'block-feedback')
  const tipPlacement = str(p.params, 'tipPlacement', 'auto')
  const transitionMs = num(p.params, 'transitionMs', 280)
  const showSkip = bool(p.params, 'showSkip', true)
  const W = p.width
  const H = p.height
  const reduce = prefersReducedMotion()

  // 나쁜 예: 추적 없음 · 클릭 관통 · 힌트 없음 · 고정 위치 말풍선 · 건너뛰기 없음 · '다음' 버튼으로 읽고 넘기기
  const track = juice && trackTarget
  const pass = !juice || outsideTap === 'pass'
  const feedback = juice && outsideTap === 'block-feedback'
  const hintMs = juice ? idleHintMs : 0
  const tipMode = juice ? tipPlacement : 'fixed'
  const skippable = juice && showSkip
  const moveMs = juice && !reduce ? transitionMs : 0

  const cfg = { track, pass, feedback, hintMs, tipMode, moveMs, holeShape, holePadding }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initial()
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

  const rootRef = useRef<HTMLDivElement>(null)
  const holeRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])

  /* ───── 직접 조작 감지 ───── */
  const realAt = useRef(-1e9)
  const real = () => {
    realAt.current = S.t
    S.idle = 0
  }

  /* ───── 측정 ───── */
  const scale = () => {
    const root = rootRef.current
    return root ? root.getBoundingClientRect().width / W || 1 : 1
  }
  const rectOf = (el: Element | null | undefined): Rect | null => {
    const root = rootRef.current
    if (!root || !el) return null
    const rr = root.getBoundingClientRect()
    const k = rr.width / W || 1
    const r = el.getBoundingClientRect()
    return { x: (r.left - rr.left) / k, y: (r.top - rr.top) / k, w: r.width / k, h: r.height / k }
  }
  const targetEl = () => (S.finished === 'none' ? rootRef.current?.querySelector(`[data-tut="${STEPS[S.step].target}"]`) : null)

  /** 대상 사각형 → 구멍 사각형 (모양 · 여백) */
  const holeFor = (r: Rect): Rect & { round: boolean } => {
    const c = cfgRef.current
    const shape = resolveShape(c.holeShape, r.w, r.h)
    const pad = c.holePadding
    if (shape === 'circle') {
      const d = Math.max(r.w, r.h) + pad * 2
      return { x: r.x + r.w / 2 - d / 2, y: r.y + r.h / 2 - d / 2, w: d, h: d, round: true }
    }
    return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2, round: false }
  }

  /* ───── 동작 ───── */
  const note = (text: string, bad = false, sec = 2.2) => {
    S.note = { text, bad, until: S.t + sec }
    touch()
  }
  const toast = (text: string) => {
    S.toast = { text, until: S.t + 2 }
    touch()
  }

  /** 버튼 본래 기능 — 튜토리얼과 무관하게 늘 같은 일을 한다 */
  const doAction = (id: TargetId) => {
    if (id === 'tab-mail') S.drawer = S.drawer === 'mail' ? 'none' : 'mail'
    else if (id === 'tab-shop') S.drawer = S.drawer === 'shop' ? 'none' : 'shop'
    else if (id === 'mail-claim') {
      if (S.mailCount) {
        S.credits += 300
        S.mailCount = 0
        toast('우편 3개 수령 · 크레딧 +300')
      }
      S.drawer = 'none'
    } else if (id === 'item-cell') {
      S.credits -= 500
      S.cells += 5
      toast('냉각 셀 ×5 구매')
      S.drawer = 'none'
    } else if (id === 'sortie') {
      toast('출격! (데모)')
      S.drawer = 'none'
    }
    touch()
  }

  const advance = () => {
    S.step++
    if (S.step >= TOTAL) {
      S.step = TOTAL - 1
      S.finished = 'done'
      S.credits += 1000
      toast('튜토리얼 완료 · 크레딧 +1000')
    }
    touch()
  }

  /** 실제 버튼의 onClick */
  const onTarget = (id: TargetId) => {
    if (S.finished !== 'none') {
      doAction(id)
      sync()
      return
    }
    const cur = STEPS[S.step]
    doAction(id)
    if (cur.target === id) advance()
    else note(`⚠ 튜토리얼 밖 버튼이 눌림 → 화면과 안내가 어긋남`, true, 3)
    sync()
  }

  /** 구멍 바깥 탭 (차단막이 받음) */
  const wrongTap = (x: number, y: number) => {
    const c = cfgRef.current
    S.ripple = { x, y, at: S.t, blocked: true }
    if (c.feedback) {
      S.wrongAt = S.t
      S.hint = true // 헤매고 있다는 신호 → 기다리지 말고 바로 손가락 힌트
      note('강조된 곳을 눌러 주세요')
    }
    touch()
    sync()
  }

  const restart = () => {
    const keep = { t: S.t, version: S.version + 1 }
    Object.assign(S, initial(), keep)
    if (listRef.current) listRef.current.scrollTop = 0
    sync()
  }

  const skipConfirm = () => {
    S.finished = 'skipped'
    S.skipAsk = false
    S.drawer = 'none'
    touch()
    sync()
  }

  /** '다음' 버튼 (나쁜 예) — 하지 않고 읽기만 해도 넘어간다 */
  const readNext = () => {
    advance()
    sync()
  }

  /* ───── 단계 시작: 대상 위치를 한 번 재 두고, 목록 안 대상은 먼저 보이게 스크롤 ───── */
  const stepKey = `${S.step}-${S.finished}`
  const lastStepKey = useRef('')
  useLayoutEffect(() => {
    if (lastStepKey.current === stepKey) return
    lastStepKey.current = stepKey
    S.idle = 0
    S.hint = false
    if (S.note && !S.note.bad) S.note = null // 지난 단계의 안내는 지운다 (경고는 남겨 둔다)
    S.frozen = rectOf(targetEl())
    S.scrollGoal = null
    const el = targetEl() as HTMLElement | null
    const list = listRef.current
    if (juice && el && list && list.contains(el)) {
      // 대상이 스크롤 목록 밖에 있으면 먼저 가운데로 데려온다 (구멍이 빈 곳을 가리키지 않게)
      S.scrollGoal = clamp(el.offsetTop - (list.clientHeight - el.offsetHeight) / 2, 0, list.scrollHeight - list.clientHeight)
      S.scrollPos = list.scrollTop
      if (!p.playing) {
        list.scrollTop = S.scrollGoal
        S.scrollGoal = null
      }
    }
    paint(0)
  })

  /* ───── 이벤트 버튼 · 자동 데모 ───── */
  const tapTarget = () => {
    const el = targetEl() as HTMLElement | null
    const r = rectOf(el)
    if (r) S.ripple = { x: r.x + r.w / 2, y: r.y + r.h / 2, at: S.t, blocked: false }
    if (el) onTarget(STEPS[S.step].target)
  }
  const handle = (id: string) => {
    if (id === 'tap-target') {
      if (S.finished === 'none') tapTarget()
    } else if (id === 'tap-outside') {
      if (S.finished !== 'none') return
      if (cfgRef.current.pass) {
        // 차단막이 없다 → 뒤의 상점 탭이 그대로 눌린다 (단계가 '상점' 이면 정답이 되므로 출격 버튼을 누른다)
        const leak: TargetId = STEPS[S.step].target === 'tab-shop' ? 'sortie' : 'tab-shop'
        const r = rectOf(rootRef.current?.querySelector(`[data-tut="${leak}"]`))
        if (r) S.ripple = { x: r.x + r.w / 2, y: r.y + r.h / 2, at: S.t, blocked: false }
        onTarget(leak)
      } else wrongTap(W * 0.5, H * 0.42)
    } else if (id === 'idle') {
      if (S.finished === 'none' && cfgRef.current.hintMs > 0) {
        S.hint = true
        touch()
      }
    } else if (id === 'skip') {
      if (S.finished === 'none') skippable ? ((S.skipAsk = true), touch()) : note('건너뛰기 버튼이 없다 — 끝까지 해야 한다', true)
    } else if (id === 'restart') restart()
    sync()
  }
  useTrigger(p.trigger, id => {
    real()
    handle(id)
  })

  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.8,
    () => {
      if (S.t - realAt.current < MANUAL_PAUSE) return
      if (S.finished !== 'none') {
        if (++S.doneTicks >= 2) restart()
        return
      }
      if (S.skipAsk) {
        S.skipAsk = false
        touch()
      } else if (!juice) {
        // 흔한 실수: 첫 단계에서 다른 버튼이 관통해 눌리고, 이후로는 '다음' 만 눌러 읽고 넘긴다
        if (S.step === 0 && !S.demoWrong) {
          S.demoWrong = true
          handle('tap-outside')
        } else readNext()
      } else if (S.step === 0 && !S.demoWrong) {
        S.demoWrong = true
        handle('tap-outside')
      } else if (S.step === 2 && cfgRef.current.hintMs > 0 && !S.hint) {
        // 가만히 기다리면 손가락 힌트가 뜨는 것을 보여 준다
      } else tapTarget()
      sync()
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = cfgRef.current
    if (S.finished === 'none' && c.hintMs > 0 && !S.hint && !S.skipAsk) {
      S.idle += dt
      if (S.idle * 1000 >= c.hintMs) {
        S.hint = true
        touch()
      }
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    if (S.toast && S.toast.until <= S.t) {
      S.toast = null
      touch()
    }
    if (S.ripple && S.t - S.ripple.at > 0.6) {
      S.ripple = null
      touch()
    }
    const list = listRef.current
    if (list && S.scrollGoal !== null) {
      S.scrollPos = damp(S.scrollPos, S.scrollGoal, 9, dt)
      if (Math.abs(S.scrollPos - S.scrollGoal) < 0.5) {
        list.scrollTop = S.scrollGoal
        S.scrollGoal = null // 끝나면 손을 뗀다 — 사용자가 직접 스크롤할 수 있게
      } else list.scrollTop = S.scrollPos
    }
    paint(dt)
    sync()
  })

  /* ───── 그리기 (ref 직접 갱신) ───── */
  const paint = (dt: number) => {
    const c = cfgRef.current
    const hole = holeRef.current
    if (!hole || S.finished !== 'none') return
    const live = rectOf(targetEl())
    const goalRect = c.track ? live : (S.frozen ?? live)
    if (!goalRect) return
    const goal = holeFor(goalRect)
    const h = S.hole
    if (!S.holeInit || c.moveMs <= 0 || dt === 0) {
      if (!S.holeInit || c.moveMs <= 0 || !p.playing) Object.assign(h, { x: goal.x, y: goal.y, w: goal.w, h: goal.h })
      S.holeInit = true
    } else {
      const lambda = 4.6 / (c.moveMs / 1000)
      h.x = damp(h.x, goal.x, lambda, dt)
      h.y = damp(h.y, goal.y, lambda, dt)
      h.w = damp(h.w, goal.w, lambda, dt)
      h.h = damp(h.h, goal.h, lambda, dt)
    }
    hole.style.transform = `translate(${h.x}px, ${h.y}px)`
    hole.style.width = `${h.w}px`
    hole.style.height = `${h.h}px`
    hole.style.borderRadius = goal.round ? '50%' : '22px'

    // 차단막 4장: 구멍의 위 · 아래 · 왼쪽 · 오른쪽
    const [bt, bb, bl, br] = blockRefs.current
    const set = (el: HTMLDivElement | null | undefined, x: number, y: number, w: number, hh: number) => {
      if (!el) return
      el.style.transform = `translate(${x}px, ${y}px)`
      el.style.width = `${Math.max(0, w)}px`
      el.style.height = `${Math.max(0, hh)}px`
    }
    set(bt, 0, 0, W, h.y)
    set(bb, 0, h.y + h.h, W, H - h.y - h.h)
    set(bl, 0, h.y, h.x, h.h)
    set(br, h.x + h.w, h.y, W - h.x - h.w, h.h)

    // 말풍선: 구멍 옆에 두되 넘치면 뒤집고 경계 안으로 (나쁜 예: 화면 아래 고정 → 대상을 가린다)
    const tip = tipRef.current
    if (tip) {
      const size = { w: tip.offsetWidth, h: tip.offsetHeight }
      let x: number
      let y: number
      let side: string
      if (c.tipMode === 'auto') {
        const bounds = { x: 24, y: 112, w: W - 48, h: H - 136 }
        const overlaps = (q: { x: number; y: number }) => q.x < h.x + h.w && q.x + size.w > h.x && q.y < h.y + h.h && q.y + size.h > h.y
        let pl = placeFloating(h, size, bounds, STEPS[S.step].prefer, 28)
        // 좌우 어느 쪽에도 안 들어가 화면 안으로 밀리면 구멍을 덮을 수 있다 → 위 · 아래로 다시
        for (const alt of ['top', 'bottom'] as const) {
          if (!overlaps(pl)) break
          pl = placeFloating(h, size, bounds, alt, 28)
        }
        x = pl.x
        y = pl.y
        side = pl.side
      } else {
        // 대화창처럼 왼쪽 아래 고정 — 하단 탭을 덮는다
        x = 40
        y = H - size.h - 30
        side = 'none'
      }
      tip.style.transform = `translate(${x}px, ${y}px)`
      tip.dataset.side = side
      // 꼬리는 구멍 가운데를 가리킨다
      const cx = h.x + h.w / 2 - x
      const cy = h.y + h.h / 2 - y
      tip.style.setProperty('--ax', `${clamp(cx, 40, size.w - 40)}px`)
      tip.style.setProperty('--ay', `${clamp(cy, 40, size.h - 40)}px`)
    }
    const hand = handRef.current
    if (hand) {
      hand.style.transform = `translate(${h.x + h.w / 2}px, ${h.y + h.h / 2}px)`
      hand.toggleAttribute('data-on', S.hint)
    }
  }
  useLayoutEffect(() => paint(0))

  /* ───── 키보드: Enter = 강조된 대상 누르기, Esc = 건너뛰기 묻기 ───── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    if (e.key === 'Enter' || e.key === ' ') {
      if (S.finished !== 'none') return
      if (e.repeat) return true // 길게 눌러도 한 번만 — 반복 키는 먹기만 한다
      tapTarget()
    } else if (e.key === 'Escape') {
      if (S.finished !== 'none' || !skippable) return
      if (e.repeat) return true
      S.skipAsk = !S.skipAsk
      touch()
      sync()
    } else return
    real()
    return true
  })

  const step = STEPS[S.step]
  const active = S.finished === 'none'
  const ts = Math.max(0.05, p.timeScale)
  const wrongRecent = S.t - S.wrongAt < 0.5
  const rootStyle = { '--dim': dimOpacity, '--ts': ts } as CSSProperties
  const T = (id: TargetId) => ({ 'data-tut': id, onClick: () => onTarget(id), tabIndex: -1 })

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      style={rootStyle}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="튜토리얼 데모 (강조된 곳을 클릭 · 터치, 키보드: Enter 누르기 · Esc 건너뛰기)"
      onKeyDown={onKeyDown}
      onPointerDownCapture={real}
    >
      {/* ── 게임 화면 ── */}
      <BaseArt />
      <header className={s.topbar}>
        <div className={s.base}>
          <b>외곽 탐사대</b>
          <span>궤도 정비 기지 · 첫 접속</span>
        </div>
        <div className={s.res}>
          <span className={s.chip}>
            <i className={s.coin} aria-hidden />
            <b className={s.num}>{S.credits.toLocaleString('ko-KR')}</b>
          </span>
          <span className={s.chip}>
            <i className={s.cell} aria-hidden />
            <b className={s.num}>{S.cells}</b>
          </span>
        </div>
      </header>

      <nav className={s.tabs}>
        <Tab label="기지" icon="home" />
        <Tab label="장비" icon="gear" />
        <Tab label="상점" icon="shop" {...T('tab-shop')} />
        <Tab label="우편" icon="mail" badge={S.mailCount} {...T('tab-mail')} />
      </nav>
      <button className={s.sortie} {...T('sortie')}>
        <span>출격</span>
        <small>북쪽 통신탑 복구</small>
      </button>

      <aside className={s.drawer} data-open={S.drawer === 'mail' || undefined}>
        <h3>우편함</h3>
        <ul>
          {['정비 지원금', '첫 접속 선물', '탐사대 환영 메시지'].map((t, i) => (
            <li key={t} data-done={S.mailCount === 0 || undefined}>
              <i className={s.coin} aria-hidden />
              <span>{t}</span>
              <b className={s.num}>{i < 2 ? '+150' : ''}</b>
            </li>
          ))}
        </ul>
        <button className={s.primary} {...T('mail-claim')}>
          모두 받기
        </button>
      </aside>

      <section className={s.shop} data-open={S.drawer === 'shop' || undefined}>
        <h3>보급 상점</h3>
        <div ref={listRef} className={s.list} data-part="track">
          {SHOP_ITEMS.map(it => (
            <button key={it.id} className={s.item} {...(it.id === 'cell' ? T('item-cell') : { tabIndex: -1, onClick: () => toast(`${it.name} — 튜토리얼 뒤에 살 수 있어요`) })}>
              <i className={it.id === 'cell' ? s.cell : s.coin} aria-hidden />
              <span>{it.name}</span>
              <b className={s.num}>{it.price.toLocaleString('ko-KR')}</b>
            </button>
          ))}
        </div>
      </section>

      {/* ── 튜토리얼 오버레이 ── */}
      <div className={s.overlay} data-active={active || undefined} data-pass={cfg.pass || undefined}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            ref={el => {
              blockRefs.current[i] = el
            }}
            className={s.blocker}
            onPointerDown={e => {
              if (cfg.pass) return
              e.preventDefault()
              const r = rootRef.current!.getBoundingClientRect()
              const k = scale()
              wrongTap((e.clientX - r.left) / k, (e.clientY - r.top) / k)
            }}
          />
        ))}
        <div ref={holeRef} className={s.hole} data-part="hole" data-wrong={(wrongRecent && cfg.feedback) || undefined} key={`hole-${S.wrongAt}`} />
        <div ref={handRef} className={s.hand} data-part="hint" aria-hidden>
          <svg viewBox="0 0 64 64">
            <path d="M24 34V12a5 5 0 0 1 10 0v16l12 3a6 6 0 0 1 4.6 6.8L48 54H26L14 40a5 5 0 0 1 7-7z" />
          </svg>
        </div>
        <div ref={tipRef} className={s.tip} data-part="tip" data-shake={(wrongRecent && cfg.feedback && !reduce) || undefined} key={`tip-${S.step}-${S.wrongAt}`}>
          <div className={s.tipHead}>
            <b>{step.title}</b>
            <span className={s.progress} data-part="progress" aria-label={`${TOTAL}단계 중 ${S.step + 1}단계`}>
              {STEPS.map((_, i) => (
                <i key={i} data-state={i < S.step ? 'done' : i === S.step ? 'now' : 'next'} />
              ))}
              <em className={s.num}>
                {S.step + 1} / {TOTAL}
              </em>
            </span>
          </div>
          <p>{rich(step.text)}</p>
          {S.note && <p className={s.note} data-bad={S.note.bad || undefined}>{S.note.text}</p>}
          {!juice && (
            <button className={s.next} tabIndex={-1} onClick={readNext}>
              다음 ›
            </button>
          )}
        </div>
        {skippable && active && (
          <div className={s.skip}>
            {S.skipAsk ? (
              <>
                <span>건너뛸까요? 설정 › 도움말에서 다시 볼 수 있어요</span>
                <button tabIndex={-1} onClick={() => ((S.skipAsk = false), touch(), sync())}>
                  계속하기
                </button>
                <button tabIndex={-1} data-kind="plain" onClick={skipConfirm}>
                  건너뛰기
                </button>
              </>
            ) : (
              <button tabIndex={-1} data-kind="plain" onClick={() => ((S.skipAsk = true), touch(), sync())}>
                건너뛰기
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 끝난 뒤: 다시 보기 ── */}
      {!active && (
        <div className={s.doneCard}>
          <b>{S.finished === 'done' ? '튜토리얼 완료' : '튜토리얼을 건너뜀'}</b>
          <span>설정 › 도움말에서 언제든 다시 볼 수 있습니다</span>
          <button tabIndex={-1} onClick={restart}>
            다시 보기
          </button>
        </div>
      )}
      {S.toast && <div className={s.toast}>{S.toast.text}</div>}
      {S.ripple && (
        <div key={S.ripple.at} className={s.ripple} data-blocked={S.ripple.blocked || undefined} style={{ transform: `translate(${S.ripple.x}px, ${S.ripple.y}px)` }} />
      )}
    </div>
  )
}

/** `**굵게**` 만 지원하는 작은 변환 */
function rich(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

function Tab({ label, icon, badge, ...rest }: { label: string; icon: 'home' | 'gear' | 'shop' | 'mail'; badge?: number; 'data-tut'?: string; onClick?: () => void; tabIndex?: number }) {
  return (
    <button className={s.tab} tabIndex={-1} {...rest}>
      <svg viewBox="0 0 24 24" aria-hidden>
        {icon === 'home' && <path d="M3 11l9-7 9 7v9H3z M9 20v-6h6v6" />}
        {icon === 'gear' && <path d="M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1" />}
        {icon === 'shop' && <path d="M4 9h16l-1.5 10h-13z M8 9V7a4 4 0 0 1 8 0v2" />}
        {icon === 'mail' && <path d="M3 6h18v12H3z M3 7l9 6 9-6" />}
      </svg>
      <span>{label}</span>
      {!!badge && <b className={s.badge}>{badge}</b>}
    </button>
  )
}

function BaseArt() {
  return (
    <svg className={s.art} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="tut-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1626" />
          <stop offset="1" stopColor="#1c3348" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#tut-sky)" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={120 + i * 200} y={180} width={14} height={640} fill="#132538" />
      ))}
      <rect x="0" y="800" width="1920" height="280" fill="#0e1b29" />
      <path d="M560 760 L1360 760 L1460 800 L460 800 Z" fill="#20384f" />
      <path d="M760 600 L1160 600 L1300 700 L1160 760 L760 760 L620 700 Z" fill="#2c4a66" />
      <path d="M820 620 L1100 620 L1180 690 L840 690 Z" fill="#3e6688" />
      <rect x="430" y="690" width="40" height="110" rx="20" fill="#5ee6c9" />
      <circle cx="450" cy="670" r="22" fill="#5ee6c9" />
    </svg>
  )
}
