/* 배틀패스 데이터 — 화면(칸)과 분리된 순수 모델. Unity 판의 PassModel.cs 와 같은 규칙이다.
 * 칸 상태는 저장하지 않고 '레벨 · 받음 기록 · 프리미엄 보유' 에서 매번 계산한다(상태 머신의 입력만 저장).
 *   잠김 ─(레벨 도달)→ 받을 수 있음 ─(받기 요청)→ 받는 중 ─(서버 확인)→ 받음
 *   프리미엄 줄은 레벨에 도달해도 보유 전에는 '패스 필요' (잠김의 한 종류) */

export type Track = 'free' | 'prem'
export type TierState = 'none' | 'locked' | 'need-prem' | 'claimable' | 'claiming' | 'claimed'
export type RewardKind = 'credit' | 'kit' | 'cell' | 'chip' | 'oxygen' | 'skin' | 'emote' | 'frame'

export interface Reward {
  kind: RewardKind
  name: string
  count: number
  /** 10 레벨마다 나오는 큰 보상 (외형 · 테두리) */
  big: boolean
}

export const XP_PER_LEVEL = 1000
/** 서버가 받기를 확인하는 데 걸리는 시간(게임 시간 초) — 모형 */
export const SERVER_DELAY = 0.35

export const KIND_NAME: Record<RewardKind, string> = {
  credit: '크레딧',
  kit: '수리 키트',
  cell: '냉각 셀',
  chip: '회로 조각',
  oxygen: '산소 캔',
  skin: '외형',
  emote: '이모트',
  frame: '테두리',
}

/** 보상 아이콘 (24×24 viewBox, 선 그림). 종류마다 모양이 다르다 */
export const KIND_PATH: Record<RewardKind, string> = {
  credit: 'M12 3a9 9 0 1 0 0.01 0Z M12 7v10 M9 9.5h4.5a2 2 0 0 1 0 4H9.5a2 2 0 0 0 0 4H15',
  kit: 'M4 7h16v12H4Z M9 7V4h6v3 M12 10v6 M9 13h6',
  cell: 'M8 4h8v16H8Z M10 2h4v2 M8 9h8 M8 14h8',
  chip: 'M7 7h10v10H7Z M10 7V3 M14 7V3 M10 21v-4 M14 21v-4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
  oxygen: 'M8 7a4 4 0 0 1 8 0v13H8Z M10 3h4v2 M8 12h8',
  skin: 'M8 3l4 2 4-2 5 4-3 4-2-1v11H8V10l-2 1-3-4Z',
  emote: 'M4 5h16v11H11l-5 4v-4H4Z M9 10h0.01 M15 10h0.01 M9 13q3 2 6 0',
  frame: 'M12 2l8.5 5v10L12 22l-8.5-5V7Z M12 6l5 3v6l-5 3-5-3V9Z',
}

const SKINS = ['하린 극지 정찰복', '도윤 정비 작업복', '세라 통신 헤드셋', '탐사선 주황 줄무늬', '드론 사냥꾼 휘장', '궤도 기지 테두리', '외곽 별빛 테두리', '하린 야간 위장복', '도윤 은빛 공구띠', '시즌 4 완주 휘장']
const EMOTES = ['엄지 척', '경례', '어깨 으쓱', '손 흔들기', '박수']

/** level 번째 칸의 보상. 무료 줄은 freeEvery 칸마다(그 사이는 빈칸 = null), 프리미엄 줄은 모든 칸 */
export function rewardFor(level: number, track: Track, freeEvery: number): Reward | null {
  const big = level % 10 === 0
  if (track === 'free') {
    if (level % freeEvery !== 0 && level !== 1) return null
    if (big) return { kind: 'frame', name: SKINS[(level / 10 + 4) % SKINS.length], count: 1, big: true }
    const k = (level * 7) % 4
    if (k === 0) return { kind: 'credit', name: KIND_NAME.credit, count: 100 + (level % 3) * 50, big: false }
    if (k === 1) return { kind: 'kit', name: KIND_NAME.kit, count: 2, big: false }
    if (k === 2) return { kind: 'oxygen', name: KIND_NAME.oxygen, count: 2, big: false }
    return { kind: 'chip', name: KIND_NAME.chip, count: 5, big: false }
  }
  if (big) return { kind: 'skin', name: SKINS[(level / 10 - 1) % SKINS.length], count: 1, big: true }
  if (level % 5 === 0) return { kind: 'emote', name: `이모트 · ${EMOTES[(level / 5) % EMOTES.length]}`, count: 1, big: false }
  const j = level % 3
  if (j === 0) return { kind: 'cell', name: KIND_NAME.cell, count: 3, big: false }
  if (j === 1) return { kind: 'credit', name: KIND_NAME.credit, count: 300, big: false }
  return { kind: 'chip', name: KIND_NAME.chip, count: 12, big: false }
}

export interface PassState {
  level: number
  /** 지금 레벨 안의 경험치 (0 ~ XP_PER_LEVEL) */
  xp: number
  count: number
  freeEvery: number
  premium: boolean
  /** 받음 기록 — `free:12` 처럼 줄:레벨 */
  claimed: Set<string>
  /** 서버에 받기를 요청해 확인을 기다리는 칸 */
  claiming: Set<string>
}

export const key = (level: number, track: Track) => `${track}:${level}`

/** 상태 머신: 저장된 입력(레벨 · 받음 · 요청 중 · 프리미엄)에서 칸 상태를 계산한다 */
export function tierState(s: PassState, level: number, track: Track): TierState {
  if (!rewardFor(level, track, s.freeEvery)) return 'none'
  const k = key(level, track)
  if (s.claimed.has(k)) return 'claimed'
  if (s.claiming.has(k)) return 'claiming'
  if (level > s.level) return 'locked'
  if (track === 'prem' && !s.premium) return 'need-prem'
  return 'claimable'
}

/** 지금 받을 수 있는 칸 전부 (모두 받기 대상) — 왼쪽부터 */
export function claimables(s: PassState): { level: number; track: Track }[] {
  const out: { level: number; track: Track }[] = []
  for (let l = 1; l <= Math.min(s.level, s.count); l++)
    for (const t of ['free', 'prem'] as Track[]) if (tierState(s, l, t) === 'claimable') out.push({ level: l, track: t })
  return out
}

/** 같은 종류끼리 묶은 결과 요약 (모두 받기 결과 창). 보상은 요청할 때 적어 둔 것을 쓴다 — 그 사이 설정이 바뀌어도 받은 것은 그대로 */
export function summarize(rewards: Reward[]) {
  const map = new Map<string, Reward>()
  for (const r of rewards) {
    const id = r.big || r.kind === 'emote' ? `${r.kind}:${r.name}` : r.kind
    const cur = map.get(id)
    if (cur) cur.count += r.count
    else map.set(id, { ...r })
  }
  return [...map.values()].sort((a, b) => Number(b.big) - Number(a.big))
}

/** 시작 상태: Lv 23 · 640 XP, Lv 17 까지 받음, 프리미엄 없음 */
export function initialPass(count: number, freeEvery: number, premium: boolean): PassState {
  const s: PassState = { level: Math.min(23, count), xp: 640, count, freeEvery, premium, claimed: new Set(), claiming: new Set() }
  for (let l = 1; l <= 17; l++) {
    s.claimed.add(key(l, 'free'))
    if (premium) s.claimed.add(key(l, 'prem'))
  }
  return s
}

/* ───── 시각 ───── */
/** 시뮬레이션의 서버 기준 시각 (UTC) 과 시즌 종료 시각 */
export const SERVER_START = Date.UTC(2026, 10, 2, 5, 47, 27)
export const SEASON_END = SERVER_START + (((6 * 24 + 4) * 60 + 12) * 60 + 33) * 1000
export const DAY = 86400000

const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
/** 남은 시간 → "6일 04:12:33" / 하루 안쪽은 "04:12:33" */
export function formatLeft(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(t / 86400)
  const hms = `${two((t % 86400) / 3600)}:${two((t % 3600) / 60)}:${two(t % 60)}`
  return d > 0 ? `${d}일 ${hms}` : hms
}
/** 시각 → "11.02 05:47:27" (offsetH 시간대) */
export function formatClock(ms: number, offsetH = 0) {
  const d = new Date(ms + offsetH * 3600000)
  return `${two(d.getUTCMonth() + 1)}.${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`
}
