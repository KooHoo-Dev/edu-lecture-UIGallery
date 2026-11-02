// 시험용 가짜 로드 — 실제 씬 없이 에셋 묶음마다 계단식으로 오르고, 0.9 에서 멈춰 활성화를 기다린다.
// 묶음 하나를 steps 번에 나눠 올린다. steps = 1 이면 묶음이 끝날 때 한 번에 (그동안은 멈칫).
using System;
using UnityEngine;

namespace UIGallery.LoadingScreen
{
    [Serializable]
    public class FakeStage
    {
        public string label = "텍스처 묶음";
        [Tooltip("이 묶음이 끝나면 progress 가 오르는 양 (모두 더하면 0.9)")]
        public float weight = 0.3f;
        public float seconds = 1.5f;
        [Min(1)] public int steps = 3;

        public FakeStage(string label, float weight, float seconds, int steps)
        {
            this.label = label;
            this.weight = weight;
            this.seconds = seconds;
            this.steps = steps;
        }
    }

    public class FakeLoadOperation : ILoadOperation
    {
        readonly FakeStage[] stages;
        readonly float start;
        readonly float activateSeconds;
        float allowAt = -1f;

        public FakeLoadOperation(FakeStage[] stages, float activateSeconds = 0.5f)
        {
            this.stages = stages;
            this.activateSeconds = activateSeconds;
            start = Time.unscaledTime;
        }

        float T => Time.unscaledTime - start;

        public float Progress
        {
            get
            {
                if (allowAt >= 0f) return Mathf.Min(1f, 0.9f + (Time.unscaledTime - allowAt) / activateSeconds * 0.1f);
                float rest = T, acc = 0f;
                foreach (FakeStage s in stages)
                {
                    if (rest >= s.seconds)
                    {
                        acc += s.weight;
                        rest -= s.seconds;
                        continue;
                    }
                    return acc + s.weight * Mathf.Floor(rest / s.seconds * s.steps) / s.steps;
                }
                return 0.9f;   // 다 불러왔다 — 활성화를 허락할 때까지 여기서 멈춘다
            }
        }

        public bool IsDone => allowAt >= 0f && Time.unscaledTime - allowAt >= activateSeconds;

        public void AllowActivation()
        {
            if (allowAt < 0f) allowAt = Time.unscaledTime;
        }

        public int StageCount => stages.Length;

        public int StageIndex
        {
            get
            {
                float rest = T;
                for (int i = 0; i < stages.Length; i++)
                {
                    if (rest < stages[i].seconds) return i;
                    rest -= stages[i].seconds;
                }
                return stages.Length;
            }
        }

        public string StageLabel => stages.Length == 0 ? null : stages[Mathf.Min(StageIndex, stages.Length - 1)].label;

        /* ───── 각본 (웹 표본과 같은 수치) ───── */

        public static FakeStage[] Normal() => new[]
        {
            new FakeStage("지형 데이터", 0.16f, 0.9f, 3),
            new FakeStage("텍스처 묶음", 0.3f, 1.6f, 4),
            new FakeStage("오디오", 0.1f, 0.6f, 2),
            new FakeStage("셰이더 준비", 0.1f, 1.0f, 1),
            new FakeStage("오브젝트 배치", 0.24f, 1.1f, 3),
        };

        public static FakeStage[] Fast() => new[]
        {
            new FakeStage("지형 데이터", 0.16f, 0.25f, 2),
            new FakeStage("텍스처 묶음", 0.3f, 0.4f, 2),
            new FakeStage("오디오", 0.1f, 0.15f, 1),
            new FakeStage("셰이더 준비", 0.1f, 0.2f, 1),
            new FakeStage("오브젝트 배치", 0.24f, 0.3f, 2),
        };

        public static FakeStage[] Slow() => new[]
        {
            new FakeStage("지형 데이터", 0.16f, 2.2f, 4),
            new FakeStage("텍스처 묶음", 0.3f, 4.6f, 6),
            new FakeStage("오디오", 0.1f, 1.4f, 2),
            new FakeStage("셰이더 준비", 0.1f, 2.4f, 2),
            new FakeStage("오브젝트 배치", 0.24f, 2.6f, 4),
        };

        public static FakeStage[] Hitch() => new[]
        {
            new FakeStage("지형 데이터", 0.16f, 0.9f, 3),
            new FakeStage("텍스처 묶음", 0.3f, 1.4f, 4),
            new FakeStage("셰이더 준비 (멈칫)", 0.1f, 3.6f, 1),
            new FakeStage("오디오", 0.1f, 0.5f, 2),
            new FakeStage("오브젝트 배치", 0.24f, 1.0f, 3),
        };
    }
}
