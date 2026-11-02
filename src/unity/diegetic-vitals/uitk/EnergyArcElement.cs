using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 동력 반원 호 — UI Toolkit 커스텀 요소. Painter2D 로 아래쪽 반원(왼쪽 → 아래 → 오른쪽)을 그린다.
    /// UI Toolkit 에는 Image 의 Filled(Radial180) 가 없으므로 호의 끝 각도로 채움 비율을 표현한다.
    /// 동력이 바닥나면 점선 윤곽만 또렷하게 남는다.
    /// </summary>
    [UxmlElement]
    public partial class EnergyArcElement : VisualElement
    {
        float m_Fill = 0.8f;
        float m_LineWidth = 22f;
        Color m_Color = new(0.38f, 0.62f, 1f);

        [UxmlAttribute]
        public float fill
        {
            get => m_Fill;
            set { m_Fill = Mathf.Clamp01(value); MarkDirtyRepaint(); }
        }

        [UxmlAttribute]
        public float lineWidth
        {
            get => m_LineWidth;
            set { m_LineWidth = value; MarkDirtyRepaint(); }
        }

        [UxmlAttribute]
        public Color arcColor
        {
            get => m_Color;
            set { m_Color = value; MarkDirtyRepaint(); }
        }

        public EnergyArcElement()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += OnGenerate;
        }

        void OnGenerate(MeshGenerationContext ctx)
        {
            var r = contentRect;
            float radius = r.width * 0.5f - m_LineWidth * 0.5f;
            if (radius <= 0f) return;
            var center = new Vector2(r.width * 0.5f, m_LineWidth * 0.5f);
            var p = ctx.painter2D;
            p.lineWidth = m_LineWidth;
            p.lineCap = LineCap.Butt;

            // 바탕 홈
            p.strokeColor = new Color(0.04f, 0.06f, 0.08f, 1f);
            p.BeginPath();
            p.Arc(center, radius, Angle.Degrees(180f), Angle.Degrees(0f), ArcDirection.CounterClockwise);
            p.Stroke();

            // 점선 윤곽 (12조각) — 바닥나면 또렷하게
            p.lineWidth = m_LineWidth * 0.3f;
            p.strokeColor = new Color(0.62f, 0.75f, 1f, m_Fill <= 0.01f ? 0.95f : 0.28f);
            for (int i = 0; i < 12; i++)
            {
                float a0 = 180f - i * 15f - 3.75f;
                p.BeginPath();
                p.Arc(center, radius, Angle.Degrees(a0), Angle.Degrees(a0 - 7.5f), ArcDirection.CounterClockwise);
                p.Stroke();
            }

            // 채움: UI 좌표는 y 가 아래로 + → 180°(왼쪽)에서 각도를 줄이면 아래(90°)를 지나 오른쪽(0°)으로 간다
            if (m_Fill <= 0.001f) return;
            p.lineWidth = m_LineWidth * 0.7f;
            p.strokeColor = m_Color;
            p.BeginPath();
            p.Arc(center, radius, Angle.Degrees(180f), Angle.Degrees(180f - 180f * m_Fill), ArcDirection.CounterClockwise);
            p.Stroke();
        }
    }
}
