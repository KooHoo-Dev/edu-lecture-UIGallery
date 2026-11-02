using System;
using UnityEngine;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 대화 데이터 — 화자 · 소개 여부 · 본문 · 선택지 · 선택별 반응 한 줄.
    /// UGUI(DialogueView)와 UI Toolkit(DialogueUITK)이 같은 에셋을 쓴다.
    /// Project 창 → Create → UI Gallery → Dialogue Data
    /// </summary>
    [CreateAssetMenu(menuName = "UI Gallery/Dialogue Data")]
    public class DialogueData : ScriptableObject
    {
        [Serializable]
        public class Line
        {
            public string speakerName = "하린";
            public string role = "탐사대장";
            [Tooltip("아직 소개 전인 인물 → 이름표 '???' + 실루엣 초상화 (스포일러 방지)")]
            public bool unknown;
            public Sprite portrait;
            public Sprite silhouette;
            [TextArea(2, 4)] public string text;

            public string DisplayName => unknown ? "???" : speakerName;
            public string DisplayRole => unknown ? "무전 · 신원 미확인" : role;
            public Sprite DisplayPortrait => unknown ? silhouette : portrait;
        }

        [Serializable]
        public class Choice
        {
            public string text = "통신탑부터 복구하죠.";
            [Tooltip("대사가 아닌 행동(침묵 등) — 괄호로 표시")] public bool isAction;
            [Tooltip("이 선택을 고르면 이어지는 반응 한 줄")] public Line reply;
        }

        [Tooltip("공통 줄. 마지막 줄이 끝나면 선택지가 열린다")] public Line[] lines;
        public Choice[] choices;
        [Tooltip("제한시간이 다 되면 확정되는 선택 (예: 침묵)")] public int defaultChoice = 2;
        [Tooltip("반응 뒤 마지막 한 줄")] public Line endLine;
    }
}
