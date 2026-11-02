using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 사각형 Image 의 정점만 옆으로 밀어 평행사변형(사선 패널)으로 만든다.
    /// RectTransform 을 회전시키는 것과 달리 자식 글자는 반듯하게 남는다 — "스타일은 틀에만, 본문은 반듯하게".
    /// Frame · Plate 같은 바탕 Image 에만 붙인다.
    /// </summary>
    [RequireComponent(typeof(Graphic))]
    public class SkewEffect : BaseMeshEffect
    {
        [SerializeField, Range(-20f, 20f), Tooltip("기울기(도). 양수면 위쪽이 오른쪽으로 밀린다")]
        float skewDeg = 6f;

        public float SkewDeg
        {
            get => skewDeg;
            set
            {
                skewDeg = value;
                if (graphic != null) graphic.SetVerticesDirty();
            }
        }

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive()) return;
            float tan = Mathf.Tan(skewDeg * Mathf.Deg2Rad);
            float centerY = graphic.rectTransform.rect.center.y;
            var v = new UIVertex();
            for (int i = 0; i < vh.currentVertCount; i++)
            {
                vh.PopulateUIVertex(ref v, i);
                v.position.x += (v.position.y - centerY) * tan;   // 가운데 높이를 기준으로 위는 오른쪽, 아래는 왼쪽
                vh.SetUIVertex(v, i);
            }
        }
    }
}
