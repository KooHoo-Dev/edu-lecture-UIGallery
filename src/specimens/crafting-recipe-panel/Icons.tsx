import type { ReactNode } from 'react'
import type { IconId } from './data'

/* 직접 그린 자원 · 완성품 아이콘 (64×64, 선 위주). 보관함 표본과 같은 선 굵기 · 둥근 끝으로 맞췄다.
 * data-fill: 채움 · data-soft: 흐린 보조선 */
const P: Record<IconId, ReactNode> = {
  repair: (
    <>
      <rect x="8" y="18" width="48" height="36" rx="5" />
      <path d="M24 18v-6h16v6" />
      <path d="M32 26v20M22 36h20" strokeWidth="6" />
    </>
  ),
  coolcell: (
    <>
      <rect x="18" y="12" width="28" height="44" rx="8" />
      <path d="M26 8h12" />
      <path d="M32 24v20M23.5 29l17 10M40.5 29l-17 10" data-soft />
    </>
  ),
  circuit: (
    <>
      <rect x="16" y="16" width="32" height="32" rx="4" />
      <path d="M24 16V8M40 16V8M24 56v-8M40 56v-8M16 24H8M16 40H8M56 24h-8M56 40h-8" />
      <rect x="26" y="26" width="12" height="12" rx="2" data-fill />
    </>
  ),
  oxygen: (
    <>
      <rect x="18" y="16" width="28" height="42" rx="10" />
      <path d="M26 16v-6h12v6M38 10h8" />
      <path d="M18 30h28M18 44h28" data-soft />
    </>
  ),
  kit: (
    <>
      <rect x="6" y="20" width="44" height="34" rx="5" />
      <path d="M21 20v-6h14v6" />
      <path d="M28 28v18M19 37h18" strokeWidth="6" />
      <path d="M50 12v14M43 19h14" />
    </>
  ),
  cellpack: (
    <>
      <rect x="8" y="16" width="14" height="38" rx="5" />
      <rect x="25" y="16" width="14" height="38" rx="5" />
      <rect x="42" y="16" width="14" height="38" rx="5" />
      <path d="M4 34h56" />
      <path d="M12 12h6M29 12h6M46 12h6" data-soft />
    </>
  ),
  tape: (
    <>
      <circle cx="28" cy="32" r="20" />
      <circle cx="28" cy="32" r="8" data-soft />
      <path d="M28 52h30v-8" />
    </>
  ),
  relay: (
    <>
      <path d="M32 30v26M22 56h20M32 30l-10 26M32 30l10 26" />
      <circle cx="32" cy="24" r="5" data-fill />
      <path d="M20 14a17 17 0 0 0 0 20M44 14a17 17 0 0 1 0 20M13 8a26 26 0 0 0 0 32M51 8a26 26 0 0 1 0 32" data-soft />
    </>
  ),
  o2pack: (
    <>
      <rect x="10" y="18" width="20" height="38" rx="8" />
      <rect x="34" y="18" width="20" height="38" rx="8" />
      <path d="M16 18v-6h8v6M40 18v-6h8v6M10 34h44" />
    </>
  ),
  flare: (
    <>
      <path d="M18 56l18-28" strokeWidth="8" />
      <path d="M42 18l4-10M46 22l10-4M40 14l-4-8M50 28l8 2" />
      <circle cx="40" cy="22" r="5" data-fill />
    </>
  ),
  mask: (
    <>
      <path d="M12 22c8-8 32-8 40 0l-4 20c-4 8-28 8-32 0z" />
      <circle cx="32" cy="38" r="6" data-fill />
      <path d="M12 26H4M60 26h-8M26 48l-4 10M38 48l4 10" data-soft />
    </>
  ),
  blanket: (
    <>
      <path d="M8 20l24-10 24 10v28L32 58 8 48z" />
      <path d="M8 34l24 10 24-10M32 10v48" data-soft />
    </>
  ),
  jammer: (
    <>
      <path d="M32 10l18 30H14z" />
      <path d="M10 50l44-34" strokeWidth="5" />
      <path d="M8 54a34 34 0 0 1 4-8M56 12a34 34 0 0 1-4 8" data-soft />
    </>
  ),
  visor: (
    <>
      <path d="M10 46a22 22 0 0 1 44 0v4H10z" />
      <path d="M13 34h38v9H13z" data-fill />
      <path d="M54 30l6-4" />
    </>
  ),
  cutter: (
    <>
      <rect x="6" y="26" width="32" height="13" rx="3" />
      <path d="M38 29h10l5 3.5-5 3.5H38" />
      <path d="M15 39v12h9V39" />
      <path d="M55 32.5c5-2 6-6 4-10 4 3 4 8-1 11" data-fill />
    </>
  ),
  reactor: (
    <>
      <circle cx="32" cy="32" r="7" data-fill />
      <ellipse cx="32" cy="32" rx="25" ry="10" />
      <ellipse cx="32" cy="32" rx="25" ry="10" transform="rotate(60 32 32)" />
      <ellipse cx="32" cy="32" rx="25" ry="10" transform="rotate(-60 32 32)" />
    </>
  ),
}

export function Icon({ id, className }: { id: IconId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      {P[id]}
    </svg>
  )
}

/** 모자람 표시 — 색만이 아니라 모양(✕ 원)으로도 */
export const ShortMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 8l8 8M16 8l-8 8" />
  </svg>
)
/** 충족 표시 — 체크 */
export const OkMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)
