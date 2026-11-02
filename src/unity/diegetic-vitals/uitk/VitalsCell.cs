using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 체력 칸 하나 — 길쭉한 육각 '배터리 셀'. USS 로는 육각형을 만들 수 없어 Painter2D 로 그린다.
    /// Hatched 가 켜지면 같은 칸 위에 사선 무늬를 덧그린다 (색을 구분하기 어려워도 위험 칸을 알아보게).
    /// 밝기(켜짐·맥동)는 style.opacity 로 바꾼다 — 다시 그리기·레이아웃 재계산이 필요 없다.
    /// </summary>
    public class VitalsCell : VisualElement
    {
        Color m_Color = Color.white;
        bool m_Hatched;

        public Color CellColor
        {
            get => m_Color;
            set { if (m_Color == value) return; m_Color = value; MarkDirtyRepaint(); }
        }

        public bool Hatched
        {
            get => m_Hatched;
            set { if (m_Hatched == value) return; m_Hatched = value; MarkDirtyRepaint(); }
        }

        public VitalsCell()
        {
            AddToClassList("seg");
            pickingMode = PickingMode.Ignore;
            generateVisualContent += OnGenerate;
        }

        void OnGenerate(MeshGenerationContext ctx)
        {
            var r = contentRect;
            if (r.width <= 0f || r.height <= 0f) return;
            var c = r.center;
            float hx = r.width * 0.5f;
            float hy = r.height * 0.5f;
            float notch = Mathf.Min(hx, hy * 1.15f);   // 양 끝의 뾰족한 부분 길이
            var p = ctx.painter2D;

            // 가로로 길쭉한 육각형: 왼쪽 끝 → 위 → 오른쪽 끝 → 아래
            p.fillColor = m_Color;
            p.BeginPath();
            p.MoveTo(new Vector2(c.x - hx, c.y));
            p.LineTo(new Vector2(c.x - hx + notch, c.y - hy));
            p.LineTo(new Vector2(c.x + hx - notch, c.y - hy));
            p.LineTo(new Vector2(c.x + hx, c.y));
            p.LineTo(new Vector2(c.x + hx - notch, c.y + hy));
            p.LineTo(new Vector2(c.x - hx + notch, c.y + hy));
            p.ClosePath();
            p.Fill();

            if (!m_Hatched) return;
            // 사선 무늬: 칸 안쪽 사각형 범위에서만 45° 선을 긋는다
            p.strokeColor = new Color(0.02f, 0.03f, 0.05f, 0.9f);
            p.lineWidth = Mathf.Max(2f, r.height * 0.14f);
            float step = r.height * 0.5f;
            float left = c.x - hx + notch * 0.6f;
            float right = c.x + hx - notch * 0.6f;
            for (float x = left - r.height; x < right; x += step)
            {
                float x0 = Mathf.Max(x, left);
                float x1 = Mathf.Min(x + r.height, right);
                if (x1 <= x0) continue;
                p.BeginPath();
                p.MoveTo(new Vector2(x0, c.y + hy - (x0 - x)));
                p.LineTo(new Vector2(x1, c.y + hy - (x1 - x)));
                p.Stroke();
            }
        }
    }
}
