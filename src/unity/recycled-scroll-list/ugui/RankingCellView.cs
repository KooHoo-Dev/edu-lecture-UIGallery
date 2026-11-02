using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.RecycledScrollList
{
    /// <summary>응원 상태를 어디에 두는가 — Cell 은 비교용 나쁜 예 (돌려쓸 때 하트가 다른 대원에게 따라간다)</summary>
    public enum CellStateMode { Data, Cell }

    /// <summary>
    /// 랭킹 한 줄의 셀 뷰 (프리팹). RecycledScroll 이 돌려쓰고, Bind 가 그때마다 내용을 처음부터 다시 채운다.
    /// - 켜고 끄는 표시(메달 · 나 · 하트 · 순위 변동)는 켜는 경우와 끄는 경우를 모두 쓴다 — 하나라도 빠지면 이전 항목의 흔적이 남는다
    /// - 버튼 리스너는 Awake 에서 한 번만. 누르면 지금 Index 를 이벤트로 알린다 (데이터는 바깥에서 바꾼다)
    /// 같은 프리팹을 '내 순위 고정 행' 으로도 쓴다.
    /// </summary>
    public class RankingCellView : RecycledCell
    {
        [SerializeField] TextMeshProUGUI rankText;
        [SerializeField] TextMeshProUGUI deltaText;
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] TextMeshProUGUI subText;
        [SerializeField] TextMeshProUGUI scoreText;
        [SerializeField] TextMeshProUGUI cheersText;
        [Tooltip("1~3위 메달 (모양 + 숫자 — 색만으로 구분하지 않는다)")]
        [SerializeField] Image medal;
        [SerializeField] Sprite[] medalSprites = new Sprite[3];
        [SerializeField] Image crest;
        [SerializeField] Sprite[] crestSprites = new Sprite[RankingData.CrestKinds];
        [Tooltip("내 줄 바탕 강조")]
        [SerializeField] Image meHighlight;
        [SerializeField] Button cheerButton;
        [SerializeField] Image heartFill;
        [Header("디버그")]
        [SerializeField] GameObject debugTag;
        [SerializeField] TextMeshProUGUI debugText;
        [Tooltip("셀에 남은 하트가 데이터와 다를 때 (cellState = Cell 일 때만)")]
        [SerializeField] GameObject staleMark;
        [SerializeField] Color upColor = new(0.44f, 0.88f, 0.54f);
        [SerializeField] Color downColor = new(1f, 0.54f, 0.54f);

        /// <summary>응원 버튼을 눌렀다 — 받는 쪽이 Index 로 데이터를 찾아 바꾼다</summary>
        public event Action<RankingCellView> CheerClicked;

        /// <summary>cellState = Cell(나쁜 예)일 때만 쓰는 '셀이 들고 있는' 응원 표시</summary>
        bool cellCheered;
        /// <summary>마지막 Bind 의 데이터 응원 상태 · 디버그 여부 (ToggleCellOnly 가 경고 표시를 다시 계산할 때)</summary>
        bool boundCheered;
        bool boundDebug;

        void Awake()
        {
            if (cheerButton != null) cheerButton.onClick.AddListener(() => CheerClicked?.Invoke(this));
        }

        public void Bind(RankingEntry e, int index, CellStateMode mode, bool showDebug)
        {
            rankText.text = (index + 1).ToString();
            bool top3 = index < 3;
            medal.gameObject.SetActive(top3);
            if (top3) medal.sprite = medalSprites[index];

            deltaText.text = e.delta > 0 ? $"▲{e.delta}" : e.delta < 0 ? $"▼{-e.delta}" : "";
            deltaText.color = e.delta >= 0 ? upColor : downColor;

            if (crestSprites.Length > 0) crest.sprite = crestSprites[e.crest % crestSprites.Length];
            crest.color = Color.HSVToRGB(((e.squad * 40 + 170) % 360) / 360f, 0.55f, 0.85f);
            nameText.text = e.me ? $"{e.name} (나)" : e.name;
            subText.text = $"{e.squad}분대 · Lv {e.level}";
            scoreText.text = e.score.ToString("N0");
            cheersText.text = e.cheers.ToString();
            meHighlight.enabled = e.me;   // 켜기만 하면 '나' 강조가 다른 줄에 남는다

            bool on;
            if (mode == CellStateMode.Cell)
            {
                // 흔한 실수 재현: 켜기만 하고 끄지 않는다 — 이 셀이 한 번 하트를 보여 주면 다른 대원에게도 남는다
                if (e.cheered) cellCheered = true;
                on = cellCheered;
            }
            else on = e.cheered;   // 바른 방법: 데이터대로 켜고 끈다
            heartFill.enabled = on;
            boundCheered = e.cheered;
            boundDebug = showDebug;

            if (debugTag != null)
            {
                debugTag.SetActive(showDebug);
                debugText.text = $"셀 {CellNumber}";
            }
            if (staleMark != null) staleMark.SetActive(showDebug && mode == CellStateMode.Cell && cellCheered != e.cheered);
        }

        /// <summary>고정 행처럼 응원 버튼이 필요 없는 자리에서 숨긴다</summary>
        public void HideCheer()
        {
            if (cheerButton != null) cheerButton.gameObject.SetActive(false);
        }

        /// <summary>나쁜 예: 버튼이 셀의 그림만 바꾼다 (데이터는 그대로)</summary>
        public void ToggleCellOnly()
        {
            cellCheered = !cellCheered;
            heartFill.enabled = cellCheered;
            if (staleMark != null) staleMark.SetActive(boundDebug && cellCheered != boundCheered);
        }

        /// <summary>상태 저장 위치를 바꿀 때 셀에 남은 표시를 지운다</summary>
        public void ClearCellState() => cellCheered = false;
    }
}
