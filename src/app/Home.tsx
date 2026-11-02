import { useMemo, useState } from 'react'
import { PLANNED, SPECIMENS } from '../core/registry'
import { GROUPS, PARADIGMS, PLATFORMS, PRINCIPLES, TAGS } from '../core/taxonomy'
import type { GroupId, Paradigm, Platform, Principle, SpecimenModule, SpecimenTag } from '../core/types'
import { load, save } from '../core/storage'
import { SpecimenCard, PlannedCard } from './SpecimenCard'

interface Filters {
  q: string
  paradigm: Paradigm | ''
  platform: Platform | ''
  principle: Principle | ''
  tag: SpecimenTag | ''
}
const EMPTY: Filters = { q: '', paradigm: '', platform: '', principle: '', tag: '' }

export function Home() {
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, ...load('filters', EMPTY) }))
  const update = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch }
    setF(next)
    save('filters', next)
  }
  const active = f.q || f.paradigm || f.platform || f.principle || f.tag

  const match = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return (m: SpecimenModule['meta']) =>
      (!q || [m.title, m.titleEn, m.oneLiner, ...m.genres, ...m.inspiredBy.map(i => i.title)].join(' ').toLowerCase().includes(q)) &&
      (!f.paradigm || m.paradigms.includes(f.paradigm)) &&
      (!f.platform || m.platforms.includes(f.platform)) &&
      (!f.principle || m.principles.includes(f.principle)) &&
      (!f.tag || (m.tags ?? []).includes(f.tag))
  }, [f])

  const shown = SPECIMENS.filter(s => match(s.meta))
  const groups = (Object.keys(GROUPS) as GroupId[]).map(g => ({
    id: g,
    items: shown.filter(s => s.meta.group === g),
    planned: active ? [] : PLANNED.filter(p => p.group === g),
  }))

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">유니티 개발자 양성과정 · 게임 UI 레퍼런스</p>
          <h1>
            잘 만든 게임 UI를 <em>해부</em>하고, <em>재현</em>하고, <em>Unity로</em> 만든다
          </h1>
          <p className="lead">
            표본마다 직접 값을 바꿔 보고, 슬로모션으로 타이밍을 확인하고, 효과를 꺼서 '나쁜 예'와 비교해 보세요. 아래쪽에는 UGUI와 UI Toolkit 구현법이 있습니다.
          </p>
        </div>
        <ul className="paradigm-legend" aria-label="UI 패러다임 4분류">
          {(['non-diegetic', 'diegetic', 'spatial', 'meta'] as Paradigm[]).map(p => (
            <li key={p}>
              <button className="paradigm-item" data-p={p} aria-pressed={f.paradigm === p} onClick={() => update({ paradigm: f.paradigm === p ? '' : p })}>
                <span className="paradigm-icon" aria-hidden />
                <span>
                  <b>{PARADIGMS[p].name}</b> <small>{PARADIGMS[p].short}</small>
                  <span className="paradigm-desc">{PARADIGMS[p].desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="filters" aria-label="필터">
        <label className="search">
          <span className="sr-only">검색</span>
          <input type="search" placeholder="검색: 체력, 미니맵, 소울라이크…" value={f.q} onChange={e => update({ q: e.target.value })} />
        </label>
        <Select label="패러다임" value={f.paradigm} onChange={v => update({ paradigm: v as Paradigm | '' })} options={Object.entries(PARADIGMS).map(([k, v]) => [k, v.name])} />
        <Select label="플랫폼" value={f.platform} onChange={v => update({ platform: v as Platform | '' })} options={Object.entries(PLATFORMS)} />
        <Select label="원리" value={f.principle} onChange={v => update({ principle: v as Principle | '' })} options={PRINCIPLES.map(p => [p, p])} />
        <Select label="주제" value={f.tag} onChange={v => update({ tag: v as SpecimenTag | '' })} options={Object.entries(TAGS).map(([k, v]) => [k, v.name])} />
        {active && (
          <button className="btn btn-ghost" onClick={() => update(EMPTY)}>
            필터 초기화
          </button>
        )}
        <span className="filters-count">
          표본 {shown.length}개{!active && PLANNED.length > 0 && ` · 제작 중 ${PLANNED.length}개`}
        </span>
      </section>

      {groups.map(
        g =>
          (g.items.length > 0 || g.planned.length > 0) && (
            <section key={g.id} className="group" aria-labelledby={`g-${g.id}`}>
              <header className="group-head">
                <span className="group-letter" aria-hidden>
                  {g.id}
                </span>
                <div>
                  <h2 id={`g-${g.id}`}>{GROUPS[g.id].name}</h2>
                  <p>{GROUPS[g.id].desc}</p>
                </div>
              </header>
              <div className="grid">
                {g.items.map(s => (
                  <SpecimenCard key={s.meta.id} mod={s} />
                ))}
                {g.planned.map(p => (
                  <PlannedCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          ),
      )}
      {shown.length === 0 && <p className="empty">조건에 맞는 표본이 없습니다. 필터를 바꿔 보세요.</p>}
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="select">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">전체</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
