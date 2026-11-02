using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.SkillCooldownPrompt
{
    /// <summary>
    /// 원형 쿨다운 덮개 — UI Toolkit 에는 Filled 이미지가 없으므로 Painter2D 로 부채꼴을 그린다.
    /// progress 1 → 0 으로 줄이면 12시부터 시계 방향으로 걷힌다 (UGUI Radial 360 · Origin Top · Clockwise 끔과 같은 방향).
    /// 부모(.slot__clip)의 overflow: hidden 이 모양대로 잘라 준다.
    /// </summary>
    [UxmlElement]
    public partial class RadialCooldown : VisualElement
    {
        float _progress;

        /// <summary>남은 비율 (0~1). 값이 바뀔 때만 다시 그린다</summary>
        [UxmlAttribute]
        public float progress
        {
            get => _progress;
            set
            {
                value = Mathf.Clamp01(value);
                if (Mathf.Approximately(_progress, value)) return;
                _progress = value;
                MarkDirtyRepaint();   // 빼먹으면 덮개가 멈춘 것처럼 보인다
            }
        }

        [UxmlAttribute]
        public Color coverColor { get; set; } = new Color(0.01f, 0.02f, 0.04f, 0.8f);

        public RadialCooldown()
        {
            pickingMode = PickingMode.Ignore;   // 장식 — 터치 입력을 가로채지 않게
            generateVisualContent += Draw;
        }

        void Draw(MeshGenerationContext mgc)
        {
            if (_progress <= 0f) return;
            Rect r = contentRect;
            Vector2 c = r.center;
            // 사각 슬롯의 모서리까지 덮도록 대각선 반지름보다 크게 (넘치는 부분은 부모가 자른다)
            float radius = Mathf.Max(r.width, r.height) * 0.75f;

            var p = mgc.painter2D;
            p.fillColor = coverColor;
            p.BeginPath();
            p.MoveTo(c);
            // 0도 = 3시 방향, y 는 아래로 증가 → 12시는 -90도.
            // '바늘 위치 → 12시(270도)' 구간만 칠해야 시계 방향으로 걷힌다 (방향은 6.3 에서 직접 확인 권장)
            p.Arc(c, radius, Angle.Degrees(-90f + 360f * (1f - _progress)), Angle.Degrees(270f), ArcDirection.Clockwise);
            p.ClosePath();
            p.Fill();
        }
    }
}
