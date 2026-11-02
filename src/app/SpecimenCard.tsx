import { useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion } from '../core/flash'
import { defaultParams } from '../core/params'
import { GROUPS, PARADIGMS, TAGS } from '../core/taxonomy'
import type { PlannedSpecimen, SpecimenModule } from '../core/types'
import { hrefSpecimen } from './router'
import { Stage } from './Stage'

/**
 * 갤러리 카드 — 평소엔 정지, 마우스를 올리거나 포커스하면 자동 데모 재생.
 * 무대는 카드가 화면 근처에 올 때 처음 만든다. 홈 첫 화면 시간이 표본 수에 비례해 늘지 않게 하려는 것
 * (표본 13개 기준 메인 스레드 시간의 대부분이 카드 무대 생성이었다). 한 번 만든 무대는 유지하고, 화면 밖 정지는 Stage 가 맡는다.
 */
export function SpecimenCard({ mod }: { mod: SpecimenModule }) {
  const m = mod.meta
  const [hover, setHover] = useState(false)
  const [mounted, setMounted] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const params = useMemo(() => defaultParams(m.params), [m.params])
  const aspect = m.stage.aspect === '9:16' ? '9:16' : '16:9'
  const play = hover && !prefersReducedMotion()

  useEffect(() => {
    if (mounted) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setMounted(true), { rootMargin: '300px 0px' })
    io.observe(stageRef.current!)
    return () => io.disconnect()
  }, [mounted])

  const wake = () => {
    setHover(true)
    setMounted(true)
  }
  return (
    <a
      className="card"
      href={hrefSpecimen(m.id)}
      onPointerEnter={wake}
      onPointerLeave={() => setHover(false)}
      onFocus={wake}
      onBlur={() => setHover(false)}
    >
      <div ref={stageRef} className="card-stage" data-aspect={aspect}>
        {mounted && <Stage mod={mod} params={params} juice playing={play} timeScale={1} trigger={null} autoplay aspect={aspect} thumbnail />}
      </div>
      <div className="card-body">
        <div className="card-tags">
          {m.paradigms.map(p => (
            <span key={p} className="chip chip-sm" data-p={p}>
              {PARADIGMS[p].short}
            </span>
          ))}
          {m.tags?.map(t => (
            <span key={t} className="chip chip-sm chip-outline" title={TAGS[t].desc}>
              {TAGS[t].name}
            </span>
          ))}
          <span className="stars" aria-label={`Unity 난이도 ${m.difficulty}`}>
            {'★'.repeat(m.difficulty)}
            <span aria-hidden className="stars-off">
              {'★'.repeat(3 - m.difficulty)}
            </span>
          </span>
        </div>
        <h3>{m.title}</h3>
        <p>{m.oneLiner}</p>
        {m.inspiredBy.length > 0 && <p className="card-inspired">Inspired by {m.inspiredBy.map(i => i.title).join(' · ')}</p>}
      </div>
    </a>
  )
}

export function PlannedCard({ p }: { p: PlannedSpecimen }) {
  return (
    <div className="card card-planned" aria-label={`${p.title} (제작 중)`}>
      <div className="card-stage card-stage-planned" data-aspect="16:9">
        <span className="planned-label">제작 중</span>
        <span className="planned-group" aria-hidden>
          {p.group} · {GROUPS[p.group].name}
        </span>
      </div>
      <div className="card-body">
        <div className="card-tags">
          {p.paradigms.map(x => (
            <span key={x} className="chip chip-sm" data-p={x}>
              {PARADIGMS[x].short}
            </span>
          ))}
        </div>
        <h3>{p.title}</h3>
        <p>{p.oneLiner}</p>
      </div>
    </div>
  )
}
