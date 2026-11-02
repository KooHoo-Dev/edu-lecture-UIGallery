using UnityEngine;
using UnityEngine.EventSystems;

namespace UIGallery.VirtualJoystickTouchLayout
{
    /// <summary>
    /// 배치 편집이 가능한 HUD 요소 (조이스틱 영역 · 공격 · 스킬 버튼).
    /// 위치는 **앵커 자체에 비율로** 둔다: anchorMin = anchorMax = (nx, ny), anchoredPosition = 0.
    /// → 부모(SafeArea) 크기가 바뀌어도(회전 · 폴더블 · 해상도) 비율 자리를 그대로 지킨다.
    /// 크기(sizeDelta)는 손가락 기준이라 비율로 늘리지 않는다. 편집 중에만 끌어서 옮겨진다.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public class TouchLayoutItem : MonoBehaviour, IBeginDragHandler, IDragHandler
    {
        public string id;
        [Tooltip("편집 중에는 꺼 둘 입력 컴포넌트 (OnScreenButton · VirtualJoystick) — 옮기다가 공격이 나가지 않게")]
        public Behaviour inputControl;

        /// <summary>TouchLayoutEditor 가 켜고 끈다</summary>
        public static bool Editing;

        // 도메인 리로드를 꺼도 플레이를 시작할 때 편집 상태를 초기화
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Editing = false;

        RectTransform rt;
        Vector2 grab;

        public RectTransform Rect => rt != null ? rt : rt = (RectTransform)transform;
        RectTransform Parent => (RectTransform)Rect.parent;

        /// <summary>부모 안의 비율 위치 (가운데 기준, 왼쪽 아래 = 0)</summary>
        public Vector2 Normalized
        {
            get => Rect.anchorMin;
            set
            {
                Rect.anchorMin = value;
                Rect.anchorMax = value;
                Rect.anchoredPosition = Vector2.zero;
            }
        }

        public void OnBeginDrag(PointerEventData e)
        {
            if (!Editing) return;
            grab = Normalized - ToNormalized(e);   // 잡은 지점과 가운데의 차이를 유지
        }

        public void OnDrag(PointerEventData e)
        {
            if (!Editing) return;
            Vector2 size = Parent.rect.size;
            Vector2 half = new Vector2(Rect.sizeDelta.x / 2f / size.x, Rect.sizeDelta.y / 2f / size.y);
            Vector2 n = ToNormalized(e) + grab;
            // 세이프 에어리어 밖으로 나가지 않게
            Normalized = new Vector2(Mathf.Clamp(n.x, half.x, 1f - half.x), Mathf.Clamp(n.y, half.y, 1f - half.y));
        }

        Vector2 ToNormalized(PointerEventData e)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(Parent, e.position, e.pressEventCamera, out Vector2 local);
            Rect r = Parent.rect;
            return new Vector2((local.x - r.xMin) / r.width, (local.y - r.yMin) / r.height);
        }
    }
}
