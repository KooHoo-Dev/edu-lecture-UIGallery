using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 틀(Image)만 사선으로 기울이는 메시 효과 — '스타일은 틀에만, 본문은 반듯하게'.
    /// RectTransform 을 Z 회전하면 글자까지 기울지만, 이 효과는 이 Image 의 정점만 옮긴다.
    /// 패널 · 이름표 · 선택지 배경 Image 에 붙이고, TMP 글자는 형제 오브젝트로 둔다.
    /// </summary>
    [RequireComponent(typeof(Graphic))]
    public class SkewEffect : BaseMeshEffect
    {
        [SerializeField, Range(0f, 15f), Tooltip("기울기 (도). 0 = 사각형")] float skewDeg = 6f;

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
            Rect rect = graphic.rectTransform.rect;
            float tan = Mathf.Tan(skewDeg * Mathf.Deg2Rad);
            float centerY = rect.center.y;
            var v = new UIVertex();
            for (int i = 0; i < vh.currentVertCount; i++)
            {
                vh.PopulateUIVertex(ref v, i);
                // 가운데 높이를 기준으로 위쪽 정점은 오른쪽, 아래쪽 정점은 왼쪽으로 → '/' 방향 평행사변형
                v.position.x += (v.position.y - centerY) * tan;
                vh.SetUIVertex(v, i);
            }
        }

#if UNITY_EDITOR
        protected override void OnValidate()
        {
            base.OnValidate();
            if (graphic != null) graphic.SetVerticesDirty();
        }
#endif
    }
}
