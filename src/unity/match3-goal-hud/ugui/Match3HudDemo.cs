// 시험용 보드 (완전한 매치3 가 아니다). 7×7 칸의 월드 위치만 두고, 키를 누르면 '깨진 블록' 을 흉내 내 HUD 를 움직인다 (새 Input System 키보드).
//   M : 묶음 깨기 (이동 −1)
//   C : 연쇄 3단 (이동 −1, chainInterval 간격으로 두 번 더 깨진다)
//   L : 마지막 이동 + 연쇄 — 목표마다 2개 남기고 이동 1 에서 연쇄. deferFailUntilSettled 를 끄면 연쇄 도중 실패가 먼저 뜬다 (나쁜 예)
//   B : 부스터 0 (0개면 상점 안내 — 이 데모는 로그만)
//   R : 다시 시작
// hud 에는 GoalHud(UGUI) 나 Match3HudUITK(UI Toolkit) 중 하나를 넣는다 (둘 다 IGoalHud).
// 순서가 중요하다: 실제값(GoalLedger.Collect)을 먼저 줄이고, 돌려받은 개수만큼 hud.Fly 를 부른다.
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.Match3GoalHud
{
    public class Match3HudDemo : MonoBehaviour
    {
        [SerializeField] LevelDefinition level;
        [Tooltip("GoalHud 또는 Match3HudUITK")] [SerializeField] MonoBehaviour hud;
        [Tooltip("왼쪽 아래 칸의 가운데 (월드)")] [SerializeField] Transform boardOrigin;
        [SerializeField] float cellSize = 1f;
        [SerializeField] int columns = 7, rows = 7;
        [SerializeField] float popSeconds = 0.22f, fallSeconds = 0.28f;
        [SerializeField] bool deferFailUntilSettled = true;
        [SerializeField] int pointsPerBlock = 20;

        IGoalHud Hud => hud as IGoalHud;
        StageState state;
        Coroutine resolving;
        StageResult shownResult;

        void OnEnable()
        {
            if (Hud == null)
            {
                Debug.LogError("[Match3HudDemo] hud 에 IGoalHud(GoalHud · Match3HudUITK)를 넣는다", this);
                enabled = false;
                return;
            }
            Hud.BoosterPressed += OnBooster;
            Hud.RetryPressed += Restart;
            Restart();
        }

        void OnDisable()
        {
            // 꺼져도 코루틴은 멈추지 않는다 — 직접 멈추고 '처리 중' 을 풀어 판정이 영원히 미뤄지지 않게
            if (resolving != null) StopCoroutine(resolving);
            resolving = null;
            state?.AbortResolve();
            if (Hud == null) return;
            Hud.BoosterPressed -= OnBooster;
            Hud.RetryPressed -= Restart;
        }

        void Restart()
        {
            if (resolving != null) StopCoroutine(resolving);
            resolving = null;
            state = new StageState(level) { deferFailUntilSettled = deferFailUntilSettled };
            shownResult = StageResult.None;
            Hud.Bind(state);
        }

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.mKey.wasPressedThisFrame) Move(0);
                if (kb.cKey.wasPressedThisFrame) Move(2);
                if (kb.lKey.wasPressedThisFrame) LastMove();
                if (kb.bKey.wasPressedThisFrame) OnBooster(0);
                if (kb.rKey.wasPressedThisFrame) Restart();
            }
            // 판정은 보드가 묻는다: 연쇄가 다 끝나고 날아오는 것이 다 도착해야 결과가 난다
            StageResult r = state.Judge(Hud.FlyingCount);
            if (r != shownResult)
            {
                shownResult = r;
                Hud.ShowResult(r);
            }
        }

        void Move(int extraChains)
        {
            if (!isActiveAndEnabled || !state.TryBeginMove()) return;
            resolving = StartCoroutine(Resolve(extraChains, 4));
        }

        void OnBooster(int index)
        {
            if (index < 0 || index >= state.boosters.Length) return;
            if (state.boosters[index] == 0)
            {
                Debug.Log($"[Match3HudDemo] {level.boosters[index].displayName} 0개 — 보급 상점으로 안내 (데모는 결제 화면이 없다)");
                return;
            }
            if (!isActiveAndEnabled || !state.TryBeginBooster(index)) return;
            resolving = StartCoroutine(Resolve(0, 9));   // 부스터는 이동을 쓰지 않는다
        }

        void LastMove()
        {
            if (!state.CanAct) Restart();
            foreach (GoalLedger g in state.goals)
            {
                g.Collect(Mathf.Max(0, g.Remaining - 2));
                g.Settle();
            }
            state.SetMovesForTest(1);
            Move(2);
        }

        /// <summary>깨짐 → 낙하 → (연쇄면) 다시 깨짐. 끝나면 EndResolve — 그 전에는 이동이 0 이어도 판정하지 않는다</summary>
        IEnumerator Resolve(int extraChains, int firstCount)
        {
            for (int chain = 1; chain <= extraChains + 1; chain++)
            {
                Break(chain == 1 ? firstCount : Random.Range(3, 6), chain);
                yield return new WaitForSeconds(popSeconds + fallSeconds);
            }
            resolving = null;
            state.EndResolve();
        }

        /// <summary>목표가 남은 종류 하나를 골라 count 개를 깬다 (진짜 보드라면 깨진 칸 목록을 넘긴다)</summary>
        void Break(int count, int chain)
        {
            GoalLedger target = null;
            foreach (GoalLedger g in state.goals)
                if (!g.Done && (target == null || Random.value < 0.5f)) target = g;
            state.AddScore(count * pointsPerBlock * chain);
            if (target == null) return;   // 남은 목표가 없으면 점수만
            int fly = target.Collect(count);   // ① 실제값 먼저
            for (int i = 0; i < fly; i++)       // ② 날려서 표시값이 따라가게
                Hud.Fly(target.Type, CellPosition(Random.Range(0, columns), Random.Range(0, rows)), i * 0.035f);
        }

        Vector3 CellPosition(int column, int row)
        {
            Vector3 origin = boardOrigin != null ? boardOrigin.position : transform.position;
            return origin + new Vector3(column * cellSize, row * cellSize, 0f);
        }

        void OnDrawGizmosSelected()
        {
            Gizmos.color = new Color(0.4f, 0.8f, 1f, 0.6f);
            for (int c = 0; c < columns; c++)
                for (int r = 0; r < rows; r++)
                    Gizmos.DrawWireCube(CellPosition(c, r), Vector3.one * cellSize * 0.9f);
        }
    }
}
