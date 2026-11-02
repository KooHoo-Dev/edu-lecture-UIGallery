// UI Toolkit 판 HUD — 월드 쪽(고스트 · 사거리 · 입력)은 UGUI 폴더의 PlacementController 를 그대로 쓰고, UI 만 UIDocument 로 그린다.
// - 고스트를 따라가는 사유 문구 · 확인 버튼: RuntimePanelUtils.CameraTransformWorldToPanel 로 월드 → 패널 좌표
// - 포인터가 UI 위인지: RuntimePanelUtils.ScreenToPanel + panel.Pick (컨트롤러의 IsOverUI 에 넣는다)
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.BuildPlacementPreview
{
    [RequireComponent(typeof(UIDocument)), DefaultExecutionOrder(100)]
    public class PlacementHudUITK : MonoBehaviour
    {
        [SerializeField] PlacementController controller;
        [SerializeField] Camera worldCamera;
        [SerializeField] List<BuildingData> buildings = new();
        [Tooltip("PlacementReason 순서대로: Ok · NoCredits · OnPath · Overlap · Water · OutOfBounds")]
        [SerializeField] Sprite[] reasonIcons = new Sprite[6];
        [SerializeField] long noteMs = 2800;

        VisualElement root, hud, palette, reason, reasonIcon, confirm;
        Label credits, hint, reasonText, note;
        Button ok, no;
        readonly List<(BuildingData data, Button button, Label cost)> items = new();
        IVisualElementScheduledItem noteHide;

        void OnEnable()
        {
            root = GetComponent<UIDocument>().rootVisualElement;
            hud = root.Q("hud");
            palette = root.Q("palette");
            reason = root.Q("reason");
            reasonIcon = root.Q("reason-icon");
            reasonText = root.Q<Label>("reason-text");
            confirm = root.Q("confirm");
            credits = root.Q<Label>("credits");
            hint = root.Q<Label>("hint");
            note = root.Q<Label>("note");
            ok = root.Q<Button>("confirm-ok");
            no = root.Q<Button>("confirm-no");

            palette.Clear();
            items.Clear();
            foreach (var b in buildings)
            {
                var data = b;
                var button = new Button(() => controller.Begin(data));
                button.AddToClassList("item");
                var name = new Label(data.displayName);
                name.AddToClassList("item__name");
                var size = new Label($"{data.size.x}×{data.size.y}" + (data.hasPad ? " + 패드" : ""));
                var cost = new Label();
                cost.AddToClassList("item__cost");
                button.Add(name);
                button.Add(size);
                button.Add(cost);
                palette.Add(button);
                items.Add((data, button, cost));
            }
            ok.clicked += OnOk;
            no.clicked += controller.Cancel;
            controller.Changed += Redraw;
            controller.CreditsChanged += OnCredits;
            controller.Rejected += ShowNote;
            controller.IsOverUI = OverUI;
            note.AddToClassList("is-hidden");
            OnCredits(controller.Credits);
            Redraw();
        }

        void OnDisable()
        {
            ok.clicked -= OnOk;
            no.clicked -= controller.Cancel;
            controller.Changed -= Redraw;
            controller.CreditsChanged -= OnCredits;
            controller.Rejected -= ShowNote;
            controller.IsOverUI = null;
            noteHide?.Pause();
            palette.Clear();   // 버튼과 그 clicked 람다를 함께 버린다
            items.Clear();
        }

        void OnOk() => controller.Confirm();

        /// <summary>화면 좌표(y 위로 +)를 패널 좌표(y 아래로 +)로 바꿔 Pick. #hud 는 picking-mode Ignore 라 빈 곳은 잡히지 않는다</summary>
        bool OverUI(Vector2 screen)
        {
            var panel = root.panel;
            if (panel == null) return false;
            var picked = panel.Pick(RuntimePanelUtils.ScreenToPanel(panel, new Vector2(screen.x, Screen.height - screen.y)));
            return picked != null && picked != root && picked != hud;
        }

        void OnCredits(int value)
        {
            credits.text = value.ToString();
            foreach (var (data, button, cost) in items)
            {
                bool locked = value < data.cost;
                button.EnableInClassList("item--locked", locked);
                cost.text = locked ? $"{data.cost - value} 부족" : data.cost.ToString();
            }
        }

        void Redraw()
        {
            var b = controller.Current;
            var chk = controller.Check;
            foreach (var (data, button, _) in items) button.EnableInClassList("item--selected", data == b);
            reason.EnableInClassList("is-hidden", b == null || !controller.ShowReason);
            confirm.EnableInClassList("is-hidden", b == null || !controller.IsTouch || !controller.Pending);
            hint.text = b == null ? "건물을 고르세요"
                : controller.IsTouch ? (controller.Pending ? "확인을 눌러 설치 · 다시 끌어 조정" : "끄는 중 — 고스트는 손가락 위")
                : "클릭 설치 · R 회전 · 오른쪽 클릭 / Esc 취소";
            if (b == null) return;
            reason.EnableInClassList("reason--bad", !chk.Ok);
            reasonIcon.style.backgroundImage = new StyleBackground(reasonIcons[(int)chk.reason]);
            reasonText.text = chk.Text(b) + (chk.Ok && b.rangeCells > 0f ? $"\n경로 {controller.PathCellsInRange}칸이 사거리 안" : "");
            ok.SetEnabled(chk.Ok);
            ok.text = chk.Ok ? "확인" : "설치 불가";
        }

        void LateUpdate()
        {
            if (controller.Current == null) return;
            // 화면 가장자리에 닿으면 컨트롤러가 반대쪽 앵커를 준다 — translate 도 그쪽으로
            reason.EnableInClassList("reason--below", controller.LabelBelow);
            confirm.EnableInClassList("confirm--left", controller.ButtonsLeft);
            Follow(reason, controller.LabelAnchor);
            Follow(confirm, controller.ButtonAnchor);
        }

        /// <summary>월드 점 → 패널 좌표. left · top 을 바꾸면 레이아웃을 다시 계산하지만 작은 요소 두 개라 괜찮다</summary>
        void Follow(VisualElement el, Vector3 world)
        {
            if (el.ClassListContains("is-hidden") || root.panel == null) return;
            Vector2 p = RuntimePanelUtils.CameraTransformWorldToPanel(root.panel, world, worldCamera);
            if (el == confirm)
            {
                // 세로 가운데 정렬(translate −50%)이라 맨 아래 · 맨 위 줄에서 버튼이 잘리지 않게 패널 안으로 가둔다
                float half = confirm.resolvedStyle.height * 0.5f;
                p.y = Mathf.Clamp(p.y, half, Mathf.Max(half, root.layout.height - half));
            }
            el.style.left = p.x;
            el.style.top = p.y;
        }

        void ShowNote(string text)
        {
            note.text = text;
            note.RemoveFromClassList("is-hidden");
            noteHide?.Pause();
            noteHide = note.schedule.Execute(() => note.AddToClassList("is-hidden")).StartingIn(noteMs);
        }
    }
}
