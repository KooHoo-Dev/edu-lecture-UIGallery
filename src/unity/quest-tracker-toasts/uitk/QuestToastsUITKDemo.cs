using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// UI Toolkit 버전 테스트 입력 — 갤러리와 같은 숫자키 1~6 (새 Input System).
    /// UGUI 버전(QuestToastsDemo)과 같은 요청을 보낸다: 큐 규칙이 같으니 화면 결과도 같아야 한다.
    /// 임무 완료는 트래커가 QuestCompleted 로 알려 주고, 이 데모가 배너 채널과 보상 토스트로 나눠 보낸다.
    /// </summary>
    public class QuestToastsUITKDemo : MonoBehaviour
    {
        [SerializeField] QuestToastsUITK hud;

        static ToastRequest Circuit() => new("circuit", "회로 조각", Rarity.Common);
        static ToastRequest Cell() => new("cell", "냉각 셀", Rarity.Common);
        static ToastRequest Oxygen() => new("oxygen", "산소 캔", Rarity.Common);
        static ToastRequest Credit(int n) => new("credit", "크레딧", Rarity.Common, n, plusUnit: true);

        void OnEnable() => hud.QuestCompleted += OnQuestCompleted;
        void OnDisable() => hud.QuestCompleted -= OnQuestCompleted;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;
            bool paused = Time.timeScale == 0f;

            if (kb.digit6Key.wasPressedThisFrame) { Time.timeScale = paused ? 1f : 0f; return; }
            if (paused) return;   // 일시정지 중에는 게임 이벤트가 일어나지 않는다

            if (kb.digit1Key.wasPressedThisFrame)
            {
                hud.AddProgress("kill");
                hud.AddProgress("circuit");
                hud.Enqueue(Circuit());
            }
            if (kb.digit2Key.wasPressedThisFrame)
            {
                // 상자 하나 — 10건이 한 프레임에 몰린다. 큐가 병합 · 정렬 · 슬롯 제한을 처리한다
                ToastRequest[] burst =
                {
                    Circuit(), Credit(120), Oxygen(), Circuit(), new("repair", "수리 키트", Rarity.Uncommon),
                    Cell(), Circuit(), new("lens", "정밀 렌즈", Rarity.Rare), Credit(80), Oxygen(),
                };
                foreach (var r in burst) hud.Enqueue(r);
                hud.AddProgress("circuit", 3);
                hud.AddProgress("oxygen", 2);
                hud.AddProgress("cell", 1);
            }
            if (kb.digit3Key.wasPressedThisFrame) StartCoroutine(SameItem());
            if (kb.digit4Key.wasPressedThisFrame) hud.Enqueue(new ToastRequest("core", "항성 코어 파편", Rarity.Legendary));
            if (kb.digit5Key.wasPressedThisFrame) hud.CompleteCurrentMain();
        }

        IEnumerator SameItem()
        {
            var wait = new WaitForSeconds(0.2f);
            for (int i = 0; i < 6; i++)
            {
                hud.Enqueue(Cell());
                hud.AddProgress("cell");
                yield return wait;
            }
        }

        void OnQuestCompleted(QuestToastsUITK.QuestDef q)
        {
            if (q.isMain)
            {
                // 최상위 알림은 배너 채널로, 보상만 일반 큐로
                hud.ShowBanner("임무 완료", q.title, q.rewardText);
                if (q.rewardCredit > 0) hud.Enqueue(Credit(q.rewardCredit));
            }
            else hud.Enqueue(new ToastRequest("repeat-done", "반복 과제 완료", Rarity.Uncommon));
        }
    }
}
