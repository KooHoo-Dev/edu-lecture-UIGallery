// 시험용 — 글자 지도로 Tilemap 세 장(땅 · 물 · 드론 경로)을 칠하고, 처음 건물 3채를 세우고, 크레딧을 조금씩 채운다.
// 지도 글자: '.' 땅 · '~' 물 · '=' 드론 경로. 첫 줄이 맵 맨 위 (Unity 칸 좌표는 y 가 위로 + 라서 뒤집어 칠한다)
using UnityEngine;
using UnityEngine.Tilemaps;

namespace UIGallery.BuildPlacementPreview
{
    public class PlacementDemo : MonoBehaviour
    {
        [SerializeField] PlacementController controller;
        [SerializeField] Tilemap groundMap, waterMap, pathMap;
        [SerializeField] TileBase groundTile, waterTile, pathTile;
        [SerializeField] BuildingData turret, sensor, depot;
        [SerializeField] float incomePerSecond = 4f;
        [SerializeField]
        string[] map =
        {
            "........................",
            "........................",
            "........................",
            "=======.................",
            "......=.......==========",
            "......=.......=.........",
            "......=.......=.........",
            "......=.......=.........",
            "......=.......=...~~~~..",
            "......=.......=..~~~~~~.",
            "......=========..~~~~~~.",
            ".................~~~~~..",
            "..................~~~...",
            "........................",
        };

        float income;

        // 컨트롤러가 검사기를 만들기(처음 Begin · PlaceNow) 전에 타일이 있어야 한다
        void Awake()
        {
            for (int row = 0; row < map.Length; row++)
                for (int col = 0; col < map[row].Length; col++)
                {
                    var c = (Vector3Int)Cell(col, row);
                    groundMap.SetTile(c, groundTile);
                    if (map[row][col] == '~') waterMap.SetTile(c, waterTile);
                    if (map[row][col] == '=') pathMap.SetTile(c, pathTile);
                }
        }

        void Start()
        {
            controller.PlaceNow(turret, Cell(4, 5), 0);
            controller.PlaceNow(sensor, Cell(10, 7), 0);
            controller.PlaceNow(depot, Cell(9, 1), 0);   // 2×2 의 원점은 왼쪽 아래 칸 (지도 줄 0~1)
        }

        void Update()
        {
            income += incomePerSecond * Time.deltaTime;
            if (income < 1f) return;
            int n = Mathf.FloorToInt(income);
            income -= n;
            controller.AddCredits(n);
        }

        /// <summary>지도 (열, 줄) → Unity 칸 (x, y 위로 +)</summary>
        Vector2Int Cell(int col, int row) => new(col, map.Length - 1 - row);
    }
}
