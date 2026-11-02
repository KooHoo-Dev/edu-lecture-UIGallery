// UGUI HUD — 건물 목록 · 크레딧 · 고스트에 붙는 사유 문구 · 터치 확인/취소 버튼 · 거절 알림.
// 월드 쪽은 PlacementController 가 맡고, 이 스크립트는 그 이벤트를 듣고 그리기만 한다.
// 고스트(월드)를 따라가는 UI 는 Camera.WorldToScreenPoint 로 화면 px 를 얻어 rt.position 에 넣는다 (Screen Space - Overlay 캔버스).
// 컨트롤러가 LateUpdate 에서 고스트 · 앵커를 옮긴 뒤에 따라가도록 실행 순서를 뒤로 둔다.
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.BuildPlacementPreview
{
    [DefaultExecutionOrder(100)]
    public class PlacementHud : MonoBehaviour
    {
        [System.Serializable]
        public class PaletteItem
        {
            public BuildingData data;
            public Button button;
            public CanvasGroup group;
            public TextMeshProUGUI costText;
            public GameObject lockIcon;
        }

        [SerializeField] PlacementController controller;
        [SerializeField] Camera worldCamera;
        [SerializeField] List<PaletteItem> palette = new();
        [SerializeField] TextMeshProUGUI creditsText;

        [Header("사유 문구 (고스트 위)")]
        [SerializeField] RectTransform reasonPanel;
        [SerializeField] Image reasonFrame;
        [SerializeField] Image reasonIcon;
        [SerializeField] TextMeshProUGUI reasonText;
        [Tooltip("PlacementReason 순서대로: Ok · NoCredits · OnPath · Overlap · Water · OutOfBounds — 사유마다 모양이 다른 아이콘")]
        [SerializeField] Sprite[] reasonIcons = new Sprite[6];
        [Tooltip("실선 틀 · 점선 틀 — 색만이 아니라 테두리 모양도 바꾼다")]
        [SerializeField] Sprite solidFrame, dashedFrame;

        [Header("터치 2단계")]
        [SerializeField] RectTransform confirmGroup;
        [SerializeField] Button confirmButton;
        [SerializeField] Button cancelButton;
        [SerializeField] TextMeshProUGUI confirmText;

        [SerializeField] TextMeshProUGUI noteText;
        [SerializeField] float noteSeconds = 2.8f;

        readonly List<RaycastResult> hits = new();
        readonly Vector3[] corners = new Vector3[4];
        Coroutine noteRoutine;

        void OnEnable()
        {
            controller.Changed += Redraw;
            controller.CreditsChanged += OnCredits;
            controller.Rejected += ShowNote;
            controller.IsOverUI = OverUI;
            // 고스트를 따라다니는 UI 가 레이캐스트에 잡히면 포인터가 그 위에 오는 순간 고스트가 멈춘다 — 자식 Image · TMP 까지 끈다
            foreach (var g in reasonPanel.GetComponentsInChildren<Graphic>(true)) g.raycastTarget = false;
            noteText.raycastTarget = false;
            foreach (var item in palette)
            {
                var data = item.data;
                item.button.onClick.AddListener(() => controller.Begin(data));
            }
            confirmButton.onClick.AddListener(OnConfirm);
            cancelButton.onClick.AddListener(controller.Cancel);
            OnCredits(controller.Credits);
            Redraw();
        }

        void OnDisable()
        {
            controller.Changed -= Redraw;
            controller.CreditsChanged -= OnCredits;
            controller.Rejected -= ShowNote;
            controller.IsOverUI = null;
            foreach (var item in palette) item.button.onClick.RemoveAllListeners();
            confirmButton.onClick.RemoveListener(OnConfirm);
            cancelButton.onClick.RemoveListener(controller.Cancel);
            if (noteRoutine != null) StopCoroutine(noteRoutine);
            noteRoutine = null;
            noteText.gameObject.SetActive(false);
        }

        /// <summary>포인터가 UI 위면 컨트롤러가 고스트를 움직이거나 설치하지 않는다 (목록을 누르다 맵에 설치되는 실수 방지)</summary>
        bool OverUI(Vector2 screen)
        {
            if (EventSystem.current == null) return false;
            hits.Clear();
            EventSystem.current.RaycastAll(new PointerEventData(EventSystem.current) { position = screen }, hits);
            return hits.Count > 0;
        }

        void OnConfirm() => controller.Confirm();

        void OnCredits(int credits)
        {
            creditsText.text = credits.ToString();
            // 살 수 없는 건물은 미리 흐리게 + 자물쇠 + 부족한 양. 버튼은 눌리게 둔다 — 누르면 이유를 말해 준다
            foreach (var item in palette)
            {
                bool locked = credits < item.data.cost;
                item.group.alpha = locked ? 0.55f : 1f;
                item.lockIcon.SetActive(locked);
                item.costText.text = locked ? $"{item.data.cost - credits} 부족" : item.data.cost.ToString();
            }
        }

        void Redraw()
        {
            var b = controller.Current;
            bool on = b != null;
            var chk = controller.Check;
            reasonPanel.gameObject.SetActive(on && controller.ShowReason);
            confirmGroup.gameObject.SetActive(on && controller.IsTouch && controller.Pending);
            if (!on) return;
            reasonIcon.sprite = reasonIcons[(int)chk.reason];
            reasonFrame.sprite = chk.Ok ? solidFrame : dashedFrame;
            reasonFrame.color = chk.Ok ? new Color(0.29f, 0.87f, 0.5f) : new Color(1f, 0.35f, 0.42f);
            string sub = chk.Ok && b.rangeCells > 0f ? $"\n<size=80%>경로 {controller.PathCellsInRange}칸이 사거리 안</size>" : "";
            reasonText.text = chk.Text(b) + sub;
            confirmButton.interactable = chk.Ok;   // 안 되는 자리에서는 확인 자체를 막고, 글자로 이유
            confirmText.text = chk.Ok ? "확인" : "설치 불가";
        }

        void LateUpdate()
        {
            if (controller.Current == null) return;
            // 월드 → 화면 → 캔버스 (Screen Space - Overlay 라 카메라 인자는 null)
            // 가장자리에 닿으면 컨트롤러가 반대쪽 앵커를 주므로 피벗도 그쪽으로
            reasonPanel.pivot = new Vector2(0.5f, controller.LabelBelow ? 1f : 0f);
            confirmGroup.pivot = new Vector2(controller.ButtonsLeft ? 1f : 0f, 0.5f);
            Follow(reasonPanel, controller.LabelAnchor);
            Follow(confirmGroup, controller.ButtonAnchor);
        }

        /// <summary>Overlay 캔버스는 RectTransform 의 위치가 곧 화면 px. (Camera 캔버스면 RectTransformUtility.ScreenPointToLocalPointInRectangle)</summary>
        void Follow(RectTransform rt, Vector3 world)
        {
            if (!rt.gameObject.activeSelf) return;
            rt.position = worldCamera.WorldToScreenPoint(world);
            // 맨 아래 줄 · 가장자리에서도 버튼이 화면 밖으로 잘리지 않게 안으로 민다
            rt.GetWorldCorners(corners);
            Vector3 push = new(Mathf.Max(0f, -corners[0].x) - Mathf.Max(0f, corners[2].x - Screen.width),
                               Mathf.Max(0f, -corners[0].y) - Mathf.Max(0f, corners[2].y - Screen.height), 0f);
            rt.position += push;
        }

        void ShowNote(string text)
        {
            if (noteRoutine != null) StopCoroutine(noteRoutine);
            noteRoutine = StartCoroutine(Note(text));
        }

        IEnumerator Note(string text)
        {
            noteText.text = text;
            noteText.gameObject.SetActive(true);
            yield return new WaitForSecondsRealtime(noteSeconds);
            noteText.gameObject.SetActive(false);
            noteRoutine = null;
        }
    }
}
