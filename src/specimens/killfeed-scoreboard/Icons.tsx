import type { TeamId, WeaponId } from './model'

/* 직접 그린 아이콘 — 훈련 장비 실루엣 (실제 총기 · 원작 아이콘을 따라 그리지 않았다). 색은 currentColor */
const WEAPON_PATH: Record<WeaponId, string> = {
  // 펄스 소총: 긴 몸통 + 개머리 + 손잡이
  pulse: 'M2 10h9l3-3h28v3h20v5H42v3h-7l-3 7h-7l2-7H15l-4 4H2z',
  // 산탄 방출기: 짧고 굵은 몸통 + 벌어진 입구
  scatter: 'M4 9h9l3-3h24l12-4v22l-12-4H30l-3 7h-7l2-7H14l-4 3H4z',
  // 정밀 조준총: 아주 긴 총열 + 위쪽 조준경
  longshot: 'M2 13h9l2-3h12V5h14v5h25v4H40v3h-6l-2 7h-6l2-7H13l-2 3H2z',
  // 충격 수류탄: 원 + 번개 홈
  shock: 'M32 3a11 11 0 1 0 .01 0zM33 7l-6 9h5l-2 7 7-10h-5l2-6z',
  // 진압봉: 비스듬한 막대 + 손잡이 가드
  baton: 'M10 22l34-17 3 4-34 17zM6 20l6-3 4 6-6 3z',
  // 경계 밖: 점선 칸 밖으로 나가는 화살표
  boundary: 'M6 4h4v4H6zM6 12h4v4H6zM6 20h4v4H6zM16 12h22V6l14 8-14 8v-6H16z',
}

export function WeaponIcon({ id }: { id: WeaponId }) {
  return (
    <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden>
      <path d={WEAPON_PATH[id]} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

/** 정밀 타격 — 원 + 네 방향 눈금 (색이 아니라 모양으로 읽힌다) */
export function PrecisionMark() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-label="정밀 타격">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" strokeWidth="2.6" />
    </svg>
  )
}

/** 팀 표식 — 우리 팀 캡슐, 상대 팀 삼각 (갤러리 공통 실루엣 규칙) */
export function TeamMark({ team, size = 22 }: { team: TeamId; size?: number }) {
  return (
    <svg viewBox="0 0 20 24" width={size * 0.84} height={size} aria-hidden>
      {team === 'orbit' ? <rect x="4" y="1" width="12" height="22" rx="6" fill="currentColor" /> : <path d="M10 1 L19 23 H1 Z" fill="currentColor" />}
    </svg>
  )
}

/** 핑 막대 — 낮을수록 막대가 많다. 높으면 막대가 줄고 숫자 옆에 '!' */
export function PingBars({ ms }: { ms: number }) {
  const n = ms < 50 ? 3 : ms < 100 ? 2 : 1
  return (
    <svg viewBox="0 0 18 16" width="22" height="20" aria-hidden>
      {[0, 1, 2].map(i => (
        <rect key={i} x={i * 6} y={10 - i * 5} width="4" height={6 + i * 5} fill="currentColor" opacity={i < n ? 1 : 0.22} />
      ))}
    </svg>
  )
}
