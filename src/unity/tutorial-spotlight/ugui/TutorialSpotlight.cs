using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.TutorialSpotlightSample
{
    /// <summary>
    /// 튜토리얼 스포트라이트 — 구멍 바깥만 막는 네 장의 차단막 + 말풍선 + 손가락 힌트.
    /// - 매 프레임 현재 대상의 화면 위치를 다시 재서 구멍을 따라가게 한다 (서랍 애니메이션 · 스크롤 · 해상도 변경)
    /// - 대상이 ScrollRect 안에 있으면 단계를 시작할 때 가운데로 스크롤한다
    /// - 입력이 idleHintSeconds 동안 없거나 바깥을 누르면 손가락 힌트를 켠다
    ///
    /// 준비: 튜토리얼 Canvas(Screen Space - Overlay, Sort Order 높게, Canvas_Game 과 같은 Canvas Scaler) 아래에
    /// 'Overlay' 를 만들고 앵커를 0,0–1,1 로 늘인 뒤(오프셋 0) 피벗만 (0, 0) 으로 둔다. Canvas 자체를 overlay 로 쓰지 않는다.
    /// Overlay 아래 요소(차단막 4장 · Ring · Hand · Tip)는 모두 앵커 = 피벗 = 왼쪽 아래(0, 0) → anchoredPosition 이 곧 '왼쪽 아래 기준 좌표'.
    /// 차단막 4장: Image(검정, Raycast Target 켬) + EventTrigger(PointerDown → OnOutsideTapped).
    /// Ring · Hand · Tip 과 그 글자는 Raycast Target 을 끈다 (말풍선이 아래 대상의 클릭을 가로채지 않게).
    /// </summary>
    public class TutorialSpotlight : MonoBehaviour
    {
        [SerializeField] TutorialSequence sequence;

        [Header("튜토리얼 Canvas 요소 (앵커·피벗 = 왼쪽 아래)")]
        [SerializeField] RectTransform overlay;
        [SerializeField] RectTransform blockTop;
        [SerializeField] RectTransform blockBottom;
        [SerializeField] RectTransform blockLeft;
        [SerializeField] RectTransform blockRight;
        [SerializeField] RectTransform ring;
        [SerializeField] RectTransform hand;
        [SerializeField] RectTransform tip;
        [SerializeField] TextMeshProUGUI tipTitle;
        [SerializeField] TextMeshProUGUI tipBody;
        [SerializeField] TextMeshProUGUI tipProgress;

        [Header("값")]
        [SerializeField] float padding = 14f;
        [Tooltip("다음 대상으로 구멍이 옮겨 가는 시간 (0 = 즉시)")]
        [SerializeField] float moveSeconds = 0.28f;
        [Tooltip("이 시간 동안 입력이 없으면 손가락 힌트 (0 = 끄기)")]
        [SerializeField] float idleHintSeconds = 4f;
        [SerializeField] float tipGap = 28f;

        int index = -1;
        Rect hole;
        bool holeInit;
        float idle;
        bool hintOn;
        TutorialTarget target;
        readonly Vector3[] corners = new Vector3[4];

        public bool Running => sequence != null && index >= 0 && index < sequence.steps.Count;

        void OnEnable() => TutorialTarget.Clicked += OnTargetClicked;
        void OnDisable() => TutorialTarget.Clicked -= OnTargetClicked;
        void Start() => Begin();

        /// <summary>처음부터 (설정 › 도움말의 '다시 보기' 에도 연결)</summary>
        public void Begin()
        {
            index = -1;
            holeInit = false;
            overlay.gameObject.SetActive(true);
            Next();
        }

        /// <summary>'건너뛰기' 확인 창의 확인 버튼에 연결</summary>
        public void Skip() => Finish();

        /// <summary>차단막 4장의 Button.onClick 에 연결 — 헤매고 있다는 신호이므로 기다리지 않고 힌트</summary>
        public void OnOutsideTapped() => hintOn = true;

        void OnTargetClicked(string id)
        {
            // 버튼의 본래 기능은 이미 실행됐다. 지금 단계의 대상일 때만 다음으로
            if (Running && id == sequence.steps[index].targetId) Next();
        }

        void Next()
        {
            index++;
            if (!Running)
            {
                Finish();
                return;
            }
            TutorialSequence.Step step = sequence.steps[index];
            target = TutorialTarget.Find(step.targetId);
            tipTitle.text = step.title;
            tipBody.text = step.body;
            tipProgress.text = $"{index + 1} / {sequence.steps.Count}";
            idle = 0f;
            hintOn = false;
            if (target != null) OnTargetFound();
            // 못 찾았으면(아직 Awake 전) Update 가 매 프레임 다시 찾는다
        }

        void OnTargetFound()
        {
            // 키보드·패드 사용자는 Submit 한 번으로 누를 수 있게 대상에 선택을 옮긴다
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(target.gameObject);
            StartCoroutine(ScrollIntoView(target.Rect));
        }

        void Finish()
        {
            index = sequence != null ? sequence.steps.Count : 0;
            overlay.gameObject.SetActive(false);
        }

        void Update()
        {
            if (!Running) return;
            if (target == null)
            {
                target = TutorialTarget.Find(sequence.steps[index].targetId);
                if (target == null) return;
                OnTargetFound();
            }

            // 1) 대상의 현재 화면 위치 → 구멍 (보간)
            Rect goal = Padded(LocalRectOf(target.Rect));
            if (!holeInit || moveSeconds <= 0f)
            {
                hole = goal;
                holeInit = true;
            }
            else
            {
                float k = 1f - Mathf.Exp(-4.6f / moveSeconds * Time.unscaledDeltaTime);   // moveSeconds 안에 약 99%
                hole = new Rect(Vector2.Lerp(hole.position, goal.position, k), Vector2.Lerp(hole.size, goal.size, k));
            }

            // 2) 구멍 바깥 네 장 + 테두리
            Vector2 area = overlay.rect.size;
            Set(blockBottom, 0f, 0f, area.x, hole.yMin);
            Set(blockTop, 0f, hole.yMax, area.x, area.y - hole.yMax);
            Set(blockLeft, 0f, hole.yMin, hole.xMin, hole.height);
            Set(blockRight, hole.xMax, hole.yMin, area.x - hole.xMax, hole.height);
            Set(ring, hole.x, hole.y, hole.width, hole.height);

            // 3) 유휴 힌트 — 어떤 입력이든 들어오면 0 으로
            bool anyInput = (Pointer.current != null && Pointer.current.press.wasPressedThisFrame)
                            || (Keyboard.current != null && Keyboard.current.anyKey.wasPressedThisFrame);
            idle = anyInput ? 0f : idle + Time.unscaledDeltaTime;
            if (idleHintSeconds > 0f && idle >= idleHintSeconds) hintOn = true;
            hand.gameObject.SetActive(hintOn);
            float bob = Mathf.Abs(Mathf.Sin(Time.unscaledTime * Mathf.PI * 0.9f)) * 18f;   // 약 0.9Hz 톡톡
            hand.anchoredPosition = hole.center + new Vector2(bob, -bob);

            // 4) 말풍선
            PlaceTip();
        }

        /// <summary>대상 RectTransform → overlay 의 왼쪽 아래 기준 사각형</summary>
        Rect LocalRectOf(RectTransform rt)
        {
            rt.GetWorldCorners(corners);   // 0 = 왼쪽 아래, 2 = 오른쪽 위
            Canvas canvas = rt.GetComponentInParent<Canvas>().rootCanvas;
            Camera cam = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            Vector2 min = ToOverlay(RectTransformUtility.WorldToScreenPoint(cam, corners[0]));
            Vector2 max = ToOverlay(RectTransformUtility.WorldToScreenPoint(cam, corners[2]));
            return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
        }

        Vector2 ToOverlay(Vector2 screen)
        {
            // 튜토리얼 Canvas 는 Overlay 라 카메라 null. overlay 피벗이 (0, 0) 이라 로컬 좌표 = 왼쪽 아래 기준
            RectTransformUtility.ScreenPointToLocalPointInRectangle(overlay, screen, null, out Vector2 local);
            return local;
        }

        /// <summary>정사각형에 가까우면 원(Ring 은 원형 스프라이트), 넓으면 여백만 더한 사각형</summary>
        Rect Padded(Rect r)
        {
            float ratio = r.width / Mathf.Max(1f, r.height);
            if (ratio > 0.7f && ratio < 1.45f)
            {
                float d = Mathf.Max(r.width, r.height) + padding * 2f;
                return new Rect(r.center.x - d / 2f, r.center.y - d / 2f, d, d);
            }
            return new Rect(r.x - padding, r.y - padding, r.width + padding * 2f, r.height + padding * 2f);
        }

        static void Set(RectTransform r, float x, float y, float w, float h)
        {
            r.anchoredPosition = new Vector2(x, y);
            r.sizeDelta = new Vector2(Mathf.Max(0f, w), Mathf.Max(0f, h));
        }

        /// <summary>선호 방향에 두고 → 넘치면 반대로 뒤집고 → 그래도 넘치면 화면 안으로 민다</summary>
        void PlaceTip()
        {
            Vector2 size = tip.rect.size;
            Vector2 area = overlay.rect.size;
            TutorialSequence.Side side = sequence.steps[index].prefer;
            Vector2 p = TipPos(side, size);
            if (!Fits(side, p, size, area))
            {
                TutorialSequence.Side alt = Opposite(side);
                Vector2 q = TipPos(alt, size);
                if (Fits(alt, q, size, area)) p = q;
            }
            p.x = Mathf.Clamp(p.x, 0f, area.x - size.x);
            p.y = Mathf.Clamp(p.y, 0f, area.y - size.y);
            tip.anchoredPosition = p;
        }

        Vector2 TipPos(TutorialSequence.Side s, Vector2 size) => s switch
        {
            TutorialSequence.Side.Top => new Vector2(hole.center.x - size.x / 2f, hole.yMax + tipGap),
            TutorialSequence.Side.Bottom => new Vector2(hole.center.x - size.x / 2f, hole.yMin - tipGap - size.y),
            TutorialSequence.Side.Left => new Vector2(hole.xMin - tipGap - size.x, hole.center.y - size.y / 2f),
            _ => new Vector2(hole.xMax + tipGap, hole.center.y - size.y / 2f),
        };

        static bool Fits(TutorialSequence.Side s, Vector2 p, Vector2 size, Vector2 area) =>
            s is TutorialSequence.Side.Top or TutorialSequence.Side.Bottom
                ? p.y >= 0f && p.y + size.y <= area.y
                : p.x >= 0f && p.x + size.x <= area.x;

        static TutorialSequence.Side Opposite(TutorialSequence.Side s) => s switch
        {
            TutorialSequence.Side.Top => TutorialSequence.Side.Bottom,
            TutorialSequence.Side.Bottom => TutorialSequence.Side.Top,
            TutorialSequence.Side.Left => TutorialSequence.Side.Right,
            _ => TutorialSequence.Side.Left,
        };

        /// <summary>대상이 ScrollRect 안에 있으면 가운데 오도록 스크롤 (Content 피벗 Y = 1 기준)</summary>
        IEnumerator ScrollIntoView(RectTransform item)
        {
            ScrollRect scroll = item.GetComponentInParent<ScrollRect>();
            if (scroll == null) yield break;
            yield return null;                 // 서랍·창이 열린 다음 프레임에 레이아웃이 확정된다
            Canvas.ForceUpdateCanvases();
            RectTransform content = scroll.content;
            RectTransform viewport = scroll.viewport != null ? scroll.viewport : (RectTransform)scroll.transform;
            float overflow = content.rect.height - viewport.rect.height;
            if (overflow <= 0f) yield break;
            // 대상 중심이 Content 위쪽에서 얼마나 아래에 있나
            float y = -content.InverseTransformPoint(item.TransformPoint(item.rect.center)).y;
            float top = Mathf.Clamp(y - viewport.rect.height / 2f, 0f, overflow);
            float goal = 1f - top / overflow;
            float from = scroll.verticalNormalizedPosition;
            const float dur = 0.5f;
            for (float t = 0f; t < dur; t += Time.unscaledDeltaTime)
            {
                scroll.verticalNormalizedPosition = Mathf.Lerp(from, goal, 1f - Mathf.Pow(1f - t / dur, 3f));
                yield return null;
            }
            scroll.verticalNormalizedPosition = goal;
        }
    }
}
