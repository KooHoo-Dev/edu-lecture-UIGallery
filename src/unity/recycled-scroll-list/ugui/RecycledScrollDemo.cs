using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.RecycledScrollList
{
    /// <summary>
    /// 시험용 — 1,000명 랭킹 데이터를 만들어 RecycledScroll 에 붙이고, 버튼 · 키로 점프 · 순위 변동 · 끝까지 튕기기를 해 본다.
    /// 데이터(entries)는 여기에만 있고 셀은 index 로 빌려 볼 뿐이다. 응원 버튼도 여기서 데이터를 바꾼 뒤 그 줄을 다시 채운다.
    /// 확인: Window → Analysis → Profiler 의 UI 모듈에서 Canvas.BuildBatch 시간, Hierarchy 의 Content 아래 셀 개수.
    /// </summary>
    public class RecycledScrollDemo : MonoBehaviour
    {
        [SerializeField] RecycledScroll list;
        [Tooltip("내 순위 고정 행 — 같은 RankingCellView 프리팹 하나 (Content 밖)")]
        [SerializeField] RankingCellView pinnedRow;
        [SerializeField] CanvasGroup pinnedGroup;
        [SerializeField] Button pinnedButton;
        [SerializeField] Button jumpMeButton;
        [SerializeField] Button reshuffleButton;
        [SerializeField] Button toBottomButton;
        [SerializeField] TextMeshProUGUI debugText;

        [SerializeField] int dataCount = 1000;
        [Tooltip("Cell = 비교용 나쁜 예 (응원 표시를 셀이 들고 있다)")]
        [SerializeField] CellStateMode cellState = CellStateMode.Data;
        [SerializeField] bool showDebug = true;

        [Header("키보드 · 패드 (선택)")]
        [SerializeField] InputActionReference jumpMeAction;

        List<RankingEntry> entries;
        readonly HashSet<RankingCellView> hooked = new();
        readonly System.Random rng = new(29);
        int myIndex;
        CellStateMode appliedState;
        int debugKey = -1;

        void Start()
        {
            entries = RankingData.Generate(dataCount);
            myIndex = RankingData.IndexOfMe(entries);
            appliedState = cellState;
            list.BindCell = OnBind;
            list.SetCount(entries.Count);

            jumpMeButton.onClick.AddListener(JumpToMe);
            if (pinnedButton != null) pinnedButton.onClick.AddListener(JumpToMe);
            reshuffleButton.onClick.AddListener(Reshuffle);
            toBottomButton.onClick.AddListener(() => list.FlingToEnd(list.Last < entries.Count - 1));
            if (pinnedRow != null) pinnedRow.HideCheer();   // 고정 행은 이동 버튼 — 응원은 목록에서
            BindPinned();
        }

        void OnEnable()
        {
            if (jumpMeAction != null) jumpMeAction.action.Enable();
        }

        void OnDisable()
        {
            if (jumpMeAction != null) jumpMeAction.action.Disable();
        }

        void OnBind(RecycledCell cell, int index)
        {
            var view = (RankingCellView)cell;
            if (hooked.Add(view)) view.CheerClicked += OnCheer;   // 셀이 처음 나왔을 때 한 번만 연결
            view.Bind(entries[index], index, cellState, showDebug);
        }

        void OnCheer(RankingCellView view)
        {
            if (view.Index < 0) return;
            if (cellState == CellStateMode.Cell)
            {
                view.ToggleCellOnly();   // 나쁜 예: 그림만 바뀌고 데이터는 그대로
                return;
            }
            RankingEntry e = entries[view.Index];
            e.cheered = !e.cheered;
            e.cheers += e.cheered ? 1 : -1;
            view.Bind(e, view.Index, cellState, showDebug);
        }

        void JumpToMe() => list.ScrollTo(myIndex);

        void Reshuffle()
        {
            RankingData.Reshuffle(entries, rng);
            myIndex = RankingData.IndexOfMe(entries);
            list.RefreshVisible();   // 보이는 셀만 다시 채운다 — 1,000개를 다 건드리지 않는다
            BindPinned();
        }

        void BindPinned()
        {
            if (pinnedRow != null && myIndex >= 0) pinnedRow.Bind(entries[myIndex], myIndex, CellStateMode.Data, false);
        }

        void Update()
        {
            if (jumpMeAction != null && jumpMeAction.action.WasPressedThisFrame()) JumpToMe();

            // 인스펙터에서 상태 저장 위치를 바꾸면 셀에 남은 표시를 지우고 다시 채운다
            if (appliedState != cellState)
            {
                appliedState = cellState;
                foreach (RankingCellView v in hooked) v.ClearCellState();
                list.RefreshVisible();
            }

            // 내 줄이 화면에 온전히 보이면 고정 행을 숨긴다
            if (pinnedGroup != null)
            {
                bool show = myIndex >= 0 && !list.IsFullyVisible(myIndex);
                pinnedGroup.alpha = Mathf.MoveTowards(pinnedGroup.alpha, show ? 1f : 0f, Time.unscaledDeltaTime / 0.2f);
                pinnedGroup.blocksRaycasts = show;
            }

            if (debugText != null)
            {
                debugText.gameObject.SetActive(showDebug);
                // 값이 바뀐 프레임에만 글자를 만든다 (매 프레임 문자열을 만들면 그것도 GC 거리)
                int key = (list.Created * 7919) ^ (list.Reused * 31) ^ (list.First * 131) ^ list.Last;
                if (showDebug && key != debugKey)
                {
                    debugKey = key;
                    debugText.text = $"데이터 {entries.Count:N0} · 만든 셀 {list.Created} · 재사용 {list.Reused:N0} · 지금 쓰는 셀 {list.ActiveCount}\n보이는 범위(여유분 포함) #{list.First + 1} ~ #{list.Last + 1}";
                }
            }
        }
    }
}
