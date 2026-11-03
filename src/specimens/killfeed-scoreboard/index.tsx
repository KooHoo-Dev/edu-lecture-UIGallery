import { useEffect, useLayoutEffect, useReducer, useRef, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { PingBars, PrecisionMark, TeamMark, WeaponIcon } from './Icons'
import { FeedQueue, Match, ME, TEAM_NAME, WEAPON_NAME, WIN, other, randomEvent, rng, scoreOf, type FeedConfig, type FeedEvent, type FeedRow, type SortKey, type TeamId } from './model'
import s from './style.module.css'

export { meta } from './meta'

/** 줄 간격 (좋은 예 · 나쁜 예) */
const PITCH = 58
const PITCH_OFF = 44
/** 새 줄 사이 최소 간격 (속도 조절) */
const PACE_MS = 220
/** 이벤트 빈도별 평균 간격 (게임 초) */
const RATE_SEC: Record<string, number> = { calm: 2.6, normal: 1.4, burst: 1.4 }
const BURST_EVERY = 8
/** 사용자가 이벤트를 누르면 자동 이벤트를 이만큼 쉰다 — 방금 만든 줄이 묻히지 않게 */
const USER_QUIET = 5
const AUTO_BOARD_EVERY = 13
const AUTO_BOARD_SEC = 3.5
/** 사람이 보드를 만진 뒤 자동 데모가 보드를 다시 열기까지 */
const HUMAN_IDLE = 8
const TEAMS: TeamId[] = ['orbit', 'surface']
const COLS = [
  { key: 'takedowns', label: '제압' },
  { key: 'assists', label: '지원' },
  { key: 'outs', label: '이탈' },
  { key: 'score', label: '점수' },
  { key: 'ping', label: '핑' },
] as const
const SORT_LABEL: Record<SortKey, string> = { score: '점수', takedowns: '제압', join: '들어온 순서' }

type Owner = 'human' | 'script' | 'event'

/** 받침이 있으면 a, 없으면 b — 나쁜 예의 긴 문장도 문법은 맞게 */
const josa = (w: string, a: string, b: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return w + (c >= 0 && c < 11172 && c % 28 ? a : b)
}

/** 첫 화면(썸네일 포함)부터 피드가 일하는 모습 — 합친 줄 · 내 줄 · 정밀 타격이 하나씩 */
function seed(q: FeedQueue) {
  const ev = (attacker: string, victim: string, weapon: FeedEvent['weapon'], precision = false): FeedEvent => ({ attacker, victim, weapon, precision, assist: null })
  const c = q.cfg
  q.cfg = { ...c, paceMs: 0 }
  q.push(ev('jiho', 'doyun', 'pulse'))
  q.push(ev('sera', 'geonu', 'longshot', true))
  q.push(ev(ME, 'ara', 'scatter'))
  q.push(ev(ME, 'junseo', 'scatter'))
  q.push(ev('seoyeon', 'minjae', 'shock'))
  q.cfg = c
  const left = [1700, 2900, 6400, 6400, 4700]
  q.rows.forEach((r, i) => {
    if (!r.leaving) r.leftMs = Math.min(r.lifeMs, left[i] ?? r.lifeMs)
  })
}

/**
 * 킬 피드 + 누르고 있는 동안만 보이는 스코어보드.
 * 줄 규칙은 model.ts 의 FeedQueue 가, 기록 · 정렬은 Match 가 맡는다. 이 컴포넌트는 결과를 그리기만 한다.
 * 매 프레임 바뀌는 것(줄 투명도)은 ref 로 DOM 을 직접 바꾸고, 줄이 들고 날 때만 다시 렌더한다.
 */
export default function KillfeedScoreboard(p: SpecimenProps) {
  const juice = p.juice
  const maxRows = Math.round(num(p.params, 'maxRows', 5))
  const displayMs = num(p.params, 'displayMs', 5000)
  const eventRate = str(p.params, 'eventRate', 'normal')
  const playersPerTeam = Math.round(num(p.params, 'playersPerTeam', 5))
  const sortBy = str(p.params, 'sortBy', 'score') as SortKey
  const mergeWindowMs = num(p.params, 'mergeWindowMs', 1500)
  const holdMode = str(p.params, 'holdMode', 'hold')
  const reduced = prefersReducedMotion()

  // 효과 끄기(나쁜 예) = 큐가 없는 피드: 줄 수 제한 · 합치기 · 속도 조절 · 내 줄 연장이 모두 없다
  const cfg: FeedConfig = juice
    ? { maxRows, displayMs, mergeWindowMs, paceMs: PACE_MS, mineScale: 1.5 }
    : { maxRows: 99, displayMs, mergeWindowMs: 0, paceMs: 0, mineScale: 1 }

  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const live = useRef({ eventRate, holdMode, autoplay: p.autoplay && !p.thumbnail })
  live.current = { eventRate, holdMode, autoplay: p.autoplay && !p.thumbnail }

  const M = useRef<{ match: Match; q: FeedQueue; r: () => number } | null>(null)
  if (!M.current) {
    const q = new FeedQueue(cfg)
    seed(q)
    M.current = { match: new Match(playersPerTeam), q, r: rng(7) }
  }
  const { match, q, r } = M.current
  match.count = playersPerTeam

  const cfgKey = JSON.stringify(cfg)
  useEffect(() => {
    q.reconfigure(JSON.parse(cfgKey) as FeedConfig)
    rerender()
  }, [cfgKey, q])

  const S = useRef({
    t: 0,
    nextAt: 1.2,
    burstAt: 5,
    quietUntil: 0,
    schedule: [] as { at: number; e: FeedEvent }[],
    board: { open: false, owner: null as Owner | null, until: 0 },
    humanAt: -99,
    boardAt: 6,
    ended: null as null | { team: TeamId; until: number },
    pingAt: 1.5,
  })

  /* ───── 게임 쪽: 이벤트 하나 = 기록 갱신 + 피드에 넣기 ───── */
  const emit = (e: FeedEvent) => {
    const x = S.current
    if (x.ended) return
    match.apply(e)
    q.push(e)
    const won = TEAMS.find(t => match.teamScore(t) >= WIN)
    if (won) x.ended = { team: won, until: x.t + 3 }
  }
  const foe = (t: TeamId) => {
    const list = match.team(t).filter(pl => pl.id !== ME)
    return list[Math.floor(r() * list.length) % list.length]
  }
  /** 몰아치기: 1초 안에 7건. 한 사람이 같은 무기로 연속 제압하고, 나도 한 번 휘말린다 */
  const burst = () => {
    const x = S.current
    const star = foe(r() < 0.5 ? 'orbit' : 'surface')
    const vs = match.team(other(star.team)).filter(pl => pl.id !== ME)
    const list: FeedEvent[] = [
      randomEvent(match, r, { attacker: star.id, victim: vs[0].id, weapon: 'pulse' }),
      randomEvent(match, r),
      randomEvent(match, r, { attacker: star.id, victim: vs[1 % vs.length].id, weapon: 'pulse' }),
      randomEvent(match, r),
      randomEvent(match, r, { attacker: star.id, victim: vs[2 % vs.length].id, weapon: 'pulse' }),
      star.team === 'surface' ? randomEvent(match, r, { attacker: star.id, victim: ME, weapon: 'pulse' }) : randomEvent(match, r, { attacker: ME }),
      randomEvent(match, r),
    ]
    list.forEach((e, i) => x.schedule.push({ at: x.t + i * 0.13, e }))
  }

  /* ───── 스코어보드 열기 · 닫기 ───── */
  const openBoard = (owner: Owner) => Object.assign(S.current.board, { open: true, owner })
  const closeBoard = () => Object.assign(S.current.board, { open: false, owner: null })
  /** 사람이 만졌다: 자동 데모가 연 보드는 닫고, 한동안 다시 열지 않는다 */
  const human = () => {
    const x = S.current
    x.humanAt = x.t
    if (x.board.owner === 'script') closeBoard()
  }
  const press = () => {
    const wasOpen = S.current.board.open && S.current.board.owner !== 'script'
    human()
    if (live.current.holdMode === 'toggle' && wasOpen) closeBoard()
    else openBoard('human')
    rerender()
  }
  const release = () => {
    if (live.current.holdMode === 'hold' && S.current.board.owner === 'human') {
      closeBoard()
      rerender()
    }
  }

  const handle = (id: string) => {
    const x = S.current
    x.quietUntil = x.t + USER_QUIET
    if (id === 'me-takedown') emit({ ...randomEvent(match, r, { attacker: ME, weapon: 'longshot' }), precision: true })
    else if (id === 'me-down') emit(randomEvent(match, r, { attacker: foe('surface').id, victim: ME }))
    else if (id === 'burst') burst()
    else if (id === 'boundary') emit(randomEvent(match, r, { weapon: 'boundary', victim: foe(r() < 0.5 ? 'orbit' : 'surface').id }))
    else if (id === 'board') {
      human()
      if (x.board.open) closeBoard()
      else openBoard('event')
    } else if (id === 'reset') {
      match.reset()
      q.rows = []
      q.pending = []
      q.stats = { merged: 0, pushed: 0 }
      x.schedule = []
      x.ended = null
    }
    rerender()
  }
  useTrigger(p.trigger, handle)

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    const x = S.current
    const L = live.current
    x.t += dt
    let dirty = false
    if (x.schedule.length) {
      const due = x.schedule.filter(e => e.at <= x.t)
      if (due.length) {
        x.schedule = x.schedule.filter(e => e.at > x.t)
        due.forEach(d => emit(d.e))
        dirty = true
      }
    }
    if (L.autoplay && !x.ended && x.t >= x.quietUntil) {
      if (x.t >= x.nextAt) {
        emit(randomEvent(match, r))
        x.nextAt = x.t + (RATE_SEC[L.eventRate] ?? 1.4) * (0.6 + r() * 0.8)
        dirty = true
      }
      if (L.eventRate === 'burst' && x.t >= x.burstAt) {
        burst()
        x.burstAt = x.t + BURST_EVERY
      }
      if (!x.board.open && x.t >= x.boardAt && x.t - x.humanAt > HUMAN_IDLE) {
        openBoard('script')
        x.board.until = x.t + AUTO_BOARD_SEC
        dirty = true
      }
    }
    if (x.board.owner === 'script' && x.t >= x.board.until) {
      closeBoard()
      x.boardAt = x.t + AUTO_BOARD_EVERY
      dirty = true
    }
    if (x.ended && x.t >= x.ended.until) {
      match.reset()
      x.ended = null
      dirty = true
    }
    if (x.t >= x.pingAt) {
      x.pingAt = x.t + 1.5
      for (const pl of match.all) pl.ping = Math.max(12, Math.min(170, pl.ping + Math.round((r() - 0.5) * 12)))
      if (x.board.open) dirty = true
    }
    // 썸네일은 첫 화면(시드 줄)을 그대로 둔다 — 줄이 다 사라진 빈 피드가 카드에 남지 않게
    if (!p.thumbnail && q.tick(dt * 1000)) dirty = true
    if (dirty) rerender()
    paint()
  })

  const rowEls = useRef(new Map<number, HTMLDivElement>())
  const paint = () => {
    for (const rw of q.rows) {
      const el = rowEls.current.get(rw.uid)
      if (el) el.style.opacity = juice ? String(q.alpha(rw)) : '1'
    }
  }
  useLayoutEffect(() => paint())

  /* ───── 입력: Q (Tab 대신) · 화면 버튼 ───── */
  const rootRef = useRef<HTMLDivElement>(null)
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail || e.key.toLowerCase() !== 'q') return
    if (!e.repeat) press() // 누르고 있는 동안 오는 반복 입력은 먹기만 한다
    return true
  })
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.toLowerCase() === 'q') release()
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release() // 누른 채 포커스를 잃으면 닫는다 (키를 뗀 신호가 오지 않는다)
  }
  const onHoldDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    e.preventDefault()
    rootRef.current?.focus({ preventScroll: true })
    press()
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // 손가락이 버튼 밖으로 미끄러져도 뗄 때까지 열림
    } catch {
      /* 합성 이벤트 */
    }
  }

  /* ───── 그리기 ───── */
  const x = S.current
  const boardOpen = x.board.open
  const pitch = juice ? PITCH : PITCH_OFF
  const liveRows = q.rows.filter(rw => !rw.leaving)
  // 해설 번호가 가리킬 줄 — 서로 다른 줄을 고른다 (나쁜 예의 문장 줄에는 칸이 없어 자리 표시로)
  const targets = juice ? liveRows : []
  const mineRow = targets.find(rw => rw.mine)
  const mergeRow = targets.find(rw => rw.victims.length > 1 && rw !== mineRow) ?? targets.find(rw => rw.victims.length > 1)
  // 번호는 칸 위에 붙으므로 가장 위(오래된) 줄을 고른다 — 아래 줄을 고르면 번호가 윗줄에 얹혀 다른 줄을 가리키는 것처럼 보인다
  const colRow = targets.find(rw => rw !== mineRow && rw !== mergeRow) ?? targets[0]
  const scores = { orbit: match.teamScore('orbit'), surface: match.teamScore('surface') }
  const dur = juice && !reduced ? 1 : 0

  const name = (id: string | null) => match.get(id)
  const feedRow = (rw: FeedRow, i: number) => {
    const atk = name(rw.attacker)
    const vicId = rw.victims.includes(ME) ? ME : rw.victims[0]
    const vic = name(vicId)!
    const ref = (el: HTMLDivElement | null) => {
      if (el) rowEls.current.set(rw.uid, el)
      else rowEls.current.delete(rw.uid)
    }
    if (!juice) {
      // 나쁜 예: 문장 한 줄 — 눈이 같은 자리에서 이름 · 무기를 찾을 수 없다
      return (
        <div key={rw.uid} ref={ref} className={s.plain} style={{ top: i * pitch }}>
          {atk ? (
            <>
              <b data-team={atk.team}>{josa(atk.name, '이', '가')}</b> {josa(WEAPON_NAME[rw.weapon], '으로', '로')} <b data-team={vic.team}>{josa(vic.name, '을', '를')}</b> 제압했습니다{rw.precision ? ' (정밀 타격 보너스 +25점)' : ''}
            </>
          ) : (
            <>
              <b data-team={vic.team}>{josa(vic.name, '이', '가')}</b> 훈련 구역 경계 밖으로 나가 이탈 처리되었습니다
            </>
          )}
        </div>
      )
    }
    const extra = rw.victims.length - 1
    return (
      <div
        key={rw.uid}
        ref={ref}
        className={s.row}
        style={{ top: i * pitch }}
        data-mine={rw.mine ?? undefined}
        data-leaving={rw.leaving || undefined}
        data-part={rw === mineRow ? 'my-row' : undefined}
        data-pin="left"
      >
        <span className={s.me}>{rw.mine ? '나' : ''}</span>
        <span className={s.atk}>
          {atk && (
            <>
              <b data-team={atk.team}>{atk.name}</b>
              <i data-team={atk.team}>
                <TeamMark team={atk.team} />
              </i>
            </>
          )}
        </span>
        <span className={s.wpn} data-part={rw === colRow ? 'columns' : undefined}>
          <WeaponIcon id={rw.weapon} />
          {rw.precision && (
            <span className={s.prec}>
              <PrecisionMark />
            </span>
          )}
        </span>
        <span className={s.vic}>
          <i data-team={vic.team}>
            <TeamMark team={vic.team} />
          </i>
          <b data-team={vic.team}>{vic.name}</b>
          {extra > 0 && <em>+{extra}</em>}
        </span>
        <span className={s.multi}>
          {extra > 0 && (
            <b key={rw.bump} data-part={rw === mergeRow ? 'merge' : undefined}>
              ×{extra + 1}
            </b>
          )}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-board={boardOpen || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale), '--k': dur } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="킬 피드 + 스코어보드 데모 (Q 를 누르고 있는 동안 스코어보드)"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
    >
      <Arena />

      {/* 위쪽 가운데: 팀 점수 */}
      <div className={s.top}>
        <span data-team="orbit">
          {juice && <TeamMark team="orbit" size={26} />}
          {TEAM_NAME.orbit} <b>{scores.orbit}</b>
        </span>
        {/* 보드가 닫혀 있을 때 해설 4번은 여기 — 모드 목표는 평소 HUD 에도 작게 남는다 */}
        <span className={s.topMid} data-part={boardOpen ? undefined : 'goal'} data-pin="below">
          {x.ended ? `${TEAM_NAME[x.ended.team]} 승리 — 새 경기` : `먼저 ${WIN}`}</span>
        <span data-team="surface">
          <b>{scores.surface}</b> {TEAM_NAME.surface}
          {juice && <TeamMark team="surface" size={26} />}
        </span>
      </div>

      {/* 오른쪽 위: 킬 피드 */}
      <div className={s.feed}>{q.rows.map(feedRow)}</div>
      {!mineRow && <i className={s.ph} data-part="my-row" data-pin="left" style={{ top: 64 }} />}
      {!colRow && <i className={s.ph} data-part="columns" style={{ top: 64, right: 300 }} />}

      {/* 누르고 있는 동안만: 스코어보드 */}
      <div className={s.board} data-open={boardOpen || undefined} aria-hidden={!boardOpen}>
        {juice ? (
          <div className={s.head}>
            {TEAMS.map(t => (
              <div key={t} className={s.teamBlock} data-team={t}>
                <div className={s.teamName}>
                  <TeamMark team={t} size={30} />
                  {TEAM_NAME[t]}
                  {t === 'orbit' && <small>우리 팀</small>}
                </div>
                <div className={s.toWin} data-part={t === 'orbit' && boardOpen ? 'goal' : undefined}>
                  <span>승리까지</span>
                  <b>{Math.max(0, WIN - scores[t])}</b>
                </div>
                <div className={s.teamScore}>
                  {scores[t]} / {WIN}
                </div>
              </div>
            ))}
            <div className={s.mode}>
              팀 제압전
              <br />
              먼저 {WIN}점
            </div>
          </div>
        ) : (
          <div className={s.headPlain} data-part={boardOpen ? 'goal' : undefined}>
            <span data-team="orbit">{TEAM_NAME.orbit}</span> {scores.orbit} : {scores.surface} <span data-team="surface">{TEAM_NAME.surface}</span>
          </div>
        )}
        {TEAMS.map(t => (
          <table key={t} className={s.table} data-team={t}>
            <thead>
              <tr>
                <th>
                  {juice && <TeamMark team={t} size={22} />}
                  {TEAM_NAME[t]}
                </th>
                {COLS.map(c => (
                  <th key={c.key} data-sort={(juice && c.key === sortBy) || undefined}>
                    {c.label}
                    {juice && c.key === sortBy ? ' ▼' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(juice ? match.sorted(t, sortBy) : match.team(t)).map(pl => (
                <tr key={pl.id} data-me={(juice && pl.id === ME) || undefined}>
                  <td>
                    <span data-team={pl.team}>{pl.name}</span>
                    {juice && pl.id === ME && <em>나</em>}
                  </td>
                  <td data-sort={(juice && sortBy === 'takedowns') || undefined}>{pl.takedowns}</td>
                  <td>{pl.assists}</td>
                  <td>{pl.outs}</td>
                  <td data-sort={(juice && sortBy === 'score') || undefined}>{scoreOf(pl)}</td>
                  <td data-bad={(juice && pl.ping >= 100) || undefined}>
                    {juice && <PingBars ms={pl.ping} />}
                    {pl.ping}
                    {juice && pl.ping >= 100 ? '!' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <div className={s.foot}>
          {juice ? `정렬: ${SORT_LABEL[sortBy]}${sortBy === 'join' ? '' : ' ▼ · 같으면 제압 → 들어온 순서'}` : '정렬 없음 · 들어온 순서'} · 점수 = 제압 100 + 지원 50 + 정밀 25
        </div>
      </div>

      {/* 오른쪽 아래: 누르고 있기 버튼 */}
      <div
        className={s.hold}
        data-part="hold"
        data-on={boardOpen || undefined}
        role="button"
        aria-pressed={boardOpen}
        onPointerDown={onHoldDown}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <KeyCap label="Q" size={52} />
        <div>
          <b>{holdMode === 'hold' ? '누르고 있는 동안 스코어보드' : '눌러서 열고 · 다시 눌러 닫기'}</b>
          <small>실제 게임은 Tab — 웹에서 Tab 은 포커스 이동 키</small>
        </div>
      </div>

      {/* 학습용: 큐 상태 */}
      {!p.thumbnail && (
        <div className={s.debug}>
          <span className={s.debugTitle}>피드 큐</span>
          {juice ? (
            <>
              <span>
                표시 <b>{liveRows.length}</b>/{maxRows}
              </span>
              <span>
                대기 <b>{q.pending.length}</b>
              </span>
              <span data-part={mergeRow ? undefined : 'merge'}>
                합침 <b>{q.stats.merged}</b>
              </span>
              <span>
                밀려남 <b>{q.stats.pushed}</b>
              </span>
            </>
          ) : (
            <span className={s.bad} data-part="merge">
              큐 없음 · 받는 즉시 전부 ({q.rows.length}줄)
            </span>
          )}
        </div>
      )}
      {p.thumbnail && !mergeRow && <i className={s.ph} data-part="merge" style={{ top: 64 }} />}
    </div>
  )
}

/** 배경 — 모의 훈련장 (가볍게) */
function Arena() {
  return (
    <svg className={s.arena} viewBox="0 0 1920 1080" aria-hidden>
      <defs>
        <linearGradient id="kfs-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16222f" />
          <stop offset="1" stopColor="#2a3a4a" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="#0c141d" />
      <path d="M0 470 H1920 V1080 H0 Z" fill="url(#kfs-floor)" />
      {Array.from({ length: 13 }, (_, i) => (
        <path key={i} d={`M${960 + (i - 6) * 70} 470 L${960 + (i - 6) * 360} 1080`} stroke="#ffffff10" strokeWidth="3" />
      ))}
      {[560, 640, 760, 940].map(y => (
        <path key={y} d={`M0 ${y} H1920`} stroke="#ffffff0c" strokeWidth="3" />
      ))}
      <path d="M520 470 h170 v-120 h-170z M1240 470 h220 v-90 h-220z M860 470 h200 v-60 h-200z" fill="#22303f" stroke="#ffffff14" strokeWidth="3" />
      <rect x="300" y="680" width="260" height="90" rx="6" fill="#1d2b39" stroke="#ffffff14" strokeWidth="3" />
      <rect x="1320" y="720" width="300" height="100" rx="6" fill="#1d2b39" stroke="#ffffff14" strokeWidth="3" />
      <path d="M940 1080 l20 -150 l20 150z" fill="#5ad1ff55" />
    </svg>
  )
}
