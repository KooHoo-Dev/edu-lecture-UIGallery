// 확률표 — 추첨기와 같은 GachaTable 에셋에서 줄을 만든다. 표를 바꾸면 Build 를 다시 부르기만 하면 된다.
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace UIGallery.GachaRevealOdds
{
    public class OddsTableView : MonoBehaviour
    {
        [Tooltip("줄 프리팹 — 자식 TextMeshProUGUI 두 개 (이름 · 확률)")]
        [SerializeField] RectTransform rowPrefab;
        [SerializeField] RectTransform rowRoot;
        [SerializeField] TextMeshProUGUI pityRule;
        [SerializeField] Color[] gradeColors = { new(1f, 0.8f, 0.3f), new(0.76f, 0.6f, 1f), new(0.56f, 0.71f, 0.86f) };

        readonly List<RectTransform> rows = new();

        public void Build(GachaTable table)
        {
            foreach (RectTransform r in rows) Destroy(r.gameObject);
            rows.Clear();
            for (int g = 0; g < 3; g++)
            {
                var grade = (Grade)g;
                string head = $"{table.GradePercent(grade):0.00}%";
                if (grade == Grade.Hero && table.pityMode == PityMode.Guarantee)
                    head += $"  (천장 포함 {table.ConsolidatedHeroPercent():0.00}%)";
                AddRow(GachaTable.GradeNames[g], head, gradeColors[g], true);
                for (int i = 0; i < table.items.Count; i++)
                    if (table.items[i].grade == grade) AddRow("   " + table.items[i].displayName, $"{table.ItemPercent(i):0.000}%", Color.white, false);
            }
            pityRule.text = "천장 — " + table.PityRuleText();
        }

        void AddRow(string label, string value, Color color, bool header)
        {
            RectTransform row = Instantiate(rowPrefab, rowRoot);
            TextMeshProUGUI[] t = row.GetComponentsInChildren<TextMeshProUGUI>();
            t[0].text = label;
            t[1].text = value;
            t[0].color = color;
            t[0].fontStyle = t[1].fontStyle = header ? FontStyles.Bold : FontStyles.Normal;
            rows.Add(row);
        }
    }
}
