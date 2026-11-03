import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createCountUp, type CountUp } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { createInputLock, type InputLock } from '../../core/inputLock'
import { num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { CUR_NAME, ENERGY_MAX, PRODUCTS, START, fmt, gemToKrw, packFor, product, remain, won, type Cur, type Product } from './data'
import s from './style.module.css'

export { meta } from './meta'

const CURS: Cur[] = ['credit', 'gem', 'energy']
/** 날아가는 아이콘 풀 크기 (재화 2종 × 최대 16개 + 여유) */
const POOL = 40
const FLY_DUR = 0.7
/** 창이 뜬 뒤 연타가 들어오는 시각(초). 프레임과 무관하게 고정 — 잠금 300ms 이상이면 모두 막히고 0~200ms 면 관통한다 */
const MASH = [0.04, 0.1, 0.16, 0.22, 0.28]
const MANUAL_PAUSE = 6

type Focus = 'cancel' | 'buy'
interface Coin {
  cur: Cur
  start: number
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  /** 이 묶음의 첫 아이콘 — 도착하면 숫자 올리기를 시작한다 */
  lead: number
}
interface Sim {
  t: number
  bal: Record<Cur, number>
  shown: Record<Cur, number>
  count: Partial<Record<Cur, CountUp>>
  pulse: Record<Cur, number>
  gain: Record<Cur, { text: string; until: number; minus: boolean } | null>
  modal: { id: string; openAt: number; focus: Focus; autoCharge: boolean } | null
  paying: { id: string; at: number; delay: number; charge: string | null } | null
  coins: Coin[]
  hlUntil: number
  note: { text: string; bad: boolean; until: number } | null
  mash: { start: number; k: number } | null
  pressAt: number
  spentKrw: number
  log: string
  autoStep: number
  humanAt: number
  version: number
}

function initial(openModal: boolean, dark: boolean): Sim {
  return {
    t: 0,
    bal: { ...START },
    shown: { ...START },
    count: {},
    pulse: { credit: 0, gem: 0, energy: 0 },
    gain: { credit: null, gem: null, energy: null },
    modal: openModal ? { id: 'kit', openAt: 0, focus: dark ? 'buy' : 'cancel', autoCharge: true } : null,
    paying: null,
    coins: [],
    hlUntil: -1,
    note: null,
    mash: null,
    pressAt: -1,
    spentKrw: 0,
    log: '모의 상점 — 실제 결제는 일어나지 않는다',
    autoStep: 0,
    humanAt: -100,
    version: 0,
  }
}

/**
 * 재화 바 · 상점 · 구매 확인 · 획득 피드백.
 * 재화 바는 창이 떠도 맨 위에 남는다(같은 데이터를 읽는 공용 UI). 확인 창은 가격 · 구매 후 잔액 · 청약철회를 보여 주고, 확인 버튼은 누른 시각 기준 입력 잠금.
 * 산 재화는 아이콘이 바로 날아가 도착한 뒤에 숫자가 오른다(core/countup). uiMode=dark 는 '하지 말아야 할 예' — 다크패턴 4가지를 표시와 함께 보여 준다.
 */
export default function CurrencyBarShop(p: SpecimenProps) {
  const juice = p.juice
  const dark = str(p.params, 'uiMode', 'honest') === 'dark'
  const lockMs = num(p.params, 'inputLockMs', 350)
  const flyCount = Math.round(num(p.params, 'flyCount', 8))
  const countUpMs = num(p.params, 'countUpMs', 900)
  const cfg = { juice, dark, lockMs, flyCount, countUpMs }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initial(true, dark)
  const S = simRef.current
  const lockHolder = useRef<InputLock | null>(null)
  if (!lockHolder.current) {
    lockHolder.current = createInputLock(lockMs)
    lockHolder.current.open(0) // 첫 화면의 창도 막 뜬 창이다
  }
  const lock = lockHolder.current
  lock.setDuration(lockMs)

  const [, setVersion] = useState(0)
  const shownVersion = useRef(S.version)
  const touch = () => S.version++
  const sync = () => {
    if (S.version !== shownVersion.current) {
      shownVersion.current = S.version
      setVersion(S.version)
    }
  }
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 3.4 }
    touch()
  }
  const human = () => (S.humanAt = S.t)

  const rootRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef<Partial<Record<Cur, HTMLElement | null>>>({})
  const iconRefs = useRef<Partial<Record<Cur, HTMLElement | null>>>({})
  const numRefs = useRef<Partial<Record<Cur, HTMLElement | null>>>({})
  const gainRefs = useRef<Partial<Record<Cur, HTMLElement | null>>>({})
  const coinRefs = useRef<(HTMLDivElement | null)[]>([])
  const modalIconRef = useRef<HTMLDivElement>(null)
  const lockRef = useRef<HTMLDivElement>(null)

  /** 요소 가운데의 논리 좌표 (무대가 축소돼 있어도 1920×1080 기준) */
  const center = (el: Element | null | undefined) => {
    const root = rootRef.current
    if (!root || !el) return { x: p.width / 2, y: p.height / 2 }
    const r = root.getBoundingClientRect()
    const k = r.width / p.width || 1
    const e = el.getBoundingClientRect()
    return { x: (e.left + e.width / 2 - r.left) / k, y: (e.top + e.height / 2 - r.top) / k }
  }

  /* ───── 재화 변화 ───── */
  const retarget = (cur: Cur) => {
    const c = S.count[cur]
    if (c) S.count[cur] = createCountUp(S.shown[cur], S.bal[cur], cfgRef.current.countUpMs * (1 - c.progress))
  }
  const spend = (cur: Cur, amount: number) => {
    S.bal[cur] -= amount
    S.shown[cur] -= amount // 쓰는 것은 바로 줄인다 (기다릴 이유가 없다)
    retarget(cur)
    if (cfgRef.current.juice) S.gain[cur] = { text: `−${fmt(amount)}`, until: S.t + 1.4, minus: true }
  }
  const grant = (cur: Cur, amount: number, from: { x: number; y: number }, order: number) => {
    const c = cfgRef.current
    S.bal[cur] += amount
    if (!c.juice) {
      // 나쁜 예: 숫자만 바뀐다 — 무엇이 얼마나 들어왔는지 놓친다
      S.shown[cur] = S.bal[cur]
      delete S.count[cur]
      return
    }
    const to = center(iconRefs.current[cur])
    // 동작 줄이기 설정이면 아이콘 하나만 (어디로 들어갔는지는 그대로 보인다)
    const n = prefersReducedMotion() ? 1 : cur === 'energy' ? Math.max(1, Math.round(c.flyCount / 2)) : c.flyCount
    for (let i = 0; i < n; i++) {
      // 2차 베지어: 조절점을 옆 · 위로 흩어 아이콘마다 다른 호를 그린다
      const side = (i % 2 ? 1 : -1) * (120 + ((i * 53) % 160))
      S.coins.push({
        cur,
        start: S.t + order * 0.16 + i * 0.05,
        x0: from.x + ((i * 37) % 60) - 30,
        y0: from.y + ((i * 23) % 40) - 20,
        cx: (from.x + to.x) / 2 + side,
        cy: Math.min(from.y, to.y) + (from.y - to.y) * 0.25 - 60,
        x1: to.x,
        y1: to.y,
        lead: i === 0 ? amount : 0,
      })
    }
  }
  const arrive = (coin: Coin) => {
    const c = cfgRef.current
    S.pulse[coin.cur] = 1
    if (!coin.lead) return
    S.gain[coin.cur] = { text: `+${fmt(coin.lead)}`, until: S.t + 1.8, minus: false }
    if (c.countUpMs <= 0) {
      S.shown[coin.cur] = S.bal[coin.cur]
      delete S.count[coin.cur]
    } else S.count[coin.cur] = createCountUp(S.shown[coin.cur], S.bal[coin.cur], c.countUpMs)
  }
  /** 날아오는 중인 것까지 모두 끝낸다 (효과 끄기 · 처음부터) */
  const flush = () => {
    S.coins = []
    S.count = {}
    S.shown = { ...S.bal }
  }

  /* ───── 확인 창 ───── */
  const shortOf = (pr: Product) => ('cur' in pr.price ? Math.max(0, pr.price.amount - S.bal.gem) : 0)
  const openModal = (id: string) => {
    if (S.paying) return
    S.modal = { id, openAt: S.t, focus: cfgRef.current.dark ? 'buy' : 'cancel', autoCharge: true }
    lock.open(S.t * 1000)
    touch()
  }
  const closeModal = (why?: string) => {
    if (!S.modal || S.paying) return
    S.modal = null
    if (why) note(why)
    touch()
  }

  /** 주 버튼(구매 · 충전 안내) 누름. at = 누른 시각(초) */
  const pressPrimary = (at: number, source: string) => {
    const m = S.modal
    const c = cfgRef.current
    if (!m || S.paying) return
    if (lock.blocks(at * 1000)) return note(`${source} — 창이 막 떠서 무시 (입력 잠금 ${c.lockMs}ms)`)
    const pr = product(m.id)
    const short = shortOf(pr)
    let charge: string | null = null
    if (short > 0) {
      if (!c.dark || !m.autoCharge) {
        S.modal = null
        S.hlUntil = S.t + 3.2
        return note(`결정 ${fmt(short)}개 부족 — 충전 상품을 직접 고른 뒤 다시 산다 (자동 결제 없음)`)
      }
      charge = packFor(short).id
    }
    if (source === '연타') note(`⚠ 창이 뜨자마자 연타가 구매를 눌렀다 (뜬 뒤 ${Math.round((at - m.openAt) * 1000)}ms) — 잠금 ${c.lockMs}ms`, true)
    // 원화 결제(또는 몰래 충전)는 스토어 확인을 기다린다. 그동안 버튼을 막아 두 번 결제되지 않게
    S.paying = { id: m.id, at: S.t, delay: charge || 'krw' in pr.price ? 0.6 : 0.25, charge }
    touch()
  }

  const complete = () => {
    const pay = S.paying
    if (!pay) return
    const pr = product(pay.id)
    const from = center(modalIconRef.current)
    if (pay.charge) {
      const pack = product(pay.charge)
      const krw = 'krw' in pack.price ? pack.price.krw : 0
      S.bal.gem += pack.gives[0].amount
      S.shown.gem += pack.gives[0].amount
      retarget('gem')
      S.spentKrw += krw
      note(`⚠ 부족분 '자동 충전' 으로 ${won(krw)} 결제 — 창에는 원화가 한 번도 보이지 않았다`, true)
    }
    if ('krw' in pr.price) S.spentKrw += pr.price.krw
    else spend('gem', pr.price.amount)
    pr.gives.forEach((g, i) => grant(g.cur, g.amount, from, i))
    S.log = `${pr.name} 구매 완료${pr.items && 'cur' in pr.price ? ` · ${pr.items} → 보관함` : ''} · 이번 시연의 모의 결제 합계 ${won(S.spentKrw)}`
    S.paying = null
    S.modal = null
    touch()
  }

  const reset = () => {
    Object.assign(S, initial(false, cfgRef.current.dark), { t: S.t, humanAt: S.humanAt, autoStep: S.autoStep, version: S.version + 1 })
    note('처음부터 — 크레딧 4,200 · 결정 680 · 에너지 42')
  }

  const affordable = () => (S.bal.gem >= 300 ? 'kit' : S.bal.gem >= 120 ? 'credits' : 'gem60')

  const handle = (id: string) => {
    if (id === 'reset') return reset()
    if (S.paying) return note('결제 확인 중 — 끝날 때까지 다른 입력을 받지 않는다')
    if (id === 'buy') openModal('kit')
    else if (id === 'short') openModal('crate')
    else if (id === 'charge') openModal('gem330')
    else if (id === 'energy') openModal('energy')
    else if (id === 'confirm') {
      if (S.modal) pressPrimary(S.t, '확인')
      else {
        openModal('kit')
        S.pressAt = S.t + cfgRef.current.lockMs / 1000 + 0.15
      }
    } else if (id === 'mash') {
      S.modal = null
      openModal(affordable())
      S.mash = { start: S.t, k: 0 }
      note('창이 뜨는 순간 구매 버튼 자리를 5번 연타 (40 · 100 · 160 · 220 · 280ms)')
    }
  }
  useTrigger(p.trigger, id => {
    human()
    handle(id)
    touch()
    sync()
  })

  // 효과를 끄면 날아오던 것을 그 자리에서 끝낸다 (숫자만 바뀌는 나쁜 예와 섞이지 않게)
  useEffect(() => {
    if (!juice) {
      flush()
      touch()
      sync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juice])
  // 정직 ↔ 다크: 열려 있는 창의 기본 선택도 그 방식대로
  useEffect(() => {
    if (S.modal) S.modal.focus = dark ? 'buy' : 'cancel'
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])

  // 자동 데모: 묶음 구매 → 재화 부족 → 결정 충전 → 에너지 충전 → 연타
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    0.5,
    () => {
      if ((!p.thumbnail && S.t - S.humanAt < MANUAL_PAUSE) || S.paying || S.coins.length || S.mash) return
      if (S.modal) {
        if (S.t - S.modal.openAt > 1.8) pressPrimary(S.t, '자동 데모')
      } else {
        const step = S.autoStep++ % 5
        if (step === 0 && S.bal.gem < 360) reset()
        handle(['buy', 'short', 'charge', 'energy', 'mash'][step])
      }
      touch()
      sync()
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    if (S.paying && S.t - S.paying.at >= S.paying.delay) complete()
    if (S.pressAt >= 0 && S.t >= S.pressAt) {
      S.pressAt = -1
      pressPrimary(S.t, '확인')
    }
    while (S.mash && S.t >= S.mash.start + MASH[S.mash.k]) {
      // 누른 시각은 이 프레임이 아니라 예정된 시각 (createInputLock 은 누른 시각으로 판정)
      const k = S.mash.k
      if (S.modal && !S.paying) pressPrimary(S.mash.start + MASH[k], '연타')
      if (++S.mash.k >= MASH.length) {
        S.mash = null
        if (S.modal && !S.paying) note(`연타 5번 모두 무시됨 — 잠금(${cfgRef.current.lockMs}ms)이 풀린 뒤 한 번 더 눌러야 산다`)
      }
    }
    if (S.coins.length) {
      const left: Coin[] = []
      for (const c of S.coins) {
        if (S.t - c.start >= FLY_DUR) arrive(c)
        else left.push(c)
      }
      if (left.length !== S.coins.length) touch()
      S.coins = left
    }
    for (const cur of CURS) {
      const c = S.count[cur]
      if (c) {
        S.shown[cur] = c.step(dt)
        if (c.done) {
          S.shown[cur] = S.bal[cur]
          delete S.count[cur]
        }
      }
      S.pulse[cur] = Math.max(0, S.pulse[cur] - dt * 5)
    }
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    if (S.hlUntil >= 0 && S.hlUntil <= S.t) {
      S.hlUntil = -1
      touch()
    }
    paint()
    sync()
  })

  const paint = () => {
    for (const cur of CURS) {
      const n = numRefs.current[cur]
      if (n) n.textContent = cur === 'energy' ? `${fmt(S.shown[cur])} / ${ENERGY_MAX}` : fmt(S.shown[cur])
      const slot = slotRefs.current[cur]
      if (slot) {
        slot.style.setProperty('--pulse', String(S.pulse[cur]))
        slot.toggleAttribute('data-counting', !!S.count[cur])
      }
      const g = gainRefs.current[cur]
      const gain = S.gain[cur]
      if (g) {
        const on = !!gain && gain.until > S.t
        if (gain) g.textContent = gain.text
        g.style.opacity = on ? String(Math.min(1, (gain!.until - S.t) / 0.4)) : '0'
        g.toggleAttribute('data-minus', !!gain?.minus)
      }
    }
    for (let i = 0; i < POOL; i++) {
      const el = coinRefs.current[i]
      if (!el) continue
      const c = S.coins[i]
      const k = c ? (S.t - c.start) / FLY_DUR : -1
      if (!c || k < 0) {
        el.style.opacity = '0'
        continue
      }
      // 시작은 느리게, 바에 가까울수록 빠르게 (ease-in) — 바에 '빨려 들어가는' 느낌
      const e = k * k
      const u = 1 - e
      const x = u * u * c.x0 + 2 * u * e * c.cx + e * e * c.x1
      const y = u * u * c.y0 + 2 * u * e * c.cy + e * e * c.y1
      el.dataset.cur = c.cur
      el.style.opacity = '1'
      el.style.transform = `translate(${x}px, ${y}px) scale(${1.15 - 0.45 * e})`
    }
    const lockEl = lockRef.current
    if (lockEl) {
      const k = S.modal ? lock.progress(S.t * 1000) : 1
      lockEl.style.setProperty('--k', String(k))
      lockEl.toggleAttribute('data-locked', k < 1)
    }
    rootRef.current?.querySelectorAll<HTMLElement>('[data-countdown]').forEach(el => {
      const text = el.dataset.countdown === 'lure' ? remain(59 - ((S.t - (S.modal?.openAt ?? 0)) % 60)) : remain(Number(el.dataset.countdown) - S.t)
      if (el.textContent !== text) el.textContent = text
    })
  }
  useLayoutEffect(paint)

  /* ───── 입력 ───── */
  const pressedAt = useRef(0)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const buyRef = useRef<HTMLButtonElement>(null)
  const focusTo = (f: Focus) => {
    if (S.modal && S.modal.focus !== f) {
      S.modal.focus = f
      touch()
      sync()
    }
  }
  // 창이 열려 있을 때만 ← → (선택) · Enter (누름) · Esc (닫기)를 먹는다. 창이 없으면 모든 키를 갤러리로 흘려보낸다
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail || !S.modal) return
    const m = S.modal
    const onButton = !!(e.target as HTMLElement).closest('button')
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      m.focus = m.focus === 'buy' ? 'cancel' : 'buy'
      // 실제 포커스가 창의 버튼에 있으면 같이 옮긴다 (보이는 선택과 Enter 가 누를 버튼이 같게)
      if (onButton) (m.focus === 'buy' ? buyRef : cancelRef).current?.focus()
    } else if (e.key === 'Enter') {
      if (e.repeat) return true
      // 버튼에 포커스가 있으면 그 버튼이 Enter 를 처리한다 (클릭으로 들어온다)
      if (onButton) return
      if (m.focus === 'buy') pressPrimary(S.t, 'Enter')
      else closeModal('취소 — 아무것도 사지 않았다')
    } else if (e.key === 'Escape') closeModal('Esc — 창을 닫았다')
    else return
    human()
    touch()
    sync()
    return true
  })

  /* ───── 렌더 ───── */
  const m = S.modal
  const pr = m ? product(m.id) : PRODUCTS[0]
  const short = shortOf(pr)
  const isKrw = 'krw' in pr.price
  const priceGem = 'cur' in pr.price ? pr.price.amount : 0
  const bundles = PRODUCTS.filter(x => 'cur' in x.price && !x.hidden)
  const packs = PRODUCTS.filter(x => 'krw' in x.price && (dark || !x.anchorOnly))
  if (dark) {
    bundles.sort((a, b) => price(b) - price(a))
    packs.sort((a, b) => price(b) - price(a))
  }
  const hl = S.hlUntil > S.t
  const ts = Math.max(0.05, p.timeScale)
  const pressBuy = (e: React.MouseEvent) => {
    human()
    // 마우스 · 터치는 누른 시각, 키보드(Enter · Space)는 지금 시각으로 판정
    pressPrimary(e.detail > 0 ? pressedAt.current : S.t, '클릭')
    sync()
  }

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-aspect={p.aspect}
      data-dark={dark || undefined}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      style={{ '--ts': ts } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="상점 데모 (확인 창: ← → 선택, Enter 누름, Esc 닫기)"
      onKeyDown={onKeyDown}
      onPointerDown={human}
    >
      {/* ───── 재화 바: 창이 떠도 맨 위에 남는 공용 UI ───── */}
      <header className={s.bar}>
        <h2 className={s.title}>외곽 탐사대 보급 상점</h2>
        {CURS.map(cur => (
          <div
            key={cur}
            ref={el => {
              slotRefs.current[cur] = el
            }}
            className={s.slot}
            data-cur={cur}
            data-part={cur === 'gem' ? 'bar' : cur === 'credit' ? 'fly' : undefined}
            data-pin="below"
          >
            <span
              className={s.slotIcon}
              ref={el => {
                iconRefs.current[cur] = el
              }}
            >
              <CurIcon cur={cur} />
            </span>
            <span className={s.slotName}>{CUR_NAME[cur]}</span>
            <b
              ref={el => {
                numRefs.current[cur] = el
              }}
            >
              {fmt(S.shown[cur])}
            </b>
            {cur !== 'credit' && (
              <button
                className={s.plus}
                aria-label={`${CUR_NAME[cur]} 충전`}
                tabIndex={p.thumbnail ? -1 : 0}
                onClick={() => {
                  human()
                  if (S.paying) return
                  if (cur === 'energy') openModal('energy')
                  else if (dark) openModal('gem6000')
                  else {
                    S.modal = null
                    S.hlUntil = S.t + 3.2
                    note('결정 충전 — 오른쪽 충전 상품에서 직접 고른다')
                  }
                  sync()
                }}
              >
                +
              </button>
            )}
            {cur === 'gem' && dark && <DarkTag text="+ 가 가장 비싼 상품으로" />}
            <i
              className={s.gain}
              ref={el => {
                gainRefs.current[cur] = el
              }}
            />
          </div>
        ))}
      </header>

      <div className={s.strip}>
        {dark ? (
          <>
            <b>하지 말아야 할 예</b> 다크패턴 4가지를 일부러 넣었다 — 가격 숨기기 · 가격 앵커링 · 구매를 기본 선택으로 · 유인 문구
          </>
        ) : (
          <>모의 상점 — 실제 결제 없음 · 가격은 원화 예시 · 결정 1개 ≈ ₩20 (기본 충전 기준)</>
        )}
      </div>

      {/* ───── 진열 ───── */}
      <section className={s.shop}>
        <div className={s.bundles}>
          <h3>
            묶음 상품 {dark && <DarkTag text="가격 숨기기 · 앵커링" />}
          </h3>
          <div className={s.cards}>
            {bundles.map((x, i) => (
              <button
                key={x.id}
                className={s.card}
                data-first={(dark && i === 0) || undefined}
                tabIndex={p.thumbnail || m ? -1 : 0}
                onClick={() => {
                  human()
                  openModal(x.id)
                  sync()
                }}
              >
                <div className={s.tags} data-part={x.id === 'kit' ? 'shelf' : undefined}>
                  {x.was && !dark && <span className={s.sale}>−{Math.round((1 - priceOf(x) / x.was) * 100)}% · 지난주 {fmt(x.was)}</span>}
                  {x.fakeWas && dark && <span className={s.sale}>−{Math.round((1 - priceOf(x) / x.fakeWas) * 100)}%!!</span>}
                  {dark && i === 0 && <span className={s.hot}>인기 1위</span>}
                  {x.endsInSec && (
                    <span className={s.limit}>
                      <ClockIcon /> 남은 <span data-countdown={x.endsInSec}>{remain(x.endsInSec)}</span>
                    </span>
                  )}
                </div>
                <ProductIcon pr={x} />
                <b className={s.cardName}>{x.name}</b>
                <ul className={s.gives}>
                  {x.gives.map(g => (
                    <li key={g.cur}>
                      <CurIcon cur={g.cur} /> {CUR_NAME[g.cur]} {fmt(g.amount)}
                    </li>
                  ))}
                  {x.items && <li>{x.items}</li>}
                </ul>
                <span className={s.price}>
                  {x.was && !dark && <s>{fmt(x.was)}</s>}
                  {x.fakeWas && dark && <s>{fmt(x.fakeWas)}</s>}
                  <CurIcon cur="gem" /> {fmt(priceOf(x))}
                  {!dark && <small>약 {won(gemToKrw(priceOf(x)))}</small>}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.packs} data-hl={hl || undefined}>
          <h3>
            궤도 결정 충전 {dark && <DarkTag text="앵커링" />}
          </h3>
          {packs.map((x, i) => {
            const krw = price(x)
            return (
              <button
                key={x.id}
                className={s.pack}
                data-anchor={(dark && i === 0) || undefined}
                tabIndex={p.thumbnail || m ? -1 : 0}
                onClick={() => {
                  human()
                  openModal(x.id)
                  sync()
                }}
              >
                <ProductIcon pr={x} />
                <span className={s.packName}>
                  <b>{x.name}</b>
                  {x.items && <small>{x.items}</small>}
                  {dark && i === 0 && <em>최고 가치!</em>}
                </span>
                <span className={s.packPrice}>
                  {dark && x.fakeWas && <s>{won(x.fakeWas)}</s>}
                  <b>{won(krw)}</b>
                  {!dark && <small>100개당 {won((krw / x.gives[0].amount) * 100)}</small>}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <footer className={s.log}>
        <span>기록</span>
        {S.log}
      </footer>

      {/* ───── 구매 확인 창 (늘 DOM 에 두고 열고 닫는다) ───── */}
      <div className={s.dim} data-on={!!m || undefined} />
      <div className={s.modal} data-on={!!m || undefined} role="dialog" aria-label="구매 확인">
        {dark && (
          <div className={s.modalStamp}>
            <b>✕</b> 하지 말아야 할 예
          </div>
        )}
        <div className={s.modalHead}>
          <div ref={modalIconRef} className={s.modalIcon}>
            <ProductIcon pr={pr} />
          </div>
          <div>
            <h3>{pr.name}</h3>
            <ul className={s.gives}>
              {pr.gives.map(g => (
                <li key={g.cur}>
                  <CurIcon cur={g.cur} /> {CUR_NAME[g.cur]} {fmt(g.amount)}
                </li>
              ))}
              {pr.items && <li>{pr.items}</li>}
            </ul>
          </div>
        </div>
        {dark && (
          <p className={s.lure}>
            이 창을 닫으면 다시 살 수 없습니다! <span data-countdown="lure">00:00:59</span>
            <DarkTag text="유인 문구 · 가짜 타이머" />
          </p>
        )}
        <dl className={s.rows} data-part="price">
          <dt>가격</dt>
          <dd>
            {isKrw ? (
              <>
                <b>{won(price(pr))}</b> <small>모의 결제</small>
              </>
            ) : (
              <>
                <CurIcon cur="gem" /> <b>{fmt(priceGem)}</b>
                {!dark && <small>약 {won(gemToKrw(priceGem))}</small>}
                {dark && <DarkTag text="실제 가격 숨김" />}
              </>
            )}
          </dd>
          {juice && (
            <>
              <dt>{isKrw ? '받은 뒤' : '구매 후'}</dt>
              <dd data-short={short > 0 || undefined}>
                <CurIcon cur="gem" /> {fmt(S.bal.gem)} →{' '}
                <b>{short > 0 ? `${fmt(short)}개 부족` : fmt(S.bal.gem + (isKrw ? pr.gives[0].amount : -priceGem))}</b>
              </dd>
            </>
          )}
          <dt>청약철회</dt>
          <dd data-refund={pr.refund.ok ? 'ok' : 'no'}>
            <span className={s.refundMark}>{pr.refund.ok ? '✓' : '✕'}</span>
            {pr.refund.text}
          </dd>
        </dl>
        {short > 0 && !dark && (
          <p className={s.shortBox}>
            결정이 <b>{fmt(short)}개</b> 모자란다. 충전 상품을 직접 고른 뒤 다시 산다 — 이 창에서 결제하지 않는다.
          </p>
        )}
        {short > 0 && dark && (
          <label className={s.autoCharge}>
            <input
              type="checkbox"
              checked={m?.autoCharge ?? true}
              tabIndex={p.thumbnail ? -1 : 0}
              onChange={e => {
                if (S.modal) S.modal.autoCharge = e.target.checked
                touch()
                sync()
              }}
            />
            부족분 자동 충전 (결정 {fmt(packFor(short).gives[0].amount)}) <DarkTag text="구매가 기본 선택" />
          </label>
        )}
        <div className={s.actions}>
          <button
            ref={cancelRef}
            className={s.cancel}
            data-focus={m?.focus === 'cancel' || undefined}
            onFocus={() => focusTo('cancel')}
            tabIndex={m && !p.thumbnail ? 0 : -1}
            disabled={!!S.paying}
            onClick={() => {
              human()
              closeModal('취소 — 아무것도 사지 않았다')
              sync()
            }}
          >
            {dark ? '다음에' : '취소'}
          </button>
          <div className={s.buyWrap} data-part="lock">
            <button
              ref={buyRef}
              className={s.buy}
              data-focus={m?.focus === 'buy' || undefined}
              onFocus={() => focusTo('buy')}
              tabIndex={m && !p.thumbnail ? 0 : -1}
              disabled={!!S.paying}
              onPointerDown={() => (pressedAt.current = S.t)}
              onClick={pressBuy}
            >
              {S.paying ? '스토어 확인 중…' : short > 0 && !dark ? '충전 상품 보기' : dark ? '바로 구매!' : isKrw ? `${won(price(pr))} 결제` : '구매'}
            </button>
            <div ref={lockRef} className={s.lock}>
              <i />
              <span>{lockMs > 0 ? `입력 잠금 ${lockMs}ms` : '입력 잠금 없음'}</span>
            </div>
            {dark && <DarkTag text="구매가 기본 선택" />}
          </div>
        </div>
        <p className={s.keys}>
          <KeyCap label="←" size={26} /> <KeyCap label="→" size={26} /> 선택 · <KeyCap label="Enter" size={26} /> 누름 · <KeyCap label="Esc" size={26} /> 닫기
        </p>
      </div>

      {/* ───── 날아가는 아이콘 풀 (만들어 둔 것을 돌려쓴다) ───── */}
      <div className={s.coins} aria-hidden>
        {Array.from({ length: POOL }, (_, i) => (
          <div
            key={i}
            ref={el => {
              coinRefs.current[i] = el
            }}
            className={s.coin}
          >
            <CurIcon cur="credit" />
            <CurIcon cur="gem" />
            <CurIcon cur="energy" />
          </div>
        ))}
      </div>

      {S.note && (
        <div className={s.note} data-bad={S.note.bad || undefined}>
          {S.note.text}
        </div>
      )}
    </div>
  )
}

const price = (x: Product) => ('krw' in x.price ? x.price.krw : x.price.amount)
const priceOf = (x: Product) => ('cur' in x.price ? x.price.amount : 0)

function DarkTag({ text }: { text: string }) {
  return <span className={s.darkTag}>✕ {text}</span>
}

/* ───── 아이콘 (직접 그린 SVG) — 재화마다 색 + 모양이 다르다 ───── */
function CurIcon({ cur }: { cur: Cur }) {
  return (
    <svg className={s.cur} data-cur={cur} viewBox="-20 -20 40 40" aria-hidden>
      {cur === 'credit' && (
        <>
          <circle r="17" />
          <circle r="11" className={s.curInner} />
          <path d="M4 -5a6 6 0 1 0 0 10" className={s.curLine} />
        </>
      )}
      {cur === 'gem' && (
        <>
          <polygon points="0,-18 15,-6 9,16 -9,16 -15,-6" />
          <polyline points="-15,-6 0,0 15,-6 M0,0 0,16" className={s.curLine} />
        </>
      )}
      {cur === 'energy' && <polygon points="4,-18 -12,3 -1,3 -5,18 12,-4 1,-4" />}
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className={s.clock} viewBox="-12 -12 24 24" aria-hidden>
      <circle r="10" />
      <path d="M0 -6V0l4 3" />
    </svg>
  )
}

function ProductIcon({ pr }: { pr: Product }) {
  const gems = 'krw' in pr.price
  const size = gems ? Math.min(4, 1 + Math.floor(Math.log10(pr.gives[0].amount))) : 0
  return (
    <svg className={s.pIcon} data-kind={gems ? 'pack' : pr.id} viewBox="-50 -50 100 100" aria-hidden>
      {gems ? (
        Array.from({ length: size }, (_, i) => (
          <polygon key={i} transform={`translate(${(i - (size - 1) / 2) * 22} ${i % 2 ? 8 : -4}) scale(${1.1 - i * 0.06})`} points="0,-26 21,-9 13,22 -13,22 -21,-9" />
        ))
      ) : (
        <>
          <rect x="-38" y="-18" width="76" height="52" rx="6" />
          <rect x="-42" y="-30" width="84" height="16" rx="4" className={s.pLid} />
          <rect x="-7" y="-30" width="14" height="64" className={s.pBand} />
        </>
      )}
    </svg>
  )
}
