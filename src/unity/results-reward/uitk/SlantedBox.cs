using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 기울어진 바탕판(평행사변형) — USS 에는 skew 가 없으므로 Painter2D 로 직접 그린다.
    /// 바탕만 기울이고 위에 올리는 Label 은 반듯하게 둔다 ("스타일은 틀에만, 본문은 반듯하게").
    /// UXML: &lt;SlantedBox skew-deg="6" fill-color="#FFB547" edge-color="#36D6C3" /&gt;
    /// 색은 UXML 속성(fill-color · edge-color) 또는 C# 의 fillColor · edgeColor 로 바꾼다.
    /// </summary>
    [UxmlElement]
    public partial class SlantedBox : VisualElement
    {
        float skew = 6f;
        Color fill = new(0.035f, 0.15f, 0.2f, 0.94f);
        Color edge = new(0.21f, 0.84f, 0.76f, 1f);

        [UxmlAttribute]
        public float skewDeg
        {
            get => skew;
            set
            {
                skew = value;
                MarkDirtyRepaint();
            }
        }

        [UxmlAttribute]   // UXML 에서 fill-color="#RRGGBB" (Color 는 UxmlAttribute 지원 타입)
        public Color fillColor
        {
            get => fill;
            set
            {
                fill = value;
                MarkDirtyRepaint();
            }
        }

        /// <summary>윗변 강조선 색 (알파 0 이면 그리지 않음)</summary>
        [UxmlAttribute]
        public Color edgeColor
        {
            get => edge;
            set
            {
                edge = value;
                MarkDirtyRepaint();
            }
        }

        public SlantedBox()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
        }

        void Draw(MeshGenerationContext mgc)
        {
            Rect r = contentRect;
            if (r.width <= 0f || r.height <= 0f) return;
            // UI Toolkit 은 y 가 아래로 커진다 → 윗변을 오른쪽으로, 아랫변을 왼쪽으로 민다
            float off = Mathf.Tan(skew * Mathf.Deg2Rad) * r.height * 0.5f;
            var tl = new Vector2(r.xMin + off, r.yMin);
            var tr = new Vector2(r.xMax + off, r.yMin);
            var br = new Vector2(r.xMax - off, r.yMax);
            var bl = new Vector2(r.xMin - off, r.yMax);

            var p = mgc.painter2D;
            p.fillColor = fill;
            p.BeginPath();
            p.MoveTo(tl);
            p.LineTo(tr);
            p.LineTo(br);
            p.LineTo(bl);
            p.ClosePath();
            p.Fill();

            if (edge.a <= 0f) return;
            p.strokeColor = edge;
            p.lineWidth = 6f;
            p.BeginPath();
            p.MoveTo(tl);
            p.LineTo(tr);
            p.Stroke();
        }
    }
}
