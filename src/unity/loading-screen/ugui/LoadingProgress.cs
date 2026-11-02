// 로딩 화면의 계산만 모은 순수 C# (UGUI · UI Toolkit 공통).
// - 표시 진행률 = MoveTowards(표시, min(progress / 0.9, 경과 / 최소 노출 시간), 속도 × dt)
// - 어떤 표시기를 켤지 (스피너 / 퍼센트 바 / 단계 문구) — 기다리는 길이에 따라
// - 팁 순환 타이머 · 손으로 넘기기
using System;
using UnityEngine;

namespace UIGallery.LoadingScreen
{
    public enum IndicatorMode
    {
        /// <summary>처음엔 스피너, barAfterSeconds 가 지나도 안 끝나면 퍼센트 바, stagesAfterSeconds 가 지나면 단계 문구까지</summary>
        Auto,
        Spinner,
        Percent,
        Stages,
    }

    [Serializable]
    public class LoadingSettings
    {
        [Tooltip("표시 진행률이 따라가는 최대 속도 (초당 비율). 0.6 = 초당 60%")]
        public float smoothSpeed = 0.6f;
        [Tooltip("로딩이 빨라도 이 시간 동안은 화면을 보여 준다 (초). 0 이면 빠른 로딩에서 화면이 번쩍 지나간다")]
        public float minShowSeconds = 2.5f;
        [Tooltip("팁 하나를 보여 주는 시간 (초)")]
        public float tipIntervalSeconds = 6f;
        public IndicatorMode indicatorMode = IndicatorMode.Auto;
        [Tooltip("준비 완료 뒤 '아무 키나 눌러 계속' 을 기다린다")]
        public bool waitForInput = true;
        [Tooltip("준비 완료 직후 입력을 막는 시간 (초) — 로딩 중 연타가 바로 넘기지 않게")]
        public float inputLockSeconds = 0.4f;
        [Header("자동 표시 기준 (초)")]
        public float barAfterSeconds = 2f;
        public float stagesAfterSeconds = 6f;
        [Tooltip("실제 progress 가 이만큼 그대로면 '조금 오래 걸리는 중' 을 알린다")]
        public float stallSeconds = 1f;
    }

    public class LoadingProgress
    {
        /// <summary>allowSceneActivation = false 일 때 progress 가 멈추는 값</summary>
        public const float LoadCap = 0.9f;

        readonly LoadingSettings s;
        float lastRaw = -1f, lastChange;
        bool autoBar, autoStages;

        public float Elapsed { get; private set; }
        /// <summary>화면에 보이는 진행률 0~1</summary>
        public float Display { get; private set; }
        /// <summary>불러오기가 끝났다 (progress ≥ 0.9)</summary>
        public bool Loaded { get; private set; }
        /// <summary>불러오기도, 표시도 끝났다 → '준비 완료'</summary>
        public bool Ready { get; private set; }
        /// <summary>실제 값이 stallSeconds 넘게 그대로다</summary>
        public bool Stalled { get; private set; }

        public int Tip { get; private set; }
        public float TipTime { get; private set; }

        public LoadingProgress(LoadingSettings settings) => s = settings;

        /// <summary>매 프레임. raw = op.progress, dt = Time.unscaledDeltaTime</summary>
        public void Tick(float raw, float dt)
        {
            Elapsed += dt;
            if (!Mathf.Approximately(raw, lastRaw))
            {
                lastRaw = raw;
                lastChange = Elapsed;
            }
            float loaded = Mathf.Clamp01(raw / LoadCap);   // 0~0.9 → 0~1 로 늘린다
            float timeCap = s.minShowSeconds > 0f ? Mathf.Clamp01(Elapsed / s.minShowSeconds) : 1f;
            Display = Mathf.MoveTowards(Display, Mathf.Min(loaded, timeCap), s.smoothSpeed * dt);

            Loaded = raw >= LoadCap - 0.0001f;
            if (Loaded && Display >= 1f) Ready = true;
            // 실제 불러오기가 그 시간 안에 끝났으면 바꾸지 않는다 — 빠른 로딩은 끝까지 스피너
            if (!Loaded && Elapsed >= s.barAfterSeconds) autoBar = true;
            if (!Loaded && Elapsed >= s.stagesAfterSeconds) autoStages = true;
            Stalled = !Loaded && Elapsed - lastChange > s.stallSeconds;
        }

        public bool ShowBar => s.indicatorMode switch
        {
            IndicatorMode.Spinner => false,
            IndicatorMode.Auto => autoBar,
            _ => true,
        };
        public bool ShowPercent => s.indicatorMode == IndicatorMode.Percent || (s.indicatorMode == IndicatorMode.Auto && autoBar);
        /// <summary>멈칫하는 동안에는 어떤 모드든 '무엇을 하는 중인지' 를 글로 알린다</summary>
        public bool ShowStages => Stalled || s.indicatorMode == IndicatorMode.Stages || (s.indicatorMode == IndicatorMode.Auto && autoStages);
        public bool BigSpinner => s.indicatorMode == IndicatorMode.Spinner || (s.indicatorMode == IndicatorMode.Auto && !autoBar);

        /// <summary>바닥 띠의 단계 문구</summary>
        public string StageText(ILoadOperation op)
        {
            if (Loaded) return "모든 단계 완료";
            string text = op.StageCount > 0
                ? $"단계 {Mathf.Min(op.StageIndex + 1, op.StageCount)}/{op.StageCount} · {op.StageLabel} 불러오는 중"
                : "불러오는 중";
            return Stalled ? text + " · 조금 오래 걸리는 중" : text;
        }

        /// <summary>팁 타이머. 바뀌었으면 true</summary>
        public bool TickTip(float dt, int count)
        {
            if (count <= 1) return false;
            TipTime += dt;
            if (TipTime < s.tipIntervalSeconds) return false;
            Flip(1, count);
            return true;
        }

        /// <summary>손으로 넘기기 — 타이머를 처음부터 (넘기자마자 또 바뀌지 않게)</summary>
        public void Flip(int dir, int count)
        {
            if (count <= 0) return;
            Tip = ((Tip + dir) % count + count) % count;
            TipTime = 0f;
        }

        public float TipRemain01 => s.tipIntervalSeconds > 0f ? Mathf.Clamp01(TipTime / s.tipIntervalSeconds) : 0f;
    }
}
