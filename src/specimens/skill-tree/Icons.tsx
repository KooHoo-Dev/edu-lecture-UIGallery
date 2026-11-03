/* 직접 그린 아이콘 (24×24 선 그림). 노드 아이콘은 표의 icon 열 이름으로 고른다 */
import type { NodeState } from './tree'

export const ICONS: Record<string, string> = {
  badge: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4',
  boot: 'M7 3h5v8l6 3c1.5.8 2 2 2 3v2H4V3 M4 15h16',
  scan: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 12l5-5 M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  tank: 'M8 6h8v14H8z M10 3h4v3h-4 M8 11h8 M11 14h2v3h-2z',
  crate: 'M4 8l8-4 8 4v9l-8 4-8-4z M4 8l8 4 8-4 M12 12v9',
  antenna: 'M12 10v11 M8 21h8 M12 10l-4 11 M12 10l4 11 M8 6a5 5 0 0 1 8 0 M5 3.5a9 9 0 0 1 14 0',
  ping: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z M12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  wave: 'M2 12h3l2-6 3 12 3-9 2 5 2-2h5',
  orbit: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M3 15c2 4 16 0 18-6 M18 5l3 4-4 1',
  wrench: 'M14 4a5 5 0 0 0-5 6l-6 6 3 3 6-6a5 5 0 0 0 6-5l-3 2-2-1-1-2z',
  cell: 'M7 5h10v15H7z M10 2h4v3 M12 8l-2 5h4l-2 5',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z M8 9h8 M8 13h8',
  drone: 'M9 10h6v4H9z M4 7h5 M15 7h5 M6.5 7v3 M17.5 7v3 M6.5 10H9 M15 10h2.5 M12 14v3',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
}

/** 상태 표식 — 색이 없어도 모양으로 읽힌다: 자물쇠 · 더하기 · 반 찬 원 · 별 */
export const BADGE: Record<NodeState, string> = {
  locked: 'M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z M12 15v2',
  available: 'M12 5v14 M5 12h14',
  acquired: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M12 4v16',
  maxed: ICONS.star,
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d={ICONS[name] ?? ICONS.star} />
    </svg>
  )
}

export function Badge({ state, className }: { state: NodeState; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden data-state={state}>
      <path d={BADGE[state]} />
      {state === 'acquired' && <path d="M12 4a8 8 0 0 0 0 16z" data-fill />}
    </svg>
  )
}
