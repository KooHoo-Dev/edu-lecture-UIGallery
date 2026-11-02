using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.InventoryGridTooltip
{
    /// <summary>
    /// 희귀도 모서리 표식을 Painter2D 로 직접 그리는 요소 — 기본: 빈 네모 · 개량: 원 · 정예: 삼각 · 명품: 마름모 · 유일: 별.
    /// 스프라이트·VectorImage 에셋이 없어도 '모양' 부호화가 빠지지 않는다 (웹 표본의 직접 그린 SVG 와 같은 도형).
    /// UXML 에서 &lt;RarityMarkElement /&gt; 로 쓰거나 C# 에서 new RarityMarkElement() 로 만든다.
    /// </summary>
    [UxmlElement]
    public partial class RarityMarkElement : VisualElement
    {
        int rarity;
        Color color = Color.white;
        static readonly Color Outline = new(0.04f, 0.05f, 0.07f);

        public RarityMarkElement()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
        }

        /// 단계와 색을 함께 바꾼다 — 둘 중 하나만 바뀌는 실수를 막는다
        public void Set(Rarity r, Color c)
        {
            rarity = (int)r;
            color = c;
            MarkDirtyRepaint();
        }

        void Draw(MeshGenerationContext mgc)
        {
            // 24×24 기준 좌표를 요소 크기에 맞춰 늘린다
            float k = Mathf.Min(contentRect.width, contentRect.height) / 24f;
            if (k <= 0f) return;
            var p = mgc.painter2D;
            Vector2 P(float x, float y) => new(x * k, y * k);

            p.lineJoin = LineJoin.Round;
            p.lineWidth = 2.5f * k;
            p.strokeColor = Outline;
            p.fillColor = color;
            p.BeginPath();
            switch (rarity)
            {
                case 0: // 빈 네모 — 테두리만
                    p.MoveTo(P(7, 7)); p.LineTo(P(17, 7)); p.LineTo(P(17, 17)); p.LineTo(P(7, 17)); p.ClosePath();
                    p.lineWidth = 2f * k;
                    p.strokeColor = new Color(color.r, color.g, color.b, 0.7f);
                    p.Stroke();
                    return;
                case 1: // 원
                    p.Arc(P(12, 12), 7f * k, Angle.Degrees(0f), Angle.Degrees(360f));
                    break;
                case 2: // 삼각
                    p.MoveTo(P(12, 3.5f)); p.LineTo(P(21, 19.5f)); p.LineTo(P(3, 19.5f)); p.ClosePath();
                    break;
                case 3: // 마름모
                    p.MoveTo(P(12, 2.5f)); p.LineTo(P(21.5f, 12)); p.LineTo(P(12, 21.5f)); p.LineTo(P(2.5f, 12)); p.ClosePath();
                    break;
                default: // 별 (꼭짓점 5개)
                    for (int i = 0; i < 10; i++)
                    {
                        float a = (-90f + i * 36f) * Mathf.Deg2Rad;
                        float rr = (i % 2 == 0 ? 10.5f : 4.6f) * k;
                        var v = new Vector2(12f * k + Mathf.Cos(a) * rr, 12.5f * k + Mathf.Sin(a) * rr);
                        if (i == 0) p.MoveTo(v); else p.LineTo(v);
                    }
                    p.ClosePath();
                    break;
            }
            p.Fill();
            p.Stroke();
        }
    }
}
