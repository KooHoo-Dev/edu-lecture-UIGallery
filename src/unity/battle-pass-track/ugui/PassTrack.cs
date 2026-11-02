// 가로 재활용 트랙 — ScrollRect(Horizontal) 의 Content 아래에 '보이는 칸 + 여유분' 만큼의 TierColumnView 만 두고 돌려쓴다.
// ① 스크롤 위치로 보이는 레벨 범위 계산 ② 범위 밖 칸을 풀에 반납 ③ 새로 들어온 레벨에 반납된 칸부터 배정 (모자랄 때만 Instantiate)
// 칸 너비가 모두 같아 위치 = index × itemWidth. LayoutGroup · ContentSizeFitter 는 쓰지 않는다 (위치를 덮어써 재활용이 깨진다).
// Content 에는 Canvas 를 하나 더 붙여(서브 Canvas) 스크롤할 때 바깥 HUD 까지 다시 묶이지 않게 한다.
// 세로판은 recycled-scroll-list 표본의 RecycledScroll — 축만 다르고 같은 두 단계다.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.BattlePassTrack
{
    [RequireComponent(typeof(ScrollRect))]
    public class PassTrack : MonoBehaviour, IBeginDragHandler
    {
        [SerializeField] TierColumnView columnPrefab;
        [Tooltip("레벨 한 칸의 너비 (px). 위치 = (레벨 − 1) × itemWidth")]
        [SerializeField] float itemWidth = 180f;
        [Tooltip("보이는 범위 양옆으로 더 붙여 둘 칸 수")]
        [Range(0, 3)]
        [SerializeField] int overscan = 1;
        [Tooltip("트랙을 열 때 지금 레벨을 화면 가로 몇 % 지점에 둘지 — 왼쪽의 받을 칸과 오른쪽 다음 보상이 함께 보이게")]
        [Range(0f, 1f)]
        [SerializeField] float snapAnchor = 0.6f;

        /// <summary>칸에 index(= 레벨 − 1) 번째 내용을 채운다. 켜고 끄는 표시는 모두 여기서 모델대로 설정해야 한다</summary>
        public Action<TierColumnView, int> BindColumn;

        public int Created { get; private set; }
        public int Reused { get; private set; }
        public float ItemWidth => itemWidth;

        ScrollRect scroll;
        RectTransform content;
        RectTransform viewport;
        readonly Dictionary<int, TierColumnView> byIndex = new();
        readonly List<int> leaving = new();
        readonly Stack<TierColumnView> free = new();
        int count;
        int first;
        int last = -1;
        Coroutine glide;

        void Awake()
        {
            scroll = GetComponent<ScrollRect>();
            scroll.horizontal = true;
            scroll.vertical = false;
            content = scroll.content;
            viewport = scroll.viewport != null ? scroll.viewport : (RectTransform)transform;
            // Content 는 왼쪽에 붙이고 세로로 늘인다. 너비는 SetCount 가 count × itemWidth 로 잡는다
            content.anchorMin = new Vector2(0f, 0f);
            content.anchorMax = new Vector2(0f, 1f);
            content.pivot = new Vector2(0f, 0.5f);
            scroll.onValueChanged.AddListener(_ => Refresh(false));
        }

        void OnDisable()
        {
            if (glide != null) StopCoroutine(glide);
            glide = null;
        }

        public void SetCount(int n)
        {
            count = Mathf.Max(0, n);
            content.sizeDelta = new Vector2(count * itemWidth, content.sizeDelta.y);
            Refresh(true);
        }

        /// <summary>모델이 바뀌었다 — 지금 보이는 칸만 다시 채운다</summary>
        public void RefreshVisible() => Refresh(true);

        /// <summary>트랙을 열 때 · '현재 레벨로' — level 칸을 화면 snapAnchor 지점에 둔다</summary>
        public void SnapTo(int level, bool animate = true, float seconds = 0.5f)
        {
            float view = viewport.rect.width;
            float max = Mathf.Max(0f, count * itemWidth - view);
            float target = Mathf.Clamp((level - 1) * itemWidth + itemWidth * 0.5f - view * snapAnchor, 0f, max);
            scroll.StopMovement();   // 남은 관성이 스냅을 이어 굴리지 않게
            if (glide != null) StopCoroutine(glide);
            glide = null;
            if (!animate || !isActiveAndEnabled)
            {
                SetScroll(target);
                return;
            }
            SetScroll(Mathf.Clamp(target - itemWidth * 2.5f, 0f, max));   // 두 칸 반 앞에서 미끄러져 들어와 '여기가 지금' 을 알린다
            glide = StartCoroutine(Glide(target, seconds));
        }

        IEnumerator Glide(float target, float seconds)
        {
            float from = -content.anchoredPosition.x;
            for (float t = 0f; t < seconds; t += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - t / seconds, 3f);   // ease-out cubic
                SetScroll(Mathf.Lerp(from, target, k));
                yield return null;
            }
            SetScroll(target);
            glide = null;
        }

        /// <summary>x = 왼쪽 끝에서 굴린 거리 (Content 는 왼쪽으로 움직이므로 anchoredPosition.x = −x)</summary>
        void SetScroll(float x)
        {
            content.anchoredPosition = new Vector2(-x, content.anchoredPosition.y);
            Refresh(false);
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            if (glide == null) return;   // 스냅 중에 끌기 시작하면 스냅을 멈춘다 (둘이 싸우면 떨린다)
            StopCoroutine(glide);
            glide = null;
        }

        void Refresh(bool rebind)
        {
            if (content == null) return;
            float x = -content.anchoredPosition.x;
            float view = viewport.rect.width;
            int f = Mathf.Max(0, Mathf.FloorToInt(x / itemWidth) - overscan);
            int l = Mathf.Min(count - 1, Mathf.CeilToInt((x + view) / itemWidth) - 1 + overscan);
            if (!rebind && f == first && l == last) return;
            first = f;
            last = l;

            leaving.Clear();
            foreach (KeyValuePair<int, TierColumnView> kv in byIndex)
                if (kv.Key < f || kv.Key > l) leaving.Add(kv.Key);
            foreach (int index in leaving)
            {
                TierColumnView c = byIndex[index];
                byIndex.Remove(index);
                c.Index = -1;
                free.Push(c);
            }

            for (int i = f; i <= l; i++)
            {
                if (byIndex.TryGetValue(i, out TierColumnView c))
                {
                    if (rebind) BindColumn?.Invoke(c, i);
                    continue;
                }
                if (free.Count > 0)
                {
                    c = free.Pop();
                    Reused++;
                    if (!c.gameObject.activeSelf) c.gameObject.SetActive(true);
                }
                else
                {
                    c = Instantiate(columnPrefab, content);
                    Created++;
                    RectTransform r = c.Rect;
                    r.anchorMin = new Vector2(0f, 0f);
                    r.anchorMax = new Vector2(0f, 1f);
                    r.pivot = new Vector2(0f, 0.5f);
                    r.sizeDelta = new Vector2(itemWidth, 0f);
                }
                c.Index = i;
                c.Rect.anchoredPosition = new Vector2(i * itemWidth, 0f);   // 칸은 위치만 옮긴다 — 파괴 · 생성 없음
                byIndex[i] = c;
                BindColumn?.Invoke(c, i);
            }
            foreach (TierColumnView rest in free)
                if (rest.gameObject.activeSelf) rest.gameObject.SetActive(false);
        }
    }
}
