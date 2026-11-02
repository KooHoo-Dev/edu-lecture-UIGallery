// 건설 배치 컨트롤러 (월드 쪽) — 포인터(새 Input System) → 월드 → 칸 스냅 → PlacementValidator → 고스트 틴트 · 빗금 · 사거리.
// 사유 문구 · 확인/취소 버튼 · 크레딧은 HUD(UGUI 의 PlacementHud 또는 UITK 의 PlacementHudUITK)가 이 컴포넌트의 이벤트를 듣고 그린다.
// - 마우스: 고스트가 포인터를 따라 칸에 붙고, 왼쪽 클릭 설치 · R 회전 · 오른쪽 클릭 / Esc 취소 · 방향키 한 칸 · Enter 설치
// - 터치: 끄는 동안 고스트를 손가락 위(touchLiftPx)로 띄우고, 손을 떼면 Pending — HUD 의 확인 버튼(Confirm)으로 2단계 설치
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Tilemaps;

namespace UIGallery.BuildPlacementPreview
{
    public class PlacementController : MonoBehaviour
    {
        [Header("월드 (2D 탑다운 · XY 평면)")]
        [SerializeField] Camera cam;
        [SerializeField] Grid grid;
        [SerializeField] Tilemap waterMap;
        [SerializeField] Tilemap pathMap;
        [SerializeField] RectInt bounds = new(0, 0, 24, 14);

        [Header("고스트 (월드 SpriteRenderer)")]
        [SerializeField] Transform ghostRoot;
        [Tooltip("칸 하나 (흰 사각형 스프라이트). 색을 바꿔 틴트한다")]
        [SerializeField] SpriteRenderer cellPrefab;
        [Tooltip("빗금 스프라이트 — 문제 칸에 겹쳐 '모양' 으로도 알린다")]
        [SerializeField] Sprite hatchSprite;
        [SerializeField] SpriteRenderer ghostArt;
        [Tooltip("Ghost 의 자식. 지름 1 유닛짜리 원 스프라이트 — 사거리 × 2 로 키운다")]
        [SerializeField] SpriteRenderer rangeCircle;
        [SerializeField] SpriteRenderer pathMarkPrefab;
        [SerializeField] GameObject gridOverlay;
        [SerializeField] Color validColor = new(0.29f, 0.87f, 0.5f, 0.45f);
        [SerializeField] Color invalidColor = new(1f, 0.35f, 0.42f, 0.45f);
        [SerializeField] Color neutralColor = new(1f, 1f, 1f, 0.25f);

        [Header("조절 값 (웹 표본과 같은 이름)")]
        [SerializeField] ValidityCue validityCue = ValidityCue.Full;
        [SerializeField] RangeMode rangeMode = RangeMode.Cells;
        [SerializeField] bool showAllRanges = true;
        [SerializeField] GridLines gridLines = GridLines.Placing;
        [SerializeField] PlaceInput inputDevice = PlaceInput.Auto;
        [Tooltip("1080 기준 px — 실제 화면 높이에 맞춰 늘린다")]
        [SerializeField] float touchLiftPx = 120f;
        [SerializeField] float snapLerpMs = 60f;
        [SerializeField] int startCredits = 260;
        [Tooltip("1080 기준 px — 사유 문구 · 확인 버튼이 들어갈 자리. 모자라면 반대쪽에 붙인다")]
        [SerializeField] float labelSpacePx = 90f;
        [SerializeField] float buttonSpacePx = 190f;

        /// <summary>고스트 · 검사 결과 · Pending 이 바뀌었다 (HUD 가 사유 문구 · 버튼을 다시 그린다)</summary>
        public event Action Changed;
        public event Action<int> CreditsChanged;
        /// <summary>거절 알림 문구 (살 수 없는 건물을 고름 · 놓은 뒤에야 알리는 방식)</summary>
        public event Action<string> Rejected;
        /// <summary>HUD 가 채운다: 이 화면 좌표가 UI 위인가 (UGUI = EventSystem.RaycastAll, UITK = panel.Pick)</summary>
        public Func<Vector2, bool> IsOverUI;

        public BuildingData Current { get; private set; }
        public PlacementCheck Check { get; private set; }
        public bool Pending { get; private set; }
        public int Credits { get; private set; }
        public int PathCellsInRange => inRange.Count;
        public bool ShowReason => validityCue == ValidityCue.Full;
        public bool IsTouch => inputDevice == PlaceInput.Touch || (inputDevice == PlaceInput.Auto && Pointer.current is Touchscreen);
        /// <summary>사유 문구를 붙일 월드 점 — 패드까지 포함한 발자국 위 가운데, 화면 위 가장자리면 아래 (LabelBelow)</summary>
        public Vector3 LabelAnchor { get; private set; }
        public bool LabelBelow { get; private set; }
        /// <summary>확인 버튼 자리 — 발자국 오른쪽, 화면 오른쪽 가장자리면 왼쪽 (ButtonsLeft)</summary>
        public Vector3 ButtonAnchor { get; private set; }
        public bool ButtonsLeft { get; private set; }

        PlacementValidator validator;
        public PlacementValidator Validator => validator ??= BuildValidator();

        readonly List<(BuildingData data, Vector2Int origin)> placed = new();
        readonly List<Vector2Int> foot = new();
        readonly List<Vector2Int> inRange = new();
        readonly List<SpriteRenderer> cells = new(), hatches = new(), marks = new(), others = new();
        readonly Plane ground = new(Vector3.back, Vector3.zero);
        Vector2Int origin;
        RectInt footBox;   // 발자국(패드 포함) 테두리, 원점 기준 칸
        int rot;
        bool dragging, keyboardAim, ghostPlaced;
        float shakeUntil;

        void Awake()
        {
            Credits = startCredits;
            ghostRoot.gameObject.SetActive(false);
            rangeCircle.enabled = false;
        }

        void OnDisable()
        {
            // 꺼질 때 고스트 · 끌기 상태를 정리한다 (다시 켰을 때 반쯤 끌린 고스트가 남지 않게)
            Cancel();
        }

        PlacementValidator BuildValidator()
        {
            var w = new HashSet<Vector2Int>();
            var p = new HashSet<Vector2Int>();
            foreach (var c in bounds.allPositionsWithin)
            {
                var c3 = new Vector3Int(c.x, c.y, 0);
                if (waterMap.HasTile(c3)) w.Add(c);
                if (pathMap.HasTile(c3)) p.Add(c);
            }
            return new PlacementValidator(bounds, w, p);
        }

        /* ───── 바깥에서 부르는 것 (HUD 버튼 · 데모) ───── */

        /// <summary>건물 고르기. 살 수 없으면 집기 상태로 들어가지 않고 바로 이유를 알린다</summary>
        public void Begin(BuildingData b)
        {
            if (Credits < b.cost)
            {
                Rejected?.Invoke($"{b.displayName}: 크레딧 {b.cost - Credits} 부족");
                return;
            }
            Current = b;
            rot = 0;
            dragging = false;
            Pending = IsTouch;              // 터치: 화면 가운데에 놓고 끌어서 맞춘다
            ghostPlaced = false;
            ghostArt.sprite = b.sprite;
            ghostRoot.gameObject.SetActive(true);
            SetOrigin(IsTouch ? Vector2Int.RoundToInt(bounds.center) - b.size / 2 : origin, true);
        }

        public void Cancel()
        {
            if (!Current) return;
            Current = null;
            Pending = dragging = false;
            ghostRoot.gameObject.SetActive(false);
            rangeCircle.enabled = false;
            Refresh();
            Changed?.Invoke();
        }

        public void Rotate()
        {
            if (!Current) return;
            rot = (rot + 1) % 4;
            SetOrigin(origin, true);
        }

        /// <summary>지금 자리에 설치 (마우스 클릭 · Enter · 터치 확인 버튼)</summary>
        public bool Confirm()
        {
            if (!Current) return false;
            var chk = Validator.Validate(Current, origin, rot, Credits);
            if (!chk.Ok)
            {
                shakeUntil = Time.unscaledTime + 0.35f;
                if (validityCue == ValidityCue.After) Rejected?.Invoke("놓은 뒤에야 알림: " + chk.Text(Current));
                return false;
            }
            PlaceNow(Current, origin, rot);
            AddCredits(-Current.cost);
            Cancel();
            return true;
        }

        /// <summary>검사 없이 바로 짓는다 (데모의 처음 배치용)</summary>
        public void PlaceNow(BuildingData b, Vector2Int at, int r)
        {
            Validator.Occupy(b, at, r);
            placed.Add((b, at));
            // 프리팹 피벗 = 본체 중심. 고스트와 같은 점에 놓고 같은 점을 기준으로 돌린다 (칸 모서리에 놓으면 반 칸 밀린다)
            Vector3 center = grid.CellToWorld((Vector3Int)at) + Vector3.Scale(grid.cellSize, (Vector2)b.size * 0.5f);
            if (b.prefab)
                Instantiate(b.prefab, center, Quaternion.Euler(0f, 0f, -90f * r), transform);
        }

        public void AddCredits(int amount)
        {
            Credits += amount;
            CreditsChanged?.Invoke(Credits);
            if (Current) SetOrigin(origin, true);   // 크레딧 부족 사유가 풀리거나 생긴다
        }

        /* ───── 입력 ───── */

        void Update()
        {
            if (!Current) return;
            var pointer = Pointer.current;
            var kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.rKey.wasPressedThisFrame) Rotate();
                if (kb.escapeKey.wasPressedThisFrame) { Cancel(); return; }
                var d = Vector2Int.zero;
                if (kb.leftArrowKey.wasPressedThisFrame) d.x--;
                if (kb.rightArrowKey.wasPressedThisFrame) d.x++;
                if (kb.upArrowKey.wasPressedThisFrame) d.y++;
                if (kb.downArrowKey.wasPressedThisFrame) d.y--;
                if (d != Vector2Int.zero) { keyboardAim = true; SetOrigin(origin + d); }
                if (kb.enterKey.wasPressedThisFrame && Confirm()) return;
            }
            if (Mouse.current != null && Mouse.current.rightButton.wasPressedThisFrame) { Cancel(); return; }
            if (pointer == null) return;

            Vector2 screen = pointer.position.ReadValue();
            bool overUI = IsOverUI != null && IsOverUI(screen);
            if (IsTouch)
            {
                if (pointer.press.wasPressedThisFrame && !overUI) { dragging = true; Pending = false; Changed?.Invoke(); }
                // 손가락 위로 띄운다 — Unity 화면 좌표는 y 가 위로 + 라서 더한다.
                // 화면 아래 가장자리에서는 남은 높이(screen.y)만큼만: 늘 같은 거리면 맨 아래 줄에 닿을 수 없다
                if (dragging) Aim(screen + Vector2.up * Mathf.Min(touchLiftPx * Screen.height / 1080f, screen.y));
                if (dragging && pointer.press.wasReleasedThisFrame) { dragging = false; Pending = true; Changed?.Invoke(); }
            }
            else
            {
                if (pointer.delta.ReadValue().sqrMagnitude > 0.01f) keyboardAim = false;
                if (!keyboardAim && !overUI) Aim(screen);
                if (pointer.press.wasPressedThisFrame && !overUI) Confirm();
            }
        }

        /// <summary>화면 → 월드 → 칸. 원근 카메라도 되도록 평면과 광선을 교차한다 (직교 2D 면 cam.ScreenToWorldPoint 로도 된다)</summary>
        void Aim(Vector2 screen)
        {
            var ray = cam.ScreenPointToRay(screen);
            if (!ground.Raycast(ray, out float dist)) return;
            Vector3 world = ray.GetPoint(dist);
            // 본체가 포인터 가운데에 오게: 반 크기만큼 빼고 반 칸 더해 반올림 → WorldToCell(내림)
            Vector3 shift = Vector3.Scale(grid.cellSize, new Vector3(1f - Current.size.x, 1f - Current.size.y, 0f) * 0.5f);
            SetOrigin((Vector2Int)grid.WorldToCell(world + shift));
        }

        void SetOrigin(Vector2Int o, bool force = false)
        {
            if (o == origin && !force) return;
            origin = o;
            Check = Validator.Validate(Current, origin, rot, Credits);
            Refresh();
            Changed?.Invoke();
        }

        /* ───── 그리기 ───── */

        void LateUpdate()
        {
            if (!Current) return;
            Vector3 target = grid.CellToWorld((Vector3Int)origin);
            // 건설 모드에서 게임을 멈추는(timeScale 0) 경우가 많아 배치 UI 는 실제 시간(unscaled)으로만 움직인다
            if (!ghostPlaced || snapLerpMs <= 0f) { ghostRoot.position = target; ghostPlaced = true; }
            else ghostRoot.position = Vector3.Lerp(ghostRoot.position, target, 1f - Mathf.Exp(-3000f / snapLerpMs * Time.unscaledDeltaTime));
            // 거절 흔들림 (놓으려 했는데 안 되는 자리)
            if (Time.unscaledTime < shakeUntil)
                ghostRoot.position += Vector3.right * Mathf.Sin(Time.unscaledTime * 60f) * 0.12f * grid.cellSize.x;
            UpdateAnchors();
        }

        void UpdateAnchors()
        {
            var size = grid.cellSize;
            Vector3 o = ghostRoot.position;
            Vector3 At(float x, float y) => o + Vector3.Scale(size, new Vector3(x, y, 0f));
            float scale = Screen.height / 1080f;
            float midX = (footBox.xMin + footBox.xMax) * 0.5f, midY = (footBox.yMin + footBox.yMax) * 0.5f;
            Vector3 top = At(midX, footBox.yMax + 0.2f);
            LabelBelow = cam.WorldToScreenPoint(top).y > Screen.height - labelSpacePx * scale;
            LabelAnchor = LabelBelow ? At(midX, footBox.yMin - 0.2f) : top;
            Vector3 right = At(footBox.xMax + 0.3f, midY);
            ButtonsLeft = cam.WorldToScreenPoint(right).x > Screen.width - buttonSpacePx * scale;
            ButtonAnchor = ButtonsLeft ? At(footBox.xMin - 0.3f, midY) : right;
        }

        void Refresh()
        {
            if (gridOverlay) gridOverlay.SetActive(gridLines == GridLines.Always || (gridLines == GridLines.Placing && Current));
            inRange.Clear();
            int n = 0, h = 0, other = 0;
            if (Current)
            {
                bool tint = validityCue != ValidityCue.After;
                Color c = !tint ? neutralColor : Check.Ok ? validColor : invalidColor;
                var size = grid.cellSize;
                Vector2Int min = Vector2Int.one * int.MaxValue, max = Vector2Int.one * int.MinValue;
                foreach (var o in Current.Footprint(rot, foot))
                {
                    min = Vector2Int.Min(min, o);
                    max = Vector2Int.Max(max, o);
                    var cell = Pool(cells, cellPrefab, ghostRoot, n++);
                    cell.transform.localPosition = new Vector3((o.x + 0.5f) * size.x, (o.y + 0.5f) * size.y, 0f);
                    cell.color = c;
                    if (validityCue == ValidityCue.Full && Check.badCells.Contains(origin + o))
                    {
                        // 모양 신호: 빗금 — 색을 못 구분해도 '어느 칸이 문제인지' 보인다
                        var hatch = Pool(hatches, cellPrefab, ghostRoot, h++);
                        hatch.sprite = hatchSprite;
                        hatch.color = Color.white;
                        hatch.sortingOrder = cell.sortingOrder + 1;
                        hatch.transform.localPosition = cell.transform.localPosition;
                    }
                }
                footBox = new RectInt(min, max - min + Vector2Int.one);
                Vector2 center = (Vector2)origin + (Vector2)Current.size * 0.5f;
                ghostArt.transform.localPosition = Vector3.Scale(size, (Vector2)Current.size * 0.5f);
                ghostArt.transform.localRotation = Quaternion.Euler(0f, 0f, -90f * rot);
                rangeCircle.enabled = rangeMode != RangeMode.None && Current.rangeCells > 0f;
                rangeCircle.transform.localPosition = ghostArt.transform.localPosition;   // Ghost 의 자식 — 고스트와 함께 미끄러진다
                rangeCircle.transform.localScale = Vector3.one * Current.rangeCells * 2f * size.x;
                if (rangeMode == RangeMode.Cells) Validator.PathInRange(center, Current.rangeCells, inRange);
                if (showAllRanges && rangeMode != RangeMode.None)
                    foreach (var (data, at) in placed)
                    {
                        if (data.rangeCells <= 0f) continue;
                        var ring = Pool(others, rangeCircle, transform, other++);
                        ring.enabled = true;
                        ring.color = new Color(1f, 1f, 1f, 0.25f);
                        ring.transform.position = grid.CellToWorld((Vector3Int)at) + Vector3.Scale(size, (Vector2)data.size * 0.5f);
                        ring.transform.localScale = Vector3.one * data.rangeCells * 2f * size.x;
                    }
            }
            for (int i = 0; i < inRange.Count; i++)
                Pool(marks, pathMarkPrefab, transform, i).transform.position = grid.GetCellCenterWorld((Vector3Int)inRange[i]);
            Hide(cells, n);
            Hide(hatches, h);
            Hide(marks, inRange.Count);
            Hide(others, other);
        }

        static SpriteRenderer Pool(List<SpriteRenderer> list, SpriteRenderer prefab, Transform parent, int i)
        {
            if (i >= list.Count) list.Add(Instantiate(prefab, parent));
            list[i].gameObject.SetActive(true);
            return list[i];
        }

        static void Hide(List<SpriteRenderer> list, int from)
        {
            for (int i = from; i < list.Count; i++) list[i].gameObject.SetActive(false);
        }
    }
}
