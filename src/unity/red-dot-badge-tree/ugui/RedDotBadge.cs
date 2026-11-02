using TMPro;
using UnityEngine;

namespace UIGallery.RedDotBadgeTree
{
    /// <summary>
    /// 배지 UI — 트리의 한 노드를 구독해서 보여 주기만 한다 (데이터를 직접 바꾸지 않는다).
    /// 배지 오브젝트 자신은 늘 켜 두고, 원 그림(visual)만 켜고 끈다
    /// (자신을 끄면 OnDisable 에서 구독이 풀려 다시 켜지지 않는다).
    /// </summary>
    public class RedDotBadge : MonoBehaviour
    {
        public enum Style { Dot, Count }

        [Tooltip("트리 경로. 예: mail · mail/reward · mail/reward/item-12")]
        [SerializeField] string path;
        [SerializeField] Style style = Style.Dot;
        [Tooltip("이보다 크면 '99+' 처럼 줄인다")]
        [SerializeField] int cap = 99;
        [Tooltip("빨간 원 (Image). 이것만 켜고 끈다")]
        [SerializeField] GameObject visual;
        [SerializeField] TextMeshProUGUI countText;

        RedDotTree.Node node;

        /// <summary>목록 행처럼 실행 중에 경로를 붙일 때</summary>
        public string Path
        {
            get => path;
            set
            {
                Unbind();
                path = value;
                if (isActiveAndEnabled) Bind();
            }
        }

        void OnEnable() => Bind();
        void OnDisable() => Unbind();   // 풀지 않으면 꺼진 배지가 계속 이벤트를 받는다 (MissingReferenceException · 구독 누적)

        void Bind()
        {
            node = RedDotTree.Instance.Get(path);
            node.Changed += Refresh;
            Refresh(node.Count);
        }

        void Unbind()
        {
            if (node != null) node.Changed -= Refresh;
            node = null;
        }

        void Refresh(int count)
        {
            visual.SetActive(count > 0);
            if (countText == null) return;
            countText.gameObject.SetActive(style == Style.Count);
            countText.text = count > cap ? $"{cap}+" : count.ToString();
        }
    }
}
