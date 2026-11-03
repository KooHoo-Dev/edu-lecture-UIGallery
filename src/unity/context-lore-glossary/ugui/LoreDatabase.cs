using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;

namespace UIGallery.ContextLoreGlossary
{
    // 용어 DB (ScriptableObject) — 화면과 분리한 순수 데이터 + 질의.
    // 글 안의 키워드는 [[id]] 또는 [[id|보이는 글자]] 로 적는다. 화면에 넣기 직전에 ToRichText 가
    // <link="id"> 리치 텍스트로 바꾼다 (TMP 와 UI Toolkit 이 같은 태그를 읽는다).
    // 장면 · 대사 노드의 태그 = 말한 사람 + 글 속 키워드 + 장면 장소. 용어집은 "지금 장면에서 지금까지 나온 항목" 만 질의한다.
    // UI Toolkit 판(LoreGlossaryUITK)도 이 파일을 그대로 쓴다.

    public enum LoreKind { Person, Place, Term }

    public enum GlossaryScope { Scene, Seen, All }

    /// 툴팁 안 키워드를 어떻게 그릴지: 링크 · 이미 위에 열린 항목(순환) · 깊이 한도(링크 아님)
    public enum LinkState { Link, Cycle, Flat }

    [Serializable]
    public class LoreEntry
    {
        public string id;
        public string displayName;
        public LoreKind kind;
        public string role;
        [TextArea(2, 4)] public string body;
    }

    [Serializable]
    public class LoreLine
    {
        public string speaker;
        [TextArea(1, 3)] public string text;
    }

    [Serializable]
    public class LoreScene
    {
        public string id;
        public string title;
        public string place;
        public List<LoreLine> lines = new();
    }

    [CreateAssetMenu(menuName = "UI Gallery/Context Lore Glossary/Lore Database", fileName = "LoreDatabase")]
    public class LoreDatabase : ScriptableObject
    {
        public List<LoreEntry> entries = new();
        public List<LoreScene> scenes = new();

        static readonly Regex Token = new(@"\[\[([a-z]+)(?:\|([^\]]+))?\]\]", RegexOptions.Compiled);
        Dictionary<string, LoreEntry> byId;

        void OnEnable() => byId = null;
        void OnValidate() => byId = null;

        public LoreEntry Get(string id)
        {
            if (byId == null)
            {
                byId = new Dictionary<string, LoreEntry>();
                foreach (var e in entries)
                    if (e != null && !string.IsNullOrEmpty(e.id)) byId[e.id.Trim()] = e;   // 인스펙터에 붙여 넣은 공백까지 같게
            }
            return id != null && byId.TryGetValue(id.Trim(), out var hit) ? hit : null;
        }

        /// 글 속 키워드 id (나온 순서)
        public static List<string> LinksOf(string text)
        {
            var list = new List<string>();
            if (string.IsNullOrEmpty(text)) return list;
            foreach (Match m in Token.Matches(text)) list.Add(m.Groups[1].Value);
            return list;
        }

        public static string KindLabel(LoreKind k) => k switch { LoreKind.Person => "인물", LoreKind.Place => "장소", _ => "용어" };

        /// 모양 글자 — 색만으로 종류를 나누지 않는다. 한글 폰트 에셋(맑은 고딕 · Noto Sans KR)에는 있지만 Arial 계열에는 ◆ 가 없다
        public static string KindGlyph(LoreKind k) => k switch { LoreKind.Person => "●", LoreKind.Place => "▼", _ => "◆" };

        public static string KindHex(LoreKind k) => k switch { LoreKind.Person => "#7FD3FF", LoreKind.Place => "#8FE07A", _ => "#FFC861" };

        /// [[id]] → <link="id"> 리치 텍스트. state 가 툴팁 깊이 · 순환에 따라 링크 여부를 정하고, focusK 번째 키워드는 키보드 포커스로 강조한다
        public string ToRichText(string text, Func<string, LinkState> state = null, int focusK = -1)
        {
            var sb = new StringBuilder();
            int last = 0, k = 0;
            foreach (Match m in Token.Matches(text ?? ""))
            {
                sb.Append(text, last, m.Index - last);
                string id = m.Groups[1].Value;
                var e = Get(id);
                string label = m.Groups[2].Success ? m.Groups[2].Value : e != null ? e.displayName : id;
                string hex = e != null ? KindHex(e.kind) : "#FFFFFF";
                string glyph = e != null ? KindGlyph(e.kind) : "";
                var st = state?.Invoke(id) ?? LinkState.Link;
                bool focus = k == focusK;
                if (st == LinkState.Flat)
                    sb.Append($"<b><color={hex}>{label}</color></b>…");
                else
                {
                    // 링크는 색 + 모양 + 밑줄. 순환 링크는 ↑(이미 위에 열림)를 붙인다 — ↩ 는 맑은 고딕 · Arial 에 없어 □ 로 나온다. 포커스는 노란 글자 + 굵게
                    string inner = $"<size=70%>{glyph}</size>{label}{(st == LinkState.Cycle ? " ↑" : "")}";
                    sb.Append($"<link=\"{id}\"><color={(focus ? "#FFE066" : hex)}>{(focus ? "<b>" : "")}<u>{inner}</u>{(focus ? "</b>" : "")}</color></link>");
                }
                last = m.Index + m.Length;
                k++;
            }
            sb.Append(text ?? "", last, (text ?? "").Length - last);
            return sb.ToString();
        }

        /// 처음 나온 곳 (장면 장소는 그 장면 첫 줄). 없으면 (-1, -1)
        public (int scene, int line) FirstSeen(string id)
        {
            for (int s = 0; s < scenes.Count; s++)
            {
                if (scenes[s].place == id) return (s, 0);
                for (int l = 0; l < scenes[s].lines.Count; l++)
                {
                    var line = scenes[s].lines[l];
                    if (line.speaker == id || LinksOf(line.text).Contains(id)) return (s, l);
                }
            }
            return (-1, -1);
        }

        static bool AtOrBefore((int scene, int line) a, int scene, int line) => a.scene >= 0 && (a.scene < scene || (a.scene == scene && a.line <= line));

        /// 지금 줄에서 처음 나온 항목인가 ('새' 표시)
        public bool IsFresh(string id, int scene, int line) => FirstSeen(id) == (scene, line);

        /// 용어집 질의: Scene = 이 장면의 0..line 대사 태그 + 장면 장소, Seen = 처음부터 지금까지, All = 사전 전체(스포일러 포함)
        public List<LoreEntry> Query(GlossaryScope scope, int scene, int line)
        {
            var ids = new HashSet<string>();
            if (scope == GlossaryScope.Scene && scene >= 0 && scene < scenes.Count)
            {
                var sc = scenes[scene];
                ids.Add(sc.place);
                for (int l = 0; l <= line && l < sc.lines.Count; l++)
                {
                    ids.Add(sc.lines[l].speaker);
                    foreach (var id in LinksOf(sc.lines[l].text)) ids.Add(id);
                }
            }
            var result = new List<LoreEntry>();
            foreach (var e in entries)
            {
                bool take = scope switch
                {
                    GlossaryScope.All => true,
                    GlossaryScope.Seen => AtOrBefore(FirstSeen(e.id), scene, line),
                    _ => ids.Contains(e.id),
                };
                if (take) result.Add(e);
            }
            // 인물 → 장소 → 용어 순, 같은 종류 안에서는 DB 순서
            result.Sort((a, b) => a.kind != b.kind ? Order(a.kind).CompareTo(Order(b.kind)) : entries.IndexOf(a).CompareTo(entries.IndexOf(b)));
            return result;
        }

        static int Order(LoreKind k) => k == LoreKind.Person ? 0 : k == LoreKind.Place ? 1 : 2;
    }
}
