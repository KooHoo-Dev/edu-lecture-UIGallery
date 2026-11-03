import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { placeFloating, type Side } from '../../core/placement'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { Badge, ICONS, Icon } from './Icons'
import { BRANCH_NAME, BY_ID, TREE, checkLearn, checkRefund, effectText, fitBudget, rankOf, refundAll, replay, rowText, spentPoints, stateOf, type Branch, type NodeState, type SkillNode } from './tree'
import s from './style.module.css'

export { meta } from './meta'

/* 배치 (논리 px) — 지도 창 · 오른쪽 패널. 월드 = 표의 열 · 줄 × 칸 크기 */
const VX = 40, VY = 150, VW = 1340, VH = 890
const SIDE_X = 1410
const CX = 200, CY = 190, PX = 120, PY = 100
const WORLD_W = PX * 2 + Math.max(...TREE.map(n => n.col)) * CX
const WORLD_H = PY * 2 + Math.max(...TREE.map(n => n.row)) * CY
/** 노드 지름(월드 px) · 확대 범위 · 정보 단계 경계 */
const NODE = 96
const Z_MIN = 0.4, Z_MAX = 1.6, FAR = 0.65, NEAR = 1
/** 노드 이름 글자 크기 (px) — 좋은 예는 확대와 무관하게 이 크기 그대로 */
const LABEL_PX = 26
const MANUAL_PAUSE = 6
const wx = (n: SkillNode) => PX + n.col * CX
const wy = (n: SkillNode) => PY + n.row * CY

type Lod = 'far' | 'mid' | 'near'
const lodOf = (z: number): Lod => (z < FAR ? 'far' : z < NEAR ? 'mid' : 'near')
const LOD_TEXT: Record<Lod, string> = { far: '멀리 · 아이콘 + 상태 표식', mid: '중간 · + 단계 (1/3)', near: '가까이 · + 이름 · 다음 수치' }
const STATE_NAME: Record<NodeState, string> = { locked: '잠김', available: '습득 가능', acquired: '습득', maxed: '최대' }
const BRANCH_ICON: Record<Branch, string> = { core: 'badge', harin: 'boot', sera: 'antenna', doyun: 'wrench' }

const EDGES = TREE.flatMap(n => n.req.map(r => ({ from: BY_ID.get(r)!, to: n })))
/** 자동 데모 순서(세 갈래를 번갈아) · 시작 기록 · 첫 선택은 기본 표일 때만. 표를 바꾸면 표 순서 · 빈 트리 · 첫 노드 */
const DEMO = ['base', 'o2', 'relay', 'repair', 'stride', 'scan', 'ping', 'coolant', 'cache', 'decode', 'plating', 'uplink', 'drone', 'joint']
const IS_DEMO = DEMO.length === TREE.length && DEMO.every(id => BY_ID.has(id))
const AUTO_ORDER = IS_DEMO ? DEMO : TREE.map(n => n.id)
const START = IS_DEMO ? ['base', 'stride', 'stride', 'stride', 'scan', 'repair'] : []
const FIRST = IS_DEMO ? 'scan' : TREE[0].id

const hex = (r: number) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
}).join(' ')
const HEX_OUT = hex(49)
const HEX_IN = hex(41)

/** 효과 문장에서 수치 부분만 ("이동 속도 +{v}%" → "+8%") — 가까이 단계의 짧은 표시용 */
const shortValue = (n: SkillNode, rank: number) => {
  const m = /(\S*)\{v\}(\S*)/.exec(n.effect)
  const v = n.values[clamp(rank, 1, n.values.length) - 1]
  return m ? `${m[1]}${v}${m[2]}` : v
}
const rankLabel = (st: NodeState, k: number, max: number) => (st === 'locked' ? '잠김' : st === 'maxed' ? `최대 ${max}/${max}` : `${k}/${max}`)

interface Cam {
  z: number
  x: number
  y: number
  tz: number
  tx: number
  ty: number
  /** 이 화면 점(ax, ay) 아래의 월드 점(wx, wy)을 붙잡은 채 확대 */
  anchor: { wx: number; wy: number; ax: number; ay: number } | null
  moving: boolean
}
const panRange = (x: number, z: number, span: number, view: number) => {
  // 트리가 창 가운데를 넘어 사라지지 않게 — 트리의 한쪽 끝이 창 가운데까지만 간다
  const a = view / 2 - span * z, b = view / 2
  return clamp(x, Math.min(a, b), Math.max(a, b))
}
const centered = (z: number) => ({ x: (VW - WORLD_W * z) / 2, y: (VH - WORLD_H * z) / 2 })
/** 화면 좌표 v 가 창 가장자리 m 안쪽에 들어오게 하는 이동량 */
const inside = (v: number, view: number, m = 150) => (v < m ? m - v : v > view - m ? view - m - v : 0)

/**
 * 스킬트리 · 성장 노드.
 * 트리 데이터와 규칙은 tree.ts(순수 함수), 습득 상태는 ranks 하나. 상태는 입력 때만 바뀌어 React 로 그리고,
 * 팬 · 줌(카메라)은 매 프레임 ref 로 DOM 을 직접 옮긴다. 좋은 예는 노드 좌표만 확대하고 글자는 그대로 두어,
 * 확대 단계(멀리 · 중간 · 가까이)에 따라 보여 줄 정보를 바꾼다. 나쁜 예(효과 끄기)는 트리 전체를 scale() 해 글자도 작아진다.
 */
export default function SkillTree(p: SpecimenProps) {
  const juice = p.juice
  const total = Math.round(num(p.params, 'points', 14))
  const cue = str(p.params, 'stateCue', 'full')
  const labelMode = str(p.params, 'labelMode', 'lod')
  const highlight = bool(p.params, 'highlightAvailable', true)
  const refundRule = str(p.params, 'refundRule', 'free')
  const startZoom = num(p.params, 'startZoom', 0.75)
  const reduce = prefersReducedMotion()

  const [, setV] = useState(0)
  const rerender = () => setV(v => v + 1)
  const R = useRef({
    ...replay(TREE, START, total), // 시작 상태도 습득 규칙으로 쌓는다 (없는 id 는 건너뜀)
    sel: FIRST,
    toast: '노드를 고르면 효과 · 다음 단계 · 필요한 선행이 툴팁에 나온다',
    tone: '' as '' | 'ok' | 'bad',
    shake: '',
    shakeT: 0,
    need: [] as string[],
    flash: 0,
    refunded: 0,
    auto: { pending: false, learns: 0, idle: 0, phase: '' as '' | 'far' | 'near' },
  }).current

  // param · 프리셋이 바뀌어도 다시 마운트되지 않는다 — 포인트가 줄어 넘치면 최근 습득부터 되돌려 예산 안으로
  const budget = useRef(total)
  if (budget.current !== total) {
    budget.current = total
    const n = fitBudget(TREE, R, total)
    if (n) {
      R.need = []
      R.auto.pending = false
      R.toast = `보유 포인트 ${total}점 — 넘친 ${n}단계를 최근 습득부터 되돌림`
      R.tone = 'bad'
    }
  }

  /** 트리 가운데에 맞추되 고른 노드가 창 밖이면 들어올 만큼 옮긴다 (툴팁이 숨지 않게) */
  const startCam = (): Cam => {
    const z = clamp(startZoom, Z_MIN, Z_MAX)
    const c = centered(z)
    const n = BY_ID.get(R.sel)!
    const x = c.x + inside(wx(n) * z + c.x, VW), y = c.y + inside(wy(n) * z + c.y, VH)
    return { z, x, y, tz: z, tx: x, ty: y, anchor: null, moving: false }
  }
  const cam = useRef<Cam>(startCam())
  const startKey = useRef(startZoom)
  if (startKey.current !== startZoom) {
    startKey.current = startZoom
    cam.current = startCam()
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipSide = useRef('right')
  /** paint 가 값이 바뀔 때만 DOM 을 쓰도록 기억해 두는 것: --ns · 툴팁 크기(렌더 뒤에만 다시 잼) · 해설 3번 대상 */
  const last = useRef({ ns: '', tw: 0, th: 0, bx: VW, bh: 0, measure: true, part: '', sel: '' })
  const zoomRef = useRef<HTMLElement>(null)
  const lodRef = useRef<HTMLSpanElement>(null)
  const nodeEls = useRef(new Map<string, HTMLDivElement>())
  const edgeEls = useRef<(SVGLineElement | null)[]>([])

  /* ───── 직접 조작 → 자동 데모 잠시 멈춤 ───── */
  const tRef = useRef(0)
  const realAt = useRef(-1e9)
  const real = () => {
    realAt.current = tRef.current
  }

  /* ───── 카메라 ───── */
  const instant = () => reduce || !p.playing
  const setNow = (z: number, x: number, y: number) => {
    const c = cam.current
    c.z = c.tz = z
    c.x = c.tx = panRange(x, z, WORLD_W, VW)
    c.y = c.ty = panRange(y, z, WORLD_H, VH)
    c.anchor = null
    c.moving = false
  }
  /** 화면 점 (ax, ay) 를 붙잡고 확대 · 축소 (휠 · 핀치는 즉시, 버튼 · 키는 부드럽게) */
  const zoomAround = (factor: number, ax = VW / 2, ay = VH / 2, now = false) => {
    const c = cam.current
    const nz = clamp((c.anchor ? c.tz : c.z) * factor, Z_MIN, Z_MAX)
    const w = { x: (ax - c.x) / c.z, y: (ay - c.y) / c.z }
    if (now || instant()) setNow(nz, ax - w.x * nz, ay - w.y * nz)
    else {
      c.tz = nz
      c.anchor = { wx: w.x, wy: w.y, ax, ay }
      c.moving = false
    }
    paint()
  }
  const flyTo = (z: number, x: number, y: number) => {
    const c = cam.current
    if (instant()) return setNow(z, x, y), paint()
    c.tz = z
    c.tx = panRange(x, z, WORLD_W, VW)
    c.ty = panRange(y, z, WORLD_H, VH)
    c.anchor = null
    c.moving = true
  }
  const fit = (z = Math.min(VW / WORLD_W, VH / WORLD_H)) => {
    const c = centered(z)
    flyTo(z, c.x, c.y)
  }
  const focusNode = (id: string, z = cam.current.tz) => {
    const n = BY_ID.get(id)!
    flyTo(z, VW / 2 - wx(n) * z, VH / 2 - wy(n) * z)
  }
  /** 고른 노드가 창 가장자리 밖이면 들어올 만큼만 옮긴다 (툴팁 자리도 남긴다) */
  const ensureVisible = (id: string) => {
    const c = cam.current
    const n = BY_ID.get(id)!
    const z = c.tz
    const dx = inside(wx(n) * z + c.tx, VW), dy = inside(wy(n) * z + c.ty, VH)
    if (dx || dy) flyTo(z, c.tx + dx, c.ty + dy)
  }
  /** 노드 여럿(잠긴 노드 + 빠진 선행)이 함께 보이게 — 묶음 가운데로, 넘치면 그만큼 축소 */
  const frame = (ids: string[]) => {
    const ns = ids.map(id => BY_ID.get(id)!)
    const xs = ns.map(wx), ys = ns.map(wy)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const z = Math.max(Z_MIN, Math.min(cam.current.tz, (VW - 600) / (x1 - x0 || 1), (VH - 300) / (y1 - y0 || 1)))
    flyTo(z, VW / 2 - ((x0 + x1) / 2) * z, VH / 2 - ((y0 + y1) / 2) * z)
  }

  /* ───── 규칙 (tree.ts 의 순수 함수) ───── */
  const left = () => total - spentPoints(TREE, R.ranks)
  const say = (text: string, tone: '' | 'ok' | 'bad' = '') => {
    R.toast = text
    R.tone = tone
  }
  const select = (id: string, follow = true) => {
    if (R.sel !== id) R.need = []
    R.sel = id
    if (follow) ensureVisible(id)
    rerender()
  }
  const learn = (id: string) => {
    const n = BY_ID.get(id)!
    R.sel = id
    const chk = checkLearn(TREE, R.ranks, total, id)
    if (chk.ok) {
      const k = rankOf(R.ranks, id) + 1
      R.ranks = { ...R.ranks, [id]: k }
      R.history.push(id)
      R.need = []
      say(`${n.name} ${k}/${n.max} 습득 — ${effectText(n, k)} · 포인트 −${n.cost}`, 'ok')
    } else {
      R.shake = id
      R.shakeT = 0.45
      R.need = chk.missing
      say(
        chk.reason === 'req'
          ? `잠김 — 먼저 ${chk.missing.map(m => BY_ID.get(m)!.name).join(' · ')} 습득`
          : chk.reason === 'points'
            ? `포인트 부족 — ${n.cost} 필요, 남은 ${left()}`
            : `이미 최대 단계 — ${n.name} ${n.max}/${n.max}`,
        'bad',
      )
    }
    rerender()
  }
  const refund = (id: string) => {
    const n = BY_ID.get(id)!
    R.sel = id
    if (refundRule === 'reset-only') {
      R.shake = id
      R.shakeT = 0.45
      say('이 규칙은 한 단계씩 되돌릴 수 없다 — 전체 초기화만', 'bad')
      return rerender()
    }
    const chk = checkRefund(TREE, R.ranks, id)
    if (chk.ok) {
      const k = rankOf(R.ranks, id) - 1
      const next = { ...R.ranks }
      if (k > 0) next[id] = k
      else delete next[id]
      R.ranks = next
      const i = R.history.lastIndexOf(id)
      if (i >= 0) R.history.splice(i, 1)
      R.need = []
      say(`${n.name} 되돌림 (${k}/${n.max}) — 포인트 +${n.cost}`, 'ok')
    } else {
      R.shake = id
      R.shakeT = 0.45
      R.need = chk.by
      say(chk.reason === 'needed' ? `되돌릴 수 없다 — ${chk.by.map(m => BY_ID.get(m)!.name).join(' · ')} 이(가) 이 노드를 선행으로 쓴다` : '아직 습득하지 않은 노드', 'bad')
    }
    rerender()
  }
  const resetAll = () => {
    const back = refundAll(TREE, R.ranks)
    R.ranks = {}
    R.history = []
    R.need = []
    R.refunded = back
    R.flash++
    say(`전체 초기화 — 포인트 ${back} 환불`, 'ok')
    rerender()
  }
  const autoPick = (preferSel: boolean) => {
    if (preferSel && checkLearn(TREE, R.ranks, total, R.sel).ok) return R.sel
    return AUTO_ORDER.find(id => checkLearn(TREE, R.ranks, total, id).ok) ?? null
  }

  const handle = (id: string) => {
    if (id === 'learn') {
      const t = autoPick(true)
      if (t) {
        learn(t)
        ensureVisible(t)
      } else {
        say('지금 습득할 수 있는 노드가 없다 (포인트 · 선행 확인)', 'bad')
        rerender()
      }
    } else if (id === 'refund') {
      const last = R.history[R.history.length - 1]
      if (last) {
        refund(last)
        ensureVisible(last)
      } else {
        say('되돌릴 습득이 없다', 'bad')
        rerender()
      }
    } else if (id === 'reset') resetAll()
    else if (id === 'zoom-out') fit(0.45)
    else if (id === 'zoom-in') focusNode(R.sel, 1.25)
    else if (id === 'locked-try') {
      const locked = TREE.filter(n => stateOf(n, R.ranks) === 'locked')
      const t = locked.find(n => n.req.some(r => rankOf(R.ranks, r) > 0)) ?? locked[0]
      if (t) {
        learn(t.id)
        frame([t.id, ...R.need])
      }
    }
  }
  useTrigger(p.trigger, id => {
    real()
    handle(id)
  })

  /* 자동 데모: 습득 가능한 노드를 골라(툴팁) → 습득. 네 번마다 멀리 → 가까이로 정보 단계를 보여 주고,
   * 더 습득할 것이 없으면 잠긴 노드를 눌러 본 뒤 전체 초기화(환불) */
  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.4,
    () => {
      if (tRef.current - realAt.current < MANUAL_PAUSE) return
      const A = R.auto
      if (A.phase === 'far') {
        A.phase = 'near'
        return focusNode(R.sel, 1.2)
      }
      if (A.phase === 'near') {
        A.phase = ''
        const c = startCam()
        return flyTo(c.z, c.x, c.y)
      }
      const pick = autoPick(false)
      if (!pick) {
        A.pending = false
        if (++A.idle === 1) handle('locked-try')
        else if (A.idle >= 3) {
          A.idle = 0
          resetAll()
        }
        return
      }
      A.idle = 0
      if (R.sel !== pick || !A.pending) {
        A.pending = true
        return select(pick)
      }
      A.pending = false
      learn(pick)
      if (++A.learns % 4 === 0) {
        A.phase = 'far'
        fit(0.48)
      }
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임: 카메라 · 흔들림 ───── */
  useGameLoop(p.playing, p.timeScale, dt => {
    tRef.current += dt
    const c = cam.current
    const moving = c.anchor || c.moving // 멈춘 카메라는 다시 그리지 않는다
    if (c.anchor) {
      const a = c.anchor
      c.z = Math.abs(c.z - c.tz) < 0.002 ? c.tz : damp(c.z, c.tz, 14, dt)
      c.x = a.ax - a.wx * c.z
      c.y = a.ay - a.wy * c.z
      if (c.z === c.tz) setNow(c.z, c.x, c.y)
    } else if (c.moving) {
      c.z = damp(c.z, c.tz, 9, dt)
      c.x = damp(c.x, c.tx, 9, dt)
      c.y = damp(c.y, c.ty, 9, dt)
      if (Math.abs(c.z - c.tz) < 0.002 && Math.abs(c.x - c.tx) < 0.5 && Math.abs(c.y - c.ty) < 0.5) setNow(c.tz, c.tx, c.ty)
    }
    if (R.shakeT > 0) {
      R.shakeT -= dt
      if (R.shakeT <= 0) {
        R.shake = ''
        rerender()
      }
    }
    if (moving) paint()
  })

  const paint = () => {
    const root = rootRef.current
    if (!root) return
    const c = cam.current
    const z = c.z
    const L = last.current
    const ns = juice ? clamp(NODE * z, 54, 112) : NODE
    const nsText = `${ns.toFixed(1)}px`
    if (L.ns !== nsText) root.style.setProperty('--ns', (L.ns = nsText))
    const lod: Lod = !juice || labelMode === 'always' ? 'near' : lodOf(z)
    if (root.dataset.lod !== lod) root.dataset.lod = lod
    if (layerRef.current) layerRef.current.style.transform = juice ? '' : `translate(${c.x}px, ${c.y}px) scale(${z})`
    // 좋은 예: 좌표만 확대(글자 · 표식은 화면 px 그대로). 나쁜 예: 월드 좌표 그대로 두고 층 전체를 scale()
    const sx = (n: SkillNode) => (juice ? wx(n) * z + c.x : wx(n))
    const sy = (n: SkillNode) => (juice ? wy(n) * z + c.y : wy(n))
    for (const n of TREE) {
      const el = nodeEls.current.get(n.id)
      if (el) el.style.transform = `translate(${sx(n).toFixed(1)}px, ${sy(n).toFixed(1)}px)`
    }
    EDGES.forEach((e, i) => {
      const l = edgeEls.current[i]
      if (!l) return
      l.setAttribute('x1', sx(e.from).toFixed(1))
      l.setAttribute('y1', sy(e.from).toFixed(1))
      l.setAttribute('x2', sx(e.to).toFixed(1))
      l.setAttribute('y2', sy(e.to).toFixed(1))
    })
    if (zoomRef.current) zoomRef.current.textContent = `${Math.round(z * 100)}%`
    const lodText = juice
      ? labelMode === 'always'
        ? `이름 항상 표시 · 글자 ${LABEL_PX}px`
        : `${LOD_TEXT[lod]} · 글자 ${LABEL_PX}px`
      : `트리 전체 축소 · 글자 ${Math.round(LABEL_PX * z)}px`
    const lodEl = lodRef.current
    if (lodEl && lodEl.textContent !== lodText) {
      lodEl.textContent = lodText
      L.measure = true // 확대 막대 폭이 바뀌었다
    }
    const tip = tipRef.current
    const sel = BY_ID.get(R.sel)
    if (!tip || !sel || !lodEl) return
    const at = (n: SkillNode) => [wx(n) * z + c.x, wy(n) * z + c.y]
    const [cx, cy] = at(sel)
    const r = (juice ? ns : NODE * z) / 2 + 6
    const on = cx > -r && cx < VW + r && cy > -r && cy < VH + r
    if (L.measure) {
      // 크기는 렌더 · 글이 바뀐 뒤에만 잰다 (멈춘 동안 매 프레임 레이아웃을 읽지 않게)
      const bar = lodEl.parentElement!
      L.measure = false
      L.tw = tip.offsetWidth
      L.th = tip.offsetHeight
      L.bx = bar.offsetLeft
      L.bh = bar.offsetTop + bar.offsetHeight
    }
    const w = L.tw, h = L.th
    const hits = (x: number, y: number, n: SkillNode) => {
      const [nx, ny] = at(n)
      return nx > x - r && nx < x + w + r && ny > y - r && ny < y + h + r
    }
    // 후보: 노드의 네 방향 + 창의 네 모서리(노드에서 멀어 3점을 얹는다). 가린 노드마다 1점, 빠진 선행 3점, 고른 노드 · 확대 막대 5점.
    // 툴팁이 "✗ 빠진 선행" 을 말하는데 그 노드를 덮으면 안 된다. 지금 자리보다 1 이상 나을 때만 옮겨 팬 · 줌 중에 오락가락하지 않게
    const cands: [string, number, number, number][] = (['right', 'left', 'bottom', 'top'] as Side[]).map(sd => {
      const pl = placeFloating({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, { w, h }, { x: 12, y: 12, w: VW - 24, h: VH - 24 }, sd, 18)
      return [sd, pl.x, pl.y, 0]
    })
    cands.push(['tl', 12, 12, 3], ['tr', VW - 12 - w, L.bh + 8, 3], ['bl', 12, VH - 12 - h, 3], ['br', VW - 12 - w, VH - 12 - h, 3])
    const score = ([, x, y, base]: (typeof cands)[number]) =>
      TREE.reduce(
        (acc, n) => acc + (hits(x, y, n) ? (n === sel ? 5 : sel.req.includes(n.id) && !rankOf(R.ranks, n.id) ? 3 : 1) : 0),
        base + (x + w > L.bx && y < L.bh ? 5 : 0),
      )
    if (L.sel !== sel.id) [L.sel, tipSide.current] = [sel.id, 'right'] // 새 노드는 옆자리부터 (모서리는 더 나을 때만)
    let pl = cands.find(k => k[0] === tipSide.current)!
    let cur = score(pl)
    for (const k of cands) {
      const sc = score(k)
      if (sc + 1 <= cur) [pl, cur, tipSide.current] = [k, sc, k[0]]
    }
    tip.style.transform = `translate(${pl[1].toFixed(1)}px, ${pl[2].toFixed(1)}px)`
    tip.style.visibility = on ? '' : 'hidden'

    // 해설 3번 대상 — 창 안에 있고 툴팁에 가리지 않은 습득 가능 노드(지금 살 수 있는 것 먼저) 중 고른 노드에서 가장 먼 것
    const seen = (n: SkillNode) => {
      const [x, y] = at(n)
      return x > 60 && x < VW - 60 && y > (x > L.bx - 60 ? L.bh + 150 : 90) && y < VH - 60 && !(on && hits(pl[1], pl[2], n))
    }
    const rank = (n: SkillNode) => {
      const st = nodeEls.current.get(n.id)?.dataset
      return (st?.can ? 2e4 : 0) + (st?.state === 'available' ? 1e4 : 0) + Math.hypot(wx(n) - wx(sel), wy(n) - wy(sel))
    }
    const part = TREE.filter(seen).sort((a, b) => rank(b) - rank(a))[0]?.id ?? TREE[TREE.length - 1].id
    if (part !== L.part) {
      nodeEls.current.get(L.part)?.querySelector('svg')?.removeAttribute('data-part')
      nodeEls.current.get(part)?.querySelector('svg')?.setAttribute('data-part', 'available')
      L.part = part
    }
  }
  useLayoutEffect(() => {
    last.current.measure = true
    paint()
  })

  /* ───── 포인터: 끌어 이동 · 두 손가락 핀치 · 탭/클릭 ───── */
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ sx: number; sy: number; x0: number; y0: number; moved: boolean; node: string | null; pinch: { d0: number } | null } | null>(null)
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = vpRef.current!.getBoundingClientRect()
    const k = r.width / VW || 1
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }
  }
  const nodeAt = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-id]')?.getAttribute('data-id') ?? null : null)
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (p.thumbnail || e.button === 2 || (e.target as Element).closest('button')) return
    real()
    const pt = toLocal(e)
    ptrs.current.set(e.pointerId, pt)
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // 창 밖으로 끌어도 이어지게
    } catch {
      /* 합성 이벤트 등 캡처할 수 없는 포인터 */
    }
    const c = cam.current
    if (ptrs.current.size === 2 && drag.current) {
      const [a, b] = [...ptrs.current.values()]
      drag.current.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
      drag.current.moved = true
    } else drag.current = { sx: pt.x, sy: pt.y, x0: c.x, y0: c.y, moved: false, node: nodeAt(e.target), pinch: null }
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !ptrs.current.has(e.pointerId)) return
    const pt = toLocal(e)
    ptrs.current.set(e.pointerId, pt)
    const c = cam.current
    if (d.pinch && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAround(dist / d.pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2, true)
      d.pinch.d0 = dist || 1
      return
    }
    if (!d.moved && Math.hypot(pt.x - d.sx, pt.y - d.sy) > 8) d.moved = true
    if (d.moved) {
      setNow(c.z, d.x0 + pt.x - d.sx, d.y0 + pt.y - d.sy)
      paint()
    }
  }
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.delete(e.pointerId)) return
    const d = drag.current
    if (!d) return
    if (ptrs.current.size === 0) {
      drag.current = null
      // 마우스는 올리면 툴팁 · 누르면 습득. 터치는 첫 탭 = 고르기(툴팁), 고른 노드를 한 번 더 = 습득
      if (!d.moved && d.node) (e.pointerType === 'mouse' || R.sel === d.node ? learn : select)(d.node)
    } else {
      const c = cam.current
      const pt = [...ptrs.current.values()][0]
      drag.current = { sx: pt.x, sy: pt.y, x0: c.x, y0: c.y, moved: true, node: null, pinch: null }
    }
  }
  const onPointerOver = (e: RPointerEvent<HTMLDivElement>) => {
    const id = nodeAt(e.target)
    if (e.pointerType === 'mouse' && id && id !== R.sel && !drag.current?.moved) {
      real()
      select(id, false)
    }
  }

  /* 휠 확대 — React 의 onWheel 은 passive 라 페이지 스크롤을 막지 못해 직접 붙인다. 최신 함수는 ref 로 */
  const api = useRef({ zoomAround, real, toLocal })
  api.current = { zoomAround, real, toLocal }
  useEffect(() => {
    const vp = vpRef.current
    if (!vp || p.thumbnail) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // Ctrl+휠 = 브라우저 확대 (가로채지 않는다)
      e.preventDefault()
      const a = api.current
      a.real()
      const pt = a.toLocal(e)
      a.zoomAround(Math.exp(-e.deltaY * 0.0015), pt.x, pt.y, true)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [p.thumbnail])

  /* ───── 키보드: 방향키 고르기 · Enter 습득 · Backspace 되돌리기 · +/− 확대 ─────
   * 방향키는 이 표본의 조작 키라 늘 먹는다. Space · 숫자 · J 는 갤러리로 흘려보낸다 */
  const moveSel = (dx: number, dy: number) => {
    const from = BY_ID.get(R.sel)!
    let best: SkillNode | null = null
    let bestScore = Infinity
    for (const n of TREE) {
      const vx = wx(n) - wx(from), vy = wy(n) - wy(from)
      const along = vx * dx + vy * dy
      if (n === from || along <= 0) continue
      // ↑ 는 직계 선행, ↓ 는 직계 후행을 반값으로 — 대각선 위의 선행을 건너뛰고 두 줄 위로 가지 않게
      const link = dy < 0 ? from.req.includes(n.id) : dy > 0 && n.req.includes(from.id)
      const score = (along + 2.5 * Math.abs(vx * dy - vy * dx)) * (link ? 0.5 : 1)
      if (score < bestScore) {
        bestScore = score
        best = n
      }
    }
    if (best) select(best.id)
  }
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key
    if ((e.target as Element).closest?.('button') && (k === 'Enter' || k === ' ')) return
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (dirs[k]) {
      real()
      moveSel(...dirs[k])
      return true
    }
    if (k === 'Enter' || k === 'Backspace' || k === 'Delete') {
      real()
      if (!e.repeat) (k === 'Enter' ? learn : refund)(R.sel) // 누르고 있어도 한 단계만 (입력 소비)
      return true
    }
    if (k === '+' || k === '=' || k === '-' || k === '_') {
      real()
      zoomAround(k === '+' || k === '=' ? 1.25 : 0.8)
      return true
    }
  })

  /* ───── 그리기 ───── */
  const ranks = R.ranks
  const spent = spentPoints(TREE, ranks)
  const remain = total - spent
  const states = new Map(TREE.map(n => [n.id, stateOf(n, ranks)]))
  const can = new Set(TREE.filter(n => checkLearn(TREE, ranks, total, n.id).ok).map(n => n.id))
  const sel = BY_ID.get(R.sel)!
  const selState = states.get(sel.id)!
  const selK = rankOf(ranks, sel.id)
  const selChk = checkLearn(TREE, ranks, total, sel.id)
  // 흐르는 선은 지금 살 수 있는 노드(선행 + 포인트)로 가는 길만
  const edgeState = (e: (typeof EDGES)[number]) => {
    const a = rankOf(ranks, e.from.id) > 0
    if (a && rankOf(ranks, e.to.id) > 0) return 'done'
    if (a && can.has(e.to.id)) return 'open'
    return a ? 'half' : 'locked'
  }
  const hint = selChk.ok
    ? '클릭 · Enter = 습득'
    : selChk.reason === 'req'
      ? '선행을 먼저 습득해야 한다'
      : selChk.reason === 'points'
        ? `포인트 부족 — ${sel.cost} 필요 · 남은 ${remain}`
        : refundRule === 'free'
          ? '우클릭 · Backspace = 한 단계 되돌리기'
          : '되돌리기는 전체 초기화만'

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-cue={cue}
      data-hl={highlight || undefined}
      data-lod="mid"
      style={{ '--ts': Math.max(0.05, p.timeScale) } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="스킬트리 (끌기 이동 · 휠 확대, 키보드: 방향키 고르기 · Enter 습득 · Backspace 되돌리기 · +/− 확대)"
      onKeyDown={onKeyDown}
    >
      <header className={s.head}>
        <b>외곽 탐사대 · 기술 트리</b>
        <span className={s.branches}>
          {(['harin', 'sera', 'doyun'] as Branch[]).map(b => (
            <em key={b} data-branch={b}>
              <Icon name={BRANCH_ICON[b]} className={s.chipIcon} />
              {BRANCH_NAME[b]}
            </em>
          ))}
        </span>
      </header>

      <div
        ref={vpRef}
        className={s.viewport}
        style={{ left: VX, top: VY, width: VW, height: VH }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerOver={onPointerOver}
        onContextMenu={e => {
          e.preventDefault()
          const id = nodeAt(e.target)
          if (id && !p.thumbnail) {
            real()
            refund(id)
          }
        }}
      >
        <div ref={layerRef} className={s.layer}>
          <svg className={s.edges} aria-hidden>
            {EDGES.map((e, i) => (
              <line
                key={`${e.from.id}-${e.to.id}`}
                ref={el => {
                  edgeEls.current[i] = el
                }}
                data-branch={e.to.branch}
                data-state={edgeState(e)}
                data-need={(R.sel === e.to.id && R.need.includes(e.from.id)) || undefined}
              />
            ))}
          </svg>
          {TREE.map(n => {
            const st = states.get(n.id)!
            const k = rankOf(ranks, n.id)
            const hexed = st === 'maxed' && cue === 'full'
            return (
              <div
                key={n.id}
                ref={el => {
                  if (el) nodeEls.current.set(n.id, el)
                }}
                className={s.node}
                data-id={n.id}
                data-branch={n.branch}
                data-state={st}
                data-can={can.has(n.id) || undefined}
                data-sel={R.sel === n.id || undefined}
                data-need={R.need.includes(n.id) || undefined}
                data-shake={R.shake === n.id || undefined}
              >
                <i className={s.selRing} />
                {/* 해설 3번 data-part 는 paint 가 창 안의 습득 가능 노드 하나의 이 모양에 단다 */}
                <svg className={s.shape} viewBox="-50 -50 100 100" aria-hidden>
                  {hexed ? <polygon className={s.outer} points={HEX_OUT} /> : <circle className={s.outer} r="47" />}
                  {hexed ? <polygon className={s.body} points={HEX_IN} /> : <circle className={s.body} r="40" />}
                  <path className={s.glyph} d={ICONS[n.icon] ?? ICONS.star} transform="translate(-21 -21) scale(1.75)" />
                </svg>
                <Badge state={st} className={s.badge} />
                <div className={s.label}>
                  <b className={s.name}>{n.name}</b>
                  <span className={s.line2}>
                    <em className={s.rank}>{rankLabel(st, k, n.max)}</em>
                    <span className={s.next}>{st === 'maxed' ? shortValue(n, k) : st === 'locked' ? '선행 필요' : `→ ${shortValue(n, k + 1)}`}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 툴팁 — 효과 · 다음 단계 수치 · 필요한 선행. 창 안에서 오른쪽 → 넘치면 왼쪽 → 고정 */}
        <div ref={tipRef} className={s.tip} data-part="tooltip" data-state={selState} data-branch={sel.branch}>
          <div className={s.tipHead}>
            <Icon name={sel.icon} className={s.tipIcon} />
            <div>
              <b>{sel.name}</b>
              <span>
                {BRANCH_NAME[sel.branch]}
                <em data-state={selState}>
                  {STATE_NAME[selState]} <i className={s.num}>{selK}/{sel.max}</i>
                </em>
              </span>
            </div>
          </div>
          <p>{selK > 0 ? `현재 ${effectText(sel, selK)}` : '아직 습득하지 않음'}</p>
          <p className={s.tipNext}>
            {selK < sel.max ? (
              <>
                다음 단계 <b>{effectText(sel, selK + 1)}</b> · 비용 {sel.cost}
              </>
            ) : (
              '최대 단계'
            )}
          </p>
          {sel.req.length > 0 && (
            <ul className={s.tipReq}>
              <li>필요한 선행{sel.req.length > 1 ? ' (모두)' : ''}</li>
              {sel.req.map(r => {
                const ok = rankOf(ranks, r) > 0
                return (
                  <li key={r} data-ok={ok || undefined}>
                    {ok ? '✓' : '✗'} {BY_ID.get(r)!.name}
                  </li>
                )
              })}
            </ul>
          )}
          <p className={s.tipFoot} data-bad={(!selChk.ok && selChk.reason !== 'max') || undefined}>
            {hint}
          </p>
        </div>

        <div className={s.zoomBar} data-part="lod">
          <button type="button" tabIndex={-1} aria-label="축소" onClick={() => (real(), zoomAround(0.8))}>
            −
          </button>
          <b ref={zoomRef} className={s.num}>
            {Math.round(cam.current.z * 100)}%
          </b>
          <button type="button" tabIndex={-1} aria-label="확대" onClick={() => (real(), zoomAround(1.25))}>
            +
          </button>
          <button type="button" tabIndex={-1} className={s.fitBtn} onClick={() => (real(), fit())}>
            맞춤
          </button>
          <span ref={lodRef} />
        </div>
      </div>

      <aside className={s.side} style={{ left: SIDE_X, top: VY }}>
        <div className={s.points}>
          <span>남은 포인트</span>
          <b key={R.flash} className={s.num} data-flash={R.flash > 0 || undefined} data-low={remain <= 0 || undefined}>
            {remain}
          </b>
          <span className={s.num}>
            / {total} · 사용 {spent}
          </span>
        </div>

        <ul className={s.legend} data-part="states">
          {(['locked', 'available', 'acquired', 'maxed'] as NodeState[]).map(st => (
            <li key={st} data-state={st} data-branch="harin">
              <svg className={s.shape} viewBox="-50 -50 100 100" aria-hidden>
                {st === 'maxed' && cue === 'full' ? <polygon className={s.outer} points={HEX_OUT} /> : <circle className={s.outer} r="47" />}
                {st === 'maxed' && cue === 'full' ? <polygon className={s.body} points={HEX_IN} /> : <circle className={s.body} r="40" />}
                <path className={s.glyph} d={ICONS.boot} transform="translate(-21 -21) scale(1.75)" />
              </svg>
              <Badge state={st} className={s.badge} />
              <b>{STATE_NAME[st]}</b>
              <span>{cue === 'full' ? LEGEND_NOTE[st] : '색으로만 구분'}</span>
            </li>
          ))}
        </ul>

        <div className={s.actions}>
          <button type="button" tabIndex={p.thumbnail ? -1 : 0} onClick={() => (real(), learn(R.sel))}>
            습득 <KeyCap label="Enter" size={56} />
          </button>
          <button type="button" tabIndex={p.thumbnail ? -1 : 0} onClick={() => (real(), refund(R.sel))} data-off={refundRule !== 'free' || undefined}>
            되돌리기 <KeyCap label="⌫" size={52} />
          </button>
          <button type="button" tabIndex={p.thumbnail ? -1 : 0} onClick={() => (real(), resetAll())}>
            초기화
          </button>
        </div>

        <div className={s.data} data-part="data">
          <h4>표의 한 줄 — id · 이름 · 갈래 · 최대 · 선행 · 비용 · 열 · 줄</h4>
          <code>{rowText(sel)}</code>
          <p>선행 검사 · 환불 계산은 화면과 분리된 순수 함수</p>
        </div>

        <p className={s.toast} data-tone={R.tone || undefined} key={R.toast}>
          {R.toast}
        </p>
      </aside>
    </div>
  )
}

const LEGEND_NOTE: Record<NodeState, string> = {
  locked: '점선 원 · 자물쇠 · "잠김"',
  available: '밝은 고리 · ＋ · "0/3"',
  acquired: '채운 원 · 반원 · "1/3"',
  maxed: '육각 이중 테두리 · 별 · "최대"',
}
