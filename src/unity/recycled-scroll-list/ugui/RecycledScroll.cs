using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.RecycledScrollList
{
    /// <summary>
    /// 재활용 스크롤 — ScrollRect 의 Content 아래에 '보이는 줄 + 여유분' 만큼의 셀만 두고 돌려쓴다.
    /// ① 스크롤 위치로 보이는 index 범위 계산 ② 범위 밖 셀을 풀에 반납 ③ 새로 들어온 항목에 반납된 셀부터 배정 (모자랄 때만 Instantiate)
    /// - 모든 행이 같은 높이라 위치 = index × itemHeight. LayoutGroup · ContentSizeFitter 는 쓰지 않는다 (위치를 덮어써 재활용이 깨진다)
    /// - Content 에는 Canvas 를 하나 더 붙여(서브 Canvas) 스크롤할 때 바깥 HUD 까지 다시 묶이지 않게 한다
    /// - 스크롤바 · 관성 · 탄성은 ScrollRect 가 그대로 맡는다. 이 스크립트는 셀 배치만 한다
    /// Content 는 위쪽 고정(anchor 위 · pivot y = 1)이라 아래로 굴릴수록 anchoredPosition.y 가 커진다.
    /// </summary>
    [RequireComponent(typeof(ScrollRect))]
    public class RecycledScroll : MonoBehaviour, IBeginDragHandler
    {
        [SerializeField] RecycledCell cellPrefab;
        [Tooltip("모든 행의 높이 (px). 위치 = index × itemHeight")]
        [SerializeField] float itemHeight = 104f;
        [Tooltip("보이는 범위 위아래로 더 붙여 둘 줄 수 — 빠르게 굴릴 때 빈칸이 비치지 않게")]
        [Range(0, 4)]
        [SerializeField] int overscan = 1;
        [Tooltip("끄면 비교용 나쁜 예: 셀을 돌려쓰지 않고 새 항목마다 새로 만들며 버리지도 않는다")]
        [SerializeField] bool recycle = true;

        /// <summary>셀에 index 번째 항목을 채운다. 켜고 끄는 표시는 모두 여기서 데이터대로 설정해야 한다</summary>
        public Action<RecycledCell, int> BindCell;

        public int Created { get; private set; }
        public int Reused { get; private set; }
        public int ActiveCount => byIndex.Count;
        public int First => first;
        public int Last => last;
        public float ItemHeight => itemHeight;
        public int Count => count;

        ScrollRect scroll;
        RectTransform content;
        RectTransform viewport;
        readonly Dictionary<int, RecycledCell> byIndex = new();
        readonly List<int> leaving = new();
        readonly Stack<RecycledCell> free = new();
        int count;
        int first;
        int last = -1;
        Coroutine glide;

        void Awake()
        {
            scroll = GetComponent<ScrollRect>();
            content = scroll.content;
            viewport = scroll.viewport != null ? scroll.viewport : (RectTransform)transform;
            // Content 는 위쪽에 붙이고 가로로 늘인다. 높이는 SetCount 가 count × itemHeight 로 잡는다
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = new Vector2(1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            scroll.onValueChanged.AddListener(_ => Refresh(false));
        }

        /// <summary>항목 수가 바뀌었다 — Content 높이를 다시 잡고 보이는 셀을 모두 다시 채운다</summary>
        public void SetCount(int n)
        {
            count = Mathf.Max(0, n);
            content.sizeDelta = new Vector2(content.sizeDelta.x, count * itemHeight);
            Refresh(true);
        }

        /// <summary>데이터만 바뀌었다(순위 변동 등) — 지금 보이는 셀만 다시 채운다</summary>
        public void RefreshVisible() => Refresh(true);

        /// <summary>index 번째 행이 화면에 온전히 보이는가 (내 순위 고정 행을 숨길지 정할 때)</summary>
        public bool IsFullyVisible(int index)
        {
            float y = content.anchoredPosition.y;
            float top = index * itemHeight;
            return top >= y - 1f && top + itemHeight <= y + viewport.rect.height + 1f;
        }

        /// <summary>
        /// index 번째 행을 가운데로. 먼 거리면 바로 앞 1.5화면까지 건너뛴 뒤 마지막 한 화면만 굴린다
        /// (끝까지 굴리면 기다려야 하고, 순간 이동만 하면 어디로 왔는지 모른다)
        /// </summary>
        public void ScrollTo(int index, bool animate = true, float seconds = 0.55f)
        {
            float view = viewport.rect.height;
            float max = Mathf.Max(0f, count * itemHeight - view);
            float target = Mathf.Clamp(index * itemHeight - (view - itemHeight) * 0.5f, 0f, max);
            scroll.StopMovement();   // 남은 관성이 점프를 이어 굴리지 않게
            if (glide != null) StopCoroutine(glide);
            if (!animate)
            {
                SetScroll(target);
                return;
            }
            float cur = content.anchoredPosition.y;
            if (Mathf.Abs(target - cur) > view * 2f) SetScroll(target - Mathf.Sign(target - cur) * view * 1.5f);
            glide = StartCoroutine(Glide(target, seconds));
        }

        /// <summary>끝까지 튕기기 — 관성이 끝을 조금 지나 멈출 속도를 준다 (지나친 만큼 ScrollRect 의 탄성이 되돌린다)</summary>
        public void FlingToEnd(bool toBottom)
        {
            if (glide != null) StopCoroutine(glide);
            float view = viewport.rect.height;
            float max = Mathf.Max(0f, count * itemHeight - view);
            float cur = content.anchoredPosition.y;
            float dist = toBottom ? max - cur + view * 1.5f : -(cur + view * 1.5f);
            // 관성 이동 거리 = 속도 ÷ (−ln 감속률). 감속률 0.135(기본값)면 ÷ 2
            float lambda = -Mathf.Log(Mathf.Clamp(scroll.decelerationRate, 0.01f, 0.99f));
            scroll.velocity = new Vector2(0f, dist * lambda);
        }

        IEnumerator Glide(float target, float seconds)
        {
            float from = content.anchoredPosition.y;
            for (float t = 0f; t < seconds; t += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - t / seconds, 3f);   // ease-out cubic
                SetScroll(Mathf.Lerp(from, target, k));
                yield return null;
            }
            SetScroll(target);
            glide = null;
        }

        void SetScroll(float y)
        {
            content.anchoredPosition = new Vector2(content.anchoredPosition.x, y);
            Refresh(false);
        }

        /// <summary>점프 중에 사용자가 끌기 시작하면 점프를 멈춘다 — 코루틴의 SetScroll 과 ScrollRect 의 끌기가 싸우면 떨린다</summary>
        public void OnBeginDrag(PointerEventData eventData)
        {
            if (glide == null) return;
            StopCoroutine(glide);
            glide = null;
        }

        void OnRectTransformDimensionsChange()
        {
            if (content != null) Refresh(true);   // 화면 크기가 바뀌면 보이는 줄 수도 바뀐다
        }

        void Refresh(bool rebind)
        {
            if (content == null) return;
            // ① 보이는 범위 (+ 여유분)
            float y = content.anchoredPosition.y;
            float view = viewport.rect.height;
            int f = Mathf.Max(0, Mathf.FloorToInt(y / itemHeight) - overscan);
            int l = Mathf.Min(count - 1, Mathf.CeilToInt((y + view) / itemHeight) - 1 + overscan);
            if (!rebind && f == first && l == last) return;   // 범위가 그대로면 할 일이 없다
            first = f;
            last = l;

            if (!recycle)
            {
                // 나쁜 예: 처음 보는 항목마다 새 셀. 만든 셀은 버리지 않아 굴린 만큼 쌓인다.
                // 데이터가 바뀌면 화면 밖에 남은 셀도 언젠가 다시 보이므로 만든 셀 전부를 다시 채워야 한다 — 그만큼 비싸다
                if (rebind)
                    foreach (KeyValuePair<int, RecycledCell> kv in byIndex) BindCell?.Invoke(kv.Value, kv.Key);
                for (int i = f; i <= l; i++)
                {
                    if (byIndex.ContainsKey(i)) continue;
                    RecycledCell kept = CreateCell();
                    Place(kept, i);
                    byIndex[i] = kept;
                    BindCell?.Invoke(kept, i);
                }
                return;
            }

            // ② 범위를 벗어난 셀을 풀에 반납
            leaving.Clear();
            foreach (KeyValuePair<int, RecycledCell> kv in byIndex)
                if (kv.Key < f || kv.Key > l) leaving.Add(kv.Key);
            foreach (int index in leaving)
            {
                RecycledCell cell = byIndex[index];
                byIndex.Remove(index);
                cell.Index = -1;
                free.Push(cell);
            }

            // ③ 새로 들어온 항목에 반납된 셀부터 배정. 범위 안에 계속 있던 셀은 (rebind 가 아니면) 건드리지 않는다
            for (int i = f; i <= l; i++)
            {
                if (byIndex.TryGetValue(i, out RecycledCell cell))
                {
                    if (rebind) BindCell?.Invoke(cell, i);
                    continue;
                }
                if (free.Count > 0)
                {
                    cell = free.Pop();
                    Reused++;
                    if (!cell.gameObject.activeSelf) cell.gameObject.SetActive(true);
                }
                else cell = CreateCell();
                Place(cell, i);
                byIndex[i] = cell;
                BindCell?.Invoke(cell, i);
            }

            // ④ 끝까지 남은 셀만 끈다 (목록 끝 근처 · 여유분을 줄였을 때만 생긴다)
            foreach (RecycledCell rest in free)
                if (rest.gameObject.activeSelf) rest.gameObject.SetActive(false);
        }

        RecycledCell CreateCell()
        {
            RecycledCell cell = Instantiate(cellPrefab, content);
            cell.CellNumber = Created++;
            RectTransform r = cell.Rect;
            r.anchorMin = new Vector2(0f, 1f);
            r.anchorMax = new Vector2(1f, 1f);
            r.pivot = new Vector2(0.5f, 1f);
            r.sizeDelta = new Vector2(0f, itemHeight);
            return cell;
        }

        void Place(RecycledCell cell, int index)
        {
            cell.Index = index;
            cell.Rect.anchoredPosition = new Vector2(0f, -index * itemHeight);   // 셀은 위치만 옮긴다 — 파괴 · 생성 없음
        }
    }
}
