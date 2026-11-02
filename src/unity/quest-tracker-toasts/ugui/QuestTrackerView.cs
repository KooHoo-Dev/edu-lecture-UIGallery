using System;
using System.Collections;
using UnityEngine;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 퀘스트 트래커 (고정 정보) — 화면 가장자리 한자리에 고정. 위치와 크기를 바꾸지 않아 시선이 습관처럼 돌아온다.
    /// 게임 쪽은 AddProgress("kill") 처럼 '무슨 일이 일어났는지'만 알리고, 어느 행을 어떻게 강조할지는 이 뷰가 정한다.
    /// 임무가 끝나면 QuestCompleted 이벤트를 낸다 → 데모(또는 게임)가 우선 배너와 보상 토스트로 보낸다.
    /// 끝난 주 임무는 접히고, 사슬의 다음 임무가 목록 맨 위에 펼쳐지며 들어온다.
    /// </summary>
    public class QuestTrackerView : MonoBehaviour
    {
        [Serializable]
        public class ObjectiveDef { public string id; public string feed; public string text; public int cur; public int max = 1; }

        [Serializable]
        public class QuestDef
        {
            public string id;
            public string title;
            public bool isMain = true;
            public string rewardText;   // 배너 아랫줄 (예: "크레딧 +350 · 수리 키트 ×2")
            public int rewardCredit;
            public ObjectiveDef[] objectives;
        }

        [SerializeField] Transform listParent;            // VerticalLayoutGroup
        [SerializeField] QuestEntryView entryPrefab;
        [SerializeField, Tooltip("주 임무 사슬 — 하나를 끝내면 다음 것을 자동 추적")] QuestDef[] mainChain;
        [SerializeField] QuestDef repeatQuest;

        public event Action<QuestDef> QuestCompleted;

        int mainIndex;

        void Start()
        {
            if (mainChain.Length > 0) Spawn(mainChain[0], first: true, animate: false);
            if (repeatQuest != null && !string.IsNullOrEmpty(repeatQuest.id)) Spawn(repeatQuest, first: false, animate: false);
        }

        QuestEntryView Spawn(QuestDef def, bool first, bool animate)
        {
            var e = Instantiate(entryPrefab, listParent);
            if (first) e.transform.SetAsFirstSibling();
            e.Init(def.id, def.isMain, def.title);
            foreach (var o in def.objectives) e.AddObjective(o.id, o.feed, o.text, o.cur, o.max);
            if (animate) StartCoroutine(e.Expand());
            return e;
        }

        /// <summary>예: AddProgress("kill"), AddProgress("circuit", 3)</summary>
        public void AddProgress(string feed, int amount = 1)
        {
            foreach (var e in listParent.GetComponentsInChildren<QuestEntryView>())
            {
                if (e.Completed) continue;
                bool hit = false;
                foreach (var row in e.rows)
                {
                    if (row.Feed != feed || row.Done) continue;
                    row.Apply(row.Current + amount, true);    // 바뀐 행만 강조된다
                    hit = true;
                }
                if (hit && e.AllDone()) Complete(e);
            }
        }

        /// <summary>현재 주 임무를 즉시 완료 (이벤트 · 치트용)</summary>
        public void CompleteCurrentMain()
        {
            foreach (var e in listParent.GetComponentsInChildren<QuestEntryView>())
                if (e.IsMain && !e.Completed) { Complete(e); return; }
        }

        void Complete(QuestEntryView e)
        {
            e.MarkCompleted();
            QuestCompleted?.Invoke(FindDef(e));
            StartCoroutine(CollapseThenNext(e));
        }

        IEnumerator CollapseThenNext(QuestEntryView e)
        {
            yield return e.HoldAndCollapse();
            bool wasMain = e.IsMain;
            Destroy(e.gameObject);
            if (wasMain && mainChain.Length > 0)
            {
                mainIndex = (mainIndex + 1) % mainChain.Length;
                Spawn(mainChain[mainIndex], first: true, animate: true);
            }
            else if (!wasMain) Spawn(Fresh(repeatQuest), first: false, animate: true);
        }

        QuestDef FindDef(QuestEntryView e)
        {
            foreach (var d in mainChain) if (d.id == e.QuestId) return d;
            return repeatQuest;
        }

        static QuestDef Fresh(QuestDef d)
        {
            var copy = new QuestDef { id = d.id, title = d.title, isMain = d.isMain, rewardText = d.rewardText, rewardCredit = d.rewardCredit, objectives = new ObjectiveDef[d.objectives.Length] };
            for (int i = 0; i < d.objectives.Length; i++)
            {
                var o = d.objectives[i];
                copy.objectives[i] = new ObjectiveDef { id = o.id, feed = o.feed, text = o.text, cur = 0, max = o.max };
            }
            return copy;
        }
    }
}
