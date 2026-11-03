import { useEffect, useLayoutEffect, useReducer, useRef, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap, MouseGlyph, TouchGlyph, useLastInputDevice } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { placeFloating, type Rect, type Side } from '../../core/placement'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { byName, entry, ENTRIES, glossaryFor, KIND_LABEL, KIND_ORDER, linksOf, parse, SCENES, type Kind, type Scope } from './data'
import s from './style.module.css'

export { meta } from './meta'

/* ───────────── 규칙 값 ───────────── */

/** 툴팁 칸 수 (DOM 에 늘 그려 두는 수 = maxDepth 최댓값) */
const SLOTS = 4
/** 잠긴 툴팁에서 포인터가 벗어나도 기다려 주는 시간 (게임 초) */
const CLOSE_GRACE = 0.45
/** 조절 값을 바꿨을 때 용어집을 잠깐 열어 두는 시간 */
const PEEK_SEC = 3
/** 사람이 만진 뒤 자동 데모가 끼어들지 않는 시간 */
const HUMAN_IDLE = 6
const TIP_W = 520
const EDGE = 24

type Owner = 'pointer' | 'key' | 'touch' | 'script'
interface Tip {
  entry: string
  /** 이 툴팁을 연 키워드 (data-kw). 대사: d<줄>.<k>, 툴팁 i 안: t<i>.<k> */
  anchor: string
  locked: boolean
  owner: Owner
}
/** 포인터 · 포커스가 있는 곳: tip = 들어 있는 툴팁 번호(-1 = 대사), key = 그 위의 키워드 */
type At = { tip: number; key: string | null } | null
type GlossMode = 'hold' | 'pause' | 'script'

/* 자동 데모 대본 — 중첩 열기(잠금 링) → 닫기 → 용어집 → 다음 대사 → 순환 참조 */
const SCRIPT = ['nest', 'wait', 'close', 'gloss', 'wait', 'glossClose', 'next', 'cycle', 'wait', 'close', 'next'] as const

/** 첫 화면: 격납고 장면 두 줄째, "냉각 셀 → 궤도 정비 기지" 두 겹이 잠긴 채 열려 있다 (궤도 정비 기지 설명 안의 냉각 셀은 ↑ 순환 표시) */
const START_STACK = (): Tip[] => [
  { entry: 'cell', anchor: 'd0.0', locked: true, owner: 'script' },
  { entry: 'base', anchor: 't0.0', locked: true, owner: 'script' },
]

/**
 * 맥락 용어집 + 중첩 툴팁.
 * 툴팁 스택 · 장면 진행 · 용어집 상태는 ref 모델에 두고 구조가 바뀔 때만 다시 그린다.
 * 잠금 링(매 프레임)과 툴팁 위치(크기를 잰 뒤)는 DOM 을 직접 고친다.
 */
export default function ContextLoreGlossary(p: SpecimenProps) {
  const juice = p.juice
  const lockMs = num(p.params, 'lockMs', 700)
  const maxDepth = Math.round(num(p.params, 'maxDepth', 3))
  const cycleMode = str(p.params, 'cycleMode', 'mark')
  const scopeParam = str(p.params, 'glossaryScope', 'scene') as Scope
  const edgeCorrection = bool(p.params, 'edgeCorrection', true)
  const holdMode = str(p.params, 'holdMode', 'hold')
  const scope: Scope = juice ? scopeParam : 'all'
  const motion = juice && !prefersReducedMotion()
  const W = p.width

  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const M = useRef({
    t: 0,
    scene: 0,
    line: 1,
    stack: START_STACK(),
    lockT: [0, 0, 0, 0],
    grace: [0, 0, 0, 0],
    ptrAt: null as At,
    focusAt: null as At,
    /** 순환 링크를 가리킬 때 강조할 (이미 열린) 툴팁 번호 */
    echo: -1,
    echoUntil: 0,
    gloss: { open: false, mode: 'hold' as GlossMode, until: 0 },
    sel: null as string | null,
    toast: { text: '', until: 0 },
    step: 0,
    humanAt: -99,
    opener: null as HTMLElement | null,
    pendingFocus: null as null | { kind: 'into'; level: number } | { kind: 'gloss' } | { kind: 'restore' },
  })
  const x = M.current
  const live = useRef({ juice, lockMs, maxDepth, cycleMode, holdMode, edgeCorrection })
  live.current = { juice, lockMs, maxDepth, cycleMode, holdMode, edgeCorrection }

  const rootRef = useRef<HTMLDivElement>(null)
  const dlgRef = useRef<HTMLElement>(null)
  const tipRefs = useRef<(HTMLDivElement | null)[]>([])
  const ringRefs = useRef<(SVGCircleElement | null)[]>([])
  /** 마우스 위치 (논리 좌표). 무대를 벗어나면 null */
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const placed = useRef<Rect[]>([])
  const suppress = useRef(false)
  /** 무대 안에 포커스가 있었나 — 포커스된 요소가 사라져도 blur 가 오지 않아 직접 기억한다 */
  const focusIn = useRef(false)
  /** 지난 그리기의 스택 앵커 — 줄어든 겹을 연 키워드를 찾는다 */
  const prevAnchors = useRef<string[]>([])

  /* ───── 스택 규칙 ───── */
  const heldOf = (a: At) => (!a ? -1 : a.key && x.stack[a.tip + 1]?.anchor === a.key ? a.tip + 1 : a.tip)
  /** 포인터 좌표가 들어 있는 가장 깊은 (보이는) 툴팁 — 새 겹이 키워드를 덮어 pointerleave 가 와도 붙잡은 것으로 본다 */
  const ptrTip = () => {
    const q = pointer.current
    for (let i = x.stack.length - 1; q && i >= 0; i--) {
      const r = placed.current[i]
      if (r && q.x >= r.x && q.x < r.x + r.w && q.y >= r.y && q.y < r.y + r.h) return i
    }
    return -1
  }
  const held = () => Math.max(heldOf(x.ptrAt), heldOf(x.focusAt), ptrTip())
  const track = (e: PointerEvent) => {
    const r = rootRef.current?.getBoundingClientRect()
    if (r && e.pointerType === 'mouse') pointer.current = { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * W) / r.width }
  }
  const human = () => (x.humanAt = x.t)
  const say = (text: string) => (x.toast = { text, until: x.t + 3.2 })

  /** 키워드에 올리거나 포커스: 그 깊이의 툴팁을 이 키워드 것으로 바꾸고 더 깊은 것은 닫는다 */
  const openAt = (level: number, key: string, id: string, owner: Owner) => {
    const L = live.current
    if (level >= L.maxDepth || x.stack.length < level) return
    if (owner !== 'script') {
      human()
      x.stack.forEach(t => t.owner === 'script' && (t.owner = owner))
    }
    // 순환 참조: 이미 위에 열린 항목이면 새로 쌓지 않고 그 툴팁을 짚어 준다
    const dup = x.stack.slice(0, level).findIndex(t => t.entry === id)
    if (L.cycleMode === 'mark' && dup >= 0) {
      x.echo = dup
      x.echoUntil = x.t + 1.6
      rerender()
      return
    }
    const cur = x.stack[level]
    if (cur && cur.anchor === key && cur.entry === id) return
    x.stack = [...x.stack.slice(0, level), { entry: id, anchor: key, locked: L.juice && L.lockMs <= 0, owner }]
    x.lockT[level] = 0
    x.grace[level] = 0
    rerender()
  }
  /** 잠기지 않은 툴팁은 포인터 · 포커스가 떠나는 즉시 닫는다 (잠긴 것은 게임 루프에서 유예 후) */
  const prune = () => {
    const h = held()
    let n = x.stack.length
    while (n - 1 > h && n > 0 && !x.stack[n - 1].locked && x.stack[n - 1].owner !== 'script') n--
    if (n !== x.stack.length) {
      x.stack = x.stack.slice(0, n)
      rerender()
    }
  }
  const lockAt = (level: number) => {
    const t = x.stack[level]
    if (!t || !live.current.juice) return
    t.locked = true
    rerender()
  }
  const closeAll = () => {
    if (!x.stack.length) return
    x.stack = []
    x.echo = -1
    rerender()
  }

  /* ───── 위치 찾기 ───── */
  const kwEl = (key: string) => rootRef.current?.querySelector<HTMLElement>(`[data-kw="${key}"]`) ?? null
  const locate = (el: Element | null): At => {
    if (!el || !rootRef.current?.contains(el)) return null
    const kw = el.closest<HTMLElement>('[data-kw]')
    const tip = el.closest<HTMLElement>('[data-tip]')
    if (!kw && !tip) return null
    return { tip: tip ? Number(tip.dataset.tip) : -1, key: kw?.dataset.kw ?? null }
  }
  const focusKw = (key: string, quiet: boolean) => {
    const el = kwEl(key)
    if (!el) return
    suppress.current = quiet
    el.focus({ preventScroll: true })
    suppress.current = false
    x.focusAt = locate(el)
  }

  /* ───── 이벤트 동작 ───── */
  /** 대사 안의 키워드 목록 (화면 순서) */
  const lineKws = (line: number) => {
    const out: { key: string; id: string }[] = []
    let k = 0
    for (const id of linksOf(SCENES[x.scene].lines[line].text)) out.push({ key: `d${line}.${k++}`, id })
    return out
  }
  /** 체인 만들기: from 에서 시작해 설명 안의 첫 키워드를 따라간다 (mark 면 이미 체인에 있는 항목은 건너뛴다) */
  const chainFrom = (key: string, id: string, preferCycle: boolean): Tip[] => {
    const L = live.current
    const out: Tip[] = [{ entry: id, anchor: key, locked: true, owner: 'script' }]
    while (out.length < L.maxDepth) {
      const lv = out.length - 1
      const links = linksOf(entry(out[lv].entry).body)
      let k = -1
      if (preferCycle && lv === 0) k = links.findIndex(l => linksOf(entry(l).body).includes(id))
      if (preferCycle && lv > 0 && L.cycleMode === 'allow') k = links.findIndex(l => l === out[lv - 1].entry)
      if (k < 0) k = L.cycleMode === 'allow' ? 0 : links.findIndex(l => !out.some(t => t.entry === l))
      if (k < 0 || !links[k]) break
      out.push({ entry: links[k], anchor: `t${lv}.${k}`, locked: true, owner: 'script' })
      if (preferCycle && L.cycleMode === 'mark') break
    }
    return out
  }
  /** 중첩 열기: 보이는 대사에서 가장 오른쪽 키워드부터 깊이 한도까지 — 화면 가장자리 뒤집기가 보인다 */
  const nest = () => {
    const kws = Array.from({ length: x.line + 1 }, (_, li) => lineKws(li)).flat()
    let pick = kws[0]
    let best = -Infinity
    for (const kw of kws) {
      const r = kwEl(kw.key)?.getBoundingClientRect().right ?? 0
      if (r > best) {
        best = r
        pick = kw
      }
    }
    if (!pick) return
    x.echo = -1
    if (!live.current.juice) {
      x.stack = [{ entry: pick.id, anchor: pick.key, locked: false, owner: 'script' }]
      say('잠금 없음 — 툴팁이 커서를 따라다니고 떠나면 바로 닫혀 안의 키워드에 닿을 수 없다')
    } else {
      const chain = chainFrom(pick.key, pick.id, false)
      // 마지막 겹은 잠기기 전 상태로 — 잠금 링이 차오르는 모습을 보여 준다
      if (live.current.lockMs > 0) chain[chain.length - 1].locked = false
      x.stack = chain
      x.lockT = [0, 0, 0, 0]
      say(chain.length >= live.current.maxDepth ? `깊이 한도 ${live.current.maxDepth} — 마지막 겹의 키워드는 링크가 아니다` : '설명 안의 키워드를 따라 한 겹씩')
    }
    rerender()
  }
  /** 순환 참조: A 설명에 B, B 설명에 A 가 있는 쌍을 연다 */
  const cycle = () => {
    const L = live.current
    let found: { key: string; id: string } | null = null
    for (let li = x.line; li >= 0 && !found; li--)
      found = lineKws(li).find(kw => linksOf(entry(kw.id).body).some(l => linksOf(entry(l).body).includes(kw.id))) ?? null
    if (!found) return
    if (!L.juice) {
      x.stack = [{ entry: found.id, anchor: found.key, locked: false, owner: 'script' }]
      say('잠금이 없으면 두 번째 겹에도 갈 수 없다')
    } else {
      x.stack = chainFrom(found.key, found.id, true)
      const a = entry(found.id).name
      const b = x.stack[1] ? entry(x.stack[1].entry).name : ''
      if (L.cycleMode === 'mark') {
        x.echo = 0
        x.echoUntil = x.t + 2.2
        say(`'${b}' 설명 안의 '${a}' — 이미 위에 열려 있어 새로 쌓지 않고 ↑ 로 그 툴팁을 짚는다`)
      } else say(`순환 허용: ${a} → ${b} → ${a} … 깊이 한도까지 같은 두 장이 반복된다`)
    }
    rerender()
  }
  const advance = (sceneJump: boolean) => {
    if (sceneJump || x.line >= SCENES[x.scene].lines.length - 1) {
      x.scene = (x.scene + 1) % SCENES.length
      x.line = 0
    } else x.line++
    x.stack = []
    x.echo = -1
    rerender()
  }

  /* ───── 용어집 ───── */
  const items = glossaryFor(scope, x.scene, x.line)
  const ordered = juice ? KIND_ORDER.flatMap(k => items.filter(it => it.entry.kind === k)) : [...items].sort((a, b) => byName(a.entry, b.entry))
  const openGloss = (mode: GlossMode, until = 0) => {
    if (!x.gloss.open) x.opener = mode === 'pause' && document.activeElement instanceof HTMLElement ? document.activeElement : null
    x.gloss = { open: true, mode, until }
    if (mode === 'pause') x.pendingFocus = { kind: 'gloss' }
    rerender()
  }
  const closeGloss = () => {
    if (!x.gloss.open) return
    const wasPause = x.gloss.mode === 'pause'
    x.gloss = { ...x.gloss, open: false }
    if (wasPause) x.pendingFocus = { kind: 'restore' }
    rerender()
  }
  const pressGloss = () => {
    human()
    if (x.gloss.open && x.gloss.mode !== 'script') closeGloss()
    else openGloss(live.current.holdMode === 'hold' ? 'hold' : 'pause')
  }
  const releaseGloss = () => {
    if (x.gloss.open && x.gloss.mode === 'hold') closeGloss()
  }
  const moveSel = (d: number) => {
    if (!ordered.length) return
    const i = Math.max(0, ordered.findIndex(it => it.entry.id === x.sel))
    x.sel = ordered[Math.min(ordered.length - 1, Math.max(0, i + d))].entry.id
    if (x.gloss.mode === 'pause') x.pendingFocus = { kind: 'gloss' }
    rerender()
  }
  // 범위가 바뀌어 고른 항목이 목록에서 빠지면 첫 항목으로 (param 변경 뒤 상태 맞추기)
  if (!ordered.some(it => it.entry.id === x.sel)) x.sel = ordered[0]?.entry.id ?? null

  /* ───── 조절 값이 바뀌면: 남은 상태를 새 한계 안으로 맞추고, 닫힌 패널에만 보이는 값은 패널을 잠깐 연다 ───── */
  useEffect(() => {
    let st = x.stack.slice(0, maxDepth)
    if (cycleMode === 'mark') {
      const cut = st.findIndex((t, i) => st.slice(0, i).some(u => u.entry === t.entry))
      if (cut >= 0) st = st.slice(0, cut)
    }
    if (!juice) st = st.slice(0, 1).map(t => ({ ...t, locked: false }))
    if (st.length !== x.stack.length || st.some((t, i) => t !== x.stack[i])) {
      x.stack = st
      rerender()
    }
  }, [juice, maxDepth, cycleMode])
  const shownScope = useRef(scopeParam + holdMode)
  useEffect(() => {
    if (shownScope.current === scopeParam + holdMode) return
    shownScope.current = scopeParam + holdMode
    if (p.thumbnail || (x.gloss.open && x.gloss.mode !== 'script')) return
    openGloss('script', x.t + PEEK_SEC)
  })
  // 가장자리 보정 · 잠금 시간은 시작 스택(모두 고정 · 뒤집기 없음)에서 안 보인다 → 중첩을 다시 연다 (마지막 겹은 고정 전부터 링이 찬다)
  const shownNest = useRef(`${lockMs}|${edgeCorrection}`)
  useEffect(() => {
    if (shownNest.current === `${lockMs}|${edgeCorrection}`) return
    shownNest.current = `${lockMs}|${edgeCorrection}`
    if (p.thumbnail) return
    human()
    nest()
  })

  /* ───── 갤러리 이벤트 · 자동 데모 ───── */
  const handle = (id: string) => {
    if (id === 'next-line') advance(false)
    else if (id === 'next-scene') advance(true)
    else if (id === 'open-nested') nest()
    else if (id === 'cycle') cycle()
    else if (id === 'glossary') {
      if (x.gloss.open) closeGloss()
      else openGloss('pause')
    } else if (id === 'close-all') {
      closeAll()
      closeGloss()
    }
  }
  useTrigger(p.trigger, handle)

  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.9,
    () => {
      // 사람이 툴팁 안에 커서를 두거나 무대에 포커스를 두고 읽는 중이면 쉰다 (게임 루프가 그동안 humanAt 을 갱신한다)
      if (x.t - x.humanAt < HUMAN_IDLE || (x.gloss.open && x.gloss.mode !== 'script')) return
      const a = SCRIPT[x.step++ % SCRIPT.length]
      if (a === 'nest') nest()
      else if (a === 'cycle') cycle()
      else if (a === 'close') closeAll()
      else if (a === 'gloss') openGloss('script')
      else if (a === 'glossClose') {
        if (x.gloss.mode === 'script') closeGloss()
      }
      else if (a === 'next') advance(false)
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임: 머무르면 잠금 · 잠긴 툴팁의 닫힘 유예 · 링 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    const L = live.current
    x.t += dt
    let dirty = false
    const h = held()
    if (h >= 0 || rootRef.current?.contains(document.activeElement)) human()
    if (L.juice) {
      x.stack.forEach((t, i) => {
        if (t.locked || (i > h && t.owner !== 'script')) return
        x.lockT[i] += (dt * 1000) / Math.max(1, L.lockMs)
        if (x.lockT[i] >= 1) {
          t.locked = true
          dirty = true
        }
      })
    }
    let cut = x.stack.length
    for (let i = 0; i < SLOTS; i++) if (i <= h) x.grace[i] = 0
    for (let i = x.stack.length - 1; i > h; i--) {
      const t = x.stack[i]
      if (t.owner === 'script') break
      if (!t.locked) {
        cut = i
        continue
      }
      x.grace[i] += dt
      if (x.grace[i] >= CLOSE_GRACE) cut = i
    }
    if (cut < x.stack.length) {
      x.stack = x.stack.slice(0, cut)
      dirty = true
    }
    if (x.echo >= 0 && x.t >= x.echoUntil) {
      x.echo = -1
      dirty = true
    }
    if (x.toast.text && x.t >= x.toast.until) {
      x.toast = { text: '', until: 0 }
      dirty = true
    }
    if (x.gloss.open && x.gloss.mode === 'script' && x.gloss.until > 0 && x.t >= x.gloss.until) {
      x.gloss = { ...x.gloss, open: false }
      dirty = true
    }
    if (dirty) rerender()
    paintRings()
  })
  const paintRings = () => {
    for (let i = 0; i < SLOTS; i++) {
      const c = ringRefs.current[i]
      const t = x.stack[i]
      if (c) c.style.strokeDashoffset = String(100 * (1 - (t?.locked ? 1 : Math.min(1, x.lockT[i]))))
    }
  }

  /* ───── 배치: 크기를 잰 뒤 → 1겹은 키워드 위, 하위 겹은 부모 오른쪽 → 넘치면 뒤집기 → 고정 ───── */
  const lastEntry = useRef<(string | null)[]>([null, null, null, null])
  const sides = useRef<Side[]>([])
  const noted = useRef<boolean[]>([])
  const toLogical = (r: DOMRect): Rect => {
    const root = rootRef.current!.getBoundingClientRect()
    const k = W / root.width
    return { x: (r.left - root.left) * k, y: (r.top - root.top) * k, w: r.width * k, h: r.height * k }
  }
  const place = () => {
    const L = live.current
    const bounds = { x: EDGE, y: EDGE, w: p.width - EDGE * 2, h: p.height - EDGE * 2 }
    const bottom = bounds.y + bounds.h
    // 툴팁 칸은 Tab 순서 때문에 대사 상자 안에 있다 — 무대 좌표에서 상자의 안쪽(padding box) 원점을 뺀다
    const d = dlgRef.current
    const off = d ? toLogical(d.getBoundingClientRect()) : { x: 0, y: 0 }
    if (d) {
      off.x += d.clientLeft
      off.y += d.clientTop
    }
    x.stack.forEach((t, i) => {
      const el = tipRefs.current[i]
      const a = kwEl(t.anchor)
      if (!el || !a) return
      const ar = toLogical(a.getBoundingClientRect())
      const size = { w: el.offsetWidth, h: el.offsetHeight }
      let pos: { x: number; y: number }
      let note = ''
      if (!L.juice && pointer.current && t.owner === 'pointer') {
        // 나쁜 예: 커서를 따라다닌다 (보정도 없다) — 커서를 툴팁 쪽으로 옮기면 툴팁도 같이 달아난다
        pos = { x: pointer.current.x + 18, y: pointer.current.y + 26 }
      } else {
        const parent = placed.current[i - 1]
        // 하위 겹: 키워드 줄 높이에 맞추되 부모 아래 변보다 내려가지 않게 (대사를 덮지 않는다)
        const anchor = i === 0 || !parent ? ar : { x: parent.x, y: Math.min(ar.y - 28, parent.y + parent.h - size.h), w: parent.w, h: size.h }
        const correct = L.juice && L.edgeCorrection
        // 셋째 겹부터는 부모가 놓인 방향으로 이어 가고 되돌아 뒤집지 않는다 — 되돌아가면 첫 겹을 통째로 덮는다. 모자라면 고정만
        const prefer = i === 0 ? 'top' : i > 1 && correct ? (sides.current[i - 1] ?? 'right') : 'right'
        const pl = placeFloating(anchor, size, i > 1 ? { x: -1e5, y: bounds.y, w: 2e5, h: bounds.h } : bounds, prefer, i === 0 ? 14 : 12)
        const name = { top: '위', bottom: '아래', left: '왼쪽', right: '오른쪽' }
        const to = { top: '위로', bottom: '아래로', left: '왼쪽으로', right: '오른쪽으로' }
        let stackNote = ''
        if (i > 1) {
          const cx = Math.min(Math.max(pl.x, bounds.x), bounds.x + bounds.w - size.w)
          const squeezed = cx !== pl.x
          pl.x = cx
          if (squeezed && parent) {
            // 옆자리가 모자라면 부모 위 → 부모 반대쪽 → 부모 아래 중 앞 겹들과 겹치지 않는 첫 자리 (없으면 부모만 피하는 자리).
            // 부모 안의 여는 키워드를 덮으면 열림 → 키워드가 가려짐 → pointerleave → 닫힘 → 다시 열림이 반복된다. 모두 안 되면 여는 키워드 줄만 피한다
            const back: Side = pl.side === 'left' ? 'right' : 'left'
            const cands: [number, number, string, Side][] = [
              [cx, parent.y - 14 - size.h - (noted.current[i - 1] ? 40 : 0), '옆 공간 부족 → 부모 위로', pl.side],
              [back === 'right' ? parent.x + parent.w + 12 : parent.x - 12 - size.w, pl.y, `${name[pl.side]} 공간 부족 → ${to[back]}`, back],
              [cx, parent.y + parent.h + 14, '옆 공간 부족 → 부모 아래로', pl.side],
            ]
            const clear = (c: [number, number, ...unknown[]], n: number) =>
              c[0] >= bounds.x && c[0] + size.w <= bounds.x + bounds.w && c[1] >= bounds.y && c[1] + size.h <= bottom &&
              placed.current.slice(n, i).every(r => c[0] >= r.x + r.w || c[0] + size.w <= r.x || c[1] >= r.y + r.h || c[1] + size.h <= r.y)
            const c = cands.find(c => clear(c, 0)) ?? cands.find(c => clear(c, i - 1))
            if (c) [pl.x, pl.y, stackNote, pl.side] = c
            else pl.y = Math.min(Math.max(ar.y - 14 - size.h >= bounds.y ? ar.y - 14 - size.h : ar.y + ar.h + 14, bounds.y), bottom - size.h)
            pl.clamped = true
          }
        }
        sides.current[i] = pl.side
        if (correct) {
          pos = pl
          note = stackNote || [pl.flipped ? `${name[prefer]} 공간 부족 → ${to[pl.side]}` : '', pl.clamped ? '화면 안으로 고정' : ''].filter(Boolean).join(' · ')
        } else if (prefer === 'top') pos = { x: anchor.x + anchor.w / 2 - size.w / 2, y: anchor.y - 14 - size.h }
        else pos = { x: anchor.x + anchor.w + 12, y: anchor.y }
      }
      placed.current[i] = { x: pos.x, y: pos.y, w: size.w, h: size.h }
      el.style.transform = `translate(${Math.round(pos.x - off.x)}px, ${Math.round(pos.y - off.y)}px)`
      noted.current[i] = !!note
      const n = el.querySelector<HTMLElement>('[data-note]')
      if (n) {
        n.textContent = note
        n.hidden = !note
      }
    })
  }
  /** 스택이 줄어 포커스가 닫힌 겹 안(또는 사라진 요소)에 남았으면 그 겹을 연 키워드로, 없으면 무대 루트로 (창을 닫을 때와 같은 원리) */
  const rescueFocus = (anchors: string[]) => {
    const root = rootRef.current
    const ae = document.activeElement
    if (!root || p.thumbnail) return
    const tip = ae instanceof HTMLElement && root.contains(ae) ? ae.closest<HTMLElement>('[data-tip]') : null
    const lv = tip ? Number(tip.dataset.tip) : -1
    if (lv < x.stack.length && !(focusIn.current && (!ae || ae === document.body))) return
    for (let j = lv; j >= 0; j--) {
      const el = anchors[j] ? kwEl(anchors[j]) : null
      if (el && Number(el.dataset.lv) <= x.stack.length) return focusKw(anchors[j], true)
    }
    x.focusAt = null
    root.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    place()
    paintRings()
    // 겹이 새로 열리거나 내용이 바뀌면 짧게 나타난다 (key 로 다시 마운트하지 않고 Web Animations 로)
    for (let i = 0; i < SLOTS; i++) {
      const id = x.stack[i]?.entry ?? null
      const el = tipRefs.current[i]
      if (id && id !== lastEntry.current[i] && el && motion && !p.thumbnail)
        el.querySelector('[data-card]')?.animate([{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 150 / Math.max(0.05, p.timeScale), easing: 'ease-out' })
      if (id) lastEntry.current[i] = id
    }
    // 창 · 겹을 열고 닫을 때 포커스 옮기기
    const f = x.pendingFocus
    x.pendingFocus = null
    const anchors = prevAnchors.current
    prevAnchors.current = x.stack.map(t => t.anchor)
    if (!f) return rescueFocus(anchors)
    if (f.kind === 'into') {
      const first = tipRefs.current[f.level]?.querySelector<HTMLElement>(`button[data-lv="${f.level + 1}"]`)
      if (first) first.focus({ preventScroll: true })
    } else if (f.kind === 'gloss') {
      // 창 안의 기본 요소: 고른 항목 (효과 끄기의 통짜 목록에는 항목 버튼이 없어 닫기 버튼)
      const root = rootRef.current
      ;(root?.querySelector<HTMLElement>(`[data-row="${x.sel}"]`) ?? root?.querySelector<HTMLElement>('[data-gloss] button'))?.focus({ preventScroll: true })
    } else {
      const o = x.opener
      x.opener = null
      if (o && o.isConnected && !o.closest('[data-gloss]')) o.focus({ preventScroll: true })
      else rootRef.current?.focus({ preventScroll: true })
    }
  })

  /* ───── 입력: 키워드 ───── */
  const onKwEnter = (level: number, key: string, id: string) => {
    x.ptrAt = { tip: level - 1, key }
    openAt(level, key, id, 'pointer')
  }
  const onKwLeave = (level: number) => {
    x.ptrAt = level > 0 && x.stack.length >= level ? { tip: level - 1, key: null } : null
    if (x.echo >= 0) {
      x.echo = -1
      rerender()
    }
    prune()
  }
  const onKwFocus = (level: number, key: string, id: string) => {
    x.focusAt = { tip: level - 1, key }
    if (!suppress.current) openAt(level, key, id, 'key')
  }
  const onKwBlur = (e: FocusEvent<HTMLElement>) => {
    x.focusAt = locate(e.relatedTarget as Element | null)
    prune()
  }
  const onKwClick = (level: number, key: string, id: string, pointerType: string) => {
    if (pointerType === 'touch' || pointerType === 'pen') x.ptrAt = { tip: level - 1, key }
    openAt(level, key, id, pointerType === 'touch' || pointerType === 'pen' ? 'touch' : 'pointer')
    if (x.stack[level]?.anchor === key) lockAt(level) // 누르면 바로 잠금 (터치 · 클릭 · Space)
  }
  const onTipEnter = (i: number) => {
    x.ptrAt = { tip: i, key: null }
    if (x.stack.some(t => t.owner === 'script')) {
      human()
      x.stack.forEach(t => (t.owner = t.owner === 'script' ? 'pointer' : t.owner))
    }
  }
  const onTipLeave = () => {
    x.ptrAt = null
    prune()
  }

  /* ───── 입력: 키보드 (core/stageKeys) ───── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key
    if (e.code === 'KeyG' || k === 'g' || k === 'G') {
      if (!e.repeat) pressGloss()
      return true
    }
    if (x.gloss.open) {
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        moveSel(k === 'ArrowDown' ? 1 : -1)
        return true
      }
      if (k === 'Escape') {
        closeGloss()
        return true
      }
      return false
    }
    const t = e.target as HTMLElement
    const kw = t.closest<HTMLElement>('[data-kw]')
    if (kw) {
      const level = Number(kw.dataset.lv)
      const key = kw.dataset.kw!
      const id = kw.dataset.id!
      human()
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const scopeEl = level === 0 ? rootRef.current : tipRefs.current[level - 1]
        const list = [...(scopeEl?.querySelectorAll<HTMLElement>(`button[data-lv="${level}"]`) ?? [])]
        const next = list[list.indexOf(kw) + (k === 'ArrowRight' ? 1 : -1)]
        next?.focus({ preventScroll: true })
        return true
      }
      if (k === 'ArrowDown' || k === 'Enter') {
        if (kw.dataset.state === 'cycle') {
          openAt(level, key, id, 'key') // 순환: 이미 열린 툴팁을 짚기만 한다
          return true
        }
        if (x.stack[level]?.anchor !== key) openAt(level, key, id, 'key')
        if (!live.current.juice) {
          say('잠금 없음 — 툴팁 안으로 들어갈 수 없다')
          rerender()
          return true
        }
        lockAt(level)
        if (level + 1 >= live.current.maxDepth || !x.stack[level]) say(`깊이 한도 ${live.current.maxDepth} — 더 보려면 용어집(G)`)
        else x.pendingFocus = { kind: 'into', level }
        rerender()
        return true
      }
      if (k === 'ArrowUp') {
        if (level > 0 && x.stack[level - 1]) {
          x.stack = x.stack.slice(0, level)
          focusKw(x.stack[level - 1].anchor, true)
          rerender()
        }
        return true
      }
      if (k === 'Escape') {
        if (!x.stack.length) return false
        const top = x.stack[x.stack.length - 1]
        x.stack = x.stack.slice(0, -1)
        focusKw(top.anchor, true)
        rerender()
        return true
      }
      return false
    }
    if (t === rootRef.current) {
      if (k === 'Enter' || k === 'ArrowDown') {
        const first = lineKws(x.line)[0]
        if (first) focusKw(first.key, false)
        return true
      }
      if (k === 'Escape' && x.stack.length) {
        closeAll()
        return true
      }
    }
    return false
  })
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.code === 'KeyG' || e.key === 'g' || e.key === 'G') releaseGloss()
  }
  const onRootBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    focusIn.current = false
    releaseGloss() // 누른 채 무대를 떠나면 뗀 신호가 오지 않는다
  }
  const onRootPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-keep]')) return
    human()
    closeAll()
  }
  const onRootPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    track(e)
    if (!live.current.juice && x.stack.length) place()
  }
  const onRootPointerLeave = () => {
    pointer.current = null
    prune()
  }
  const onHoldDown = (e: PointerEvent<HTMLDivElement>) => {
    if (p.thumbnail) return
    e.preventDefault()
    rootRef.current?.focus({ preventScroll: true })
    pressGloss()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 */
    }
  }

  /* ───── 그리기 ───── */
  const device = useLastInputDevice(p.thumbnail ? 'mouse' : 'auto')
  const sc = SCENES[x.scene]
  const stack = x.stack
  const keywordPart = stack[0]?.anchor.startsWith('d') ? stack[0].anchor : `d${x.line}.0`

  /** 키워드 하나. level = 0 은 대사, n 은 툴팁 n-1 안 */
  const kw = (level: number, key: string, id: string, label: string, state: 'link' | 'cycle' | 'flat'): ReactNode => {
    const kind = entry(id).kind
    if (state === 'flat')
      return (
        <b key={key} className={s.kwFlat} data-kind={kind} title="깊이 한도 — 더 보려면 용어집">
          {label}
        </b>
      )
    return (
      <button
        key={key}
        type="button"
        className={s.kw}
        data-keep
        data-kind={kind}
        data-kw={key}
        data-lv={level}
        data-id={id}
        data-state={state}
        data-open={stack[level]?.anchor === key || undefined}
        data-part={key === keywordPart ? 'keyword' : undefined}
        data-pin="below"
        tabIndex={p.thumbnail ? -1 : 0}
        onPointerEnter={e => e.pointerType === 'mouse' && (track(e), onKwEnter(level, key, id))}
        onPointerLeave={e => e.pointerType === 'mouse' && (track(e), onKwLeave(level))}
        onFocus={() => onKwFocus(level, key, id)}
        onBlur={onKwBlur}
        onClick={e => onKwClick(level, key, id, (e.nativeEvent as globalThis.PointerEvent).pointerType ?? '')}
      >
        <KindMark kind={kind} size={level === 0 ? 22 : 18} />
        {label}
        {state === 'cycle' && <i className={s.cycleMark}>↑</i>}
      </button>
    )
  }
  const rich = (src: string, level: number, prefix: string, inStack: string[]) =>
    parse(src).map((c, i) => {
      if (!('link' in c)) return <span key={`s${i}`}>{c.text}</span>
      const state = level >= maxDepth ? 'flat' : cycleMode === 'mark' && inStack.includes(c.link) ? 'cycle' : 'link'
      return kw(level, `${prefix}${c.k}`, c.link, c.text, state)
    })

  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const t = stack[i]
    const id = t?.entry ?? lastEntry.current[i] ?? 'cell'
    const e = entry(id)
    const above = stack.slice(0, i + 1).map(u => u.entry)
    const status = !juice ? '잠금 없음 · 커서를 따라다님' : t?.locked ? '고정됨 · 들어갈 수 있다' : '머무르면 고정'
    const lastLevel = i + 1 >= maxDepth
    return (
      <div
        key={i}
        ref={el => {
          tipRefs.current[i] = el
        }}
        className={s.tip}
        data-tip={i}
        data-keep
        data-visible={!!t || undefined}
        data-locked={(t?.locked && juice) || undefined}
        data-echo={x.echo === i || undefined}
        data-part={i === 1 ? 'nested' : undefined}
        style={{ width: TIP_W }}
        onPointerEnter={e2 => e2.pointerType === 'mouse' && (track(e2), onTipEnter(i))}
        onPointerLeave={e2 => e2.pointerType === 'mouse' && (track(e2), onTipLeave())}
      >
        <span className={s.note} data-note hidden />
        <div className={s.card} data-card data-kind={e.kind}>
          <header className={s.tipHead}>
            <KindMark kind={e.kind} size={30} />
            <b>{e.name}</b>
            <small>
              {KIND_LABEL[e.kind]} · {e.role}
            </small>
          </header>
          <p className={s.tipBody}>{rich(e.body, i + 1, `t${i}.`, above)}</p>
          <footer className={s.tipFoot}>
            <svg className={s.ring} viewBox="0 0 36 36" aria-hidden data-part={i === 0 ? 'lock' : undefined}>
              <circle cx="18" cy="18" r="15.9" className={s.ringBg} />
              <circle
                ref={el => {
                  ringRefs.current[i] = el
                }}
                cx="18"
                cy="18"
                r="15.9"
                className={s.ringFg}
                pathLength={100}
              />
              <path className={s.lockGlyph} d="M13 17v-3a5 5 0 0 1 10 0v3M11.5 17h13v9h-13z" />
            </svg>
            <span className={s.status}>{status}</span>
            <span className={s.depth} data-max={lastLevel || undefined}>
              깊이 {i + 1}/{maxDepth}
              {lastLevel ? ' · 한도' : ''}
            </span>
          </footer>
        </div>
      </div>
    )
  })

  const lines = sc.lines.slice(0, x.line + 1).map((l, li) => (
    // key 는 줄 번호만 — 장면이 바뀌어도 요소를 다시 만들지 않는다 (포커스가 body 로 빠지지 않게)
    <div key={li} className={s.line} data-current={li === x.line || undefined}>
      <span className={s.speaker}>
        <KindMark kind="person" size={22} />
        {entry(l.speaker).name}
      </span>
      <p className={s.say}>{rich(l.text, 0, `d${li}.`, [])}</p>
    </div>
  ))

  const sel = ordered.find(it => it.entry.id === x.sel) ?? ordered[0]
  const glossOpen = x.gloss.open
  const glossary = (
    <div className={s.gloss} data-gloss data-keep data-open={glossOpen || undefined} data-mode={x.gloss.mode} aria-hidden={!glossOpen}>
      <div className={s.glossDim} onPointerDown={() => x.gloss.mode !== 'hold' && closeGloss()} />
      <section className={s.glossPanel} role="dialog" aria-label="용어집">
        <header className={s.glossHead}>
          <div>
            <p className={s.eyebrow}>{x.gloss.mode === 'hold' ? '누르고 있는 동안' : x.gloss.mode === 'pause' ? '일시정지' : '미리보기'} · 용어집</p>
            <h2>{!juice ? '전체 사전' : scope === 'scene' ? `지금 장면 — ${sc.title}` : scope === 'seen' ? '지금까지 나온 항목' : '전체 사전 (아직 안 나온 항목 포함)'}</h2>
          </div>
          <span className={s.count}>
            <b>{items.length}</b> / {ENTRIES.length}
          </span>
        </header>
        {juice ? (
          <div className={s.glossBody}>
            <div className={s.glossList} data-part="glossary">
              {KIND_ORDER.map(k => {
                const group = ordered.filter(it => it.entry.kind === k)
                if (!group.length) return null
                return (
                  <div key={k} className={s.group}>
                    <h3>
                      <KindMark kind={k} size={22} />
                      {KIND_LABEL[k]} <small>{group.length}</small>
                    </h3>
                    {group.map(it => (
                      <button
                        key={it.entry.id}
                        type="button"
                        className={s.row}
                        data-row={it.entry.id}
                        data-kind={it.entry.kind}
                        data-sel={it.entry.id === sel?.entry.id || undefined}
                        data-unseen={!it.firstSeen || undefined}
                        tabIndex={glossOpen ? 0 : -1}
                        onClick={() => {
                          x.sel = it.entry.id
                          rerender()
                        }}
                        onFocus={() => {
                          if (x.sel !== it.entry.id) {
                            x.sel = it.entry.id
                            rerender()
                          }
                        }}
                      >
                        <KindMark kind={it.entry.kind} size={24} />
                        <b>{it.entry.name}</b>
                        <small>{it.firstSeen ? it.entry.role : '아직 안 나옴'}</small>
                        {it.fresh && <em className={s.fresh}>새</em>}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className={s.detail}>
              {sel && (
                <>
                  <div className={s.detailHead} data-kind={sel.entry.kind}>
                    <KindMark kind={sel.entry.kind} size={40} />
                    <div>
                      <h3>{sel.entry.name}</h3>
                      <small>
                        {KIND_LABEL[sel.entry.kind]} · {sel.entry.role}
                      </small>
                    </div>
                  </div>
                  <p className={s.detailBody}>
                    {parse(sel.entry.body).map((c, i) =>
                      'link' in c ? (
                        <b key={i} data-kind={entry(c.link).kind}>
                          {c.text}
                        </b>
                      ) : (
                        <span key={i}>{c.text}</span>
                      ),
                    )}
                  </p>
                  <p className={s.where}>
                    {sel.firstSeen
                      ? sel.firstSeen.scene === x.scene && sel.entry.id === sc.place
                        ? `이 장면의 장소 · ${sc.title}`
                        : `처음 나온 곳 · 장면 ${sel.firstSeen.scene + 1} ${SCENES[sel.firstSeen.scene].title} · ${sel.firstSeen.line + 1}번째 대사`
                      : '아직 이야기에 나오지 않았다 — 스포일러'}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={s.dump} data-part="glossary">
            {ordered.map(it => (
              <p key={it.entry.id}>
                <b>{it.entry.name}</b> ({KIND_LABEL[it.entry.kind]}) — {it.entry.body.replace(/\[\[([a-z]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, t?: string) => t ?? entry(id).name)}
              </p>
            ))}
          </div>
        )}
        <footer className={s.glossFoot}>
          <span>
            <KeyCap label="↑↓" size={32} /> 고르기
          </span>
          <span>
            <KeyCap label="G" size={32} /> {x.gloss.mode === 'hold' ? '떼면 닫힘' : '닫기'}
          </span>
          {x.gloss.mode !== 'hold' && (
            <span>
              <KeyCap label="Esc" size={32} /> 닫기
            </span>
          )}
          <button type="button" className={s.close} tabIndex={glossOpen ? 0 : -1} onClick={closeGloss}>
            닫기
          </button>
        </footer>
      </section>
    </div>
  )

  const hint =
    device === 'touch'
      ? [
          [<TouchGlyph key="t" kind="tap" size={32} />, '키워드 탭 = 열고 고정'],
          [<TouchGlyph key="h" kind="hold" size={32} />, '오른쪽 위 버튼 누르고 있기 = 용어집'],
        ]
      : device === 'mouse'
        ? [
            [<MouseGlyph key="m" button="left" size={32} />, juice ? `올리고 ${(lockMs / 1000).toFixed(1)}초 머물면 고정 · 클릭 = 바로 고정` : '올리면 열림 (잠금 없음)'],
            [<KeyCap key="g" label="G" size={32} />, holdMode === 'hold' ? '누르고 있기 = 용어집' : '눌러서 용어집 열기 · 닫기'],
          ]
        : [
            [<KeyCap key="a" label="←→" size={32} />, '키워드'],
            [<KeyCap key="d" label="↓" size={32} />, '고정하고 안으로 (Enter)'],
            [<KeyCap key="u" label="↑" size={32} />, '바깥으로 (Esc 닫기)'],
            [<KeyCap key="g" label="G" size={32} />, holdMode === 'hold' ? '누르고 있기 = 용어집' : '용어집'],
          ]

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-motion={motion || undefined}
      data-paused={!p.playing || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="맥락 용어집 데모 (키워드에서 ↓ · Enter 로 툴팁 안으로, Esc 로 닫기, G 를 누르고 있으면 용어집)"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={() => (focusIn.current = true)}
      onBlur={onRootBlur}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerLeave={onRootPointerLeave}
    >
      <SceneArt scene={x.scene} />

      <header className={s.sceneHead}>
        <p className={s.eyebrow}>
          외곽 탐사대 · 장면 {x.scene + 1}/{SCENES.length}
        </p>
        <h1>{sc.title}</h1>
        <span className={s.placeChip}>
          <KindMark kind="place" size={22} />
          {entry(sc.place).name} · 대사 {x.line + 1}/{sc.lines.length}
        </span>
      </header>

      <div className={s.stackBar} aria-live="polite">
        <span className={s.stackLabel}>툴팁 스택</span>
        {stack.length ? (
          stack.map((t, i) => (
            <span key={i} className={s.crumb} data-kind={entry(t.entry).kind} data-locked={(t.locked && juice) || undefined} data-echo={x.echo === i || undefined}>
              {i > 0 && <i className={s.sep}>›</i>}
              <KindMark kind={entry(t.entry).kind} size={18} />
              {entry(t.entry).name}
              {t.locked && juice ? <em>고정</em> : null}
            </span>
          ))
        ) : (
          <span className={s.crumbEmpty}>비어 있음 — 키워드에 올리거나 포커스</span>
        )}
        <span className={s.depthMeter}>
          {stack.length}/{maxDepth}
        </span>
        {x.toast.text && <span className={s.toast}>{x.toast.text}</span>}
      </div>

      <div className={s.hold} data-part="hold" data-keep data-on={glossOpen || undefined} role="button" aria-pressed={glossOpen} onPointerDown={onHoldDown} onPointerUp={releaseGloss} onPointerCancel={releaseGloss} onLostPointerCapture={releaseGloss}>
        <KeyCap label="G" size={52} />
        <div>
          <b>{holdMode === 'hold' ? '누르고 있는 동안 용어집' : '눌러서 용어집 열기 · 닫기'}</b>
          <small>{juice && scope !== 'all' ? (scope === 'scene' ? `지금 장면 항목 ${items.length}개만` : `지금까지 나온 ${items.length}개`) : `사전 전체 ${ENTRIES.length}개`}</small>
        </div>
      </div>

      <section ref={dlgRef} className={s.dialogue}>
        <div className={s.lines}>{lines}</div>
        {/* 툴팁 칸은 대사 바로 뒤 DOM — Tab 으로도 대사 키워드 다음에 툴팁 안 키워드로 들어간다 (자리는 place() 가 무대 좌표로 잡는다) */}
        {slots}
        <div className={s.dlgFoot}>
          <div className={s.hints}>
            {hint.map(([g, t], i) => (
              <span key={i}>
                {g}
                {t}
              </span>
            ))}
          </div>
          <button type="button" className={s.next} data-keep tabIndex={p.thumbnail ? -1 : 0} onClick={() => advance(false)}>
            다음 대사 ▶
          </button>
        </div>
      </section>

      {glossary}
    </div>
  )
}

/** 종류 표식 — 색과 함께 모양으로도 구분한다: 인물 = 원, 장소 = 핀, 용어 = 마름모 */
function KindMark({ kind, size = 22 }: { kind: Kind; size?: number }) {
  return (
    <svg className={s.mark} data-kind={kind} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {kind === 'person' ? <circle cx="12" cy="12" r="8" /> : kind === 'place' ? <path d="M12 22s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fillRule="evenodd" /> : <path d="M12 3l9 9-9 9-9-9z" />}
    </svg>
  )
}

/** 배경 — 장면마다 다른 실루엣 (가볍게) */
function SceneArt({ scene }: { scene: number }) {
  return (
    <svg className={s.art} viewBox="0 0 1920 1080" aria-hidden data-scene={scene}>
      <defs>
        <linearGradient id="clg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene === 2 ? '#1d1830' : '#0b1522'} />
          <stop offset="1" stopColor={scene === 2 ? '#3a2a3c' : '#1a2a3b'} />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#clg-sky)" />
      {scene === 0 && (
        <g fill="none" stroke="#ffffff14" strokeWidth="4">
          <path d="M0 640 L520 420 H1400 L1920 640" />
          <path d="M520 420 V120 M1400 420 V120 M760 420 V160 M1160 420 V160" />
          <rect x="820" y="230" width="280" height="150" rx="10" stroke="#5ad1ff40" />
          <path d="M860 300 h200 M860 330 h120" stroke="#5ad1ff40" />
          <path d="M120 560 h240 v120 h-240z M1560 560 h240 v120 h-240z" fill="#16222f" />
        </g>
      )}
      {scene === 1 && (
        <g>
          <rect x="560" y="120" width="800" height="420" rx="60" fill="#0f1c2a" stroke="#ffffff1a" strokeWidth="6" />
          <path d="M600 470 Q960 330 1320 470 V500 H600z" fill="#5b3b2c" />
          <path d="M600 500 Q960 420 1320 500 V530 H600z" fill="#3c2a22" />
          <circle cx="1180" cy="220" r="10" fill="#ff6b6b" />
          <path d="M0 620 H1920 V1080 H0z" fill="#101a25" />
        </g>
      )}
      {scene === 2 && (
        <g>
          <path d="M0 640 Q600 590 1920 650 V1080 H0z" fill="#241c28" />
          <path d="M1240 640 L1300 180 L1330 180 L1390 640z M1270 400 h90 M1285 300 h60" fill="none" stroke="#ffffff22" strokeWidth="8" />
          <path d="M1330 180 l60 -40" stroke="#ffffff22" strokeWidth="8" />
          {[
            [1120, 260],
            [1480, 300],
            [1420, 200],
          ].map(([cx, cy]) => (
            <path key={cx} d={`M${cx} ${cy - 18} l18 30 h-36z`} fill="#ff6b6b55" />
          ))}
        </g>
      )}
    </svg>
  )
}
