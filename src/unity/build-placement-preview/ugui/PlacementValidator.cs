// 배치 검사 — MonoBehaviour 가 아닌 순수 C#. 맵 경계 · 물 · 드론 경로 · 점유 칸을 들고, 사유 enum 을 돌려준다.
// 화면(고스트 색 · 사유 문구 · 확인 버튼)은 이 결과 하나만 보고 그린다. 그래서 EditMode 테스트로 따로 확인할 수 있다.
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.BuildPlacementPreview
{
    public class PlacementValidator
    {
        readonly RectInt bounds;
        readonly HashSet<Vector2Int> water;
        readonly HashSet<Vector2Int> path;
        readonly Dictionary<Vector2Int, BuildingData> occupied = new();
        readonly List<Vector2Int> scratch = new();

        public IReadOnlyCollection<Vector2Int> PathCells => path;

        public PlacementValidator(RectInt bounds, HashSet<Vector2Int> water, HashSet<Vector2Int> path)
        {
            this.bounds = bounds;
            this.water = water;
            this.path = path;
        }

        /// <summary>
        /// 한 칸의 문제. 우선순위: 맵 밖 → 물 → 겹침 → 경로.
        /// 경로가 정해진 타워 디펜스라 '경로 칸 위에는 못 짓는다' 만 본다. 자유 배치 미로형이면 임시로 점유한 뒤
        /// 입구 → 기지를 BFS 로 찾아, 길이 없으면 별도 사유(BlocksPath)를 돌려줘야 한다 (이 표본 범위 밖)
        /// </summary>
        public PlacementReason CellReason(Vector2Int c)
        {
            if (!bounds.Contains(c)) return PlacementReason.OutOfBounds;
            if (water.Contains(c)) return PlacementReason.Water;
            if (occupied.ContainsKey(c)) return PlacementReason.Overlap;
            if (path.Contains(c)) return PlacementReason.OnPath;
            return PlacementReason.Ok;
        }

        /// <summary>
        /// 칸마다 문제를 보고 가장 우선인 사유 하나를 고른다. 자리가 괜찮을 때만 크레딧을 본다 (자리를 고치는 것이 먼저).
        /// badCells 는 매번 새 리스트 — 결과를 오래 들고 있어도 다음 검사에 덮이지 않는다.
        /// </summary>
        public PlacementCheck Validate(BuildingData b, Vector2Int origin, int rot, int credits)
        {
            var result = new PlacementCheck { reason = PlacementReason.Ok, badCells = new List<Vector2Int>() };
            foreach (var o in b.Footprint(rot, scratch))
            {
                var c = origin + o;
                var r = CellReason(c);
                if (r == PlacementReason.Ok) continue;
                result.badCells.Add(c);
                if (r == PlacementReason.Overlap && result.other == null) result.other = occupied[c].displayName;
                if (r > result.reason) result.reason = r;
            }
            if (result.Ok && credits < b.cost)
            {
                result.reason = PlacementReason.NoCredits;
                result.shortBy = b.cost - credits;
            }
            return result;
        }

        public void Occupy(BuildingData b, Vector2Int origin, int rot)
        {
            foreach (var o in b.Footprint(rot, scratch)) occupied[origin + o] = b;
        }

        public void Clear() => occupied.Clear();

        /// <summary>사거리 안에 드는 경로 칸 (칸 중심까지 거리 ≤ 사거리). center 는 칸 단위 (본체 중심)</summary>
        public void PathInRange(Vector2 center, float range, List<Vector2Int> into)
        {
            into.Clear();
            if (range <= 0f) return;
            foreach (var c in path)
                if (Vector2.Distance(new Vector2(c.x + 0.5f, c.y + 0.5f), center) <= range) into.Add(c);
        }
    }
}
