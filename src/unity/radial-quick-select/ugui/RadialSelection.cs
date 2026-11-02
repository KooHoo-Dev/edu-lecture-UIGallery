using UnityEngine;

namespace UIGallery.RadialQuickSelect
{
    /// <summary>
    /// 방사형 휠의 각도 · 칸 계산 (순수 함수 — UGUI · UI Toolkit 판이 함께 쓴다).
    /// 각도 기준: 위 = 0°, 시계 방향 + . 칸 i 의 가운데 = i × (360 / 칸 수).
    /// </summary>
    public static class RadialSelection
    {
        /// <summary>y 가 위로 + 인 벡터 → 0~360°. (Atan2(y, x) 는 오른쪽 = 0° 반시계라서 인자를 바꿔 넣는다)</summary>
        public static float Angle(Vector2 v)
        {
            float a = Mathf.Atan2(v.x, v.y) * Mathf.Rad2Deg;
            return a < 0f ? a + 360f : a;
        }

        /// <summary>
        /// 각도 → 칸 번호. 지금 고른 칸(current)이 있으면 그 칸의 경계를 hysteresisDeg 만큼 넓게 봐서,
        /// 경계 위에서 손이 조금 떨려도 선택이 왔다 갔다 하지 않게 한다.
        /// </summary>
        public static int Sector(float angle, int count, int current, float hysteresisDeg)
        {
            float step = 360f / count;
            if (current >= 0 && current < count && Mathf.Abs(Mathf.DeltaAngle(current * step, angle)) <= step / 2f + hysteresisDeg)
                return current;
            return (int)Mathf.Floor(angle / step + 0.5f) % count;
        }
    }
}
