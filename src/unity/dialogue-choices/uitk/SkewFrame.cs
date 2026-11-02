using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 사선 틀 — USS 에는 skew 변형이 없으므로 평행사변형을 Painter2D 로 직접 그린다.
    /// 글자(Label)는 이 요소의 '형제'로 두어 기울지 않는다 → 스타일은 틀에만, 본문은 반듯하게.
    /// 색은 USS 사용자 정의 속성으로 바꿀 수 있다:  .dlg-choice:focus .dlg-frame { --frame-fill: rgb(255, 106, 61); }
    /// </summary>
    [UxmlElement]
    public partial class SkewFrame : VisualElement
    {
        static readonly CustomStyleProperty<Color> FillProp = new("--frame-fill");
        static readonly CustomStyleProperty<Color> BorderProp = new("--frame-border");

        float skew = 6f;
        Color fillColor = new(0.035f, 0.043f, 0.06f, 0.94f);
        Color borderColor = new(1f, 1f, 1f, 0.9f);
        float borderWidth = 3f;

        [UxmlAttribute] public float Skew { get => skew; set { skew = value; MarkDirtyRepaint(); } }
        [UxmlAttribute] public Color FillColor { get => fillColor; set { fillColor = value; MarkDirtyRepaint(); } }
        [UxmlAttribute] public Color BorderColor { get => borderColor; set { borderColor = value; MarkDirtyRepaint(); } }
        [UxmlAttribute] public float BorderWidth { get => borderWidth; set { borderWidth = value; MarkDirtyRepaint(); } }

        public SkewFrame()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
            RegisterCallback<CustomStyleResolvedEvent>(OnStyle);
        }

        void OnStyle(CustomStyleResolvedEvent evt)
        {
            if (evt.customStyle.TryGetValue(FillProp, out var f)) fillColor = f;
            if (evt.customStyle.TryGetValue(BorderProp, out var b)) borderColor = b;
            MarkDirtyRepaint();
        }

        void Draw(MeshGenerationContext mgc)
        {
            Rect r = contentRect;
            if (r.width <= 0f || r.height <= 0f) return;
            // 위 변은 오른쪽, 아래 변은 왼쪽으로 반 높이 × tan 만큼 → '/' 방향 사선
            float off = Mathf.Tan(skew * Mathf.Deg2Rad) * r.height * 0.5f;
            var p = mgc.painter2D;
            p.BeginPath();
            p.MoveTo(new Vector2(r.xMin + off, r.yMin));
            p.LineTo(new Vector2(r.xMax + off, r.yMin));
            p.LineTo(new Vector2(r.xMax - off, r.yMax));
            p.LineTo(new Vector2(r.xMin - off, r.yMax));
            p.ClosePath();
            p.fillColor = fillColor;
            p.Fill();
            if (borderWidth > 0f)
            {
                p.strokeColor = borderColor;
                p.lineWidth = borderWidth;
                p.lineJoin = LineJoin.Miter;
                p.Stroke();
            }
        }
    }
}
