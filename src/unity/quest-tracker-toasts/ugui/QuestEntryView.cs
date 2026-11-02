using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 트래커의 임무 블록 1개 (QuestEntry 프리팹). 들어올 때 높이를 펼치고, 완료되면 1.25초 머문 뒤 0.25초에 접힌다.
    /// 높이 보간은 LayoutElement.preferredHeight 로 한다 (VerticalLayoutGroup 이 위치를 맡는다).
    /// </summary>
    public class QuestEntryView : MonoBehaviour
    {
        [SerializeField] LayoutElement layoutElement;
        [SerializeField] CanvasGroup group;
        [SerializeField] RectTransform content;          // 실제 내용 (높이 측정용)
        [SerializeField] TextMeshProUGUI kindLabel;      // "주 임무" / "반복 과제"
        [SerializeField] TextMeshProUGUI title;
        [SerializeField] GameObject doneTag;             // "완료" 표시
        [SerializeField] Image titleHighlight;
        [SerializeField] Transform objectivesParent;
        [SerializeField] ObjectiveRowView rowPrefab;

        public readonly List<ObjectiveRowView> rows = new();
        public string QuestId { get; private set; }
        public bool IsMain { get; private set; }
        public bool Completed { get; private set; }

        public void Init(string id, bool isMain, string titleText)
        {
            QuestId = id;
            IsMain = isMain;
            kindLabel.text = isMain ? "주 임무" : "반복 과제";
            title.text = titleText;
            doneTag.SetActive(false);
            titleHighlight.color = Color.clear;
        }

        public ObjectiveRowView AddObjective(string id, string feed, string text, int cur, int max)
        {
            var row = Instantiate(rowPrefab, objectivesParent);
            row.Init(id, feed, text, cur, max);
            rows.Add(row);
            return row;
        }

        public bool AllDone()
        {
            foreach (var r in rows) if (!r.Done) return false;
            return true;
        }

        public IEnumerator Expand(float seconds = 0.32f)
        {
            Canvas.ForceUpdateCanvases();
            float h = LayoutUtility.GetPreferredHeight(content);
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / seconds)
            {
                layoutElement.preferredHeight = Mathf.Lerp(0f, h, 1f - Mathf.Pow(1f - t, 3f));
                group.alpha = t;
                titleHighlight.color = new Color(1f, 0.75f, 0.35f, 0.32f);
                yield return null;
            }
            layoutElement.preferredHeight = -1f;   // 다시 내용 크기를 따른다
            group.alpha = 1f;
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / 0.6f)
            {
                titleHighlight.color = new Color(1f, 0.75f, 0.35f, 0.32f * (1f - t));
                yield return null;
            }
            titleHighlight.color = Color.clear;
        }

        public void MarkCompleted()
        {
            Completed = true;
            doneTag.SetActive(true);
            foreach (var r in rows) r.Apply(r.Max, true);
        }

        public IEnumerator HoldAndCollapse(float hold = 1.25f, float collapse = 0.25f)
        {
            yield return new WaitForSeconds(hold);   // 게임 시간 — 일시정지 중 멈춘다
            float h = ((RectTransform)transform).rect.height;
            for (float t = 0f; t < 1f; t += Time.deltaTime / collapse)
            {
                layoutElement.preferredHeight = Mathf.Lerp(h, 0f, Mathf.SmoothStep(0f, 1f, t));
                group.alpha = 1f - t;
                yield return null;
            }
        }
    }
}
