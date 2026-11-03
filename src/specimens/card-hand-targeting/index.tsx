import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { easeInOutSine } from '../../core/countup'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, damp, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import { Silhouette } from '../../core/silhouettes'
import type { SpecimenProps } from '../../core/types'
import {
  CARDS,
  DECK,
  ENEMY_FOOT,
  ENERGY,
  MAX_HAND,
  bezier,
  damageEnemy,
  fanPoses,
  hitCard,
  intentHit,
  intentOf,
  intentTotal,
  makeEnemies,
  previewLoss,
  rng,
  rowPoses,
  shuffle,
  type Card,
  type CardDef,
  type Enemy,
  type Pose,
} from './battle'
import s from './style.module.css'

export { meta } from './meta'

const MANUAL_PAUSE = 6
const CARD_W = 200
const CARD_H = 280
const HAND_CX = 960
const BASE_Y = 925
/** 대상 지정 카드를 든 자리 (손패 위 가운데) */
const AIM: Pose = { x: 790, y: 690, rot: 0, scale: 1.1 } // 왼쪽 적의 체력 · 방어를 가리지 않는 자리
/** 대상이 없는 카드는 이 선 위에서 놓아야 쓴다 */
const PLAY_LINE = 640
const PILE: Pose = { x: 95, y: 1010, rot: -8, scale: 0.35 }
const DISCARD = { x: 1825, y: 1010 }
const END_BTN = { x: 1770, y: 840 }
const PLAYER_X = 380
const ARROW_DOTS = 14
const BAD_GAP = 120
const ENEMY_XMID = 1390

interface Held {
  uid: number
  /** aim = 화살표로 대상 고르기 · drag = 카드째 끌기 */
  mode: 'aim' | 'drag'
  gx: number
  gy: number
  downX: number
  downY: number
  downT: number
  /** 클릭으로 집었다 — 다음 클릭에서 놓는다 */
  sticky: boolean
  /** 키보드로 집었다 — ←/→ 로 대상, Enter 로 확정 */
  kb: boolean
  kbTarget: number
  owner: 'human' | 'script'
}

type Step =
  | { k: 'to'; x: number; y: number; dur: number }
  | { k: 'toCard'; uid: number; dx: number; dur: number }
  | { k: 'toEnemy'; id: string; dx: number; dur: number }
  | { k: 'down'; uid?: number }
  | { k: 'up' }
  | { k: 'wait'; dur: number }
  | { k: 'call'; fn: () => void }
  | { k: 'plan' }

interface Flying {
  card: Card
  from: Pose
  at: number
}

interface Pop {
  id: number
  x: number
  y: number
  text: string
  tone: 'dmg' | 'block' | 'heal' | 'info'
  at: number
}

interface Sim {
  t: number
  version: number
  r: () => number
  uidN: number
  hand: Card[]
  draw: Card[]
  discard: Card[]
  energy: number
  hp: number
  maxHp: number
  block: number
  enemies: Enemy[]
  phase: 'player' | 'enemy' | 'win'
  phaseT: number
  actIdx: number
  turn: number
  /** 호버(마우스) 또는 키보드로 고른 카드 */
  focus: number | null
  held: Held | null
  ptr: { x: number; y: number; inside: boolean }
  /** 지금 화살표 · 카드가 가리키는 적 (미리보기용) */
  aimId: string | null
  /** 대상 없는 카드를 사용선 위로 올렸다 */
  armed: boolean
  flying: Flying[]
  pops: Pop[]
  popN: number
  shake: { uid: number; at: number } | null
  hurtAt: number
  enemyHurt: Record<string, number>
  delay: Record<number, number>
  note: { text: string; bad: boolean; until: number } | null
  script: Step[] | null
  scriptEvent: boolean
  stepT: number
  stepFrom: { x: number; y: number } | null
  stepTo: { x: number; y: number } | null
  vp: { x: number; y: number; down: boolean } | null
  sweptTurn: number
  enemyPick: number
}

/**
 * 카드 손패 부채꼴 + 타겟 화살표 + 적 의도.
 * 손패는 원호 공식으로 직접 배치하고(LayoutGroup 으로는 못 만든다), 호버한 카드는 들어 올려 똑바로 세우고 이웃을 비킨다.
 * 적 하나를 고르는 카드는 화살표로, 대상이 없는 카드는 사용선 위로 끌어서 쓴다. 판정은 늘 '포인터 위치' 로.
 */
export default function CardHandTargeting(p: SpecimenProps) {
  const juice = p.juice
  const handSize = Math.round(num(p.params, 'handSize', 7))
  const fanDeg = num(p.params, 'fanDeg', 22)
  const radius = num(p.params, 'radiusPx', 2000)
  const hoverLift = num(p.params, 'hoverLift', 100)
  const push = num(p.params, 'neighborPush', 50)
  const showIntent = juice && bool(p.params, 'showIntent', true)
  const reduced = prefersReducedMotion()

  const cfg = { juice, handSize, fanDeg, radius, hoverLift, push, showIntent, reduced }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const simRef = useRef<Sim | null>(null)
  if (!simRef.current) simRef.current = initSim(handSize, juice, p.thumbnail ? 'thumb' : p.autoplay ? 'auto' : 'none')
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
  const note = (text: string, bad = false) => {
    S.note = { text, bad, until: S.t + 2.6 }
    touch()
  }
  const pop = (x: number, y: number, text: string, tone: Pop['tone']) => {
    S.pops.push({ id: S.popN++, x, y, text, tone, at: S.t })
    touch()
  }
  const realAt = useRef(-1e9)
  const rootRef = useRef<HTMLDivElement>(null)
  const poses = useRef(new Map<number, Pose>())

  /* ───── 배치 ───── */
  const layout = () => {
    const c = cfgRef.current
    const list = S.hand.filter(x => x.uid !== S.held?.uid)
    const rest = c.juice ? fanPoses(list.length, HAND_CX, BASE_Y, c.fanDeg, c.radius) : rowPoses(list.length, HAND_CX, BASE_Y, BAD_GAP)
    return { list, rest }
  }

  /** 카드마다 가야 할 자세와 쌓는 순서 */
  const targets = () => {
    const c = cfgRef.current
    const { list, rest } = layout()
    const out = new Map<number, Pose & { z: number }>()
    const h = S.phase === 'player' ? list.findIndex(x => x.uid === S.focus) : -1
    list.forEach((card, i) => {
      const r = rest[i]
      let t: Pose & { z: number } = { ...r, z: i }
      if (h >= 0) {
        if (c.juice) {
          if (i === h) {
            // 들어 올려 똑바로 세우고 맨 앞으로 — 화면 밖으로 나가지 않게 x 는 가둔다
            t = { x: clamp(r.x, 160, 1760), y: BASE_Y - c.hoverLift, rot: 0, scale: 1.25, z: 100 }
          } else {
            const d = i - h
            const f = Math.abs(d) === 1 ? 1 : Math.abs(d) === 2 ? 0.5 : 0.25
            t = { ...r, x: r.x + Math.sign(d) * c.push * f, z: i }
          }
        } else if (i === h) {
          t = { ...r, y: r.y - 16, z: i } // 흔한 실수: 조금 들 뿐 쌓는 순서는 그대로 — 오른쪽 카드에 가려 읽을 수 없다
        }
      }
      if ((S.delay[card.uid] ?? 0) > S.t) t = { ...PILE, z: i }
      out.set(card.uid, t)
    })
    const held = S.held
    if (held) {
      if (held.mode === 'aim') out.set(held.uid, { ...AIM, z: 200 })
      else out.set(held.uid, { x: S.ptr.x - held.gx, y: S.ptr.y - held.gy, rot: 0, scale: 1.05, z: 200 })
    }
    return out
  }

  /** 포인터 아래 카드 — 들어 올린 카드는 지금 자리, 나머지는 '원래 자리' 로 판정 (움직이는 카드로 판정하면 경계에서 떨린다) */
  const hoverAt = (x: number, y: number): number | null => {
    if (S.phase !== 'player') return null
    const c = cfgRef.current
    const { list, rest } = layout()
    if (c.juice) {
      const f = list.find(card => card.uid === S.focus)
      const cur = f && poses.current.get(f.uid)
      if (f && cur && hitCard(cur, CARD_W, CARD_H, x, y)) return f.uid
      for (let i = list.length - 1; i >= 0; i--) if (hitCard(rest[i], CARD_W, CARD_H, x, y)) return list[i].uid
      return null
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const cur = poses.current.get(list[i].uid) ?? rest[i]
      if (hitCard(cur, CARD_W, CARD_H, x, y)) return list[i].uid
    }
    return null
  }

  const alive = () => S.enemies.filter(e => e.hp > 0)
  /** 포인터 아래 적 (좋은 예의 판정) */
  const enemyAt = (x: number, y: number) => alive().find(e => Math.abs(x - e.x) <= 100 && y >= 340 && y <= 700) ?? null
  /** 흔한 실수: 끌고 있는 카드 사각형과 처음 겹치는 적 */
  const enemyUnderCard = (cx: number, cy: number) => {
    const hw = (CARD_W * 1.05) / 2
    const hh = (CARD_H * 1.05) / 2
    return alive().find(e => cx + hw >= e.x - 100 && cx - hw <= e.x + 100 && cy + hh >= 340 && cy - hh <= 700) ?? null
  }

  /* ───── 덱 · 카드 사용 ───── */
  const drawCard = (delayIdx = 0) => {
    if (S.hand.length >= MAX_HAND) {
      note(`손패가 가득 참 (최대 ${MAX_HAND}장)`)
      return false
    }
    if (!S.draw.length) {
      S.draw = shuffle(S.discard, S.r)
      S.discard = []
    }
    const card = S.draw.pop()
    if (!card) return false
    S.hand.push(card)
    poses.current.set(card.uid, { ...PILE })
    S.delay[card.uid] = S.t + delayIdx * 0.07
    touch()
    return true
  }
  /** 날아가는 중인 카드를 버린 더미에 바로 넣는다 (곧바로 다시 뽑아야 할 때) */
  const landFlying = () => {
    for (const f of S.flying) S.discard.push(f.card)
    S.flying = []
  }
  const toDiscard = (card: Card) => {
    S.hand = S.hand.filter(x => x.uid !== card.uid)
    if (cfgRef.current.reduced) S.discard.push(card) // 움직임 줄이기: 날아가는 연출 없이
    else S.flying.push({ card, from: { ...(poses.current.get(card.uid) ?? PILE) }, at: S.t })
    if (S.focus === card.uid) S.focus = null
    touch()
  }

  const play = (card: Card, target: Enemy | null): boolean => {
    const c = card.def
    if (c.cost > S.energy) {
      note(`⚠ 에너지 부족 — ${c.cost} 필요, 지금 ${S.energy}. 놓은 뒤에야 알려 준다`, true)
      return false
    }
    S.energy -= c.cost
    toDiscard(card)
    const hitList = c.target === 'all' ? alive() : target ? [target] : []
    if (c.dmg) {
      for (const e of hitList) {
        let lost = 0
        for (let i = 0; i < (c.hits ?? 1); i++) lost += damageEnemy(e, c.dmg)
        if (c.weak) e.weak += c.weak
        S.enemyHurt[e.id] = S.t
        pop(e.x, 400, lost > 0 ? `-${lost}` : '막힘', lost > 0 ? 'dmg' : 'block')
        if (c.weak) pop(e.x, 340, `약화 ${c.weak}턴`, 'info')
      }
    }
    if (c.block) {
      S.block += c.block
      pop(PLAYER_X, 400, `방어 +${c.block}`, 'block')
    }
    if (c.heal) {
      const before = S.hp
      S.hp = Math.min(S.maxHp, S.hp + c.heal)
      pop(PLAYER_X, 400, `+${S.hp - before}`, 'heal')
    }
    if (c.energy) {
      S.energy += c.energy
      pop(150, 760, `에너지 +${c.energy}`, 'info')
    }
    const dead = hitList.filter(e => e.hp <= 0)
    if (dead.length) note(`${dead.map(e => e.name).join(' · ')} 격파`)
    else note(target ? `${c.name} → ${target.name}` : c.name)
    if (!alive().length) {
      S.phase = 'win'
      S.phaseT = S.t + 1.6
      S.focus = null
      note('전투 승리 — 새 적이 다가온다')
    }
    return true
  }

  /* ───── 집기 · 놓기 ───── */
  const grab = (uid: number, x: number, y: number, owner: Held['owner'], kb = false) => {
    if (S.phase !== 'player' || S.held) return
    const card = S.hand.find(c => c.uid === uid)
    if (!card) return
    const c = cfgRef.current
    if (c.juice && card.def.cost > S.energy) {
      // 좋은 예: 집는 순간 거절 — 흔들림 + 이유
      S.shake = { uid, at: S.t }
      note(`에너지가 모자라 쓸 수 없다 (${card.def.cost} 필요 · 지금 ${S.energy})`)
      return
    }
    const cur = poses.current.get(uid) ?? AIM
    const mode = c.juice && card.def.target === 'enemy' ? 'aim' : 'drag'
    const al = alive()
    const mid = al.length ? Math.min(al.length - 1, Math.floor(al.length / 2)) : 0
    S.held = { uid, mode, gx: kb ? 0 : x - cur.x, gy: kb ? 0 : y - cur.y, downX: x, downY: y, downT: performance.now(), sticky: false, kb, kbTarget: mid, owner }
    S.focus = uid
    touch()
  }
  const cancel = (why?: string) => {
    if (!S.held) return
    S.held = null
    S.aimId = null
    S.armed = false
    if (why) note(why)
    touch()
  }
  const release = (x: number, y: number) => {
    const h = S.held
    if (!h) return
    const card = S.hand.find(c => c.uid === h.uid)
    if (!card) return cancel()
    const c = cfgRef.current
    const def = card.def
    S.held = null
    S.aimId = null
    S.armed = false
    touch()
    if (h.mode === 'aim') {
      const e = h.kb ? (alive()[h.kbTarget] ?? null) : enemyAt(x, y)
      if (e) play(card, e)
      else note('대상이 없는 곳에서 놓음 — 카드는 손패로 돌아간다')
      return
    }
    if (c.juice) {
      if (y < PLAY_LINE || h.kb) play(card, null)
      return
    }
    // 흔한 실수: 카드째 끌고, 대상은 '카드 사각형과 먼저 겹친 적'
    if (def.target === 'enemy') {
      const e = enemyUnderCard(x - h.gx, y - h.gy)
      if (!e) return
      const pointed = enemyAt(x, y)
      if (play(card, e) && pointed && pointed.id !== e.id) note(`⚠ 포인터는 ${pointed.name} 위였는데 카드 사각형이 먼저 닿은 ${e.name}에 맞음`, true)
      return
    }
    if (y < 800) play(card, null)
  }

  /* ───── 포인터 (사람 · 자동 데모가 같은 함수를 쓴다) ───── */
  const moveCore = (x: number, y: number) => {
    S.ptr = { x, y, inside: true }
    if (!S.held && S.phase === 'player') {
      const f = hoverAt(x, y)
      if (f !== S.focus) {
        S.focus = f
        touch()
      }
    }
  }
  const downCore = (x: number, y: number, owner: Held['owner'], uid?: number) => {
    if (S.held?.sticky) return release(x, y)
    if (S.held) return
    const u = uid ?? hoverAt(x, y)
    if (u != null) grab(u, x, y, owner)
  }
  const upCore = (x: number, y: number) => {
    const h = S.held
    if (!h || h.sticky || h.kb) return
    if (Math.hypot(x - h.downX, y - h.downY) < 10 && performance.now() - h.downT < 300) {
      h.sticky = true // 클릭해서 집었다 → 다음 클릭에서 놓는다
      touch()
    } else release(x, y)
  }

  const human = () => {
    realAt.current = S.t
    if (S.script) {
      S.script = null
      S.vp = null
      if (S.held?.owner === 'script') cancel()
      touch()
    }
  }
  const toStage = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current?.getBoundingClientRect()
    if (!r || !r.width) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * p.width) / r.width, y: ((e.clientY - r.top) * p.height) / r.height }
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || (e.target as Element).closest('button')) return
    human()
    const { x, y } = toStage(e)
    moveCore(x, y)
    if (e.button === 2) return cancel('취소 — 카드는 손패로')
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 */
    }
    downCore(x, y, 'human')
    sync()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || (S.script && S.scriptEvent)) return
    // 카드를 읽으려고 호버만 해도 사람이 쓰는 중 — 자동 데모가 끼어들지 않게
    human()
    const { x, y } = toStage(e)
    moveCore(x, y)
    sync()
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || S.script || (e.target as Element).closest('button')) return
    const { x, y } = toStage(e)
    upCore(x, y)
    sync()
  }
  const onPointerLeave = () => {
    if (S.script) return
    S.ptr.inside = false
    if (!S.held && S.focus !== null) {
      S.focus = null
      touch()
      sync()
    }
  }

  // 조작 키(A · D · ←/→ · Space · Enter · E)는 무대에 포커스가 있으면 늘 먹는다 — 적 턴이나 빈 손패에서 누른 Space 가 갤러리 재생/정지로 가지 않게.
  // Esc · Backspace 는 카드를 집었을 때만 (아니면 갤러리 발표 모드 해제로)
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const c = cfgRef.current
    const h = S.held
    if (k === 'ArrowLeft' || k === 'a' || k === 'ArrowRight' || k === 'd') {
      const dir = k === 'ArrowLeft' || k === 'a' ? -1 : 1
      if (h?.kb && h.mode === 'aim') {
        const n = alive().length
        h.kbTarget = (h.kbTarget + dir + n) % Math.max(1, n)
      } else if (!h) {
        const { list } = layout()
        if (!list.length) return true
        const i = list.findIndex(x => x.uid === S.focus)
        S.focus = list[i < 0 ? Math.floor(list.length / 2) : (i + dir + list.length) % list.length].uid
      }
    } else if (k === 'Enter' || k === ' ') {
      if (e.repeat) return true
      if (h?.kb) release(0, 0)
      else if (!h && S.focus !== null && S.phase === 'player') {
        const card = S.hand.find(x => x.uid === S.focus)
        if (card) {
          if (card.def.target === 'enemy' && c.juice) grab(card.uid, 0, 0, 'human', true)
          else if (card.def.target === 'enemy') {
            // 흔한 실수: 키보드로는 대상을 고를 방법이 없어 늘 첫 번째 적
            const first = alive()[0] ?? null
            if (play(card, first) && first && alive().length > 1) note(`⚠ 키보드로는 대상을 못 고른다 — 늘 첫 번째 적(${first.name})`, true)
          } else if (!c.juice || card.def.cost <= S.energy) play(card, null)
          else grab(card.uid, 0, 0, 'human', true)
        }
      }
    } else if (k === 'Escape' || k === 'Backspace') {
      if (!h) return
      cancel('취소 — 카드는 손패로')
    } else if (k === 'e') endTurn()
    else return
    human()
    touch()
    sync()
    return true
  })

  /* ───── 턴 ───── */
  const endTurn = () => {
    if (S.phase !== 'player') return
    cancel()
    for (const card of [...S.hand]) toDiscard(card)
    for (const e of S.enemies) e.block = 0 // 적의 방어는 적 턴이 시작될 때 사라진다
    S.phase = 'enemy'
    S.actIdx = 0
    S.phaseT = S.t + 0.45
    S.focus = null
    note('턴 종료 — 적이 의도대로 행동한다')
  }
  /** advance = false: 새 적이라 의도를 처음부터 */
  const startTurn = (advance = true) => {
    landFlying()
    S.turn++
    if (advance) for (const e of S.enemies) e.step++
    S.block = 0 // 내 방어는 내 턴이 시작될 때 사라진다
    S.energy = ENERGY
    S.phase = 'player'
    for (let i = 0; i < cfgRef.current.handSize; i++) if (!drawCard(i)) break
    touch()
  }
  const enemyAct = (e: Enemy) => {
    const it = intentOf(e)
    if (it.kind === 'attack') {
      let lost = 0
      for (let i = 0; i < (it.hits ?? 1); i++) {
        const dmg = intentHit(e)
        const a = Math.min(S.block, dmg)
        S.block -= a
        lost += dmg - a
      }
      S.hp -= lost
      S.hurtAt = S.t
      pop(PLAYER_X, 400, lost > 0 ? `-${lost}` : '막음', lost > 0 ? 'dmg' : 'block')
    } else if (it.kind === 'block') {
      e.block += it.value
      pop(e.x, 400, `방어 +${it.value}`, 'block')
    } else {
      e.str += it.value
      pop(e.x, 400, `공격 +${it.value}`, 'info')
    }
    if (e.weak > 0) e.weak--
    touch()
  }

  /* ───── 이벤트 · 자동 데모 ───── */
  /** 시연용: 내 차례로 만들고, 손패에 쓸 수 있는 대상 카드를 하나 마련한다 (덱 장수는 그대로) */
  const ensureTargetCard = (): { card: Card; started: boolean } => {
    let started = false
    if (S.phase !== 'player') {
      startTurnNow()
      started = true
    }
    let card = S.hand.find(c => c.def.target === 'enemy' && c.def.cost <= S.energy)
    if (!card) {
      card = S.hand.find(c => c.def.target === 'enemy')
      if (card) S.energy = Math.max(S.energy, card.def.cost)
    }
    if (!card) {
      // 손패에 대상 카드가 없으면 더미에서 한 장 가져온다
      landFlying()
      const pile = S.draw.some(c => c.def.target === 'enemy') ? S.draw : S.discard
      const i = pile.findIndex(c => c.def.target === 'enemy')
      if (S.hand.length >= MAX_HAND) toDiscard(S.hand[0])
      card = pile.splice(i, 1)[0] ?? { uid: S.uidN++, def: CARDS.shot }
      S.hand.push(card)
      poses.current.set(card.uid, { ...PILE })
      if (S.energy < card.def.cost) S.energy = card.def.cost
      started = true
    }
    touch()
    return { card, started }
  }
  const runEvent = (steps: Step[]) => {
    cancel()
    S.script = steps
    S.scriptEvent = true
    S.stepT = 0
    S.stepFrom = null
    S.vp = S.vp ?? { x: 960, y: 760, down: false }
    touch()
  }
  const handle = (id: string) => {
    if (id === 'end-turn') {
      S.script = null
      S.vp = null
      endTurn()
    } else if (id === 'draw') {
      if (S.phase === 'player') drawCard()
    } else if (id === 'aim' || id === 'misaim') {
      if (!alive().length) S.enemies = makeEnemies()
      let target = alive()[Math.min(1, alive().length - 1)]
      if (id === 'misaim') {
        // 이웃한 두 적이 필요하다 — 포인터는 오른쪽 적의 왼쪽 가장자리, 카드는 왼쪽 적과도 겹친다
        const [a, b, c] = S.enemies
        if (a.hp > 0 && b.hp > 0) target = b
        else if (b.hp > 0 && c.hp > 0) target = c
        else {
          S.enemies = makeEnemies()
          target = S.enemies[1]
        }
      }
      const { card, started } = ensureTargetCard()
      runEvent([
        { k: 'wait', dur: started ? 0.9 : 0 }, // 새로 뽑은 카드가 손패에 자리 잡을 때까지
        { k: 'toCard', uid: card.uid, dx: id === 'misaim' ? 60 : 0, dur: 0.45 },
        { k: 'down', uid: card.uid },
        { k: 'toEnemy', id: target.id, dx: id === 'misaim' ? -75 : 0, dur: 0.8 },
        { k: 'wait', dur: 0.7 },
        { k: 'up' },
        { k: 'wait', dur: 0.6 },
      ])
      if (id === 'misaim') note(`포인터를 ${target.name}의 왼쪽 가장자리에 놓아 본다`)
    } else if (id === 'broke') {
      let started = S.phase !== 'player'
      if (started) startTurnNow()
      let card = S.hand.find(c => c.def.cost >= 1 && c.def.target === 'enemy')
      if (!card) {
        const r = ensureTargetCard()
        card = r.card
        started = started || r.started
      }
      S.energy = 0
      note('에너지 0 — 그래도 공격 카드를 써 본다')
      const target = alive()[0]
      runEvent([
        { k: 'wait', dur: started ? 0.9 : 0 },
        { k: 'toCard', uid: card.uid, dx: 0, dur: 0.45 },
        { k: 'down', uid: card.uid },
        { k: 'toEnemy', id: target?.id ?? '', dx: 0, dur: 0.7 },
        { k: 'wait', dur: 0.4 },
        { k: 'up' },
        { k: 'wait', dur: 0.6 },
      ])
    }
  }
  const startTurnNow = () => {
    const fresh = S.phase === 'win' || !alive().length
    if (fresh) S.enemies = makeEnemies()
    startTurn(!fresh)
  }
  useTrigger(p.trigger, id => {
    human()
    handle(id)
    touch()
    sync()
  })

  /** 자동 데모가 다음에 할 일 — 지금 상태를 보고 정한다 */
  const plan = (): Step[] => {
    if (S.phase !== 'player') return [{ k: 'wait', dur: 0.3 }, { k: 'plan' }]
    const steps: Step[] = []
    const { list, rest } = layout()
    if (S.sweptTurn !== S.turn && list.length > 1) {
      // 손패를 훑어 호버 · 이웃 비킴을 보여 준다
      S.sweptTurn = S.turn
      steps.push({ k: 'to', x: rest[0].x, y: BASE_Y - 40, dur: 0.6 }, { k: 'to', x: rest[rest.length - 1].x, y: BASE_Y - 40, dur: 1.6 })
    }
    const playable = list.filter(c => c.def.cost <= S.energy)
    const al = alive()
    const atk = playable.filter(c => c.def.target === 'enemy').sort((a, b) => (b.def.dmg ?? 0) * (b.def.hits ?? 1) - (a.def.dmg ?? 0) * (a.def.hits ?? 1))[0]
    const self = playable.find(c => c.def.target !== 'enemy')
    if (atk && al.length) {
      const target = al[S.enemyPick++ % al.length]
      steps.push(
        { k: 'toCard', uid: atk.uid, dx: 0, dur: 0.5 },
        { k: 'wait', dur: 0.25 },
        { k: 'down', uid: atk.uid },
        { k: 'toEnemy', id: target.id, dx: 0, dur: 0.8 },
        { k: 'wait', dur: 0.5 },
        { k: 'up' },
        { k: 'wait', dur: 0.6 },
        { k: 'plan' },
      )
    } else if (self) {
      steps.push(
        { k: 'toCard', uid: self.uid, dx: 0, dur: 0.5 },
        { k: 'wait', dur: 0.25 },
        { k: 'down', uid: self.uid },
        { k: 'to', x: 940, y: 520, dur: 0.8 },
        { k: 'wait', dur: 0.4 },
        { k: 'up' },
        { k: 'wait', dur: 0.6 },
        { k: 'plan' },
      )
    } else {
      steps.push({ k: 'to', x: END_BTN.x, y: END_BTN.y, dur: 0.7 }, { k: 'wait', dur: 0.4 }, { k: 'call', fn: endTurn }, { k: 'wait', dur: 0.5 }, { k: 'plan' })
    }
    return steps
  }

  const runScript = (dt: number) => {
    const q = S.script
    if (!q) return
    if (!q.length) {
      S.script = null
      S.scriptEvent = false
      S.vp = null
      touch()
      return
    }
    const st = q[0]
    const vp = (S.vp = S.vp ?? { x: S.ptr.x || 960, y: S.ptr.y || 760, down: false })
    const next = () => {
      q.shift()
      S.stepT = 0
      S.stepFrom = null
      S.stepTo = null
    }
    if (st.k === 'plan') {
      q.shift()
      q.push(...plan())
      return
    }
    if (st.k === 'down') {
      vp.down = true
      downCore(vp.x, vp.y, 'script', st.uid)
      touch()
      return next()
    }
    if (st.k === 'up') {
      vp.down = false
      upCore(vp.x, vp.y)
      touch()
      return next()
    }
    if (st.k === 'call') {
      st.fn()
      return next()
    }
    S.stepT += dt
    if (st.k === 'wait') {
      if (S.stepT >= st.dur) next()
      return
    }
    if (!S.stepFrom) {
      S.stepFrom = { x: vp.x, y: vp.y }
      if (st.k === 'to') S.stepTo = { x: st.x, y: st.y }
      else if (st.k === 'toCard') {
        const t = targets().get(st.uid)
        if (!t) return next()
        S.stepTo = { x: t.x + st.dx, y: Math.min(t.y, BASE_Y - 30) }
      } else {
        const e = S.enemies.find(x => x.id === st.id)
        if (!e) return next()
        S.stepTo = { x: e.x + st.dx, y: 520 }
      }
    }
    const k = easeInOutSine(Math.min(1, S.stepT / st.dur))
    const to = S.stepTo!
    vp.x = S.stepFrom.x + (to.x - S.stepFrom.x) * k
    vp.y = S.stepFrom.y + (to.y - S.stepFrom.y) * k
    moveCore(vp.x, vp.y)
    if (S.stepT >= st.dur) next()
  }

  // 손패 수를 바꾸면 바로 맞춘다
  useEffect(() => {
    if (S.phase !== 'player' || S.held) return
    landFlying()
    let i = 0
    while (S.hand.length < handSize && drawCard(i++));
    while (S.hand.length > handSize) toDiscard(S.hand[S.hand.length - 1])
    touch()
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handSize])

  /* ───── 매 프레임 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    S.t += dt
    // 자동 데모: 사람이 6초 동안 손대지 않으면 시작
    if (p.autoplay && !p.thumbnail && !S.script && !S.held && S.t - realAt.current > MANUAL_PAUSE) {
      S.script = [{ k: 'plan' }]
      S.scriptEvent = false
      S.stepT = 0
      S.stepFrom = null
    }
    if (S.script && !S.scriptEvent && !p.autoplay) {
      S.script = null
      S.vp = null
      if (S.held?.owner === 'script') cancel()
      touch()
    }
    runScript(dt)
    // 적 턴: 한 마리씩 차례로
    if (S.phase === 'enemy' && S.t >= S.phaseT) {
      while (S.actIdx < S.enemies.length && S.enemies[S.actIdx].hp <= 0) S.actIdx++
      if (S.actIdx < S.enemies.length) {
        enemyAct(S.enemies[S.actIdx++])
        S.phaseT = S.t + 0.55
      } else {
        if (S.hp <= 0) {
          S.hp = S.maxHp
          S.enemies = makeEnemies()
          note('쓰러짐 — 전투를 처음부터', true)
          return startTurn(false)
        }
        startTurn()
      }
    }
    if (S.phase === 'win' && S.t >= S.phaseT) {
      for (const card of [...S.hand]) toDiscard(card)
      S.enemies = makeEnemies()
      startTurn(false)
    }
    // 끝난 연출 정리
    const flyBefore = S.flying.length
    S.flying = S.flying.filter(f => {
      const done = S.t - f.at > 0.4
      if (done) S.discard.push(f.card)
      return !done
    })
    if (S.flying.length !== flyBefore) touch()
    const popBefore = S.pops.length
    S.pops = S.pops.filter(x => S.t - x.at < 1.1)
    if (S.pops.length !== popBefore) touch()
    if (S.note && S.note.until <= S.t) {
      S.note = null
      touch()
    }
    if (S.shake && S.t - S.shake.at > 0.4) {
      S.shake = null
      touch()
    }
    paint(dt)
    sync()
  })

  /* ───── 그리기 (매 프레임 DOM 직접) ───── */
  const cardRefs = useRef(new Map<number, HTMLDivElement>())
  const flyRefs = useRef(new Map<number, HTMLDivElement>())
  const arrowRef = useRef<SVGGElement>(null)
  const dotRefs = useRef<(SVGPathElement | null)[]>([])
  const headRef = useRef<SVGPathElement>(null)
  const vpRef = useRef<SVGGElement>(null)
  const paint = (dt: number) => {
    const c = cfgRef.current
    const snap = !c.juice || c.reduced
    const tg = targets()
    for (const [uid, t] of tg) {
      let cur = poses.current.get(uid)
      if (!cur || snap) cur = { ...t }
      else if (dt > 0) {
        const held = S.held?.uid === uid
        const l = held ? 30 : 16
        cur = { x: damp(cur.x, t.x, l, dt), y: damp(cur.y, t.y, l, dt), rot: damp(cur.rot, t.rot, l, dt), scale: damp(cur.scale, t.scale, l, dt) }
      }
      poses.current.set(uid, cur)
      const el = cardRefs.current.get(uid)
      if (el) {
        el.style.transform = `translate(${cur.x - CARD_W / 2}px, ${cur.y - CARD_H / 2}px) rotate(${cur.rot}deg) scale(${cur.scale})`
        el.style.zIndex = String(10 + t.z)
      }
    }
    for (const f of S.flying) {
      const el = flyRefs.current.get(f.card.uid)
      if (!el) continue
      const k = Math.min(1, (S.t - f.at) / 0.35)
      const e = k * k
      const x = f.from.x + (DISCARD.x - f.from.x) * e
      const y = f.from.y + (DISCARD.y - f.from.y) * e - Math.sin(k * Math.PI) * 120
      el.style.transform = `translate(${x - CARD_W / 2}px, ${y - CARD_H / 2}px) rotate(${f.from.rot + k * 40}deg) scale(${f.from.scale * (1 - k * 0.65)})`
      el.style.opacity = String(1 - k * 0.6)
    }

    // 타겟 화살표 (좋은 예 · 대상 지정 카드)
    const h = S.held
    const aiming = !!h && h.mode === 'aim'
    let aimId: string | null = null
    let armed = false
    const al = alive()
    const start = { x: AIM.x, y: AIM.y - (CARD_H * AIM.scale) / 2 + 8 }
    let end = { x: ENEMY_XMID, y: 520 }
    if (aiming && h) {
      if (h.kb) {
        const e = al[h.kbTarget]
        if (e) end = { x: e.x, y: 520 }
        aimId = e?.id ?? null
      } else {
        end = { x: S.ptr.x, y: S.ptr.y }
        aimId = enemyAt(S.ptr.x, S.ptr.y)?.id ?? null
      }
    } else if (h && !c.juice && h.mode === 'drag') {
      const card = S.hand.find(x => x.uid === h.uid)
      if (card?.def.target === 'enemy') aimId = enemyUnderCard(S.ptr.x - h.gx, S.ptr.y - h.gy)?.id ?? null
    } else if (h && c.juice) {
      armed = h.kb || S.ptr.y < PLAY_LINE
    }
    const ctl = { x: start.x + (end.x - start.x) * 0.05, y: Math.min(end.y, start.y) - 90 }
    if (arrowRef.current) {
      arrowRef.current.style.visibility = aiming ? 'visible' : 'hidden'
      arrowRef.current.toggleAttribute('data-on', !!aimId)
    }
    dotRefs.current.forEach((el, i) => {
      if (!el) return
      const b = bezier(start, ctl, end, 0.04 + (0.86 * i) / (ARROW_DOTS - 1))
      el.setAttribute('transform', `translate(${b.x} ${b.y}) rotate(${b.deg}) scale(${0.6 + (0.5 * i) / ARROW_DOTS})`)
    })
    if (headRef.current) {
      const b = bezier(start, ctl, end, 1)
      headRef.current.setAttribute('transform', `translate(${b.x} ${b.y}) rotate(${b.deg})`)
    }
    if (vpRef.current) {
      const vp = S.vp
      vpRef.current.style.visibility = vp && !p.thumbnail ? 'visible' : 'hidden'
      if (vp) vpRef.current.setAttribute('transform', `translate(${vp.x} ${vp.y}) scale(${vp.down ? 0.85 : 1})`)
    }
    if (aimId !== S.aimId || armed !== S.armed) {
      S.aimId = aimId
      S.armed = armed
      touch()
    }
  }
  useLayoutEffect(() => paint(0))

  /* ───── 렌더 ───── */
  const ts = Math.max(0.05, p.timeScale)
  const heldCard = S.held ? S.hand.find(c => c.uid === S.held!.uid) : undefined
  const heldDef = heldCard?.def
  const { list: handList, rest } = layout()
  const hoverUid = S.focus ?? handList[Math.floor(handList.length / 2)]?.uid ?? null
  const fanBox = rest.length
    ? {
        left: Math.max(0, Math.min(...rest.map(r => r.x)) - CARD_W / 2),
        right: Math.min(1920, Math.max(...rest.map(r => r.x)) + CARD_W / 2),
        top: Math.min(...rest.map(r => r.y)) - CARD_H / 2,
      }
    : { left: 760, right: 1160, top: 800 }
  // 미리보기 (좋은 예만)
  const pv = juice && heldDef && S.phase === 'player'
  const aimEnemy = S.aimId ? S.enemies.find(e => e.id === S.aimId) : undefined
  const previewFor = (e: Enemy) => {
    if (!pv || !heldDef) return null
    if (heldDef.target === 'enemy' && aimEnemy?.id === e.id) return heldDef
    if (heldDef.target === 'all' && S.armed) return heldDef
    return null
  }
  const incoming = S.enemies.reduce((a, e) => a + intentTotal(e), 0)
  const blockPv = pv && S.armed && heldDef?.block ? heldDef.block : 0
  const healPv = pv && S.armed && heldDef?.heal ? Math.min(heldDef.heal, S.maxHp - S.hp) : 0

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-phase={S.phase}
      data-holding={S.held ? S.held.mode : undefined}
      style={{ '--ts': ts } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="카드 손패 데모 (끌어서 사용, ←/→ · Enter, Esc 취소, E 턴 종료)"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 전장 */}
      <svg className={s.field} viewBox="0 0 1920 1080" aria-hidden>
        <defs>
          <linearGradient id="cht-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#101c2b" />
            <stop offset="1" stopColor="#1d2f3f" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="#0a121c" />
        <rect y="560" width="1920" height="520" fill="url(#cht-floor)" />
        <path d="M0 600 H1920" stroke="#ffffff14" strokeWidth="3" />
        <g className={s.body} data-hurt={S.t - S.hurtAt < 0.25 || undefined}>
          <Silhouette role="ally" x={PLAYER_X} y={ENEMY_FOOT} height={190} />
        </g>
        {S.enemies.map(e => (
          <g key={e.id} className={s.body} data-hurt={S.t - (S.enemyHurt[e.id] ?? -9) < 0.25 || undefined}>
            <Silhouette role="enemy" x={e.x} y={ENEMY_FOOT} height={170} down={e.hp <= 0} />
          </g>
        ))}
      </svg>

      {/* 사용선 (대상 없는 카드를 끄는 동안) */}
      <div className={s.playLine} data-show={(juice && S.held?.mode === 'drag') || undefined} data-armed={S.armed || undefined}>
        <span>{S.armed ? '놓으면 사용' : '이 선 위로 끌어 올려 사용'}</span>
      </div>

      {/* 플레이어 */}
      <div className={s.unit} style={{ left: PLAYER_X - 130, width: 260 }}>
        <span className={s.unitName}>하린</span>
        <Bar hp={S.hp} max={S.maxHp} block={S.block + blockPv} loss={0} heal={healPv} blockPv={blockPv > 0} />
        <span className={s.incoming} data-hidden={!showIntent || undefined}>
          {showIntent ? (
            <>
              들어올 피해 <b>{incoming}</b>
              {S.block + blockPv > 0 && (
                <>
                  {' '}
                  → 방어 후 <b data-safe={Math.max(0, incoming - S.block - blockPv) === 0 || undefined}>{Math.max(0, incoming - S.block - blockPv)}</b>
                </>
              )}
            </>
          ) : (
            '들어올 피해 ?'
          )}
        </span>
      </div>

      {/* 적 */}
      {S.enemies.map((e, i) => {
        const pvDef = previewFor(e)
        const loss = pvDef ? previewLoss(e, pvDef) : 0
        const it = intentOf(e)
        const hit = intentHit(e)
        const weakPv = pvDef?.weak && e.weak === 0 ? intentHit(e, pvDef.weak) : null
        return (
          <div
            key={e.id}
            className={s.enemy}
            style={{ left: e.x - 110 }}
            data-dead={e.hp <= 0 || undefined}
            data-aimed={(S.aimId === e.id && (juice || S.held?.mode === 'drag')) || undefined}
            data-kb={(S.held?.kb && S.aimId === e.id) || undefined}
          >
            <div className={s.intent} data-kind={showIntent ? it.kind : 'hidden'} data-part={i === 0 ? 'intent' : undefined}>
              {showIntent ? (
                <>
                  <IntentIcon kind={it.kind} />
                  <b>
                    {it.kind === 'attack' ? (
                      weakPv !== null ? (
                        <>
                          <s>{hit}</s> {weakPv}
                        </>
                      ) : (
                        hit
                      )
                    ) : it.kind === 'block' ? (
                      it.value
                    ) : (
                      `+${it.value}`
                    )}
                    {it.kind === 'attack' && it.hits ? <small>×{it.hits}</small> : null}
                  </b>
                  <span>{it.kind === 'attack' ? '공격' : it.kind === 'block' ? '방어' : '강화'}</span>
                </>
              ) : (
                <b className={s.unknown}>?</b>
              )}
            </div>
            <i className={s.bracket} aria-hidden />
            <div className={s.enemyFoot}>
              <span className={s.unitName}>
                {e.name}
                {e.weak > 0 && <em className={s.tag}>약화 {e.weak}</em>}
                {e.str > 0 && <em className={s.tag}>공격 +{e.str}</em>}
              </span>
              <Bar hp={e.hp} max={e.maxHp} block={e.block} loss={loss} heal={0} blockPv={false} />
              {loss > 0 && <span className={s.lossText}>{loss >= e.hp ? '처치' : `-${loss}`}</span>}
            </div>
          </div>
        )
      })}

      {/* 손패 영역 (해설 번호용) */}
      <div className={s.fanBox} data-part="fan" data-empty={!rest.length || undefined} style={{ left: fanBox.left, width: fanBox.right - fanBox.left, top: fanBox.top }} />
      {!S.hand.some(c => c.uid === hoverUid) && <div className={s.fanBox} data-part="hover" data-empty style={{ left: 860, width: 200, top: 800 }} />}

      {/* 카드 */}
      {S.hand.map(card => (
        <div
          key={card.uid}
          ref={el => {
            if (el) cardRefs.current.set(card.uid, el)
            else cardRefs.current.delete(card.uid)
          }}
          className={s.card}
          data-part={card.uid === hoverUid ? 'hover' : undefined}
          data-focus={(S.focus === card.uid && !S.held) || undefined}
          data-held={S.held?.uid === card.uid || undefined}
          data-sticky={(S.held?.uid === card.uid && S.held.sticky) || undefined}
        >
          <CardFace def={card.def} unplayable={juice && S.phase === 'player' && card.def.cost > S.energy} shake={S.shake?.uid === card.uid} juice={juice} dim={S.phase !== 'player'} />
        </div>
      ))}
      {S.flying.map(f => (
        <div
          key={`f${f.card.uid}`}
          ref={el => {
            if (el) flyRefs.current.set(f.card.uid, el)
            else flyRefs.current.delete(f.card.uid)
          }}
          className={s.card}
          data-flying
        >
          <CardFace def={f.card.def} unplayable={false} shake={false} juice={juice} dim={false} />
        </div>
      ))}

      {/* 화살표 · 가상 포인터 */}
      <svg className={s.overlay} viewBox="0 0 1920 1080" aria-hidden>
        <g ref={arrowRef} className={s.arrow} data-part="arrow">
          {Array.from({ length: ARROW_DOTS }, (_, i) => (
            <path
              key={i}
              ref={el => {
                dotRefs.current[i] = el
              }}
              d="M-9 -11 L5 0 L-9 11 L-4 0 Z"
            />
          ))}
          <path ref={headRef} className={s.head} d="M-26 -26 L14 0 L-26 26 L-14 0 Z" />
        </g>
        <g ref={vpRef} className={s.vp}>
          <path d="M0 0 L0 40 L11 30 L19 48 L27 44 L19 27 L33 27 Z" />
        </g>
      </svg>

      {/* 하단 HUD */}
      <div className={s.energy} data-part="energy" data-empty={S.energy === 0 || undefined}>
        <b>
          {S.energy}/{ENERGY}
        </b>
        <span>에너지</span>
      </div>
      <div className={s.pile} style={{ left: 30 }}>
        <b>{S.draw.length}</b>
        <span>뽑을 카드</span>
      </div>
      <div className={s.pile} style={{ right: 30 }}>
        <b>{S.discard.length + S.flying.length}</b>
        <span>버린 카드</span>
      </div>
      <button
        className={s.endTurn}
        tabIndex={-1}
        disabled={S.phase !== 'player'}
        onClick={() => {
          human()
          endTurn()
          sync()
        }}
      >
        <KeyCap label="E" size={34} /> {S.phase === 'player' ? '턴 종료' : S.phase === 'enemy' ? '적 턴…' : '승리!'}
      </button>
      <div className={s.turn}>
        {S.turn}턴 · {S.phase === 'player' ? '내 차례' : S.phase === 'enemy' ? '적 차례' : '전투 승리'}
      </div>
      {S.held?.sticky && <div className={s.hint}>클릭한 곳에 사용 · 오른쪽 클릭 취소</div>}
      {S.held?.kb && <div className={s.hint}>←/→ 대상 · Enter 사용 · Esc 취소</div>}

      {S.pops.map(x => (
        <span key={x.id} className={s.pop} data-tone={x.tone} style={{ left: x.x, top: x.y }}>
          {x.text}
        </span>
      ))}
      {S.note && (
        <div className={s.note} data-bad={S.note.bad || undefined}>
          {S.note.text}
        </div>
      )}
    </div>
  )
}

/* ───── 처음 상태 ───── */
function initSim(handSize: number, juice: boolean, start: 'auto' | 'thumb' | 'none'): Sim {
  const r = rng(7)
  let uidN = 1
  const deck = shuffle(
    DECK.map(id => ({ uid: uidN++, def: CARDS[id] })),
    r,
  )
  const hand = deck.splice(deck.length - Math.min(handSize, deck.length))
  const S: Sim = {
    t: 0,
    version: 0,
    r,
    uidN,
    hand,
    draw: deck,
    discard: [],
    energy: ENERGY,
    hp: 46,
    maxHp: 50,
    block: 0,
    enemies: makeEnemies(),
    phase: 'player',
    phaseT: 0,
    actIdx: 0,
    turn: 1,
    focus: null,
    held: null,
    ptr: { x: 960, y: 760, inside: false },
    aimId: null,
    armed: false,
    flying: [],
    pops: [],
    popN: 0,
    shake: null,
    hurtAt: -9,
    enemyHurt: {},
    delay: {},
    note: null,
    script: null,
    scriptEvent: false,
    stepT: 0,
    stepFrom: null,
    stepTo: null,
    vp: null,
    sweptTurn: 0,
    enemyPick: 1,
  }
  // 첫 화면부터 '공격 카드를 들어 가운데 적을 겨눈' 모습 (썸네일 · 해설 번호가 가리킬 것이 보이게)
  if (start !== 'none') {
    const card = hand.find(c => c.def.target === 'enemy' && c.def.cost <= S.energy)
    if (card) {
      S.held = { uid: card.uid, mode: juice ? 'aim' : 'drag', gx: 0, gy: 40, downX: 0, downY: 0, downT: -1e9, sticky: false, kb: false, kbTarget: 1, owner: 'script' }
      S.ptr = { x: ENEMY_XMID + 20, y: 520, inside: true }
      S.focus = card.uid
      if (start === 'auto') {
        S.vp = { x: S.ptr.x, y: S.ptr.y, down: true }
        S.script = [{ k: 'wait', dur: 1.4 }, { k: 'up' }, { k: 'wait', dur: 0.6 }, { k: 'plan' }]
      }
    }
  }
  return S
}

/* ───── 작은 부품 ───── */
function Bar({ hp, max, block, loss, heal, blockPv }: { hp: number; max: number; block: number; loss: number; heal: number; blockPv: boolean }) {
  const k = Math.max(0, hp) / max
  return (
    <div className={s.bar}>
      {block > 0 && (
        <span className={s.block} data-preview={blockPv || undefined}>
          <svg viewBox="-12 -14 24 28" aria-hidden>
            <path d="M0 -12 L10 -8 L9 4 Q6 10 0 13 Q-6 10 -9 4 L-10 -8 Z" />
          </svg>
          {block}
        </span>
      )}
      <div className={s.barTrack} data-block={block > 0 || undefined}>
        <div className={s.barFill} style={{ width: `${k * 100}%` }} />
        {loss > 0 && <div className={s.barLoss} style={{ left: `${((hp - loss) / max) * 100}%`, width: `${(loss / max) * 100}%` }} />}
        {heal > 0 && <div className={s.barHeal} style={{ left: `${k * 100}%`, width: `${(heal / max) * 100}%` }} />}
        <span className={s.barText}>
          {Math.max(0, hp)}/{max}
        </span>
      </div>
    </div>
  )
}

function IntentIcon({ kind }: { kind: string }) {
  if (kind === 'attack')
    return (
      <svg viewBox="-20 -20 40 40" aria-hidden>
        <path d="M-14 14 L8 -8 L12 -16 L16 -12 L8 -8 M-10 4 L-4 10 M-16 16 L-12 12" strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
    )
  if (kind === 'block')
    return (
      <svg viewBox="-20 -20 40 40" aria-hidden>
        <path d="M0 -16 L14 -11 L13 4 Q9 12 0 17 Q-9 12 -13 4 L-14 -11 Z" />
      </svg>
    )
  return (
    <svg viewBox="-20 -20 40 40" aria-hidden>
      <path d="M-12 2 L0 -10 L12 2 M-12 14 L0 2 L12 14" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

const TARGET_LABEL = { enemy: '적 하나', self: '자신', all: '모든 적' }

function CardFace({ def, unplayable, shake, juice, dim }: { def: CardDef; unplayable: boolean; shake: boolean; juice: boolean; dim: boolean }) {
  return (
    <div className={s.face} data-kind={def.kind} data-unplayable={unplayable || undefined} data-shake={shake || undefined} data-dim={dim || undefined}>
      <span className={s.cost}>{def.cost}</span>
      {juice && def.target === 'enemy' && (
        <svg className={s.aimMark} viewBox="-16 -16 32 32" aria-hidden>
          <circle r="10" />
          <path d="M0 -15 V-5 M0 5 V15 M-15 0 H-5 M5 0 H15" />
        </svg>
      )}
      <b className={s.cardName}>{def.name}</b>
      <div className={s.art}>
        <CardArt id={def.id} />
      </div>
      <span className={s.cardType}>
        {def.kind === 'attack' ? '공격' : '기술'} · {TARGET_LABEL[def.target]}
      </span>
      <p className={s.cardText}>{def.text}</p>
    </div>
  )
}

function CardArt({ id }: { id: string }) {
  const d: Record<string, string> = {
    shot: 'M-34 18 L30 -14 M-30 26 L34 -6',
    hammer: 'M-8 30 L-8 -6 M-30 -6 H14 V-26 H-30 Z',
    burst: 'M-34 14 L-6 -8 M-14 20 L14 -2 M6 26 L34 4',
    pulse: 'M-36 0 Q-27 -18 -18 0 T0 0 T18 0 T36 0',
    overload: 'M0 -28 L8 -8 L28 -10 L12 4 L20 24 L0 12 L-20 24 L-12 4 L-28 -10 L-8 -8 Z',
    shield: 'M0 -28 L24 -20 L22 6 Q16 20 0 28 Q-16 20 -22 6 L-24 -20 Z',
    repair: 'M-8 -28 H8 V-8 H28 V8 H8 V28 H-8 V8 H-28 V-8 H-8 Z',
    cell: 'M-14 -24 H14 V28 H-14 Z M-6 -30 H6 M-6 -2 L4 -12 L-2 2 L6 2 L-4 14',
  }
  return (
    <svg viewBox="-44 -36 88 72" aria-hidden>
      <path d={d[id] ?? d.shot} />
    </svg>
  )
}
