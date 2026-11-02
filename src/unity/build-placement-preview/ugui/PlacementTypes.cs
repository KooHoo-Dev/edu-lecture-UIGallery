// 건설 배치에서 같이 쓰는 형식 — 건물 데이터(ScriptableObject), 검사 결과(사유 enum), 조절 값 enum, 사유 문구.
// UGUI 판과 UI Toolkit 판이 모두 이 파일을 쓴다.
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.BuildPlacementPreview
{
    /// <summary>검사 결과 — bool 이 아니라 '왜 안 되는지'. 위에서 아래로 갈수록 우선 (맵 밖이 가장 먼저 보인다)</summary>
    public enum PlacementReason { Ok, NoCredits, OnPath, Overlap, Water, OutOfBounds }

    /// <summary>유효/무효를 어떻게 알리나: 색 + 무늬 + 사유 문구 / 색만 / 놓은 뒤에야</summary>
    public enum ValidityCue { Full, Color, After }
    public enum RangeMode { Cells, Circle, None }
    public enum GridLines { Placing, Always, Never }
    /// <summary>Auto = 마지막으로 쓴 포인터가 터치스크린이면 터치 방식</summary>
    public enum PlaceInput { Auto, Mouse, Touch }

    [CreateAssetMenu(menuName = "UI Gallery/Build Placement/Building")]
    public class BuildingData : ScriptableObject
    {
        public string displayName = "방어 포탑";
        public int cost = 100;
        [Tooltip("본체 크기 (칸). 정사각이면 회전해도 본체는 그대로")]
        public Vector2Int size = Vector2Int.one;
        [Tooltip("본체 옆 착륙 패드 (회전 0 기준 칸 오프셋). 없으면 hasPad 끔")]
        public bool hasPad;
        public Vector2Int pad = new(2, 1);
        [Tooltip("사거리 (칸, 본체 중심부터). 0 = 없음")]
        public float rangeCells = 3.5f;
        public Sprite sprite;
        public GameObject prefab;

        /// <summary>
        /// 회전한 발자국 (원점 칸 기준 오프셋). 본체 중심 c 를 기준으로 시계 방향 90°씩: (x, y) → (c.x + (y − c.y), c.y − (x − c.x)).
        /// Unity 칸 좌표는 y 가 위로 + 라서 웹(아래로 +)과 식의 부호가 반대다.
        /// </summary>
        public List<Vector2Int> Footprint(int rot, List<Vector2Int> into = null)
        {
            into ??= new List<Vector2Int>();
            into.Clear();
            for (int y = 0; y < size.y; y++)
                for (int x = 0; x < size.x; x++)
                    into.Add(new Vector2Int(x, y));
            if (hasPad)
            {
                float cx = (size.x - 1) / 2f, cy = (size.y - 1) / 2f;
                Vector2 p = pad;
                for (int r = 0; r < ((rot % 4) + 4) % 4; r++)
                    p = new Vector2(cx + (p.y - cy), cy - (p.x - cx));
                into.Add(Vector2Int.RoundToInt(p));
            }
            return into;
        }
    }

    public struct PlacementCheck
    {
        public PlacementReason reason;
        /// <summary>문제가 된 칸 — 고스트에서 이 칸만 빗금</summary>
        public List<Vector2Int> badCells;
        /// <summary>겹친 건물 이름 · 부족한 크레딧</summary>
        public string other;
        public int shortBy;
        public bool Ok => reason == PlacementReason.Ok;

        /// <summary>사유 → 짧은 문구 (사유 패널 · 놓은 뒤 알림이 같은 문구를 쓴다)</summary>
        public string Text(BuildingData b) => reason switch
        {
            PlacementReason.Ok => $"설치 가능 · {b.cost} 크레딧",
            PlacementReason.OutOfBounds => "맵 밖 — 구역 경계를 넘는다",
            PlacementReason.Water => "물 위 — 단단한 땅에만 짓는다",
            PlacementReason.Overlap => $"{other} 자리와 겹친다",
            PlacementReason.OnPath => "드론 경로 위 — 길에는 못 짓는다",
            _ => $"크레딧 {shortBy} 부족",
        };
    }
}
