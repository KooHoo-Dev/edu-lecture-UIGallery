using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.RedDotBadgeTree
{
    /// <summary>
    /// 시험용 입력 — 숫자키로 트리를 바꾸고 배지가 따라오는지 본다.
    /// 1: 새 우편(보상 잎 추가)  2: 우편 보상 하나 받기  3: 공지 탭 열기(소식 잎 모두 끄기)
    /// 4: 일일 임무 모두 받기    5: 하루 지남(일일 임무 다시)
    /// 꺼지는 규칙: 보상(할 일)은 받았을 때, 공지(소식)는 그 탭을 열었을 때.
    /// </summary>
    public class RedDotDemo : MonoBehaviour
    {
        readonly Queue<string> mailRewards = new();
        int mailNo;

        static RedDotTree Tree => RedDotTree.Instance;

        void Start()
        {
            AddMail();
            AddMail();
            Tree.SetLeaf("mail/notice/maintenance", true);
            NextDay();
            Tree.SetLeaf("mission/weekly/tower", true);
            Debug.Log($"레드닷 합계 {Tree.Root.Count}");
        }

        void AddMail()
        {
            string path = $"mail/reward/item-{++mailNo}";
            mailRewards.Enqueue(path);
            Tree.SetLeaf(path, true);
        }

        static void NextDay()
        {
            Tree.SetLeaf("mission/daily/drone", true);
            Tree.SetLeaf("mission/daily/explore", true);
        }

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) AddMail();
            if (kb.digit2Key.wasPressedThisFrame && mailRewards.Count > 0) Tree.Remove(mailRewards.Dequeue());   // 받은 우편은 트리에서 뺀다
            if (kb.digit3Key.wasPressedThisFrame) Tree.ClearChildren("mail/notice");
            if (kb.digit4Key.wasPressedThisFrame) Tree.ClearChildren("mission/daily");
            if (kb.digit5Key.wasPressedThisFrame) NextDay();
            if (kb.anyKey.wasPressedThisFrame) Debug.Log($"우편 {Tree.Get("mail").Count} · 임무 {Tree.Get("mission").Count} · 합계 {Tree.Root.Count}");
        }

        /// <summary>탭 버튼 onClick 에 연결 — 소식 탭은 열면 끈다</summary>
        public void OnNoticeTabOpened() => Tree.ClearChildren("mail/notice");
    }
}
