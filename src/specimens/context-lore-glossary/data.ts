/* 맥락 용어집 데이터 — 화면과 분리한 순수 데이터 + 질의 함수.
 * 글 안의 키워드는 [[id]] 또는 [[id|보이는 글자]] 로 적는다 (Unity 판은 같은 표기를 TMP <link="id"> 로 바꾼다).
 * 장면 · 대사 노드에는 태그(말한 사람 · 글 속 키워드 · 장면 장소)가 달려 있고, 용어집은 "지금 장면에서 지금까지 나온 항목" 만 질의한다. */

export type Kind = 'person' | 'term' | 'place'

export interface Entry {
  id: string
  name: string
  kind: Kind
  /** 한 줄 소개 (용어집 목록) */
  role: string
  /** 설명. 안의 [[id]] 가 하위 툴팁 키워드가 된다 */
  body: string
}

export interface Line {
  speaker: string
  text: string
}

export interface Scene {
  id: string
  title: string
  /** 장면 장소 — 대사에 나오지 않아도 이 장면의 항목이다 */
  place: string
  lines: Line[]
}

export const KIND_LABEL: Record<Kind, string> = { person: '인물', term: '용어', place: '장소' }
export const KIND_ORDER: Kind[] = ['person', 'place', 'term']

export const ENTRIES: Entry[] = [
  { id: 'harin', name: '하린', kind: 'person', role: '탐사대장', body: '외곽 탐사대 대장. [[doyun]]의 정비 보고와 [[sera]]의 신호 분석을 듣고 회수 경로를 정한다.' },
  { id: 'doyun', name: '도윤', kind: 'person', role: '정비사', body: '[[base]]의 정비사. 동력로의 [[cell]]을 직접 갈아 끼운다. 대장 [[harin]]과 오래 일했다.' },
  { id: 'sera', name: '세라', kind: 'person', role: '통신 담당', body: '[[tower]]이 끊긴 뒤로 [[drone]] 신호를 손으로 골라낸다. 찾은 것은 [[harin]]에게 바로 보고한다.' },
  { id: 'base', name: '궤도 정비 기지', kind: 'place', role: '탐사대 거점', body: '행성 궤도에 떠 있는 탐사대 거점. 동력은 [[cell]]에 기대고, 정비는 [[doyun]]이 맡는다.' },
  { id: 'surface', name: '지표 탐사 구역', kind: 'place', role: '행성 표면', body: '기지 아래 행성 표면. 북쪽 끝에 [[tower]]이 있고, 숨을 쉬려면 [[oxygen]]이 필요하다.' },
  { id: 'tower', name: '북쪽 통신탑', kind: 'place', role: '무너진 중계탑', body: '[[surface]] 북쪽의 중계탑. 무너진 뒤로 [[drone]]이 모여든다. 고치려면 [[circuit]]이 필요하다.' },
  { id: 'cell', name: '냉각 셀', kind: 'term', role: '동력로 소모품', body: '동력로의 열을 빼는 소모품. 다 쓰면 [[base]] 동력이 내려간다. 남은 열이 [[drone]]을 끌어들인다.' },
  { id: 'drone', name: '잔해 드론', kind: 'term', role: '적 · 무인기', body: '부서진 위성 조각으로 움직이는 무인기. [[cell]]의 열을 따라온다. 잔해에서 [[circuit]]이 나온다.' },
  { id: 'circuit', name: '회로 조각', kind: 'term', role: '복구 재료', body: '[[drone]] 잔해에서 나오는 부품. [[tower]] 복구에 쓴다.' },
  { id: 'kit', name: '수리 키트', kind: 'term', role: '현장 수리 도구', body: '현장 수리 도구 묶음. [[doyun]]이 꾸린다. [[circuit]]을 끼워 넣을 때 쓴다.' },
  { id: 'oxygen', name: '산소 캔', kind: 'term', role: '휴대 산소', body: '[[surface]]에서 쓰는 휴대 산소. 한 캔으로 약 40분 버틴다.' },
]

export const SCENES: Scene[] = [
  {
    id: 'hangar',
    title: '격납고 점검',
    place: 'base',
    lines: [
      { speaker: 'doyun', text: '[[cell]] 두 개가 또 바닥났어요. 이대로면 내일 아침 [[base]] 동력이 내려가요.' },
      { speaker: 'harin', text: '회수조를 꾸리자. [[sera]], 궤도에 남은 신호 있어?' },
      { speaker: 'sera', text: '격납고 바깥에 [[cell]] 열 신호가 셋. 둘은 가까워요.' },
    ],
  },
  {
    id: 'shuttle',
    title: '강하 셔틀',
    place: 'surface',
    lines: [
      { speaker: 'sera', text: '[[tower]] 쪽에서 [[drone]] 신호가 늘고 있어요.' },
      { speaker: 'harin', text: '[[circuit]] 챙길 기회네. [[doyun]], [[oxygen]]은?' },
      { speaker: 'doyun', text: '한 사람당 두 캔. [[kit]]도 실었어요.' },
    ],
  },
  {
    id: 'tower-foot',
    title: '북쪽 통신탑 아래',
    place: 'tower',
    lines: [
      { speaker: 'doyun', text: '드론이 모인 건 버려진 [[cell]] 열 때문이에요.' },
      { speaker: 'sera', text: '[[drone]]을 떼어 내면 [[tower]] 신호가 돌아와요.' },
      { speaker: 'harin', text: '좋아. [[kit]] 꺼내고, [[base]]에 복구 시작한다고 전해.' },
    ],
  },
]

const BY_ID = new Map(ENTRIES.map(e => [e.id, e]))
export const entry = (id: string) => BY_ID.get(id)!

export type Chunk = { text: string } | { link: string; text: string; k: number }

/** "[[id]]" · "[[id|글자]]" 표기를 글 조각과 키워드 조각으로 나눈다. k = 그 글 안에서 몇 번째 키워드인지 */
export function parse(src: string): Chunk[] {
  const out: Chunk[] = []
  const re = /\[\[([a-z]+)(?:\|([^\]]+))?\]\]/g
  let last = 0
  let k = 0
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) })
    out.push({ link: m[1], text: m[2] ?? entry(m[1]).name, k: k++ })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ text: src.slice(last) })
  return out
}

/** 글 안 키워드 id 들 (나온 순서, 중복 포함) */
export const linksOf = (src: string) => parse(src).flatMap(c => ('link' in c ? [c.link] : []))

/** 대사 노드 하나의 태그 = 말한 사람 + 글 속 키워드 */
const lineTags = (l: Line) => [l.speaker, ...linksOf(l.text)]

export type Scope = 'scene' | 'seen' | 'all'

export interface GlossaryItem {
  entry: Entry
  /** 지금 줄에서 처음 나온 항목 */
  fresh: boolean
  /** 처음 나온 곳 (장면 번호 · 대사 번호). 아직 안 나왔으면 null — 'all' 범위에서만 생긴다 */
  firstSeen: { scene: number; line: number } | null
}

/** 처음 나온 곳 — 장면 장소는 그 장면 첫 줄에 나온 것으로 친다 */
function firstSeenMap(): Map<string, { scene: number; line: number }> {
  const m = new Map<string, { scene: number; line: number }>()
  SCENES.forEach((sc, si) => {
    if (!m.has(sc.place)) m.set(sc.place, { scene: si, line: 0 })
    sc.lines.forEach((l, li) => lineTags(l).forEach(id => m.has(id) || m.set(id, { scene: si, line: li })))
  })
  return m
}
const FIRST_SEEN = firstSeenMap()

const before = (a: { scene: number; line: number }, scene: number, line: number) => a.scene < scene || (a.scene === scene && a.line <= line)

/**
 * 용어집 질의. scene = 지금 장면의 0..line 대사에 태그된 항목 + 장면 장소,
 * seen = 처음부터 지금 줄까지 나온 항목, all = 사전 전체(아직 안 나온 항목까지 — 정보 과부하 · 스포일러).
 */
export function glossaryFor(scope: Scope, scene: number, line: number): GlossaryItem[] {
  const sc = SCENES[scene]
  let ids: string[]
  if (scope === 'all') ids = ENTRIES.map(e => e.id)
  else if (scope === 'seen') ids = ENTRIES.filter(e => FIRST_SEEN.get(e.id) && before(FIRST_SEEN.get(e.id)!, scene, line)).map(e => e.id)
  else ids = [...new Set([sc.place, ...sc.lines.slice(0, line + 1).flatMap(lineTags)])]
  return ENTRIES.filter(e => ids.includes(e.id)).map(e => {
    const f = FIRST_SEEN.get(e.id) ?? null
    return { entry: e, fresh: !!f && f.scene === scene && f.line === line, firstSeen: f && before(f, scene, line) ? f : null }
  })
}

/** 가나다순 (효과 끄기 — 종류 구분 없이 사전 순서) */
export const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, 'ko')
