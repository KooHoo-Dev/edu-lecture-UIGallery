import type { GroupId, InputKind, Paradigm, Platform, Principle, SpecimenTag } from './types'

export const GROUPS: Record<GroupId, { name: string; desc: string }> = {
  A: { name: 'HUD · 상태', desc: '체력·자원·쿨다운처럼 지금 내 상태를 알려 주는 요소' },
  B: { name: '길찾기 · 목표', desc: '어디를 보고, 어디로 가야 하는지 알려 주는 요소' },
  C: { name: '알림 · 피드백', desc: '방금 일어난 일을 놓치지 않게 알려 주는 요소' },
  D: { name: '메뉴 · 흐름', desc: '게임 밖 화면과 화면 사이의 이동' },
  E: { name: '아이템 · 성장', desc: '모으고, 비교하고, 고르는 화면' },
  F: { name: '대화 · 서사', desc: '이야기를 읽고 선택하는 화면' },
  G: { name: '입력 · 접근성', desc: '누구나, 어떤 장치로든 조작할 수 있게' },
}

export const PARADIGMS: Record<Paradigm, { name: string; short: string; desc: string }> = {
  diegetic: { name: 'Diegetic', short: '세계 안', desc: '게임 세계 안에 실제로 존재하고 캐릭터도 볼 수 있는 UI (예: 장비에 붙은 표시등)' },
  'non-diegetic': { name: 'Non-diegetic', short: '화면 위', desc: '화면 위에 덧씌운 전통적인 HUD. 캐릭터는 볼 수 없다' },
  spatial: { name: 'Spatial', short: '공간', desc: '3D 공간에 배치되지만 캐릭터는 모르는 UI (예: 머리 위 이름표, 데미지 숫자)' },
  meta: { name: 'Meta', short: '화면 효과', desc: '화면 자체의 변화로 상태를 표현 (예: 피격 시 붉은 테두리)' },
  menu: { name: 'Menu', short: '메뉴', desc: '게임 플레이 밖의 메뉴 화면' },
}

export const PRINCIPLES: Principle[] = ['가독성', '시각 위계', '즉각 피드백', '일관성', '어포던스', '인지 부하', '몰입', '접근성']

export const PLATFORMS: Record<Platform, string> = { pc: 'PC', console: '콘솔', mobile: '모바일' }

/* 그룹을 늘리는 대신 태그로 묶는다: 접근성 표본은 메뉴 · 대화 · 입력 그룹에 흩어져 있다 (2026-11-02 결정) */
export const TAGS: Record<SpecimenTag, { name: string; desc: string }> = {
  accessibility: { name: '접근성', desc: '접근성 기능 자체가 학습 목표인 표본 — 글자 크기, 자막 · 캡션, 색각, 시간 제한 끄기, 조작 재설정 …' },
}
export const INPUTS: Record<InputKind, string> = { mouse: '마우스', keyboard: '키보드', gamepad: '게임패드', touch: '터치' }
