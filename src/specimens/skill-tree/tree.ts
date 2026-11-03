/* 스킬트리 데이터 + 규칙 — 화면과 분리한 순수 함수만 둔다 (React · DOM 없음).
 * 트리는 TSV 표 한 장이다. 엑셀 · 구글 시트에서 짠 표를 그대로 붙여 넣는다. Unity 판도 같은 표를 TextAsset 으로 읽는다.
 * 열: id · 이름 · 갈래 · 최대 단계 · 선행 id(쉼표, 없으면 -) · 단계당 비용 · 열(x) · 줄(y) · 아이콘 · 효과({v} 자리) · 단계별 수치(/) */

export const TREE_TSV = `id	name	branch	max	req	cost	col	row	icon	effect	values
base	기본 훈련	core	1	-	1	4	0	badge	산소 용량 +{v}	10
stride	지형 주파	harin	3	base	1	1	1	boot	이동 속도 +{v}%	4/8/12
scan	지표 스캔	harin	2	stride	1	0	2	scan	스캔 반경 +{v}m	5/10
o2	산소 절약	harin	3	stride	1	2	2	tank	산소 소모 −{v}%	5/10/15
cache	보급 상자 탐지	harin	1	scan,o2	1	1	3	crate	지도에 상자 {v}곳 표시	3
relay	중계 안테나	sera	2	base	1	4	1	antenna	통신 거리 +{v}m	50/100
ping	위치 핑	sera	3	relay	1	3	2	ping	핑 표시 +{v}초	2/4/6
decode	신호 해독	sera	2	relay	1	5	2	wave	해독 속도 +{v}%	15/30
uplink	궤도 업링크	sera	1	ping,decode	2	4	3	orbit	기지 직통 {v}회	1
repair	응급 수리	doyun	3	base	1	7	1	wrench	수리량 +{v}	10/20/30
coolant	냉각 순환	doyun	2	repair	1	6	2	cell	냉각 셀 +{v}초	5/10
plating	보강 장갑	doyun	3	repair	1	8	2	shield	받는 피해 −{v}%	4/8/12
drone	정비 드론	doyun	1	coolant,plating	2	7	3	drone	{v}초마다 자동 수리	8
joint	합동 탐사	core	1	cache,uplink	3	2.5	4	star	세 갈래 효과 +{v}%	10`

export type Branch = 'core' | 'harin' | 'doyun' | 'sera'
export type NodeState = 'locked' | 'available' | 'acquired' | 'maxed'
export type Ranks = Record<string, number>

export interface SkillNode {
  id: string
  name: string
  branch: Branch
  max: number
  req: string[]
  cost: number
  col: number
  row: number
  icon: string
  effect: string
  values: string[]
}

export const BRANCH_NAME: Record<Branch, string> = { core: '공통', harin: '하린 · 탐사', doyun: '도윤 · 정비', sera: '세라 · 통신' }

/** 표 → 노드 목록. 머리 줄과 빈 줄 · # 주석은 건너뛰고, 칸마다 앞뒤 공백을 지운다(엑셀의 "scan, o2").
 * 없는 선행 id 는 바로 알린다 (표를 잘못 붙여 넣은 경우) */
export function parseTree(tsv: string): SkillNode[] {
  const rows = tsv.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('id\t'))
  const nodes = rows.map(l => {
    const c = l.split('\t').map(x => x.trim())
    return {
      id: c[0],
      name: c[1],
      branch: c[2] as Branch,
      max: Number(c[3]),
      req: c[4] === '-' ? [] : c[4].split(',').map(x => x.trim()),
      cost: Number(c[5]),
      col: Number(c[6]),
      row: Number(c[7]),
      icon: c[8],
      effect: c[9],
      values: c[10].split('/'),
    }
  })
  const ids = new Set(nodes.map(n => n.id))
  if (!nodes.length) throw new Error('스킬트리 표: 노드가 없다')
  for (const n of nodes) for (const r of n.req) if (!ids.has(r)) throw new Error(`스킬트리 표: ${n.id} 의 선행 ${r} 가 없다`)
  return nodes
}

export const TREE = parseTree(TREE_TSV)
export const BY_ID = new Map(TREE.map(n => [n.id, n]))

export const rankOf = (r: Ranks, id: string) => r[id] ?? 0

/** 선행 조건: 선행 노드가 모두 1단계 이상 */
export const reqMet = (n: SkillNode, r: Ranks) => n.req.every(id => rankOf(r, id) > 0)

export function stateOf(n: SkillNode, r: Ranks): NodeState {
  const k = rankOf(r, n.id)
  if (k >= n.max) return 'maxed'
  if (k > 0) return 'acquired'
  return reqMet(n, r) ? 'available' : 'locked'
}

export const spentPoints = (tree: SkillNode[], r: Ranks) => tree.reduce((sum, n) => sum + rankOf(r, n.id) * n.cost, 0)

export type LearnCheck = { ok: true } | { ok: false; reason: 'max' | 'req' | 'points'; missing: string[] }

/** 한 단계 올릴 수 있는가 — 최대 → 선행 → 포인트 순서로 본다 (이유가 여럿이면 플레이어가 먼저 풀어야 할 것부터) */
export function checkLearn(tree: SkillNode[], r: Ranks, total: number, id: string): LearnCheck {
  const n = tree.find(x => x.id === id)
  if (!n || rankOf(r, id) >= n.max) return { ok: false, reason: 'max', missing: [] }
  const missing = n.req.filter(x => rankOf(r, x) === 0)
  if (missing.length) return { ok: false, reason: 'req', missing }
  if (total - spentPoints(tree, r) < n.cost) return { ok: false, reason: 'points', missing: [] }
  return { ok: true }
}

export type RefundCheck = { ok: true } | { ok: false; reason: 'none' | 'needed'; by: string[] }

/** 한 단계 되돌릴 수 있는가 — 마지막 1단계를 빼면 이 노드를 선행으로 쓰는 습득 노드가 고아가 된다 */
export function checkRefund(tree: SkillNode[], r: Ranks, id: string): RefundCheck {
  const k = rankOf(r, id)
  if (k === 0) return { ok: false, reason: 'none', by: [] }
  const by = k === 1 ? tree.filter(n => n.req.includes(id) && rankOf(r, n.id) > 0).map(n => n.id) : []
  return by.length ? { ok: false, reason: 'needed', by } : { ok: true }
}

/** 습득 기록을 규칙(checkLearn)대로 다시 쌓는다. 표에 없는 id · 규칙에 걸리는 단계는 건너뛴다 */
export function replay(tree: SkillNode[], ids: string[], total: number) {
  const ranks: Ranks = {}
  const history: string[] = []
  for (const id of ids)
    if (checkLearn(tree, ranks, total, id).ok) {
      ranks[id] = rankOf(ranks, id) + 1
      history.push(id)
    }
  return { ranks, history }
}

/** 예산이 줄어 쓴 포인트가 넘치면 기록 끝에서부터 checkRefund 를 통과하는 단계를 되돌린다. 되돌린 단계 수를 돌려준다 */
export function fitBudget(tree: SkillNode[], s: { ranks: Ranks; history: string[] }, total: number) {
  let n = 0
  while (spentPoints(tree, s.ranks) > total) {
    let i = s.history.length - 1
    while (i >= 0 && !checkRefund(tree, s.ranks, s.history[i]).ok) i--
    if (i < 0) {
      s.ranks = {}
      s.history = []
      return n + 1
    }
    const id = s.history[i]
    const k = rankOf(s.ranks, id) - 1
    s.ranks = { ...s.ranks, [id]: k }
    if (!k) delete s.ranks[id]
    s.history.splice(i, 1)
    n++
  }
  return n
}

/** 전체 초기화로 돌려받는 포인트 (= 쓴 포인트 전부) */
export const refundAll = (tree: SkillNode[], r: Ranks) => spentPoints(tree, r)

/** 효과 문장. rank 0 이면 1단계 수치 */
export const effectText = (n: SkillNode, rank: number) => n.effect.replace('{v}', n.values[Math.max(0, Math.min(n.values.length, rank) - 1)])

/** 화면에 보여 줄 표의 한 줄 (탭은 보이게 ⇥ 로) */
export const rowText = (n: SkillNode) =>
  [n.id, n.name, n.branch, n.max, n.req.join(',') || '-', n.cost, n.col, n.row].join(' ⇥ ')
