import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion, requestFlash } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { createInputLock } from '../../core/inputLock'
import { num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import {
  EXCHANGE_ITEM,
  GRADES,
  GRADE_LABEL,
  ITEMS,
  buildTable,
  consolidatedPct,
  drawIndex,
  gradePct,
  itemPct,
  makeRng,
  pct,
  pityRuleText,
  serverPull,
  tailP,
  skewTable,
  type GachaTable,
  type Grade,
  type PityMode,
  type PityState,
} from './model'
import s from './style.module.css'

export { meta } from './meta'

type Phase = 'result' | 'request' | 'tease' | 'reveal' | 'reconnect'
const MANUAL_PAUSE = 6
/** 서버 응답 지연 흉내 (초) */
const LATENCY = 0.35
/** 카드가 엎어진 채 깔리는 시간 (초) */
const DEAL = 0.45
/** 영웅 카드 강조 뒤 추가로 머무는 시간 (초) */
const HERO_HOLD = 0.7
const COUPONS = 120
/** 연타 5번의 누른 시각 — 첫 탭이 마지막 장을 뒤집어 결과를 연 시각부터 0 · 60 · 120 · 180 · 240ms.
 * 프레임 간격과 무관하게 고정해서, 잠금 300ms 이상(모든 프리셋)이면 막히고 0~200ms 로 낮추면 관통한다 */
const MASH_OFFSETS = [0, 0.06, 0.12, 0.18, 0.24]
const START_PULLS = 62
/** 지난 기록 62회. 천장이 그보다 낮으면 규칙상 영웅이 이미 나왔어야 하므로 그만큼 넣는다 */
function startState(pityCount: number) {
  const sinceHero = Math.min(START_PULLS, pityCount - 1)
  const hero = Math.ceil((START_PULLS - sinceHero) / pityCount)
  return {
    pity: { sinceHero, points: START_PULLS } as PityState,
    record: { total: START_PULLS, hero, rare: 8, common: START_PULLS - hero - 8, exchange: 0 },
  }
}
/** 첫 화면: 지난 10회 결과 (희귀 2 · 일반 8) */
const START_CARDS = [7, 9, 3, 8, 10, 11, 5, 7, 9, 8]

const gradeOf = (i: number | null): Grade | null => (i == null ? null : ITEMS[i].grade)
const rank = (g: Grade) => GRADES.indexOf(g)

interface Sim {
  t: number
  phase: Phase
  phaseAt: number
  /** 항목 번호. 나쁜 예는 뒤집을 때 정하므로 그 전까지 null */
  cards: (number | null)[]
  forced: number[]
  flipped: number
  /** 새로 깔 때마다 +1 — 카드 key */
  deal: number
  nextFlipAt: number
  teaseGrade: Grade
  heroCard: number
  flashSeq: number
  nearMiss: number
  coupons: number
  server: PityState
  /** 화면에 보이는 천장 (결과를 다 보여 준 뒤에 갱신 — 카운터가 결과를 먼저 알려 주지 않게) */
  view: PityState
  record: ReturnType<typeof startState>['record']
  sim: { n: number; counts: number[]; pity: PityState }
  log: { text: string; bad: boolean }
  note: { text: string; bad: boolean; until: number } | null
  /** 연타 흉내: 결과가 열린 시각(start)에서 고정 간격(MASH_OFFSETS)으로 누른다 */
  mash: { start: number; k: number } | null
  mashArm: boolean
  reconnectAt: number
  /** 나쁜 예: 재접속 전에 본 카드 이름 */
  before: string[]
  autoStep: number
  autoSkipAt: number
  humanAt: number
  version: number
}

function initial(pityCount: number): Sim {
  const st = startState(pityCount)
  return {
    t: 0,
    phase: 'result',
    phaseAt: -10,
    cards: [...START_CARDS],
    forced: [],
    flipped: START_CARDS.length,
    deal: 0,
    nextFlipAt: 0,
    teaseGrade: 'rare',
    heroCard: -1,
    flashSeq: 0,
    nearMiss: -1,
    coupons: COUPONS,
    server: { ...st.pity },
    view: { ...st.pity },
    record: st.record,
    sim: { n: 0, counts: ITEMS.map(() => 0), pity: { sinceHero: 0, points: 0 } },
    log: { text: '← 서버 응답: 결과 10개 확정 (희귀 2 · 일반 8)', bad: false },
    note: null,
    mash: null,
    mashArm: false,
    reconnectAt: -1,
    before: [],
    autoStep: 0,
    autoSkipAt: -1,
    humanAt: -100,
    version: 0,
  }
}

/**
 * 뽑기 연출 + 확률표 · 천장.
 * 결과는 '서버'(serverPull)가 먼저 정하고, 연출은 받은 결과를 등급 예고 → 한 장씩 뒤집기 순서로 보여 주기만 한다.
 * 확률표 · 천장 문장 · 추첨은 모두 같은 GachaTable 을 읽는다. 효과 끄기 = 다크패턴 모음(표시와 실제가 다른 표 · 천장 숨김 · 건너뛰기 없음 · 클라이언트 추첨 · 거짓 예고 · 잠금 없음).
 */
export default function GachaRevealOdds(p: SpecimenProps) {
  const juice = p.juice
  const heroRatePct = num(p.params, 'heroRatePct', 2)
  const pityCount = Math.round(num(p.params, 'pityCount', 80))
  const pityMode = (str(p.params, 'pityMode', 'guarantee') === 'exchange' ? 'exchange' : 'guarantee') as PityMode
  const teaseMs = num(p.params, 'teaseMs', 900)
  const flipMs = num(p.params, 'flipMs', 420)
  const lockMs = juice ? num(p.params, 'inputLockMs', 400) : 0
  const reduced = prefersReducedMotion()

  // 확률표와 추첨기가 함께 읽는 표 하나. 나쁜 예는 추첨만 '몰래 바꾼 표' 를 읽는다
  const table = useMemo(() => buildTable(heroRatePct, pityMode, pityCount), [heroRatePct, pityMode, pityCount])
  const drawTable = useMemo<GachaTable>(() => (juice ? table : { ...skewTable(table), pityMode: 'exchange' }), [juice, table])

  const cfg = { juice, table, drawTable, teaseMs, flipMs, lockMs }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initial(pityCount)
  const S = simRef.current
  const lock = useRef(createInputLock(lockMs)).current
  lock.setDuration(lockMs)
  const serverRand = useRef(makeRng(2024)).current
  const clientRand = useRef(makeRng(77)).current
  const simRand = useRef(makeRng(9)).current

  const [, setVersion] = useState(0)
  const shown = useRef(S.version)
  const touch = () => S.version++
  const sync = () => {
    if (S.version !== shown.current) {
      shown.current = S.version
      setVersion(S.version)
    }
  }
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 3 }
    touch()
  }
  const human = () => (S.humanAt = S.t)
  const revealing = () => S.phase !== 'result'

  // 표가 바뀌면 지난 시뮬레이션은 다른 표의 것이다 — 비운다
  useEffect(() => {
    S.sim = { n: 0, counts: ITEMS.map(() => 0), pity: { sinceHero: 0, points: 0 } }
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawTable])

  // 연출 도중 효과를 켜고 끄면(정상 ↔ 나쁜 예) 흐름이 섞이지 않게 이번 연출을 그 자리에서 끝낸다
  const lastJuice = useRef(juice)
  useEffect(() => {
    if (lastJuice.current === juice) return
    lastJuice.current = juice
    if (S.phase === 'result') return
    if (!juice) {
      // 정상 → 나쁜 예: 서버 결과는 이미 정해졌으니 기록 · 천장 카운터를 결과 상태로 맞춘다
      S.view = { ...S.server }
      for (const i of S.cards) if (i != null) S.record[ITEMS[i].grade]++
      S.record.total += S.cards.length
    } else {
      // 나쁜 예 → 정상: 기기에서 뒤집을 때 세던 기록에 남은 장을 더한다
      S.cards = S.cards.map(c => {
        if (c != null) return c
        const idx = drawIndex(drawTable, clientRand)
        S.record[ITEMS[idx].grade]++
        S.record.total++
        return idx
      })
    }
    S.flipped = S.cards.length
    S.phase = 'result'
    S.phaseAt = S.t
    S.mash = null
    S.mashArm = false
    S.reconnectAt = -1
    S.autoSkipAt = -1
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juice])

  /* ───── 뽑기 ───── */
  const startPull = (count: number) => {
    if (revealing()) return note('연출 중 — 먼저 끝까지 보거나 건너뛰기')
    if (S.coupons < count) return note(`보급 쿠폰 부족 (${S.coupons}장) — "처음부터" 로 다시 채운다`)
    const c = cfgRef.current
    S.coupons -= count
    S.deal++
    S.flipped = 0
    S.nearMiss = -1
    S.heroCard = -1
    S.before = []
    S.phaseAt = S.t
    if (c.juice) {
      // 서버가 결과 · 천장을 한 번에 정해 돌려준다. 연출은 그 뒤에 시작
      const r = serverPull(c.table, S.server, count, serverRand)
      S.cards = r.items
      S.forced = r.forced
      S.teaseGrade = r.items.reduce<Grade>((best, i) => (rank(ITEMS[i].grade) < rank(best) ? ITEMS[i].grade : best), 'common')
      S.phase = 'request'
      // 내용은 공개가 끝난 뒤에 적는다 — 로그가 결과를 먼저 알려 주지 않게
      S.log = { text: `→ 요청 ${count}회 · ← 응답: 결과 ${count}개 확정 (내용은 공개 뒤에)`, bad: false }
    } else {
      S.cards = Array.from({ length: count }, () => null)
      S.forced = []
      // 결과를 아직 모르니 예고는 근거 없는 연출 — 절반 가까이 '영웅 신호'
      S.teaseGrade = clientRand() < 0.45 ? 'hero' : 'rare'
      S.phase = 'tease'
      S.log = { text: '⚠ 서버 요청 없음 — 카드를 뒤집을 때 이 기기에서 추첨', bad: true }
    }
    touch()
  }

  const toReveal = () => {
    S.phase = 'reveal'
    S.phaseAt = S.t
    S.nextFlipAt = S.t + DEAL
    touch()
  }

  const flipNext = () => {
    const c = cfgRef.current
    const i = S.flipped
    if (i >= S.cards.length) return
    if (!c.juice) {
      // 나쁜 예: 결과가 연출 도중 클라이언트에서 정해진다 (그것도 확률표와 다른 표로)
      const idx = drawIndex(c.drawTable, clientRand)
      S.cards[i] = idx
      const g = ITEMS[idx].grade
      S.record[g]++
      S.record.total++
      if (i === 0 && S.before.length && S.before[0] !== ITEMS[idx].name)
        note(`⚠ 1번 카드: 재접속 전 "${S.before[0]}" → 지금 "${ITEMS[idx].name}". 같은 쿠폰으로 결과가 바뀌었다`, true)
      const last = i === S.cards.length - 1
      if (last && S.teaseGrade === 'hero' && !S.cards.some(x => gradeOf(x) === 'hero')) {
        S.nearMiss = i
        note('⚠ "영웅 신호" 였는데 영웅 없음 — 마지막 장이 금빛으로 떨리다 낮은 등급으로. 거짓 예고 + 아깝게 놓친 연출', true)
      }
    }
    S.flipped++
    const hero = gradeOf(S.cards[i]) === 'hero'
    if (hero) {
      S.heroCard = i
      if (c.juice && !reduced && requestFlash()) S.flashSeq++
    }
    S.nextFlipAt = S.t + c.flipMs / 1000 + (hero && c.juice ? HERO_HOLD : 0)
    if (S.flipped >= S.cards.length) openResult()
    touch()
  }

  const openResult = () => {
    S.phase = 'result'
    S.phaseAt = S.t
    S.mashArm = false
    lock.open(S.t * 1000)
    if (cfgRef.current.juice) {
      // 결과를 다 보여 준 뒤에 기록 · 천장 카운터를 갱신한다 (서버 값은 이미 바뀌어 있다)
      S.view = { ...S.server }
      for (const i of S.cards) if (i != null) {
        S.record[ITEMS[i].grade]++
        S.record.total++
      }
      const n = (g: Grade) => S.cards.filter(i => gradeOf(i) === g).length
      S.log = {
        text: `← 서버 응답: 결과 ${S.cards.length}개 확정 (영웅 ${n('hero')} · 희귀 ${n('rare')} · 일반 ${n('common')})${S.forced.length ? ' · 천장 발동' : ''}`,
        bad: false,
      }
    }
    touch()
  }

  const skip = (source = '건너뛰기') => {
    if (!revealing()) return
    if (!cfgRef.current.juice) return note(`⚠ ${source} — 건너뛰기가 없다. 남은 ${S.cards.length - S.flipped}장을 끝까지 봐야 한다`, true)
    S.flipped = S.cards.length
    openResult()
    note(`${source} — 남은 연출을 한 번에 끝내고 결과 목록으로 (결과는 이미 정해져 있어 그대로)`)
  }

  /** 탭 한 번 = 한 단계 (입력 소비). 결과 화면에서 온 탭은 그 자리의 '10회 뽑기' 버튼을 누른 것 */
  const tap = (source: string, at = S.t) => {
    if (S.phase === 'tease') toReveal()
    else if (S.phase === 'reveal') flipNext()
    else if (S.phase === 'result') pressPull(10, at, source)
  }

  const pressPull = (count: number, pressedAt: number, source: string) => {
    if (lock.blocks(pressedAt * 1000)) return note(`${source} — 결과가 막 열려 무시 (입력 잠금 ${cfgRef.current.lockMs}ms)`)
    if (source === '연타') note(`⚠ 카드를 넘기던 연타가 그대로 "10회 뽑기" 를 눌렀다 — 쿠폰 ${count}장 사용`, true)
    startPull(count)
  }

  const doReconnect = () => {
    const c = cfgRef.current
    S.phase = 'reconnect'
    S.phaseAt = S.t
    if (c.juice) {
      note(`연결 끊김 → 재접속: 서버가 보관한 결과 ${S.cards.length}개를 다시 받아 ${S.flipped + 1}번째 장부터 이어서`)
    } else {
      S.before = S.cards.slice(0, S.flipped).map(i => (i == null ? '' : ITEMS[i].name))
      note(`⚠ 재접속 — 본 ${S.flipped}장이 사라지고 처음부터 다시 추첨된다 (기록에는 이미 들어갔다)`, true)
      S.cards = S.cards.map(() => null)
      S.deal++
      S.flipped = 0
      S.nearMiss = -1
      S.heroCard = -1
    }
    touch()
  }

  const reconnect = () => {
    if (S.phase === 'reconnect') return
    if (S.phase === 'reveal' && S.flipped > 0) return doReconnect()
    if (S.phase === 'result') {
      startPull(10)
      if (S.phase !== 'result') {
        S.reconnectAt = 3
        note('10회 뽑기 — 4번째 카드 앞에서 연결이 끊긴다')
      }
    } else S.reconnectAt = 1
  }

  const simulate = () => {
    const c = cfgRef.current
    const r = serverPull(c.drawTable, S.sim.pity, 1000, simRand)
    for (const i of r.items) S.sim.counts[i]++
    S.sim.n += 1000
    touch()
  }

  const exchange = () => {
    const c = cfgRef.current
    if (!c.juice || c.table.pityMode !== 'exchange' || revealing() || S.server.points < c.table.pityCount) return
    S.server.points -= c.table.pityCount
    S.view = { ...S.server }
    S.cards = [EXCHANGE_ITEM]
    S.deal++
    S.forced = [0]
    S.flipped = 1
    S.heroCard = 0
    S.record.exchange++ // 뽑기 횟수 · 등급 합계와 따로 센다
    S.log = { text: `→ 교환 요청 · ← 응답: ${ITEMS[EXCHANGE_ITEM].name} 지급, 포인트 −${c.table.pityCount}`, bad: false }
    S.phaseAt = S.t
    touch()
  }

  /** 같은 객체를 그대로 두고 값만 처음으로 (닫힌 함수들이 들고 있는 참조가 끊기지 않게) */
  const reset = (text: string) => {
    Object.assign(S, initial(cfgRef.current.table.pityCount), { t: S.t, humanAt: S.humanAt, autoStep: S.autoStep, deal: S.deal + 1, version: S.version + 1 })
    S.note = { text, bad: false, until: S.t + 3 }
  }

  const handle = (id: string) => {
    if (id === 'pull-1') startPull(1)
    else if (id === 'pull-10') startPull(10)
    else if (id === 'skip') {
      if (!revealing()) {
        startPull(10)
        S.autoSkipAt = S.t + 1.2
        note('10회 뽑기 → 1.2초 뒤 건너뛰기')
      } else skip()
    } else if (id === 'mash') {
      if (S.phase === 'result') startPull(10)
      if (revealing()) S.mashArm = true
    } else if (id === 'reconnect') reconnect()
    else if (id === 'simulate') simulate()
    else if (id === 'reset') reset(`처음부터 — 쿠폰 ${COUPONS}장 · 천장 · 기록 · 시뮬레이션 초기화`)
  }
  useTrigger(p.trigger, id => {
    human()
    handle(id)
    touch()
    sync()
  })

  // 자동 데모: 10회 → 1회 → 시뮬레이션 → 건너뛰기 → 재접속 → 연타
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    0.5,
    () => {
      if ((!p.thumbnail && S.t - S.humanAt < MANUAL_PAUSE) || S.phase !== 'result' || S.t - S.phaseAt < 2.4) return
      if (S.coupons < 10) {
        reset('자동 데모 — 쿠폰을 다시 채움')
        sync()
        return
      }
      const step = p.thumbnail ? 0 : S.autoStep++ % 6
      handle(['pull-10', 'pull-1', 'simulate', 'skip', 'reconnect', 'mash'][step])
      if (step === 2) S.phaseAt = S.t // 시뮬레이션 결과를 읽을 시간
      touch()
      sync()
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = cfgRef.current
    if (S.phase === 'request' && S.t - S.phaseAt >= LATENCY) {
      S.phase = 'tease'
      S.phaseAt = S.t
      touch()
    }
    if (S.phase === 'tease' && S.t - S.phaseAt >= c.teaseMs / 1000) toReveal()
    if (S.phase === 'reveal' && S.t >= S.nextFlipAt) flipNext()
    if (S.phase === 'reconnect' && S.t - S.phaseAt >= 0.8) {
      if (c.juice) {
        S.phase = 'reveal'
        S.nextFlipAt = S.t + 0.2
      } else {
        S.phase = 'tease'
        S.teaseGrade = clientRand() < 0.45 ? 'hero' : 'rare'
      }
      S.phaseAt = S.t
      touch()
    }
    if (S.reconnectAt >= 0 && S.phase === 'reveal' && S.flipped >= S.reconnectAt) {
      S.reconnectAt = -1
      doReconnect()
    }
    if (S.autoSkipAt >= 0 && S.t >= S.autoSkipAt) {
      S.autoSkipAt = -1
      skip()
    }
    // 연타 흉내: 마지막 장 앞에서 시작 — 첫 탭이 마지막 장을 뒤집어 결과를 열고, 나머지 넷이 잠금 구간에 떨어진다
    if (S.mashArm && S.phase === 'reveal' && S.flipped >= S.cards.length - 1) {
      S.mashArm = false
      S.mash = { start: S.t, k: 0 }
    }
    while (S.mash && S.t >= S.mash.start + MASH_OFFSETS[S.mash.k]) {
      // 누른 시각은 프레임이 처리한 시각이 아니라 예정된 시각 (createInputLock 은 누른 시각으로 판정)
      tap('연타', S.mash.start + MASH_OFFSETS[S.mash.k])
      if (++S.mash.k >= MASH_OFFSETS.length) S.mash = null
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    paint()
    sync()
  })

  const lockRef = useRef<HTMLDivElement>(null)
  const paint = () => {
    const el = lockRef.current
    if (!el) return
    const k = S.phase === 'result' ? lock.progress(S.t * 1000) : 1
    el.style.setProperty('--k', String(k))
    el.toggleAttribute('data-locked', k < 1)
  }
  useLayoutEffect(paint)

  /* ───── 입력 ───── */
  const pressedAt = useRef(0)
  // 연출 중일 때만 Enter(다음 장) · Esc(건너뛰기)를 먹는다(core/stageKeys). 나머지 키(Space · 숫자 · J …)는 갤러리로 흘려보낸다
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail || !revealing() || e.repeat) return
    // 건너뛰기 버튼에 포커스가 있으면 Enter 는 그 버튼이 처리한다
    if (e.key === 'Enter' && (e.target as HTMLElement).closest('button')) return
    if (e.key === 'Enter') tap('Enter')
    else if (e.key === 'Escape') skip('Esc')
    else return
    human()
    sync()
    return true
  })


  /* ───── 렌더 ───── */
  const X = S
  const busy = X.phase !== 'result'
  const showCards = X.phase === 'reveal' || X.phase === 'result' || (X.phase === 'reconnect' && juice)
  const ts = Math.max(0.05, p.timeScale)
  const flipDur = Math.min(flipMs * 0.8, 420)
  const remain = Math.max(1, table.pityCount - X.view.sinceHero)

  return (
    <div
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-phase={X.phase}
      style={{ '--ts': ts, '--flip': `${(reduced ? 0 : flipDur) / ts}ms` } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="뽑기 연출 데모 (연출 중 탭 · Enter 다음 장, Esc 건너뛰기)"
      onKeyDown={onKeyDown}
      onPointerDown={human}
    >
      <section className={s.main}>
        <header className={s.top}>
          <h2>외곽 탐사대 보급 신호</h2>
          <span className={s.record}>
            누적 <b>{X.record.total}</b>회 · 영웅 <b>{X.record.hero}</b> · 희귀 <b>{X.record.rare}</b> · 일반 <b>{X.record.common}</b>
            {X.record.exchange > 0 && (
              <>
                {' '}
                · 교환 <b>{X.record.exchange}</b>
              </>
            )}
          </span>
          <span className={s.coupon}>
            <svg viewBox="0 0 40 28" aria-hidden>
              <path d="M2 4h36v7a3 3 0 0 0 0 6v7H2v-7a3 3 0 0 0 0-6z" />
            </svg>
            보급 쿠폰 <b>{X.coupons}</b>장
          </span>
        </header>

        <div className={s.stage}>
          {/* 1단계: 등급 예고 — 가장 높은 등급을 색 · 모양 · 글자로 */}
          <div className={s.beam} data-grade={X.teaseGrade} data-on={X.phase === 'request' || X.phase === 'tease' || undefined}>
            <GradeMark grade={X.phase === 'request' ? null : X.teaseGrade} size={220} />
            <b>{X.phase === 'request' ? '서버 응답 대기…' : `${GRADE_LABEL[X.teaseGrade]} 신호`}</b>
            <span>{X.phase === 'request' ? '결과를 먼저 받고 연출을 시작한다' : juice ? '가장 높은 등급 예고 — 탭하면 카드로' : '가장 높은 등급 예고'}</span>
          </div>

          {/* 2단계: 엎어진 카드 뒷면이 등급을, 뒤집으면 항목을 */}
          <div className={s.cards} data-count={X.cards.length} data-on={showCards || undefined} data-part="tease">
            {X.cards.map((idx, i) => {
              const g = gradeOf(idx)
              const up = i < X.flipped
              // 나쁜 예: 영웅이 아직 없으면 마지막 장 뒷면을 금빛으로 — 뒤집기 전까지 '거의 됐다' 는 기대
              const lure = !juice && X.teaseGrade === 'hero' && i === X.cards.length - 1 && !X.cards.some(c => gradeOf(c) === 'hero')
              const back = juice ? g : lure || X.nearMiss === i ? 'hero' : null
              return (
                <div
                  key={`${X.deal}-${i}`}
                  className={s.card}
                  data-flipped={up || undefined}
                  data-back={back ?? 'none'}
                  data-grade={up ? g : undefined}
                  data-burst={(juice && up && X.heroCard === i) || undefined}
                  data-near={(up && X.nearMiss === i) || undefined}
                  style={{ '--i': i } as CSSProperties}
                >
                  <div className={s.inner}>
                    <div className={s.back}>
                      {back ? <GradeMark grade={back} size={80} /> : <span className={s.qmark}>?</span>}
                      {back && <span>{GRADE_LABEL[back]}</span>}
                    </div>
                    <div className={s.face}>
                      {idx != null && (
                        <>
                          <span className={s.badge}>
                            <GradeMark grade={ITEMS[idx].grade} size={28} />
                            {GRADE_LABEL[ITEMS[idx].grade]}
                          </span>
                          <ItemIcon idx={idx} />
                          <b>{ITEMS[idx].name}</b>
                          {X.forced.includes(i) && <em>{table.pityMode === 'exchange' ? '교환' : '천장 확정'}</em>}
                          {X.nearMiss === i && <em className={s.near}>아깝다!</em>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {X.flashSeq > 0 && <div key={X.flashSeq} className={s.flash} />}
          <div className={s.reconnect} data-on={X.phase === 'reconnect' || undefined}>
            연결 끊김 — 재접속 중…
          </div>
          {/* 연출 중에는 화면 어디를 눌러도 다음 장 (탭 한 번 = 한 장) */}
          <div
            className={s.tap}
            data-on={busy || undefined}
            onPointerDown={e => {
              if (p.thumbnail || e.button !== 0) return
              tap('탭')
              sync()
            }}
          />
          <div className={s.hint} data-on={busy || undefined}>
            탭 · <KeyCap label="Enter" size={30} /> 다음 장
            {juice && (
              <>
                {' '}
                · <KeyCap label="Esc" size={30} /> 건너뛰기
              </>
            )}
          </div>
          <button
            className={s.skip}
            data-part="skip"
            data-on={(busy && juice) || undefined}
            tabIndex={busy && juice ? 0 : -1}
            onClick={() => {
              skip()
              sync()
            }}
          >
            건너뛰기 ≫
          </button>
        </div>

        <div className={s.controls}>
          {[1, 10].map(n => (
            <button
              key={n}
              className={s.pull}
              data-big={n === 10 || undefined}
              disabled={busy || X.coupons < n}
              onPointerDown={() => (pressedAt.current = X.t)}
              onClick={e => {
                human()
                // 마우스 · 터치는 누른 시각, 키보드(Enter · Space)는 지금 시각으로 판정
                pressPull(n, e.detail > 0 ? pressedAt.current : X.t, '클릭')
                sync()
              }}
            >
              {n}회 뽑기 <small>쿠폰 {n}</small>
            </button>
          ))}
          <div ref={lockRef} className={s.lock}>
            <i />
            <span>{lockMs > 0 ? `입력 잠금 ${lockMs}ms` : '입력 잠금 없음'}</span>
          </div>
        </div>

        <div className={s.pity} data-part="pity" data-hidden={!juice || undefined}>
          {juice && table.pityMode === 'guarantee' && (
            <>
              <span className={s.pityLabel}>{remain <= 1 ? '다음 1회' : '영웅 확정까지'}</span>
              <b>{remain <= 1 ? '영웅 확정' : `${remain}회`}</b>
              <div className={s.bar}>
                <i style={{ width: `${Math.min(100, (X.view.sinceHero / table.pityCount) * 100)}%` }} />
              </div>
              <small>
                {Math.min(X.view.sinceHero, table.pityCount)} / {table.pityCount}
              </small>
            </>
          )}
          {juice && table.pityMode === 'exchange' && (
            <>
              <span className={s.pityLabel}>교환 포인트</span>
              <b>
                {X.view.points} / {table.pityCount}
              </b>
              <div className={s.bar}>
                <i style={{ width: `${Math.min(100, (X.view.points / table.pityCount) * 100)}%` }} />
              </div>
              <button
                className={s.exchange}
                disabled={busy || X.view.points < table.pityCount}
                onClick={() => {
                  human()
                  exchange()
                  sync()
                }}
              >
                {ITEMS[EXCHANGE_ITEM].name} 교환
              </button>
            </>
          )}
        </div>

        <div className={s.server} data-part="server" data-bad={X.log.bad || (X.deal === 0 && !juice) || undefined}>
          <span>{juice ? '서버' : '기기'}</span>
          {X.deal === 0 && !juice ? '지난 결과 10개 — 이 기기에서 뒤집을 때 추첨했다' : X.log.text}
        </div>
      </section>

      <OddsPanel table={table} juice={juice} sim={X.sim} />

      {X.note && (
        <div className={s.note} data-bad={X.note.bad || undefined}>
          {X.note.text}
        </div>
      )}
    </div>
  )
}

/* ───── 확률표 — 추첨기와 같은 표에서 만든다 ───── */
function OddsPanel({ table, juice, sim }: { table: GachaTable; juice: boolean; sim: Sim['sim'] }) {
  const showPity = juice && table.pityMode === 'guarantee'
  // 시뮬레이션과 비교할 기대값: 정상은 천장을 포함한 종합 확률, 나쁜 예는 표에 적힌 값(그것만 공개됐으니)
  const expectGrade = (g: Grade) => (showPity ? consolidatedPct(table, g) : gradePct(table, g))
  const expectItem = (i: number) => {
    const g = ITEMS[i].grade
    return gradePct(table, g) > 0 ? itemPct(table, i) * (expectGrade(g) / gradePct(table, g)) : 0
  }
  // 표시(기대)와 실제 비교. 여러 줄을 한꺼번에 보면 정직한 표에서도 하나쯤은 우연히 크게 벗어난다(다중 비교).
  // 그래서 등급 3줄 + 기대 횟수 10회 이상인 항목만 보고, 한쪽 꼬리 확률 0.001% 미만일 때만 '우연으로 볼 수 없다' 고 한다
  // (모형 실험: 정직한 표 · 프리셋 3개 · 1,000~3,000회 18,000번 중 잘못 경고 3번. 몰래 바꾼 표는 2,000회에서 약 88%, 3,000회에서 전부 경고)
  const word = showPity ? '기대' : '표시'
  const lines: { text: string; bad: boolean }[] = []
  if (sim.n > 0) {
    const rows = [
      ...GRADES.map(g => ({ name: GRADE_LABEL[g], p: expectGrade(g) / 100, c: ITEMS.reduce((a, it, i) => a + (it.grade === g ? sim.counts[i] : 0), 0) })),
      ...ITEMS.map((it, i) => ({ name: it.name, p: expectItem(i) / 100, c: sim.counts[i] })).filter(r => sim.n * r.p >= 10),
    ].map(r => ({ ...r, tail: tailP(r.c, sim.n, r.p) }))
    const sorted = [...rows].sort((a, b) => a.tail - b.tail)
    const desc = (r: (typeof rows)[number]) => `${r.name}: ${word} ${pct(r.p * 100, r.p < 0.1 ? 3 : 2)} · 실제 ${r.c}회 (${pct((r.c / sim.n) * 100, 2)})`
    for (const r of sorted.slice(0, 2)) if (r.tail < 1e-5) lines.push({ text: `⚠ ${desc(r)} — 우연일 확률 0.001% 미만`, bad: true })
    if (!lines.length) {
      const w = sorted[0]
      lines.push(
        w.tail < 1e-3
          ? { text: `${desc(w)} — 의심스럽지만 아직 표본이 적다. 더 돌려 확인`, bad: false }
          : { text: `가장 큰 차이 ${w.name} — 우연 범위 (이만큼 벗어날 확률 ${w.tail < 0.01 ? '1% 미만' : `${Math.round(w.tail * 100)}%`})`, bad: false },
      )
    }
  } else lines.push({ text: '"1,000회 시뮬레이션" — 같은 추첨 함수를 별도 천장 상태로 돌려 표시와 비교', bad: false })
  return (
    <aside className={s.side}>
      <div className={s.odds} data-part="odds">
        <h3>
          확률 정보 <small>1회 기준 · 항목별</small>
        </h3>
        <div className={s.oddsCols}>
          {GRADES.map(g => (
            <div key={g} className={s.gradeBlock} data-grade={g}>
              <div className={s.gradeRow}>
                <GradeMark grade={g} size={30} />
                <b>{GRADE_LABEL[g]}</b>
                <span>{pct(gradePct(table, g), 2)}</span>
                {showPity && g === 'hero' && <em>천장 포함 {pct(consolidatedPct(table, g), 2)}</em>}
              </div>
              {ITEMS.map((it, i) =>
                it.grade === g ? (
                  <div key={it.id} className={s.itemRow}>
                    <span>{it.name}</span>
                    <span>{pct(itemPct(table, i))}</span>
                  </div>
                ) : null,
              )}
            </div>
          ))}
        </div>
        <p className={s.rule}>{juice ? `천장 — ${pityRuleText(table)}` : '천장 — (안내 없음)'}</p>
        <p className={s.src} data-bad={!juice || undefined}>
          {juice ? (
            <>
              <code>GACHA_TABLE</code> → 확률표 · 천장 문장 · 추첨기
            </>
          ) : (
            <>
              <code>ODDS_TEXT</code> → 확률표 · <code>DROP_WEIGHTS</code> → 추첨기
            </>
          )}
        </p>
      </div>

      <div className={s.sim}>
        <h3>
          시뮬레이션 <b>{sim.n.toLocaleString('ko-KR')}</b>회 <small>{showPity ? '천장 포함 기대 vs 실제' : '표시 vs 실제'}</small>
        </h3>
        {GRADES.map(g => {
          const shown = expectGrade(g)
          const real = sim.n ? (ITEMS.reduce((a, it, i) => a + (it.grade === g ? sim.counts[i] : 0), 0) / sim.n) * 100 : 0
          const max = Math.max(shown, real, 0.01) * 1.15
          return (
            <div key={g} className={s.simRow} data-grade={g}>
              <span className={s.simLabel}>
                <GradeMark grade={g} size={24} />
                {GRADE_LABEL[g]}
              </span>
              <div className={s.simBars}>
                <i className={s.shownBar} style={{ width: `${(shown / max) * 100}%` }} />
                <i className={s.realBar} style={{ width: sim.n ? `${(real / max) * 100}%` : '0%' }} />
              </div>
              <span className={s.simVal}>
                {word} {pct(shown, 2)}
                <br />
                실제 {sim.n ? pct(real, 2) : '—'}
              </span>
            </div>
          )
        })}
        {lines.map(l => (
          <p key={l.text} className={s.simNote} data-bad={l.bad || undefined}>
            {l.text}
          </p>
        ))}
      </div>

    </aside>
  )
}

/* ───── 등급 표시: 색 + 모양 + 글자 (색만으로 구분하지 않는다) ───── */
function GradeMark({ grade, size }: { grade: Grade | null; size: number }) {
  return (
    <svg className={s.mark} data-grade={grade ?? 'wait'} width={size} height={size} viewBox="-50 -50 100 100" aria-hidden>
      {grade === 'hero' && <polygon points="0,-46 13,-15 46,-14 20,7 29,40 0,21 -29,40 -20,7 -46,-14 -13,-15" />}
      {grade === 'rare' && <polygon points="0,-44 40,0 0,44 -40,0" />}
      {grade === 'common' && <circle r="36" />}
      {grade === null && <circle r="36" className={s.waitRing} />}
    </svg>
  )
}

/** 항목 그림 — 첫 글자를 등급 모양 타일에 (비트맵 없이) */
function ItemIcon({ idx }: { idx: number }) {
  const it = ITEMS[idx]
  return (
    <svg className={s.icon} data-grade={it.grade} viewBox="-50 -50 100 100" aria-hidden>
      <rect x="-42" y="-42" width="84" height="84" rx={it.grade === 'common' ? 42 : it.grade === 'rare' ? 10 : 18} transform={it.grade === 'rare' ? 'rotate(45)' : undefined} />
      <text y="14">{it.name.slice(0, 1)}</text>
    </svg>
  )
}
