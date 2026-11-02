using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.RecycledScrollList
{
    /// <summary>
    /// UI Toolkit 판 — 같은 1,000명 랭킹을 ListView 로. UGUI 판의 RecycledScroll 이 직접 하던 일(범위 계산 · 반납 · 재배정)이 ListView 에 내장돼 있다.
    /// - makeItem: 요소를 새로 만들 때만 불린다 → 여기서 버튼 콜백을 한 번만 등록하고 '만든 셀 수' 를 센다
    /// - bindItem: 요소를 다른 항목에 다시 쓸 때마다 불린다 → 글자 · 하트를 모두 데이터대로, 콜백이 읽을 index 는 userData 로
    /// - 데이터만 바뀌면 RefreshItems(), 개수가 바뀌면 Rebuild()
    /// RankingEntry · RankingData 는 UGUI 폴더 것을 그대로 쓴다.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class RankingListUITK : MonoBehaviour
    {
        /// <summary>한 줄 요소에서 자주 쓰는 자식 — makeItem 에서 한 번 찾아 두고 bindItem 에서 Q() 를 반복하지 않는다</summary>
        class RowRefs
        {
            public VisualElement row;
            public Label cellNo, rank, delta, name, sub, score, cheers;
            public VisualElement crest;
            public Button cheer;
        }

        [SerializeField] VisualTreeAsset rowTemplate;
        [SerializeField] int dataCount = 1000;
        [Tooltip("행 높이 (px) — ListView.fixedItemHeight. USS 의 행 높이도 이것을 따른다")]
        [SerializeField] float itemHeight = 104f;
        [SerializeField] bool showDebug = true;
        [Tooltip("문장 모양 스프라이트 (RankingData.CrestKinds 개)")]
        [SerializeField] Sprite[] crestSprites = new Sprite[RankingData.CrestKinds];

        ListView list;
        ScrollView scrollView;
        Label debug;
        VisualElement pinnedHost;
        RowRefs pinned;
        List<RankingEntry> entries;
        readonly System.Random rng = new(29);
        int myIndex;
        int made;
        int binds;

        Button jumpButton, reshuffleButton, bottomButton;
        TemplateContainer pinnedRow;
        int shownMade = -1, shownBinds = -1;
        float nextDebugAt;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            list = root.Q<ListView>("list");
            debug = root.Q<Label>("debug");
            pinnedHost = root.Q("pinned");
            jumpButton = root.Q<Button>("jump-me");
            reshuffleButton = root.Q<Button>("reshuffle");
            bottomButton = root.Q<Button>("to-bottom");

            entries = RankingData.Generate(dataCount);
            myIndex = RankingData.IndexOfMe(entries);
            made = 0;
            binds = 0;
            root.Q<Label>("total").text = $"참가 {entries.Count:N0}명";

            list.fixedItemHeight = itemHeight;
            list.virtualizationMethod = CollectionVirtualizationMethod.FixedHeight;
            list.selectionType = SelectionType.None;
            list.makeItem = MakeRow;
            list.bindItem = BindRow;
            list.itemsSource = entries;
            list.Rebuild();

            scrollView = list.Q<ScrollView>();
            scrollView.verticalScroller.valueChanged += OnScrolled;

            // 고정 행: ListView 밖에 같은 템플릿 하나
            pinnedRow = rowTemplate.Instantiate();
            pinnedRow.style.flexGrow = 1;
            pinned = Cache(pinnedRow);
            pinned.cheer.style.display = DisplayStyle.None;
            pinned.cellNo.style.display = DisplayStyle.None;
            pinnedHost.Add(pinnedRow);
            pinnedHost.RegisterCallback<ClickEvent>(OnPinnedClick);

            jumpButton.clicked += JumpToMe;
            reshuffleButton.clicked += Reshuffle;
            bottomButton.clicked += ScrollToBottom;

            Fill(pinned, entries[myIndex], myIndex);
            UpdatePinned();
        }

        // 켤 때 단 것은 끌 때 모두 뗀다 — 컴포넌트를 껐다 켜면 콜백 · 고정 행이 두 벌이 되지 않게
        void OnDisable()
        {
            if (scrollView != null) scrollView.verticalScroller.valueChanged -= OnScrolled;
            if (pinnedHost != null)
            {
                pinnedHost.UnregisterCallback<ClickEvent>(OnPinnedClick);
                pinnedRow?.RemoveFromHierarchy();
            }
            if (jumpButton != null) jumpButton.clicked -= JumpToMe;
            if (reshuffleButton != null) reshuffleButton.clicked -= Reshuffle;
            if (bottomButton != null) bottomButton.clicked -= ScrollToBottom;
        }

        void OnScrolled(float _) => UpdatePinned();
        void OnPinnedClick(ClickEvent _) => JumpToMe();
        void ScrollToBottom() => list.ScrollToItem(entries.Count - 1);

        // 디버그 글자는 0.25초에 한 번, 값이 바뀌었을 때만 만든다 (bindItem 마다 문자열을 만들면 그것도 GC 거리)
        void Update()
        {
            if (debug == null || Time.unscaledTime < nextDebugAt) return;
            nextDebugAt = Time.unscaledTime + 0.25f;
            debug.style.display = showDebug ? DisplayStyle.Flex : DisplayStyle.None;
            if (!showDebug || (made == shownMade && binds == shownBinds)) return;
            shownMade = made;
            shownBinds = binds;
            debug.text = $"데이터 {entries.Count:N0} · makeItem {made}회(= 만든 셀) · bindItem {binds:N0}회(= 다시 채움)";
        }

        VisualElement MakeRow()
        {
            TemplateContainer row = rowTemplate.Instantiate();
            row.style.height = itemHeight;
            RowRefs r = Cache(row);
            r.cellNo.text = $"셀 {made}";
            r.cellNo.style.display = showDebug ? DisplayStyle.Flex : DisplayStyle.None;
            // 콜백은 여기서 한 번만. bindItem 에서 += 하면 요소를 다시 쓸 때마다 쌓여 한 번 눌러도 여러 번 불린다
            r.cheer.clicked += () => OnCheer(r);
            made++;
            return row;
        }

        void BindRow(VisualElement element, int index)
        {
            binds++;
            var r = (RowRefs)element.userData;
            r.cheer.userData = index;   // 버튼이 지금 어느 항목인지
            Fill(r, entries[index], index);
        }

        static RowRefs Cache(VisualElement row)
        {
            var r = new RowRefs
            {
                row = row.Q(className: "row"),
                cellNo = row.Q<Label>("cell-no"),
                rank = row.Q<Label>("rank"),
                delta = row.Q<Label>("delta"),
                name = row.Q<Label>("name"),
                sub = row.Q<Label>("sub"),
                score = row.Q<Label>("score"),
                cheers = row.Q<Label>("cheers"),
                crest = row.Q("crest"),
                cheer = row.Q<Button>("cheer"),
            };
            row.userData = r;
            return r;
        }

        /// <summary>한 줄 채우기 — 켜고 끄는 클래스는 EnableInClassList 로 켜기 · 끄기를 한 번에</summary>
        void Fill(RowRefs r, RankingEntry e, int index)
        {
            r.rank.text = (index + 1).ToString();
            r.row.EnableInClassList("row--medal", index < 3);
            r.row.EnableInClassList("row--me", e.me);
            r.delta.text = e.delta > 0 ? $"▲{e.delta}" : e.delta < 0 ? $"▼{-e.delta}" : "";
            r.delta.EnableInClassList("row__delta--up", e.delta > 0);
            r.delta.EnableInClassList("row__delta--down", e.delta < 0);
            if (crestSprites.Length > 0 && crestSprites[e.crest % crestSprites.Length] != null)
                r.crest.style.backgroundImage = new StyleBackground(crestSprites[e.crest % crestSprites.Length]);
            r.crest.style.unityBackgroundImageTintColor = Color.HSVToRGB(((e.squad * 40 + 170) % 360) / 360f, 0.55f, 0.85f);
            r.name.text = e.me ? $"{e.name} (나)" : e.name;
            r.sub.text = $"{e.squad}분대 · Lv {e.level}";
            r.score.text = e.score.ToString("N0");
            r.cheers.text = e.cheers.ToString();
            r.cheer.EnableInClassList("row__cheer--on", e.cheered);
        }

        void OnCheer(RowRefs r)
        {
            if (r.cheer.userData is not int index) return;
            RankingEntry e = entries[index];
            e.cheered = !e.cheered;   // 상태는 데이터에
            e.cheers += e.cheered ? 1 : -1;
            list.RefreshItem(index);
        }

        void JumpToMe() => list.ScrollToItem(myIndex);

        void Reshuffle()
        {
            RankingData.Reshuffle(entries, rng);
            myIndex = RankingData.IndexOfMe(entries);
            list.RefreshItems();   // 보이는 요소만 다시 bindItem
            Fill(pinned, entries[myIndex], myIndex);
            UpdatePinned();
        }

        void UpdatePinned()
        {
            float y = scrollView.scrollOffset.y;
            float view = scrollView.contentViewport.layout.height;
            float top = myIndex * itemHeight;
            bool visible = !float.IsNaN(view) && top >= y - 1f && top + itemHeight <= y + view + 1f;
            pinnedHost.EnableInClassList("ranking__pinned--hidden", visible);
            pinnedHost.pickingMode = visible ? PickingMode.Ignore : PickingMode.Position;
        }
    }
}
