using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 메뉴 스택의 한 칸 (UGUI).
    /// - CanvasGroup 으로 보이기·상호작용을 끄고 켠다 (전환 중 이전 패널의 입력을 막는 핵심)
    /// - 포커스 막대(FocusBar)는 Items(LayoutGroup) 바깥 형제라서 레이아웃에 덮어써지지 않는다
    /// - 항목 순차 등장은 Item 이 아니라 그 아래 Content 의 CanvasGroup 에 건다
    /// 모든 연출은 Time.unscaledDeltaTime — 일시정지(timeScale 0) 중에도 돈다.
    /// </summary>
    [RequireComponent(typeof(CanvasGroup))]
    public class MenuPanel : MonoBehaviour
    {
        [Tooltip("브레드크럼에 보일 이름")] public string title = "메뉴";
        [Tooltip("처음 열 때 포커스할 항목 (확인 창이면 '취소')")] public Selectable firstSelected;
        [Tooltip("확인 창처럼 슬롯 배치에 끼지 않고 가운데 겹쳐 뜨는 패널")] public bool overlay;

        [Header("포커스 막대 (Items 의 형제)")]
        [SerializeField] RectTransform focusBar;
        [SerializeField, Tooltip("막대가 따라가는 속도 — 약 90ms 에 도착")] float barSharpness = 40f;

        [Header("순차 등장")]
        [SerializeField] CanvasGroup[] itemContents;
        [SerializeField] float staggerSeconds = 0.03f;
        [SerializeField] float itemFadeSeconds = 0.18f;

        CanvasGroup group;
        RectTransform rect;
        float barTargetY;
        bool hasBarTarget;

        public CanvasGroup Group => group ? group : group = GetComponent<CanvasGroup>();
        public RectTransform Rect => rect ? rect : rect = (RectTransform)transform;

        /// <summary>전환 중에는 false — 사라지는 중인 패널이 확정 입력을 받아 '두 번 push' 되는 버그를 막는다</summary>
        public void SetInteractable(bool on)
        {
            Group.interactable = on;
            Group.blocksRaycasts = on;
        }

        /// <summary>MenuItemView.OnSelect 에서 부른다 — 막대가 그 항목 높이로 미끄러진다</summary>
        public void FocusOn(RectTransform item)
        {
            if (!focusBar) return;
            // 같은 부모 좌표계로 옮겨서 y 만 맞춘다
            Vector3 local = focusBar.parent.InverseTransformPoint(item.position);
            barTargetY = local.y;
            hasBarTarget = true;
        }

        void Update()
        {
            if (!focusBar || !hasBarTarget) return;
            var p = focusBar.anchoredPosition;
            p.y = Mathf.Lerp(p.y, barTargetY, 1f - Mathf.Exp(-barSharpness * Time.unscaledDeltaTime));
            focusBar.anchoredPosition = p;
        }

        public void PlayStagger()
        {
            if (itemContents == null || itemContents.Length == 0 || !isActiveAndEnabled) return;
            StopAllCoroutines();
            StartCoroutine(Stagger());
        }

        IEnumerator Stagger()
        {
            foreach (var c in itemContents) c.alpha = 0f;
            float t = 0f;
            float total = staggerSeconds * itemContents.Length + itemFadeSeconds;
            while (t < total)
            {
                t += Time.unscaledDeltaTime;
                for (int i = 0; i < itemContents.Length; i++)
                {
                    float k = Mathf.Clamp01((t - i * staggerSeconds) / itemFadeSeconds);
                    itemContents[i].alpha = 1f - (1f - k) * (1f - k);   // easeOutQuad
                    itemContents[i].transform.localPosition = new Vector3(-30f * (1f - k), 0f, 0f);
                }
                yield return null;
            }
            foreach (var c in itemContents)
            {
                c.alpha = 1f;
                c.transform.localPosition = Vector3.zero;
            }
        }
    }
}
