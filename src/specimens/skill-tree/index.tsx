import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { placeFloating, type Placement, type Side } from '../../core/placement'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { Badge, ICONS, Icon } from './Icons'
import { BRANCH_NAME, BY_ID, TREE, checkLearn, checkRefund, effectText, rankOf, refundAll, rowText, spentPoints, stateOf, type Branch, type NodeState, type Ranks, type SkillNode } from './tree'
import s from './style.module.css'

export { meta } from './meta'

/* 배치 (논리 px) — 지도 창 · 오른쪽 패널. 월드 = 표의 열 · 줄 × 칸 크기 */
const VX = 40, VY = 150, VW = 1340, VH = 890
const SIDE_X = 1410
const CX = 200, CY = 190, PX = 120, PY = 100
const WORLD_W = PX * 2 + 8 * CX
const WORLD_H = PY * 2 + 4 * CY
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
/** 자동 데모가 고르는 순서 — 세 갈래를 번갈아 */
const AUTO_ORDER = ['base', 'o2', 'relay', 'repair', 'stride', 'scan', 'ping', 'coolant', 'cache', 'decode', 'plating', 'uplink', 'drone', 'joint']
const START: Ranks = { base: 1, stride: 3, scan: 1, repair: 1 }
const START_HISTORY = ['base', 'stride', 'stride', 'stride', 'scan', 'repair']

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
    ranks: { ...START } as Ranks,
    history: [...START_HISTORY],
    sel: 'scan',
    toast: '노드를 고르면 효과 · 다음 단계 · 필요한 선행이 툴팁에 나온다',
    tone: '' as '' | 'ok' | 'bad',
    shake: '',
    shakeT: 0,
    need: [] as string[],
    flash: 0,
    refunded: 0,
    auto: { pending: false, learns: 0, idle: 0, phase: '' as '' | 'far' | 'near' },
  }).current

  const startCam = (): Cam => {
    const z = clamp(startZoom, Z_MIN, Z_MAX)
    const c = centered(z)
    return { z, x: c.x, y: c.y, tz: z, tx: c.x, ty: c.y, anchor: null, moving: false }
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
  const tipSide = useRef<Side>('right')
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
    const x = wx(n) * z + c.tx, y = wy(n) * z + c.ty
    const m = 150
    const dx = x < m ? m - x : x > VW - m ? VW - m - x : 0
    const dy = y < m ? m - y : y > VH - m ? VH - m - y : 0
    if (dx || dy) flyTo(z, c.tx + dx, c.ty + dy)
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
            : `${n.name} 은 이미 최대 단계`,
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
        ensureVisible(t.id)
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
        const c = centered(startZoom)
        return flyTo(clamp(startZoom, Z_MIN, Z_MAX), c.x, c.y)
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
    paint()
  })

  const paint = () => {
    const root = rootRef.current
    if (!root) return
    const c = cam.current
    const z = c.z
    const ns = juice ? clamp(NODE * z, 54, 112) : NODE
    root.style.setProperty('--ns', `${ns.toFixed(1)}px`)
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
    if (lodRef.current)
      lodRef.current.textContent = juice
        ? labelMode === 'always'
          ? `이름 항상 표시 · 글자 ${LABEL_PX}px`
          : `${LOD_TEXT[lod]} · 글자 ${LABEL_PX}px`
        : `트리 전체 축소 · 글자 ${Math.round(LABEL_PX * z)}px`
    const tip = tipRef.current
    const sel = BY_ID.get(R.sel)
    if (tip && sel) {
      const cx = wx(sel) * z + c.x, cy = wy(sel) * z + c.y
      const r = (juice ? ns : NODE * z) / 2 + 6
      const on = cx > -r && cx < VW + r && cy > -r && cy < VH + r
      const size = { w: tip.offsetWidth, h: tip.offsetHeight }
      const place = (side: Side) => placeFloating({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, size, { x: 12, y: 12, w: VW - 24, h: VH - 24 }, side, 18)
      // 네 방향 중 노드를 덜 가리는 쪽 — 선행 노드를 가리면 3배로 센다(툴팁이 "필요한 선행" 을 말하는데 그 노드를 덮으면 안 된다).
      // 지금 쪽보다 1 이상 나을 때만 옮겨 팬 · 줌 중에 툴팁이 오락가락하지 않게 한다
      const covered = (pl: Placement) =>
        TREE.reduce((acc, n) => {
          if (n === sel) return acc
          const nx = wx(n) * z + c.x, ny = wy(n) * z + c.y
          const hit = nx > pl.x - r && nx < pl.x + size.w + r && ny > pl.y - r && ny < pl.y + size.h + r
          return acc + (hit ? (sel.req.includes(n.id) ? 3 : 1) : 0)
        }, 0)
      let pl = place(tipSide.current)
      let cur = covered(pl)
      for (const side of ['right', 'left', 'bottom', 'top'] as Side[]) {
        const alt = place(side)
        const sc = covered(alt)
        if (sc + 1 <= cur) {
          pl = alt
          cur = sc
          tipSide.current = side
        }
      }
      tip.style.transform = `translate(${pl.x.toFixed(1)}px, ${pl.y.toFixed(1)}px)`
      tip.style.visibility = on ? '' : 'hidden'
    }
  }
  useLayoutEffect(() => paint())

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
      const score = along + 2.5 * Math.abs(vx * dy - vy * dx)
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
  const sel = BY_ID.get(R.sel)!
  // 해설 번호용 습득 가능 노드 — 툴팁에 가리지 않게 고른 노드에서 가장 먼 것. 없으면 마지막 노드(번호는 DOM 에 늘 있다)
  const firstAvail =
    TREE.filter(n => states.get(n.id) === 'available').sort((a, b) => Math.hypot(wx(b) - wx(sel), wy(b) - wy(sel)) - Math.hypot(wx(a) - wx(sel), wy(a) - wy(sel)))[0]?.id ?? 'joint'
  const selState = states.get(sel.id)!
  const selK = rankOf(ranks, sel.id)
  const selChk = checkLearn(TREE, ranks, total, sel.id)
  const edgeState = (e: (typeof EDGES)[number]) => {
    const a = rankOf(ranks, e.from.id) > 0
    if (a && rankOf(ranks, e.to.id) > 0) return 'done'
    if (a && states.get(e.to.id) === 'available') return 'open'
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
      data-hl={(highlight && juice) || undefined}
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
                data-can={checkLearn(TREE, ranks, total, n.id).ok || undefined}
                data-sel={R.sel === n.id || undefined}
                data-need={R.need.includes(n.id) || undefined}
                data-shake={R.shake === n.id || undefined}
                data-part={n.id === firstAvail ? 'available' : undefined}
              >
                <i className={s.selRing} />
                <svg className={s.shape} viewBox="-50 -50 100 100" aria-hidden>
                  {hexed ? <polygon className={s.outer} points={HEX_OUT} /> : <circle className={s.outer} r="47" />}
                  {hexed ? <polygon className={s.body} points={HEX_IN} /> : <circle className={s.body} r="40" />}
                  <path className={s.glyph} d={ICONS[n.icon]} transform="translate(-21 -21) scale(1.75)" />
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
            습득 <KeyCap label="Enter" size={30} />
          </button>
          <button type="button" tabIndex={p.thumbnail ? -1 : 0} onClick={() => (real(), refund(R.sel))} data-off={refundRule !== 'free' || undefined}>
            되돌리기 <KeyCap label="⌫" size={30} />
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
