using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.ContextLoreGlossary
{
    // 장면 · 대사 표시 + 맥락 용어집.
    // 용어집은 LoreDatabase.Query 로 "지금 장면에서 지금까지 나온 항목" 만 받아 그린다 (scope 로 비교 가능).
    //   누르고 있기(holdToOpen): 누르는 동안만 열고 떼면 닫는다 — 포커스는 옮기지 않는다 (슬쩍 보기)
    //   일시정지 · 토글: 열 때 첫 항목으로 선택을 옮기고(SetSelectedGameObject), 닫을 때 연 요소로 돌려준다
    // 시험용: glossaryAction(G · 패드 Select) · nextLineAction(N · 패드 오른쪽 어깨).
    public class LoreSceneView : MonoBehaviour
    {
        [SerializeField] LoreDatabase db;
        [SerializeField] TooltipStack tooltips;

        [Header("장면")]
        [SerializeField] TMP_Text sceneTitle;
        [SerializeField] KeywordText dialogue;     // level 0
        [SerializeField] int scene;
        [SerializeField] int line;

        [Header("용어집")]
        [SerializeField] CanvasGroup glossary;
        [SerializeField] TMP_Text glossaryTitle;
        [SerializeField] TMP_Text glossaryCount;
        [SerializeField] RectTransform listRoot;   // VerticalLayoutGroup
        [SerializeField] Button rowPrefab;         // Button(Transition: Color Tint — 선택이 눈에 보이게) + 자식 TMP_Text
        [SerializeField] TMP_Text detailTitle;
        [SerializeField] TMP_Text detailBody;
        [SerializeField] GlossaryScope scope = GlossaryScope.Scene;
        [SerializeField] bool holdToOpen = true;

        [Header("입력")]
        [SerializeField] InputActionReference glossaryAction;
        [SerializeField] InputActionReference nextLineAction;
        [SerializeField] InputActionReference cancelAction;

        readonly List<Button> rows = new();
        readonly List<LoreEntry> shown = new();
        bool open, held;
        GameObject opener, lastSelected;

        void OnEnable()
        {
            if (glossaryAction != null) glossaryAction.action.Enable();
            if (nextLineAction != null) nextLineAction.action.Enable();
            if (cancelAction != null) cancelAction.action.Enable();
            scene = Mathf.Clamp(scene, 0, Mathf.Max(0, db.scenes.Count - 1));
            line = Mathf.Clamp(line, 0, Mathf.Max(0, db.scenes[scene].lines.Count - 1));
            SetGlossary(false, restoreFocus: false);
            RenderScene();
        }

        void OnDisable()
        {
            // 열린 창 · 막아 둔 입력을 되돌린다
            SetGlossary(false, restoreFocus: false);
            if (tooltips != null) tooltips.inputBlocked = false;
        }

        void OnApplicationFocus(bool focus)
        {
            if (!focus && open && held) SetGlossary(false, restoreFocus: false);   // 누른 채 창을 떠나면 뗀 신호가 오지 않는다
        }

        void Update()
        {
            var g = glossaryAction != null ? glossaryAction.action : null;
            if (g != null && g.WasPressedThisFrame())
            {
                if (open && !held) SetGlossary(false, restoreFocus: true);
                else if (!open) Open(hold: holdToOpen);
            }
            if (g != null && g.WasReleasedThisFrame() && open && held) SetGlossary(false, restoreFocus: false);
            if (open && !held && cancelAction != null && cancelAction.action.WasPressedThisFrame()) SetGlossary(false, restoreFocus: true);
            if (!open && nextLineAction != null && nextLineAction.action.WasPressedThisFrame()) NextLine();

            // 키보드 · 패드로 고른 줄이 바뀌면 오른쪽 설명을 바꾼다
            var sel = EventSystem.current != null ? EventSystem.current.currentSelectedGameObject : null;
            if (open && sel != lastSelected)
            {
                lastSelected = sel;
                int i = rows.FindIndex(r => r.gameObject == sel);
                if (i >= 0 && i < shown.Count) ShowDetail(shown[i]);
            }
        }

        // ───────── 장면 ─────────

        public void NextLine()
        {
            if (line < db.scenes[scene].lines.Count - 1) line++;
            else NextScene();
            RenderScene();
        }

        public void NextScene()
        {
            scene = (scene + 1) % db.scenes.Count;
            line = 0;
            RenderScene();
        }

        void RenderScene()
        {
            var sc = db.scenes[scene];
            var place = db.Get(sc.place);
            sceneTitle.text = $"장면 {scene + 1}/{db.scenes.Count} · {sc.title}   <size=70%>{(place != null ? place.displayName : "")} · 대사 {line + 1}/{sc.lines.Count}</size>";
            var sb = new StringBuilder();
            for (int l = 0; l <= line && l < sc.lines.Count; l++)
            {
                var who = db.Get(sc.lines[l].speaker);
                string alpha = l == line ? "" : "<alpha=#99>";   // 지난 줄은 흐리게
                sb.Append(alpha).Append($"<b><color=#7FD3FF>{(who != null ? who.displayName : sc.lines[l].speaker)}</color></b>  ");
                sb.Append(db.ToRichText(sc.lines[l].text)).Append("<alpha=#FF>");
                if (l < line) sb.Append('\n');
            }
            tooltips.CloseAll();          // 줄이 바뀌면 링크 위치가 바뀐다 — 열린 툴팁을 닫는다
            dialogue.SetText(sb.ToString());
            if (open) BuildList();        // 열린 채 장면이 바뀌어도 목록이 따라온다
        }

        // ───────── 용어집 ─────────

        /// 일시정지 메뉴에서 부른다 (선택을 용어집으로 옮긴다)
        public void OpenPaused() => Open(hold: false);

        void Open(bool hold)
        {
            held = hold;
            opener = hold || EventSystem.current == null ? null : EventSystem.current.currentSelectedGameObject;
            SetGlossary(true, restoreFocus: false);
        }

        void SetGlossary(bool on, bool restoreFocus)
        {
            open = on;
            if (!on && EventSystem.current != null)
            {
                // 선택을 먼저 옮기고 나서 끈다 — interactable 을 먼저 끄면 선택된 줄이 해제되며 선택이 사라진다.
                // 창을 연 요소로 돌려주지 않으면 다음 Submit 이 갈 곳이 없다
                var sel = EventSystem.current.currentSelectedGameObject;
                bool inside = sel != null && sel.transform.IsChildOf(glossary.transform);
                if (restoreFocus || inside) EventSystem.current.SetSelectedGameObject(restoreFocus && opener != null && opener.activeInHierarchy ? opener : null);
            }
            glossary.alpha = on ? 1f : 0f;
            glossary.blocksRaycasts = on;
            glossary.interactable = on && !held;   // 누르고 있기는 보기만 — 버튼을 고르지 않는다
            if (tooltips != null)
            {
                tooltips.inputBlocked = on;
                if (on) tooltips.ReleaseFocus();
            }
            if (!on)
            {
                lastSelected = null;
                opener = null;
                return;
            }
            BuildList();
            if (!held && rows.Count > 0 && EventSystem.current != null) EventSystem.current.SetSelectedGameObject(rows[0].gameObject);
        }

        void BuildList()
        {
            shown.Clear();
            shown.AddRange(db.Query(scope, scene, line));
            var sc = db.scenes[scene];
            glossaryTitle.text = scope switch
            {
                GlossaryScope.Scene => $"지금 장면 — {sc.title}",
                GlossaryScope.Seen => "지금까지 나온 항목",
                _ => "전체 사전 (아직 안 나온 항목 포함)",
            };
            glossaryCount.text = $"<size=140%><b>{shown.Count}</b></size> / {db.entries.Count}";

            while (rows.Count < shown.Count)
            {
                var b = Instantiate(rowPrefab, listRoot);
                int index = rows.Count;
                b.onClick.AddListener(() => { if (index < shown.Count) ShowDetail(shown[index]); });
                rows.Add(b);
            }
            for (int i = 0; i < rows.Count; i++)
            {
                bool on = i < shown.Count;
                rows[i].gameObject.SetActive(on);
                if (!on) continue;
                var e = shown[i];
                bool fresh = db.IsFresh(e.id, scene, line);
                rows[i].GetComponentInChildren<TMP_Text>().text =
                    $"<color={LoreDatabase.KindHex(e.kind)}>{LoreDatabase.KindGlyph(e.kind)} <b>{e.displayName}</b></color>  <color=#9FB4C9><size=85%>{LoreDatabase.KindLabel(e.kind)} · {e.role}</size></color>{(fresh ? "  <mark=#FFE06655>새</mark>" : "")}";
            }
            if (shown.Count > 0) ShowDetail(shown[0]);
        }

        void ShowDetail(LoreEntry e)
        {
            detailTitle.text = $"<color={LoreDatabase.KindHex(e.kind)}>{LoreDatabase.KindGlyph(e.kind)} {e.displayName}</color>\n<size=60%><color=#9FB4C9>{LoreDatabase.KindLabel(e.kind)} · {e.role}</color></size>";
            // 용어집 설명 안 키워드는 링크가 아니라 강조만 — 여기서는 읽기에 집중한다
            detailBody.text = db.ToRichText(e.body, _ => LinkState.Flat).Replace("…", "");
            var (s, l) = db.FirstSeen(e.id);
            bool seen = s >= 0 && (s < scene || (s == scene && l <= line));
            detailBody.text += seen ? $"\n\n<size=80%><color=#9FB4C9>처음 나온 곳 · 장면 {s + 1} {db.scenes[s].title} · {l + 1}번째 대사</color></size>" : "\n\n<size=80%><color=#9FB4C9>아직 이야기에 나오지 않았다 — 스포일러</color></size>";
        }
    }
}
