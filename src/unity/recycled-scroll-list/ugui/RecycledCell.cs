using UnityEngine;

namespace UIGallery.RecycledScrollList
{
    /// <summary>
    /// 재활용 셀의 바탕 — RecycledScroll 이 만들고(Instantiate 는 처음 한 번), 위치만 옮기고, 다른 항목에 다시 배정한다.
    /// 무엇을 그릴지는 이것을 상속한 셀 뷰(RankingCellView)가 정한다. 셀은 '지금 빌려 보여 주는 항목 번호' 만 안다 — 상태는 데이터에.
    /// MonoBehaviour 는 클래스 이름과 파일 이름이 같아야 하므로 따로 둔다.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public class RecycledCell : MonoBehaviour
    {
        /// <summary>만들어진 순서 (디버그 표시용 셀 번호)</summary>
        public int CellNumber { get; internal set; }

        /// <summary>지금 보여 주는 항목의 index. 풀에서 쉬는 중이면 -1</summary>
        public int Index { get; internal set; } = -1;

        RectTransform rect;
        public RectTransform Rect => rect != null ? rect : rect = (RectTransform)transform;
    }
}
