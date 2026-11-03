import { useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { bool, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import {
  KIND_LABEL,
  MENUS,
  act,
  claimAll,
  createSim,
  mailFlood,
  menuBadge,
  newMail,
  newPromo,
  nextDay,
  openMenu,
  openTab,
  rootBadge,
  rootCount,
  tabBadge,
  type Badge,
  type Cfg,
  type ClearRule,
  type PromoDots,
  type Sim,
} from './tree'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** 새 항목 경로 번쩍임: 항목 → 탭 → 메뉴 → 로비 순서 간격 */
const PULSE_STEP = 0.15

type BadgeStyle = 'auto' | 'count' | 'dot'

/**
 * 레드닷 알림 배지 트리.
 * 점 데이터는 항목에만 있고 메뉴·탭 배지는 매번 자식에서 계산한다 (나쁜 예는 화면별 플래그).
 * 상태가 드물게 바뀌므로 React 렌더, 시간은 번쩍임 표시용으로만 흐른다.
 */
export default function RedDotBadgeTree(p: SpecimenProps) {
  const juice = p.juice
  const badgeStyle = str(p.params, 'badgeStyle', 'auto') as BadgeStyle
  const countCap = str(p.params, 'countCap', '99')
  const pulseOn = bool(p.params, 'pulseOnNew', true)
  const showTree = bool(p.params, 'showTree', true)
  const cfg: Cfg = {
    good: juice,
    clearRule: str(p.params, 'clearRule', 'by-type') as ClearRule,
    promoDots: (juice ? str(p.params, 'promoDots', 'subtle') : 'red') as PromoDots,
    openToLit: juice && bool(p.params, 'openToLit', true),
  }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const reduce = prefersReducedMotion()

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = createSim()
  const S = simRef.current
  const [, setVersion] = useState(0)
  const shown = useRef(S.version)
  const sync = () => {
    if (S.version !== shown.current) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const run = (fn: (sm: Sim, c: Cfg) => void) => {
    fn(S, cfgRef.current)
    sync()
  }

  /* ───── 직접 조작 → 자동 데모 잠시 멈춤 ───── */
  const realAt = useRef(-1e9)
  const real = () => {
    realAt.current = S.t
  }

  /* ───── 이벤트 · 자동 데모 ───── */
  const firstOpen = (menu: string, kind?: string) => S.items.find(l => l.menu === menu && (kind ? l.kind === kind : true) && (l.kind === 'reward' ? !l.done : l.dot))
  const handle = (id: string) => {
    if (id === 'new-mail') run(newMail)
    else if (id === 'claim-all') run((sm, c) => claimAll(sm, c, sm.menu))
    else if (id === 'next-day') run(nextDay)
    else if (id === 'promo') run(newPromo)
    else if (id === 'mail-flood') run(sm => mailFlood(sm))
    else if (id === 'reset') {
      simRef.current = createSim()
      simRef.current.t = S.t
      simRef.current.version = S.version + 1
      setVersion(simRef.current.version)
    }
  }
  useTrigger(p.trigger, id => {
    real()
    handle(id)
  })

  const autoStep = useRef(0)
  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.7,
    () => {
      if (S.t - realAt.current < MANUAL_PAUSE) return
      const k = autoStep.current++ % 14
      const c = cfgRef.current
      const actFirst = (menu: string, kind?: string) => {
        const l = firstOpen(menu, kind)
        if (l) act(S, c, l.id)
      }
      if (k === 0) newMail(S)
      else if (k === 1) openMenu(S, c, 'mail')
      else if (k === 2) actFirst('mail', 'reward')
      else if (k === 3) openTab(S, c, 'notice')
      else if (k === 4) claimAll(S, c, 'mail')
      else if (k === 5) openMenu(S, c, 'mission')
      else if (k === 6) actFirst('mission', 'reward')
      else if (k === 7) {
        // 무료 보급을 받으면 상점에는 홍보만 남는다 → 홍보 점이 약하게 바뀌는 것을 보여 준다
        openMenu(S, c, 'shop')
        actFirst('shop', 'reward')
      }
      else if (k === 8) openTab(S, c, 'package')
      else if (k === 9) newPromo(S)
      else if (k === 10) {
        openMenu(S, c, 'crew')
        actFirst('crew', 'reward')
      } else if (k === 11) nextDay(S)
      else if (k === 12) openMenu(S, c, 'mission')
      else if (k === 13) claimAll(S, c, 'mission')
      sync()
    },
    p.trigger?.seq,
  )

  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    // 번쩍임이 끝나면 한 번 다시 그린다
    if (S.pulse && S.t - S.pulse.at > PULSE_STEP * 4 + 0.6) {
      S.pulse = null
      S.version++
    }
    sync()
  })

  /* ───── 키보드: Q/E 메뉴, ←/→ 탭, Enter 첫 항목 처리 ─────
   * 숫자 1~9 는 갤러리의 이벤트 단축키라 쓰지 않는다. 지금 쓰는 조작 키만 먹고 나머지는 갤러리로 흘려보낸다 */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const c = cfgRef.current
    const def = MENUS.find(m => m.id === S.menu)!
    const ti = def.tabs.findIndex(t => t.id === S.tab)
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    let go: (() => void) | null = null
    if (k === 'q' || k === 'e') {
      const mi = MENUS.findIndex(m => m.id === S.menu)
      const next = MENUS[(mi + (k === 'e' ? 1 : MENUS.length - 1)) % MENUS.length]
      if (next.id !== S.menu) go = () => run((sm, cc) => openMenu(sm, cc, next.id))
    } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      const n = def.tabs.length
      if (n > 1) go = () => run((sm, cc) => openTab(sm, cc, def.tabs[(ti + (k === 'ArrowRight' ? 1 : n - 1)) % n].id))
    } else if (k === 'Enter') {
      const l = S.items.find(x => x.menu === S.menu && x.tab === S.tab && (x.kind === 'reward' ? !x.done : x.dot))
      if (l) go = () => run(sm => act(sm, c, l.id))
    }
    if (!go) return
    if (!e.repeat) {
      go()
      real()
    }
    return true // 꾹 눌러 반복되는 키도 갤러리로 새지 않게 먹는다
  })

  /* ───── 그리기 ───── */
  const cap = countCap === 'none' ? Infinity : Number(countCap)
  const pulse = pulseOn && juice && !reduce && S.pulse && S.t - S.pulse.at < PULSE_STEP * 4 + 0.6 ? S.pulse : null
  /** 번쩍임 속성 — 애니메이션을 다시 시작하려고 key 도 바꾼다 (key 는 펼치지 않고 따로 넘긴다) */
  const pulseAttr = (depth: number, hit: boolean) =>
    hit && pulse ? { 'data-pulse': true, style: { '--delay': `${(depth * PULSE_STEP) / Math.max(0.05, p.timeScale)}s` } as CSSProperties } : {}
  const pulseKey = (hit: boolean) => (hit && pulse ? `p-${pulse.n}` : 'still')

  const dot = (b: Badge, level: 'root' | 'menu' | 'tab', part?: string, hit = false, depth = 0) => {
    // 좋은 예: 계산값. 나쁜 예: 플래그 — 켜져 있는데 셀 게 없으면 '유령'
    const on = b.on
    const ghost = !juice && on && b.count === 0
    const subtle = juice && b.promoOnly && cfg.promoDots === 'subtle'
    let label = ''
    if (!juice) label = b.count ? String(b.count) : ''
    else if (subtle) label = '' // 약한 점에는 숫자를 넣지 않는다
    else if (badgeStyle === 'count' || (badgeStyle === 'auto' && b.rewards > 0)) {
      const n = badgeStyle === 'count' ? b.count : b.rewards
      label = n > cap ? `${cap}+` : String(n)
    }
    return (
      <b
        key={pulseKey(hit)}
        className={s.badge}
        data-on={on || undefined}
        data-num={label !== '' || undefined}
        data-subtle={subtle || undefined}
        data-ghost={ghost || undefined}
        data-level={level}
        data-part={part}
        aria-label={on ? (label ? `알림 ${label}개` : '새 알림') : undefined}
        {...pulseAttr(depth, hit)}
      >
        {label}
      </b>
    )
  }

  const menuDef = MENUS.find(m => m.id === S.menu)!
  const tabItems = S.items.filter(l => l.menu === S.menu && l.tab === S.tab)
  const undone = S.items.filter(l => l.menu === S.menu && l.kind === 'reward' && !l.done).length
  const total = rootCount(S, cfg)

  return (
    <div
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="레드닷 데모 (클릭 · 터치, 키보드: Q/E 메뉴 · ←/→ 탭 · Enter 첫 항목 처리)"
      onKeyDown={onKeyDown}
      onPointerDownCapture={real}
    >
      <header className={s.topbar}>
        <div className={s.profile}>
          <span className={s.avatar} aria-hidden />
          <div>
            <b>외곽 탐사대</b>
            <span>궤도 정비 기지 · 로비</span>
          </div>
          {dot(rootBadge(S, cfg), 'root', undefined, !!pulse, 3)}
        </div>
        <span className={s.chip}>
          <i className={s.coin} aria-hidden />
          <b className={s.num}>{S.credits.toLocaleString('ko-KR')}</b>
        </span>
      </header>

      {/* 메뉴 (1단) */}
      <nav className={s.nav}>
        {MENUS.map((m, i) => (
          <button
            key={m.id}
            className={s.navBtn}
            data-active={S.menu === m.id || undefined}
            tabIndex={-1}
            onClick={() => run((sm, c) => openMenu(sm, c, m.id))}
          >
            <MenuIcon icon={m.icon} />
            <span>{m.label}</span>
            <kbd className={s.key}>{i + 1}</kbd>
            {dot(menuBadge(S, cfg, m.id), 'menu', m.id === 'mail' ? 'nav-badge' : m.id === 'shop' ? 'promo' : undefined, pulse?.menu === m.id, 2)}
          </button>
        ))}
      </nav>

      {/* 메뉴 내용: 탭 (2단) + 항목 (3단) */}
      <section className={s.panel}>
        <div className={s.panelHead}>
          <h3>{menuDef.label}</h3>
          <button className={s.claimAll} tabIndex={-1} disabled={!undone} onClick={() => run((sm, c) => claimAll(sm, c, sm.menu))}>
            모두 받기{undone ? ` (${undone})` : ''}
          </button>
        </div>
        <div className={s.tabs} data-part="tab-badge">
          {menuDef.tabs.map(t => (
            <button key={t.id} className={s.tab} data-active={S.tab === t.id || undefined} tabIndex={-1} onClick={() => run((sm, c) => openTab(sm, c, t.id))}>
              {t.label}
              {dot(tabBadge(S, cfg, S.menu, t.id), 'tab', undefined, pulse?.menu === S.menu && pulse?.tab === t.id, 1)}
            </button>
          ))}
        </div>
        <ul className={s.items} data-part="leaf">
          {tabItems.length === 0 && <li className={s.empty}>이 탭에는 항목이 없습니다</li>}
          {tabItems.map(l => {
            const counted = l.dot && !(l.kind === 'promo' && cfg.promoDots === 'off')
            const subtle = juice && l.kind === 'promo' && cfg.promoDots === 'subtle'
            const finished = l.kind === 'reward' ? l.done : !l.dot
            return (
              <li key={l.id} className={s.item} data-done={finished || undefined}>
                <b
                  key={pulseKey(pulse?.item === l.id)}
                  className={s.badge}
                  data-on={counted || undefined}
                  data-subtle={subtle || undefined}
                  data-level="item"
                  {...pulseAttr(0, pulse?.item === l.id)}
                />
                <span className={s.kind} data-kind={l.kind}>
                  {KIND_LABEL[l.kind]}
                </span>
                <span className={s.label}>{l.label}</span>
                <button className={s.act} data-kind={l.kind} tabIndex={-1} disabled={finished} onClick={() => run((sm, c) => act(sm, c, l.id))}>
                  {l.kind === 'reward' ? (l.done ? '받음' : '받기') : finished ? '확인함' : l.kind === 'promo' ? '보기' : '확인'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* 데이터 트리 (수업용 패널) */}
      <aside className={s.tree} data-hidden={!showTree || undefined} aria-hidden={!showTree} data-part="tree">
        <h4>{juice ? '레드닷 트리 — 부모 = 자식의 합 (계산)' : '화면별 플래그 — 따로 켜고 끔'}</h4>
        <ul>
          <li className={s.node} data-depth="0">
            <span>로비</span>
            <em className={s.num}>{total}</em>
          </li>
          {MENUS.map(m => {
            const mb = menuBadge(S, cfg, m.id)
            return [
              <li key={m.id} className={s.node} data-depth="1" data-mismatch={(!juice && mb.on !== mb.count > 0) || undefined}>
                <span>{m.label}</span>
                <em className={s.num}>{juice ? mb.count : `${mb.on ? '켜짐' : '꺼짐'} · 실제 ${mb.count}`}</em>
              </li>,
              ...m.tabs.map(t => {
                const tb = tabBadge(S, cfg, m.id, t.id)
                return (
                  <li key={`${m.id}/${t.id}`} className={s.node} data-depth="2" data-mismatch={(!juice && tb.on !== tb.count > 0) || undefined}>
                    <span>{t.label}</span>
                    <em className={s.num}>{juice ? tb.count : `${tb.on ? '켜짐' : '꺼짐'} · 실제 ${tb.count}`}</em>
                  </li>
                )
              }),
            ]
          })}
        </ul>
        <ol className={s.log}>
          {S.log.map((l, i) => (
            <li key={`${S.version}-${i}`} data-tone={l.tone}>
              {l.text}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

function MenuIcon({ icon }: { icon: 'mail' | 'mission' | 'crew' | 'shop' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {icon === 'mail' && <path d="M3 6h18v12H3z M3 7l9 6 9-6" />}
      {icon === 'mission' && <path d="M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4" />}
      {icon === 'crew' && <path d="M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M16 5a3 3 0 0 1 0 6 M18 14c2 .7 3 3 3 6" />}
      {icon === 'shop' && <path d="M4 9h16l-1.5 10h-13z M8 9V7a4 4 0 0 1 8 0v2" />}
    </svg>
  )
}
