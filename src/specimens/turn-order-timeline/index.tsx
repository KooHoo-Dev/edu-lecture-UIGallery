import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { easeOutCubic } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { bool, num, str } from '../../core/params'
import { ROLE_COLOR, Silhouette } from '../../core/silhouettes'
import type { SpecimenProps } from '../../core/types'
import { DIST, TurnQueue, firstIndex, type Entry, type Unit } from './model'
import s from './style.module.css'

export { meta } from './meta'

/* ───── 배치 상수 (1920×1080) ───── */
// 세로(왼쪽) — 한 줄 260×72, 지금 차례는 1.35배
const V = { x: 44, activeY: 40, start: 196, pitch: 84, min: 70, span: 760, activeScale: 1.35 }
// 가로(위) — 한 칸 120×148, 지금 차례는 1.3배
const H = { y: 46, activeX: 44, start: 250, pitch: 150, min: 112, span: 1500, activeScale: 1.3 }
/** 새 차례가 들어오는 / 끝난 차례가 나가는 방향 거리 */
const ENTER = 90
const BADGE_SEC = 2.2
const CAPTION_SEC = 3.2
const SCENE_FOOT = 562
const SCENE_X: Record<string, number> = { harin: 820, doyun: 640, sera: 1000, droneA: 1400, droneB: 1620 }
const AUTO = ['next', 'haste', 'next', 'next', 'slow', 'next', 'interrupt', 'next', 'next', 'advance', 'next', 'next'] as const

interface Pose {
  x: number
  y: number
  s: number
  o: number
}

interface Item {
  entry: Entry
  index: number
  leaving: boolean
  from: Pose
  to: Pose
  cur: Pose
  t: number
  dur: number
}

interface Badge {
  dir: 'up' | 'down' | 'new'
  n: number
  until: number
}

/**
 * 턴 순서 타임라인 — 전투 큐(model.ts)가 순서를 계산하고, 이 뷰는 결과(preview)만 받아 초상을 배치한다.
 * 같은 차례는 영구 key 를 가져 순서가 바뀌면 같은 초상이 새 자리로 미끄러진다 (LayoutGroup 없이 위치를 직접 계산 + 보간).
 */
export default function TurnOrderTimeline(p: SpecimenProps) {
  const juice = p.juice
  const previewCount = Math.round(num(p.params, 'previewCount', 8))
  const showActionValue = bool(p.params, 'showActionValue', true)
  const slideMs = num(p.params, 'slideMs', 350)
  const spacingMode = str(p.params, 'spacingMode', 'slots')
  const barSide = str(p.params, 'barSide', 'left')
  const vertical = barSide !== 'top'
  const reduced = prefersReducedMotion()

  const cfg = { juice, previewCount, slideMs, spacingMode, vertical, reduced, timeScale: p.timeScale }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const qRef = useRef<TurnQueue | null>(null)
  if (!qRef.current) qRef.current = new TurnQueue()
  const Q = qRef.current

  const st = useRef({
    t: 0,
    items: new Map<string, Item>(),
    order: [] as string[],
    badges: new Map<string, Badge>(),
    caption: null as { text: string; bad: boolean; until: number } | null,
    lastBadgeKey: null as string | null,
    auto: 0,
  })
  const [, setVersion] = useState(0)
  const bump = () => setVersion(v => v + 1)
  const [hover, setHover] = useState<string | null>(null)

  const itemRefs = useRef(new Map<string, HTMLDivElement>())

  /** 큐 결과 → 칸마다 목표 자리. 같은 간격(slots) 또는 행동값 비례(time) */
  const targetsFor = (entries: Entry[]): Pose[] => {
    const c = cfgRef.current
    const n = Math.max(1, entries.length - 1)
    const last = Math.max(1, entries[entries.length - 1]?.av ?? 1)
    return entries.map((e, i) => {
      const active = i === 0
      const sc = active && c.juice ? (c.vertical ? V.activeScale : H.activeScale) : 1
      if (active && !c.juice) return c.vertical ? { x: V.x, y: V.start - V.pitch, s: 1, o: 1 } : { x: H.start - H.pitch, y: H.y, s: 1, o: 1 } // 흔한 실수: 지금 차례도 다른 칸과 똑같이
      if (active) return c.vertical ? { x: V.x, y: V.activeY, s: sc, o: 1 } : { x: H.activeX, y: H.y - 12, s: sc, o: 1 }
      const j = i - 1
      const min = c.vertical ? V.min : H.min
      const span = c.vertical ? V.span : H.span
      // 행동값 비례: 칸마다 최소 간격 + 행동값에 비례한 나머지 — 겹치지 않으면서 '얼마나 기다리는지' 가 거리로 보인다
      const along = c.spacingMode === 'time' ? j * min + e.av * (Math.max(0, span - (n - 1) * min) / last) : j * (c.vertical ? V.pitch : H.pitch)
      return c.vertical ? { x: V.x, y: V.start + along, s: 1, o: 1 } : { x: H.start + along, y: H.y, s: 1, o: 1 }
    })
  }

  /** 모델이 바뀌면 부른다 — 칸마다 지금 자리에서 새 목표로 보간을 시작한다 */
  const relayout = () => {
    const c = cfgRef.current
    const S = st.current
    const entries = Q.preview(c.previewCount)
    const tg = targetsFor(entries)
    // 게임 시간(초) — dt 에 배속이 이미 곱해져 있다. 처음 그릴 때는 보간 없이 제자리에
    const dur = c.juice && !c.reduced && S.items.size > 0 ? c.slideMs / 1000 : 0
    const seen = new Set<string>()
    entries.forEach((e, i) => {
      seen.add(e.key)
      const to = tg[i]
      const it = S.items.get(e.key)
      if (it && !it.leaving) {
        it.entry = e
        it.index = i
        if (Math.abs(it.to.x - to.x) > 0.5 || Math.abs(it.to.y - to.y) > 0.5 || it.to.s !== to.s) {
          it.from = { ...it.cur }
          it.to = to
          it.t = 0
          it.dur = dur
        }
      } else {
        // 새로 보이는 차례: 줄 끝 바깥에서 미끄러져 들어온다 (끼어들기는 바로 그 자리에서 나타난다)
        const off = e.kind === 'extra' ? { x: c.vertical ? -ENTER : 0, y: c.vertical ? 0 : -ENTER } : { x: c.vertical ? 0 : ENTER, y: c.vertical ? ENTER : 0 }
        const from = { x: to.x + off.x, y: to.y + off.y, s: to.s, o: 0 }
        S.items.set(e.key, { entry: e, index: i, leaving: false, from, to, cur: dur ? { ...from } : { ...to }, t: 0, dur })
      }
    })
    // 아직 나가던 칸(이전 이벤트의 것)은 바로 치운다 — 정지 중에 연달아 넘기면 겹쳐 쌓이지 않게
    for (const [key, it] of S.items) if (it.leaving && !seen.has(key)) S.items.delete(key)
    for (const [key, it] of S.items) {
      if (seen.has(key) || it.leaving) continue
      if (!dur) {
        S.items.delete(key)
        continue
      }
      // 끝난 차례는 줄 앞쪽 밖으로, 밀려난 차례는 줄 끝 밖으로 사라진다
      const done = it.index === 0
      const dx = c.vertical ? 0 : done ? -ENTER : ENTER
      const dy = c.vertical ? (done ? -ENTER : ENTER) : 0
      it.leaving = true
      it.from = { ...it.cur }
      it.to = { x: it.cur.x + dx, y: it.cur.y + dy, s: it.cur.s, o: 0 }
      it.t = 0
      it.dur = dur
    }
    S.order = [...S.items.values()].sort((a, b) => Number(a.leaving) - Number(b.leaving) || a.index - b.index).map(x => x.entry.key)
    bump()
  }

  const nameOf = (id: string) => Q.unit(id)?.name ?? id
  const caption = (text: string, bad = false) => {
    st.current.caption = { text, bad, until: st.current.t + CAPTION_SEC }
  }

  /** 미리보기 안 다음 정규 차례 순번. 줄 밖(−1)은 가장 늦은 것으로 본다 (Unity 판의 int.MaxValue 와 같다) */
  const rank = (entries: Entry[], id: string) => {
    const i = firstIndex(entries, id)
    return i < 0 ? Infinity : i
  }
  /** 다음 정규 차례가 가장 늦은 아군 (버프 · 앞당김 대상). 지금 행동 중인 유닛은 빼서 변화가 바로 줄에 보이게 */
  const latestAlly = (entries: Entry[]) => {
    const allies = Q.units.filter(u => u.role === 'ally' && u.id !== Q.active?.unitId)
    return allies.reduce((a, b) => (rank(entries, b.id) > rank(entries, a.id) ? b : a))
  }
  /** 다음 정규 차례가 가장 이른 적 (둔화 대상) — 줄에 보이는 적이 먼저 뽑힌다 */
  const earliestEnemy = (entries: Entry[]) => {
    const enemies = Q.units.filter(u => u.role === 'enemy' && u.id !== Q.active?.unitId)
    return enemies.reduce((a, b) => (rank(entries, b.id) < rank(entries, a.id) ? b : a))
  }

  /** 이벤트 하나 = 모델 바꾸기 → 전후 비교로 바뀐 칸 알림 → 뷰 다시 배치 */
  const handle = (id: string) => {
    const c = cfgRef.current
    const S = st.current
    const before = Q.preview(c.previewCount)
    let target: Unit | null = null
    let text = ''
    if (id === 'next') {
      const r = Q.endTurn()
      const now = Q.active!
      text = `${nameOf(r.ended)} 행동 끝 → ${nameOf(now.unitId)}${now.extra ? ' 끼어들기' : ''} 차례`
      if (r.expired) text += ` · ${nameOf(r.expired)} 속도 변화가 끝나 원래 간격으로`
    } else if (id === 'haste') {
      target = latestAlly(before)
      Q.setSpeedMod(target.id, 0.4, 2)
      text = `${target.name} 속도 +40% (${target.baseSpeed} → ${target.speed}) · 2턴`
    } else if (id === 'slow') {
      target = earliestEnemy(before)
      Q.setSpeedMod(target.id, -0.3, 2)
      text = `${target.name} 둔화 −30% (${target.baseSpeed} → ${target.speed}) · 2턴`
    } else if (id === 'advance') {
      target = latestAlly(before)
      Q.shiftAction(target.id, 0.5)
      text = `${target.name} 행동 50% 앞당김 — 다음 한 번만`
    } else if (id === 'interrupt') {
      const pending = new Set([...Q.extras.map(x => x.unitId), ...(Q.active?.extra ? [Q.active.unitId] : [])])
      const who = ['harin', 'sera', 'doyun'].find(u => !pending.has(u))
      if (!who || Q.extras.length >= 2) {
        caption('끼어들기는 두 개까지 — 먼저 다음 턴을 진행')
        return bump()
      }
      Q.addExtra(who)
      text = `${nameOf(who)} 끼어들기 (추가 행동) — 지금 차례가 끝나면 바로. 정규 차례는 그대로`
    } else if (id === 'reset') {
      Q.reset()
      S.badges.clear()
      S.lastBadgeKey = null
      text = '전투 처음부터 — 모두 같은 거리(10000)에서 출발'
    } else return
    const after = Q.preview(c.previewCount)
    if (c.juice) {
      if (target) {
        // 바뀐 칸 알림: 대상 유닛의 차례마다 몇 칸 움직였는지
        const bi = firstIndex(before, target.id)
        const ai = firstIndex(after, target.id)
        if (bi > 0 && ai > 0 && bi !== ai) text += ` — 다음 차례 ${bi}번째 → ${ai}번째`
        else if (ai > 0 && bi === ai) text += ` — 순서는 그대로, 행동값 ${Math.round(before[bi].av)} → ${Math.round(after[ai].av)}`
        for (const e of after) {
          if (e.unitId !== target.id || e.kind !== 'turn') continue
          const was = before.findIndex(b => b.key === e.key)
          const now = after.indexOf(e)
          const badge: Badge | null = was < 0 ? { dir: 'new', n: 0, until: S.t + BADGE_SEC } : was !== now ? { dir: was > now ? 'up' : 'down', n: Math.abs(was - now), until: S.t + BADGE_SEC } : null
          if (badge) {
            S.badges.set(e.key, badge)
            S.lastBadgeKey = e.key
          }
        }
      } else if (id === 'interrupt') {
        const x = after.find(e => e.kind === 'extra' && !before.some(b => b.key === e.key))
        if (x) {
          S.badges.set(x.key, { dir: 'new', n: 0, until: S.t + BADGE_SEC })
        }
      }
      caption(text)
    }
    relayout()
  }

  useTrigger(p.trigger, handle)
  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.8,
    () => {
      const S = st.current
      handle(AUTO[S.auto++ % AUTO.length])
    },
    p.trigger?.seq,
  )

  // 조절 값(칸 수 · 방향 · 간격 · 효과)이 바뀌면 다시 배치 — 이것도 미끄러진다
  useEffect(() => {
    relayout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewCount, spacingMode, barSide, juice])

  /* ───── 매 프레임 ───── */
  const paint = (dt: number) => {
    const S = st.current
    let removed = false
    for (const [key, it] of S.items) {
      it.t += dt
      const k = it.dur > 0 ? Math.min(1, it.t / it.dur) : 1
      const e = easeOutCubic(k)
      it.cur = {
        x: it.from.x + (it.to.x - it.from.x) * e,
        y: it.from.y + (it.to.y - it.from.y) * e,
        s: it.from.s + (it.to.s - it.from.s) * e,
        o: it.from.o + (it.to.o - it.from.o) * e,
      }
      if (it.leaving && k >= 1) {
        S.items.delete(key)
        removed = true
        continue
      }
      const el = itemRefs.current.get(key)
      if (el) {
        el.style.transform = `translate(${it.cur.x}px, ${it.cur.y}px) scale(${it.cur.s})`
        el.style.opacity = String(it.cur.o)
      }
    }
    let expired = false
    for (const [key, b] of S.badges) if (b.until <= S.t) (S.badges.delete(key), (expired = true))
    if (S.caption && S.caption.until <= S.t) {
      S.caption = null
      expired = true
    }
    if (removed) S.order = S.order.filter(k => S.items.has(k))
    if (removed || expired) bump()
  }
  useGameLoop(p.playing, p.timeScale, dt => {
    st.current.t += dt
    paint(dt)
  })
  useLayoutEffect(() => paint(0))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (p.thumbnail || e.key !== 'Enter' || e.repeat) return
    e.preventDefault()
    e.stopPropagation()
    handle('next')
  }

  /* ───── 렌더 ───── */
  const S = st.current
  const items = S.order.map(k => S.items.get(k)).filter((x): x is Item => !!x)
  const live = items.filter(x => !x.leaving)
  const extraItem = live.find(x => x.entry.extra && x.index > 0)
  const plain = live.filter(x => x.index > 0 && !x.entry.extra)
  const slideKey = S.lastBadgeKey && S.badges.has(S.lastBadgeKey) && live.some(x => x.entry.key === S.lastBadgeKey) ? S.lastBadgeKey : plain[Math.min(1, plain.length - 1)]?.entry.key
  const avKey = live[1] && !(juice && live[1].entry.extra) ? live[1].entry.key : null
  // 해설 5번: 3번째 칸 이후의 첫 적 (앞쪽 칸의 다른 번호와 겹치지 않게)
  const enemies = live.filter(x => Q.unit(x.entry.unitId).role === 'enemy' && x.index > 0)
  const firstEnemy = (enemies.find(x => x.index >= 3) ?? enemies[0] ?? live.find(x => Q.unit(x.entry.unitId).role === 'enemy'))?.entry.key
  const activeId = Q.active?.unitId ?? ''
  const elapsedShown = Math.round(Q.elapsed * 10) / 10

  return (
    <div
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-orient={vertical ? 'v' : 'h'}
      data-spacing={spacingMode}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="턴 순서 타임라인 데모 (Enter 다음 턴)"
      onKeyDown={onKeyDown}
    >
      {/* 전장 */}
      <svg className={s.field} viewBox="0 0 1920 1080" aria-hidden>
        <defs>
          <linearGradient id="tot-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#13202f" />
            <stop offset="1" stopColor="#223447" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="#0b131d" />
        <rect y="480" width="1920" height="600" fill="url(#tot-floor)" />
        <path d="M0 520 H1920" stroke="#ffffff14" strokeWidth="3" />
        {Q.units.map(u => {
          const x = SCENE_X[u.id]
          const on = juice && u.id === activeId
          const hov = juice && hover === u.id
          return (
            <g key={u.id}>
              {(on || hov) && <ellipse className={s.ring} data-hover={(!on && hov) || undefined} cx={x} cy={SCENE_FOOT} rx={92} ry={24} />}
              <Silhouette role={u.role} x={x} y={SCENE_FOOT} height={u.role === 'ally' ? 190 : 165} />
            </g>
          )
        })}
      </svg>

      {/* 전장 위 이름 · 상태 */}
      {Q.units.map(u => {
        const x = SCENE_X[u.id]
        const pending = Q.extras.some(e => e.unitId === u.id)
        return (
          <div key={u.id} className={s.unitTag} style={{ left: x - 120, top: SCENE_FOOT + 22 }} data-role={u.role}>
            <b>{u.name}</b>
            <span className={s.speed}>속도 {u.speed}</span>
            <div className={s.status}>
              {u.modTurns > 0 && <em data-kind={u.modPct > 0 ? 'up' : 'down'}>{u.modPct > 0 ? `▲ 속도 +${Math.round(u.modPct * 100)}%` : `▼ 둔화 −${Math.round(Math.abs(u.modPct) * 100)}%`}</em>}
              {pending && juice && <em data-kind="extra">끼어들기 대기</em>}
            </div>
          </div>
        )
      })}
      {juice && Q.active && (
        <div className={s.actingLabel} style={{ left: SCENE_X[activeId], top: SCENE_FOOT - (Q.unit(activeId).role === 'ally' ? 248 : 222) }}>
          {Q.active.extra ? '끼어들기 행동 중' : '행동 중'}
        </div>
      )}

      {/* 타임라인 바 */}
      <div className={s.bar}>
        {spacingMode === 'time' && (
          <div className={s.axis}>
            <span>{vertical ? '행동값 ↓ (간격 = 기다리는 시간)' : '행동값 → (간격 = 기다리는 시간)'}</span>
          </div>
        )}
      </div>
      {items.map(it => {
        const e = it.entry
        const u = Q.unit(e.unitId)
        // 나가는 칸도 마지막 상태(행동 중)를 그대로 그린다 — '행동값 0' 으로 바뀌면 곧 행동할 칸처럼 읽힌다
        const active = it.index === 0
        const badge = juice ? S.badges.get(e.key) : undefined
        const parts: string[] = []
        if (!it.leaving) {
          if (active) parts.push('active')
          if (extraItem?.entry.key === e.key) parts.push('interrupt')
          else if (e.key === slideKey && !active) parts.push('slide')
        }
        return (
          <div
            key={e.key}
            ref={el => {
              if (el) itemRefs.current.set(e.key, el)
              else itemRefs.current.delete(e.key)
            }}
            className={s.entry}
            data-part={parts[0]}
            data-pin={vertical ? 'right' : 'below'}
            data-role={u.role}
            data-active={active || undefined}
            data-extra={(juice && e.extra) || undefined}
            data-changed={badge ? badge.dir : undefined}
            data-hover={(juice && hover === u.id) || undefined}
            data-leaving={it.leaving || undefined}
            onPointerEnter={() => setHover(u.id)}
            onPointerLeave={() => setHover(h => (h === u.id ? null : h))}
          >
            <div className={s.portrait} data-part={!it.leaving && e.key === firstEnemy ? 'role' : undefined} data-pin={vertical ? 'left' : undefined}>
              <Portrait role={u.role} initial={u.initial} juice={juice} />
              {juice && e.extra && <Bolt />}
            </div>
            <div className={s.info}>
              {juice && <b className={s.name}>{u.short}</b>}
              {juice && active ? (
                <span className={s.chip} data-kind="active">
                  행동 중
                </span>
              ) : juice && e.extra ? (
                <span className={s.chip} data-kind="extra">
                  끼어들기
                </span>
              ) : (
                <span className={s.av} data-hidden={!showActionValue || undefined} data-part={e.key === avKey ? 'av' : undefined} data-pin="right">
                  {Math.round(e.av)}
                </span>
              )}
            </div>
            {badge && (
              <span className={s.badge} data-dir={badge.dir}>
                {badge.dir === 'new' ? (e.extra ? '새로' : '추가') : `${badge.dir === 'up' ? '▲' : '▼'}${badge.n}`}
              </span>
            )}
          </div>
        )
      })}
      {!extraItem && <div className={s.placeholder} data-part="interrupt" style={vertical ? { left: V.x, top: V.start } : { left: H.start, top: H.y }} />}
      {!firstEnemy && <div className={s.placeholder} data-part="role" style={vertical ? { left: V.x, top: V.start + V.pitch } : { left: H.start + H.pitch, top: H.y }} />}
      {!avKey && <span className={s.placeholder} data-part="av" style={vertical ? { left: V.x + 80, top: V.start } : { left: H.start, top: H.y + 110 }} />}

      {/* 무슨 일이 생겼는지 한 줄 */}
      <div className={s.caption} data-show={(juice && !!S.caption) || undefined}>
        {S.caption?.text ?? ''}
      </div>

      {/* 모델 (디버그) */}
      <div className={s.model} aria-label="전투 큐 모델">
        <div className={s.modelHead}>
          <b>모델 · TurnQueue</b>
          <span>디버그 창 · 게임 화면에는 없다</span>
        </div>
        <div className={s.formula}>
          행동값 = 남은 거리 ÷ 속도 <small>기준 {DIST} · 흐른 값 {elapsedShown}</small>
        </div>
        <table>
          <thead>
            <tr>
              <th>유닛</th>
              <th>속도</th>
              <th>남은 거리</th>
              <th>행동값</th>
            </tr>
          </thead>
          <tbody>
            {Q.units.map(u => (
              <tr key={u.id} data-active={u.id === activeId || undefined} data-role={u.role}>
                <td>
                  <i data-role={u.role} />
                  {u.name}
                </td>
                <td data-mod={u.modTurns > 0 ? (u.modPct > 0 ? 'up' : 'down') : undefined}>{u.speed}</td>
                <td>{u.id === activeId && !Q.active?.extra ? '행동 중' : Math.round(u.dist)}</td>
                <td>{u.id === activeId && !Q.active?.extra ? '—' : (u.dist / u.speed).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ───── 초상 ───── */
function Portrait({ role, initial, juice }: { role: 'ally' | 'enemy'; initial: string; juice: boolean }) {
  const c = ROLE_COLOR[role]
  if (!juice) {
    // 흔한 실수: 같은 동그라미에 색만 다르다 — 색각에 따라 아군 · 적을 구분할 수 없다
    return (
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="44" fill={c} />
        <text x="50" y="64" textAnchor="middle" fontSize="40" fontWeight="700" fill="#0b131d">
          {initial}
        </text>
      </svg>
    )
  }
  return role === 'ally' ? (
    <svg viewBox="0 0 100 100" aria-hidden>
      <rect x="5" y="5" width="90" height="90" rx="22" fill="#10202e" stroke={c} strokeWidth="6" />
      <rect x="37" y="18" width="26" height="68" rx="13" fill={c} />
    </svg>
  ) : (
    <svg viewBox="0 0 100 100" aria-hidden>
      <path d="M26 5 H74 L95 26 V74 L74 95 H26 L5 74 V26 Z" fill="#2a1216" stroke={c} strokeWidth="6" strokeLinejoin="round" />
      <path d="M50 18 L80 82 H20 Z" fill={c} />
    </svg>
  )
}

function Bolt() {
  return (
    <svg className={s.bolt} viewBox="0 0 24 24" aria-hidden>
      <path d="M14 1 L4 14 H11 L9 23 L20 9 H13 Z" />
    </svg>
  )
}
