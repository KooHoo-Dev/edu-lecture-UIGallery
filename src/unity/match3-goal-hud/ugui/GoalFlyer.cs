// 보드(월드) 좌표에서 목표 아이콘으로 날아가는 아이콘. ObjectPool<Image> + 2차 베지어, Update 한 곳에서 모두 움직인다
// (코루틴을 쓰지 않는다 — 꺼질 때 남은 비행을 한곳에서 정리할 수 있다).
// 좌표 변환: 보드 카메라로 월드 → 화면 픽셀, RectTransformUtility 로 화면 → FlyLayer 로컬.
// Canvas 가 Screen Space - Camera 면 Canvas 의 카메라를 넘기고, Overlay 일 때만 null. 출발 · 도착점은 매 프레임 다시 읽는다.
// 다시 시작할 때는 CancelAll — 지워질 목표 칸으로 가던 비행을 콜백 없이 풀로 돌려준다.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool;
using UnityEngine.UI;

namespace UIGallery.Match3GoalHud
{
    public class GoalFlyer : MonoBehaviour
    {
        [SerializeField] RectTransform flyLayer;
        [Tooltip("Raycast Target 끈 Image · 피벗 가운데")] [SerializeField] Image iconPrefab;
        [Tooltip("보드를 찍는 카메라 (월드 → 화면). 비우면 Camera.main")] [SerializeField] Camera boardCamera;
        [SerializeField] Canvas canvas;
        [SerializeField] float flySeconds = 0.65f;
        [Tooltip("호의 높이 (FlyLayer 단위)")] [SerializeField] float arcHeight = 140f;

        struct Flight
        {
            public Image icon;
            public Vector3 fromWorld;
            public RectTransform target;
            public float side;
            public float start;
            public Action arrive;
        }

        readonly List<Flight> flights = new();
        ObjectPool<Image> pool;

        public int ActiveCount => flights.Count;
        public float FlySeconds { get => flySeconds; set => flySeconds = Mathf.Max(0f, value); }

        void Awake()
        {
            if (boardCamera == null) boardCamera = Camera.main;
            // 켜고 끄기는 SetActive 대신 Image.enabled — 레이아웃 재계산이 없다
            pool = new ObjectPool<Image>(() => Instantiate(iconPrefab, flyLayer), i => i.enabled = true, i => i.enabled = false, i => Destroy(i.gameObject), true, 24, 96);
        }

        void OnDisable()
        {
            // 날던 것은 도착한 것으로 친다 — 표시값이 실제값보다 큰 채로 남지 않게
            List<Action> pending = new();
            foreach (Flight f in flights)
            {
                pool.Release(f.icon);
                pending.Add(f.arrive);
            }
            flights.Clear();
            foreach (Action a in pending) a?.Invoke();
        }

        /// <summary>남은 비행을 콜백 없이 풀로 돌려준다 — 다시 시작(Bind)처럼 도착할 목표 칸이 곧 지워질 때.
        /// 새 판의 정산은 새 GoalLedger 라 도착 처리할 것이 없다</summary>
        public void CancelAll()
        {
            foreach (Flight f in flights) pool.Release(f.icon);
            flights.Clear();
        }

        /// <summary>월드 위치 → FlyLayer 로컬 좌표</summary>
        public Vector2 WorldToLayer(Vector3 world)
        {
            Vector2 screen = RectTransformUtility.WorldToScreenPoint(boardCamera, world);
            Camera uiCamera = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(flyLayer, screen, uiCamera, out Vector2 local);
            return local;
        }

        /// <summary>fromWorld 에서 target(목표 아이콘) 가운데로. 도착하면 arrive. 꺼져 있거나 0초면 바로 도착</summary>
        public void Fly(Sprite sprite, Vector3 fromWorld, RectTransform target, float delay, Action arrive)
        {
            if (!isActiveAndEnabled || flySeconds <= 0f)
            {
                arrive?.Invoke();
                return;
            }
            // 조절점을 옆으로 흩는 양 — 여러 개가 겹쳐도 길이 갈린다
            float side = (flights.Count % 2 == 0 ? -1f : 1f) * (60f + flights.Count * 37 % 120);
            Image icon = pool.Get();
            icon.sprite = sprite;
            icon.rectTransform.localPosition = WorldToLayer(fromWorld);
            icon.rectTransform.localScale = Vector3.zero;   // 지연 동안 숨김
            // 출발 · 도착점은 저장하지 않고 매 프레임 다시 읽는다: 막 만든 목표 칸은 아직 레이아웃 전이고,
            // 회전 · 안전 영역이 바뀌면 칸과 보드의 화면 자리가 옮겨 간다
            flights.Add(new Flight { icon = icon, fromWorld = fromWorld, target = target, side = side, start = Time.unscaledTime + delay, arrive = arrive });
        }

        void Update()
        {
            float now = Time.unscaledTime;
            // 뒤에서부터 — 도착한 것을 지워도 인덱스가 밀리지 않게
            for (int i = flights.Count - 1; i >= 0; i--)
            {
                Flight f = flights[i];
                float k = (now - f.start) / flySeconds;
                if (k < 0f) continue;
                if (k >= 1f)
                {
                    flights.RemoveAt(i);
                    pool.Release(f.icon);
                    f.arrive?.Invoke();   // 도착할 때 표시값 −1
                    continue;
                }
                if (f.target == null)
                {
                    // 목표 칸이 지워졌다 (CancelAll 없이 지운 경우) — 콜백 없이 버린다
                    flights.RemoveAt(i);
                    pool.Release(f.icon);
                    continue;
                }
                Vector2 p0 = WorldToLayer(f.fromWorld);
                // 피벗과 무관하게 아이콘 사각형의 가운데
                Vector2 p2 = flyLayer.InverseTransformPoint(f.target.TransformPoint(f.target.rect.center));
                // 조절점: 두 점 가운데에서 옆으로 흩고 위로 올린다
                Vector2 p1 = new((p0.x + p2.x) * 0.5f + f.side, Mathf.Max(p0.y, p2.y) + arcHeight);
                float e = k * k * (3f - 2f * k);   // smoothstep
                float u = 1f - e;
                RectTransform rt = f.icon.rectTransform;
                // localPosition = 부모(FlyLayer) 피벗 기준 — ScreenPointToLocalPointInRectangle · InverseTransformPoint 와 같은 기준이라 앵커 설정과 무관
                rt.localPosition = u * u * p0 + 2f * u * e * p1 + e * e * p2;
                rt.localScale = Vector3.one * (1.25f - 0.45f * e);
            }
        }
    }
}
