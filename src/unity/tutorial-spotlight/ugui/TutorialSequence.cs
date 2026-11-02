using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.TutorialSpotlightSample
{
    /// <summary>
    /// 튜토리얼 단계 데이터 — 문구를 코드에서 빼 두면 기획자가 에셋만 고쳐서 바꿀 수 있다.
    /// Project 창 → Create → UI Gallery → Tutorial Sequence
    /// </summary>
    [CreateAssetMenu(menuName = "UI Gallery/Tutorial Sequence")]
    public class TutorialSequence : ScriptableObject
    {
        public enum Side { Top, Bottom, Left, Right }

        [Serializable]
        public class Step
        {
            [Tooltip("강조할 TutorialTarget 의 id — 이 대상을 누르면 다음 단계")]
            public string targetId;
            public string title;
            [TextArea] public string body;
            [Tooltip("말풍선을 먼저 놓아 볼 방향 (화면을 넘치면 반대로 뒤집는다)")]
            public Side prefer = Side.Top;
        }

        public List<Step> steps = new();
    }
}
