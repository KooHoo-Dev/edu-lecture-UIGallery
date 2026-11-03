import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { MAX_LEVEL, POOL, RARITY_LABEL, draft, makeBuild, stepOf, valueAt, type Build, type Offer } from './draft'
import s from './style.module.css'

export { meta } from './meta'

const MANUAL_PAUSE = 6
const PX = 960
const PY = 640

interface Enemy {
  x: number
  y: number
}

interface Sim {
  t: number
  build: Build
  level: number
  xp: number
  hp: number
  credits: number
  enemies: Enemy[]
  spawnT: number
  shotT: number
  offers: Offer[] | null
  /** 닫힌 뒤에도 마지막 카드를 (숨긴 채) 그려 둔다 — 해설 번호가 가리킬 것이 늘 있게 */
  lastOffers: Offer[]
  /** 카드를 새로 돌린 횟수 (레벨업 · 리롤). 카드 key 에 써서 추방은 그 자리만 다시 나타나게 */
  deal: number
  /** 카드가 나타난 시각 (실제 시간) — 입력 잠금 · 순차 등장 기준 */
  shownAt: number
  /** 자동 데모가 다음 동작까지 기다리기 시작한 시각 */
  autoAt: number
  focus: number
  rerolls: number
  banishes: number
  banishMode: boolean
  seed: number
  picked: { idx: number; at: number } | null
  hurtAt: number
  note: { text: string; bad: boolean; until: number } | null
  autoStep: number
  version: number
}

const START_LEVELS: Record<string, number> = { laser: 3, orbit: 1, shock: 2, frost: 1, armor: 2, magnet: 1 }
const xpNeed = (lv: number) => 8 + lv * 2

/**
 * 레벨업 3택.
 * 레벨이 오르면 세계는 멈추고(게임 시간 0) 카드는 실제 시간으로 차례로 나타난다. 나타난 직후 잠깐은 입력을 막아,
 * 공격 버튼을 연타하던 손이 카드를 잘못 고르지 않게 한다.
 */
export default function UpgradeDraftChoice(p: SpecimenProps) {
  const juice = p.juice
  const choices = Math.round(num(p.params, 'choices', 3))
  const lockMs = juice ? num(p.params, 'inputLockMs', 400) : 0
  const staggerMs = juice && !prefersReducedMotion() ? num(p.params, 'staggerMs', 90) : 0
  const maxRerolls = Math.round(num(p.params, 'rerolls', 2))
  const maxBanishes = Math.round(num(p.params, 'banishes', 1))
  const slotLimit = Math.round(num(p.params, 'slotLimit', 4))
  const showDiff = juice && bool(p.params, 'showDiff', true)
  const pauseGame = juice && bool(p.params, 'pauseGame', true)

  const cfg = { juice, choices, lockMs, slotLimit, pauseGame, maxRerolls, maxBanishes }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) {
    const build: Build = makeBuild(START_LEVELS, slotLimit)
    const offers = draft(build, choices, 58, juice)
    simRef.current = {
      t: 0,
      build,
      level: 7,
      xp: 0,
      hp: 100,
      credits: 0,
      enemies: Array.from({ length: 10 }, (_, i) => ({ x: PX + Math.cos(i * 0.63) * 520, y: PY + Math.sin(i * 0.63) * 300 })),
      spawnT: 0,
      shotT: 0,
      // 첫 화면부터 레벨업 카드 (썸네일 · 해설 번호가 가리킬 것이 보이게)
      // 시드 58: 일반 · 희귀 · 영웅이 한 장씩 — 첫 화면에서 희귀도 차이가 보이게
      offers,
      lastOffers: offers,
      deal: 0,
      shownAt: -10,
      autoAt: 0,
      focus: 0,
      rerolls: maxRerolls,
      banishes: maxBanishes,
      banishMode: false,
      seed: 58,
      picked: null,
      hurtAt: -9,
      note: null,
      autoStep: 0,
      version: 0,
    }
  }
  const S = simRef.current
  S.build.slotLimit = slotLimit
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
  /** 카드를 누른 순간 잠금 중이었는지 — 클릭은 손을 뗄 때 오므로, 잠금 중 누르고 풀린 뒤 떼도 통과하지 않게 */
  const pressLocked = useRef(false)

  // 리롤 · 추방 횟수 값을 바꾸면 바로 반영 (다음 판을 기다리지 않게)
  useEffect(() => {
    S.rerolls = maxRerolls
    S.banishes = maxBanishes
    if (S.banishes <= 0) S.banishMode = false
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRerolls, maxBanishes])

  /* ───── 레벨업 · 고르기 ───── */
  const deal = (offers: Offer[]) => {
    S.offers = offers
    S.lastOffers = offers
    S.deal++
    S.shownAt = S.t
    S.autoAt = S.t
    S.focus = 0
  }
  const levelUp = () => {
    if (S.offers) return
    const c = cfgRef.current
    // 자동 데모: 리롤 · 추방을 다 썼으면 새 판 (빌드 · 횟수 처음으로)
    if (p.autoplay && !p.thumbnail && S.rerolls <= 0 && S.banishes <= 0 && (c.maxRerolls > 0 || c.maxBanishes > 0)) {
      S.build = makeBuild(START_LEVELS, c.slotLimit)
      S.level = 7
      S.rerolls = c.maxRerolls
      S.banishes = c.maxBanishes
      note('새 판 — 빌드와 리롤 · 추방 횟수를 처음으로')
    }
    S.level++
    S.xp = 0
    S.seed++
    deal(draft(S.build, c.choices, S.seed, c.juice))
    S.banishMode = false
    S.picked = null
    touch()
  }
  const locked = () => S.t - S.shownAt < cfgRef.current.lockMs / 1000
  const pick = (idx: number, source: string) => {
    const offers = S.offers
    if (!offers || S.picked) return
    if (locked()) {
      note(`${source} — 나타난 직후라 무시 (입력 잠금)`)
      return
    }
    const o = offers[idx]
    if (!o) return
    if (S.banishMode) return banish(idx)
    if (o.blocked) {
      note(`⚠ "${o.up.name}" — ${o.blocked}. 이번 레벨업 선택이 날아감`, true)
    } else if (source === '연타 입력') {
      note(`⚠ 공격 연타가 그대로 "${o.up.name}" 을(를) 골라 버림 — 카드를 읽지도 못했다`, true)
    } else if (o.level < 0) {
      note(`${o.up.name} 받음`)
    } else {
      note(o.level === 0 ? `${o.up.name} 새로 얻음` : `${o.up.name} Lv ${o.level} → ${o.level + 1}`)
    }
    if (!o.blocked) {
      if (o.level < 0) {
        if (o.up.id === 'heal') S.hp = Math.min(100, S.hp + o.up.per)
        else S.credits += o.up.per
      } else {
        S.build.levels[o.up.id] = o.level + 1
        S.build.values[o.up.id] = Math.round(((S.build.values[o.up.id] ?? 0) + stepOf(o.up, o.rarity)) * 10) / 10
      }
    }
    S.picked = { idx, at: S.t }
    touch()
  }
  const reroll = () => {
    if (!S.offers || S.picked || S.rerolls <= 0) return
    S.rerolls--
    S.seed += 31
    deal(draft(S.build, cfgRef.current.choices, S.seed, cfgRef.current.juice))
    S.banishMode = false
    note(`리롤 — 남은 ${S.rerolls}회`)
  }
  const banish = (idx: number) => {
    if (!S.offers || S.picked || S.banishes <= 0) return
    const o = S.offers[idx]
    if (!o || o.level < 0) {
      note('보상 카드는 추방할 수 없음')
      return
    }
    S.banishes--
    S.build.banished.add(o.up.id)
    S.banishMode = false
    // 그 자리만 새로 뽑는다 (이미 보이는 카드와 겹치지 않게)
    const others = new Set(S.offers.map(x => x.up.id))
    S.seed += 17
    const shown = S.offers.filter((_, i) => i !== idx).map(x => x.up.id)
    const fresh = draft({ ...S.build, banished: new Set([...S.build.banished, ...others]) }, 1, S.seed, cfgRef.current.juice, shown)[0]
    S.offers = S.offers.map((x, i) => (i === idx ? fresh : x))
    S.lastOffers = S.offers
    S.autoAt = S.t
    if (cfgRef.current.juice) note(`${o.up.name} 추방 — 이번 판에 다시 나오지 않음 (남은 ${S.banishes}회)`)
    else note(`⚠ ${o.up.name} 추방 — 하지만 그냥 무작위로 뽑아서 추방한 것도 다시 나온다`, true)
  }

  /* ───── 입력 ───── */
  // 선택지가 떠 있는 동안 조작 키(←/→ · A/D · Enter · Space · R · B)는 늘 먹는다 — 고른 뒤 연타한 Space 가 갤러리 재생/정지로 가지 않게
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail || !S.offers) return
    const n = S.offers.length
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key // Caps Lock · Shift 여도 같은 키
    if (k === 'ArrowLeft' || k === 'a') S.focus = (S.focus + n - 1) % n
    else if (k === 'ArrowRight' || k === 'd') S.focus = (S.focus + 1) % n
    else if (k === 'Enter' || k === ' ') {
      if (!e.repeat) pick(S.focus, 'Enter')
    } else if (k === 'r') reroll()
    else if (k === 'b') {
      if (S.banishes > 0) S.banishMode = !S.banishMode
    } else return
    realAt.current = S.t
    touch()
    sync()
    return true
  })

  const handle = (id: string) => {
    if (id === 'level-up') levelUp()
    else if (id === 'mash') {
      // 공격 버튼(Enter)을 0.08초 간격으로 연타하던 중에 레벨업이 왔다
      if (!S.offers) levelUp()
      S.shownAt = S.t
      S.autoAt = S.t
      mashLeft.current = 5
      mashT.current = 0.04
    } else if (id === 'reroll') reroll()
    else if (id === 'banish') {
      if (S.offers && !S.picked && S.banishes > 0) banish(S.focus)
    }
    touch()
    sync()
  }
  const mashLeft = useRef(0)
  const mashT = useRef(0)
  useTrigger(p.trigger, id => {
    realAt.current = S.t
    handle(id)
  })

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    const c = cfgRef.current
    // 연타 흉내
    if (mashLeft.current > 0) {
      mashT.current -= dt
      if (mashT.current <= 0) {
        mashLeft.current--
        mashT.current = 0.08
        pick(S.focus, '연타 입력')
      }
    }
    // 고른 카드가 날아간 뒤 닫고 게임 재개
    if (S.picked && S.t - S.picked.at > 0.45) {
      S.offers = null
      S.picked = null
      touch()
    }
    // 세계: 카드가 떠 있고 정지 옵션이면 멈춘다 (게임 시간 0)
    const frozen = !!S.offers && c.pauseGame
    const wdt = frozen ? 0 : dt
    if (wdt > 0) {
      S.spawnT -= wdt
      if (S.spawnT <= 0) {
        S.spawnT = 0.6
        const a = (S.t * 2.3) % (Math.PI * 2)
        S.enemies.push({ x: PX + Math.cos(a) * 1000, y: PY + Math.sin(a) * 560 })
      }
      for (const en of S.enemies) {
        const dx = PX - en.x
        const dy = PY - en.y
        const d = Math.hypot(dx, dy) || 1
        en.x += (dx / d) * 120 * wdt
        en.y += (dy / d) * 120 * wdt
      }
      // 닿은 적: 피해
      const hit = S.enemies.filter(en => Math.hypot(en.x - PX, en.y - PY) < 50)
      if (hit.length) {
        S.enemies = S.enemies.filter(en => !hit.includes(en))
        S.hp = Math.max(5, S.hp - hit.length * 6)
        S.hurtAt = S.t
        touch()
      }
      // 자동 공격: 가장 가까운 적을 0.35초마다
      S.shotT -= wdt
      if (S.shotT <= 0 && S.enemies.length) {
        S.shotT = 0.35
        let best = 0
        S.enemies.forEach((en, i) => {
          if (Math.hypot(en.x - PX, en.y - PY) < Math.hypot(S.enemies[best].x - PX, S.enemies[best].y - PY)) best = i
        })
        S.enemies.splice(best, 1)
        if (!S.offers) {
          S.xp++
          if (S.xp >= xpNeed(S.level)) levelUp()
          touch()
        }
      }
    }
    // 자동 데모: 카드가 뜨면 1.6초 보고 고른다 (가끔 리롤 · 추방)
    if (p.autoplay && !p.thumbnail && S.offers && !S.picked && S.t - realAt.current > MANUAL_PAUSE && S.t - S.autoAt > 1.6) {
      const k = S.autoStep++ % 4
      if (k === 1 && S.rerolls > 0) reroll()
      else if (k === 2 && S.banishes > 0 && S.offers[S.offers.length - 1].level >= 0) banish(S.offers.length - 1)
      else pick(Math.min(1, S.offers.length - 1), '자동 데모')
      touch()
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    if (S.hp < 40 && !S.offers) {
      S.hp = 100 // 데모가 끝나지 않게
      touch()
    }
    paint()
    sync()
  })

  const enemyRefs = useRef<(SVGPathElement | null)[]>([])
  const lockRef = useRef<HTMLDivElement>(null)
  const xpRef = useRef<HTMLDivElement>(null)
  const paint = () => {
    enemyRefs.current.forEach((el, i) => {
      const en = S.enemies[i]
      if (!el) return
      el.style.display = en ? '' : 'none'
      if (en) el.setAttribute('transform', `translate(${en.x} ${en.y})`)
    })
    if (lockRef.current) {
      const k = cfgRef.current.lockMs > 0 ? Math.min(1, (S.t - S.shownAt) / (cfgRef.current.lockMs / 1000)) : 1
      lockRef.current.style.transform = `scaleX(${k})`
      lockRef.current.parentElement?.toggleAttribute('data-locked', k < 1)
    }
    if (xpRef.current) xpRef.current.style.transform = `scaleX(${S.offers ? 1 : S.xp / xpNeed(S.level)})`
  }
  useLayoutEffect(paint)

  /* ───── 렌더 ───── */
  const offers = S.offers
  const cardsShown = offers ?? S.lastOffers
  const ts = Math.max(0.05, p.timeScale)
  const weapons = POOL.filter(u => u.kind === 'weapon' && (S.build.levels[u.id] ?? 0) > 0)
  const passives = POOL.filter(u => u.kind === 'passive' && (S.build.levels[u.id] ?? 0) > 0)

  return (
    <div
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-open={!!offers || undefined}
      data-frozen={(!!offers && pauseGame) || undefined}
      data-banish={S.banishMode || undefined}
      style={{ '--ts': ts, '--stagger': `${staggerMs / ts}ms` } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="레벨업 3택 데모 (클릭 또는 ←/→ · Enter, R 리롤, B 추방)"
      onKeyDown={onKeyDown}
      onPointerDown={() => (realAt.current = S.t)}
    >
      {/* 경기장 */}
      <svg className={s.arena} viewBox="0 0 1920 1080" aria-hidden>
        <rect width="1920" height="1080" fill="#1a2b22" />
        {Array.from({ length: 40 }, (_, i) => (
          <circle key={i} cx={(i * 397) % 1920} cy={(i * 241) % 1080} r={3} fill="#ffffff10" />
        ))}
        {Array.from({ length: 40 }, (_, i) => (
          <path
            key={i}
            ref={el => {
              enemyRefs.current[i] = el
            }}
            d="M0 -20 L18 14 L-18 14 Z"
            fill="#ff6b5e"
          />
        ))}
        <rect x={PX - 20} y={PY - 50} width="40" height="100" rx="20" fill="#5ee6c9" data-hurt={S.t - S.hurtAt < 0.2 || undefined} className={s.player} />
      </svg>

      {/* HUD */}
      <div className={s.xp}>
        <span>Lv {S.level}</span>
        <div className={s.xpTrack}>
          <div ref={xpRef} className={s.xpFill} />
        </div>
      </div>
      <div className={s.hp}>
        체력 <b>{Math.round(S.hp)}</b>
        {S.credits > 0 && <span> · 크레딧 {S.credits}</span>}
      </div>
      <div className={s.slots} data-part="slots">
        <SlotRow label="무기" items={weapons.map(u => ({ id: u.id, name: u.name, lv: S.build.levels[u.id] }))} limit={slotLimit} />
        <SlotRow label="보조" items={passives.map(u => ({ id: u.id, name: u.name, lv: S.build.levels[u.id] }))} limit={slotLimit} />
      </div>

      {/* 레벨업 화면 */}
      <div className={s.dim} />
      <div className={s.frozen}>{pauseGame ? '일시정지 — 세계 시간 0' : '게임이 계속 진행 중'}</div>
      <section className={s.draft} aria-hidden={!offers}>
        <h2>
          레벨 업! <span>Lv {S.level}</span>
        </h2>
        <div className={s.lock} data-part="lock">
          <div ref={lockRef} className={s.lockFill} />
          <span>{lockMs > 0 ? `입력 잠금 ${lockMs}ms` : '입력 잠금 없음'}</span>
        </div>
        <div className={s.cards} style={{ '--n': cardsShown.length } as CSSProperties}>
          {cardsShown.map((o, i) => {
            const v = o.level >= 0 ? valueAt(o.up, o.now, o.rarity) : null
            const isNew = o.level === 0
            return (
              <button
                key={`${S.deal}-${i}-${o.up.id}`}
                className={s.card}
                data-rarity={juice ? o.rarity : 'plain'}
                data-focus={S.focus === i || undefined}
                data-picked={S.picked?.idx === i || undefined}
                data-gone={(S.picked && S.picked.idx !== i) || undefined}
                data-part={i === 0 ? 'card' : undefined}
                style={{ '--i': i } as CSSProperties}
                tabIndex={-1}
                disabled={!offers}
                onPointerEnter={() => {
                  S.focus = i
                  touch()
                  sync()
                }}
                onPointerDown={() => {
                  pressLocked.current = locked()
                }}
                onClick={() => {
                  realAt.current = S.t
                  if (pressLocked.current) {
                    pressLocked.current = false
                    note('클릭 — 잠금 중에 누른 입력이라 무시 (입력 잠금)')
                  } else pick(i, '클릭')
                  sync()
                }}
              >
                {juice && (
                  <span className={s.rarity}>
                    <i data-shape={o.rarity} />
                    {RARITY_LABEL[o.rarity]}
                  </span>
                )}
                <span className={s.kind}>{o.up.kind === 'weapon' ? '무기' : '보조'}</span>
                <svg className={s.icon} viewBox="-40 -40 80 80" aria-hidden>
                  <polygon points="0,-34 30,-17 30,17 0,34 -30,17 -30,-17" />
                  <text y="12">{o.up.name.slice(0, 1)}</text>
                </svg>
                <b className={s.name}>{o.up.name}</b>
                <span className={s.level}>
                  {o.level < 0 ? '보상' : isNew ? 'NEW' : juice ? `Lv ${o.level} → ${Math.min(MAX_LEVEL, o.level + 1)}` : `Lv ${o.level + 1}`}
                </span>
                {showDiff && (
                  <span className={s.diff} data-part={i === 0 ? 'diff' : undefined}>
                    {v ? (
                      <>
                        {o.up.stat} <s>{v.now}</s> → <b>{v.next}</b>
                      </>
                    ) : (
                      `${o.up.stat} +${o.up.per}`
                    )}
                  </span>
                )}
                {!showDiff && i === 0 && <span className={s.diff} data-part="diff" data-empty />}
              </button>
            )
          })}
        </div>
        <div className={s.actions} data-part="reroll">
          <button
            tabIndex={-1}
            disabled={!offers || S.rerolls <= 0}
            onClick={() => {
              realAt.current = S.t
              reroll()
              sync()
            }}
          >
            <KeyCap label="R" size={36} /> 리롤 <b>{S.rerolls}</b>
          </button>
          <button
            tabIndex={-1}
            disabled={!offers || S.banishes <= 0}
            data-on={S.banishMode || undefined}
            onClick={() => {
              realAt.current = S.t
              if (S.banishes > 0) S.banishMode = !S.banishMode
              touch()
              sync()
            }}
          >
            <KeyCap label="B" size={36} /> {S.banishMode ? '추방할 카드를 고르세요' : '추방'} <b>{S.banishes}</b>
          </button>
        </div>
      </section>
      {S.note && (
        <div className={s.note} data-bad={S.note.bad || undefined}>
          {S.note.text}
        </div>
      )}
    </div>
  )
}

function SlotRow({ label, items, limit }: { label: string; items: { id: string; name: string; lv: number }[]; limit: number }) {
  return (
    <div className={s.slotRow}>
      <span className={s.slotLabel}>
        {label} {items.length}/{limit}
      </span>
      {Array.from({ length: Math.max(limit, items.length) }, (_, i) => {
        const it = items[i]
        return (
          <span key={i} className={s.slot} data-empty={!it || undefined} title={it?.name}>
            {it ? it.name.slice(0, 1) : ''}
            {it && <em>{it.lv}</em>}
          </span>
        )
      })}
    </div>
  )
}
