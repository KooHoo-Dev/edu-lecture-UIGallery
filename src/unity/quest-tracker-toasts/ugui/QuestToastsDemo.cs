using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 테스트 입력 — 갤러리와 같은 숫자키 (새 Input System).
    /// 1: 잔해 드론 처치(목표 +1)  2: 전리품 몰림(10건 한 프레임)  3: 같은 재료 연속 획득(0.2초 × 6)
    /// 4: 전설 등급 획득  5: 임무 완료(우선 배너)  6: 일시정지 켜기/끄기 (Time.timeScale 0 ↔ 1)
    /// 임무 완료는 일반 큐가 아니라 PriorityBanner 채널로 보내고, 보상 크레딧만 토스트로 보낸다.
    /// </summary>
    public class QuestToastsDemo : MonoBehaviour
    {
        [SerializeField] ToastStackView toasts;
        [SerializeField] QuestTrackerView tracker;
        [SerializeField] PriorityBanner banner;
        [SerializeField] GameObject pauseOverlay;

        static ToastRequest Circuit(int n = 1) => new("circuit", "회로 조각", Rarity.Common, n);
        static ToastRequest Cell(int n = 1) => new("cell", "냉각 셀", Rarity.Common, n);
        static ToastRequest Oxygen(int n = 1) => new("oxygen", "산소 캔", Rarity.Common, n);
        static ToastRequest Credit(int n) => new("credit", "크레딧", Rarity.Common, n, plusUnit: true);
        static ToastRequest Repair(int n = 1) => new("repair", "수리 키트", Rarity.Uncommon, n);
        static ToastRequest Lens(int n = 1) => new("lens", "정밀 렌즈", Rarity.Rare, n);
        static ToastRequest Core() => new("core", "항성 코어 파편", Rarity.Legendary);

        void OnEnable() => tracker.QuestCompleted += OnQuestCompleted;
        void OnDisable() => tracker.QuestCompleted -= OnQuestCompleted;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;
            bool paused = Time.timeScale == 0f;

            if (kb.digit6Key.wasPressedThisFrame)
            {
                Time.timeScale = paused ? 1f : 0f;
                if (pauseOverlay != null) pauseOverlay.SetActive(!paused);
                return;
            }
            if (paused) return;   // 일시정지 중에는 게임 이벤트가 일어나지 않는다

            if (kb.digit1Key.wasPressedThisFrame)
            {
                tracker.AddProgress("kill");
                tracker.AddProgress("circuit");
                toasts.Enqueue(Circuit());
            }
            if (kb.digit2Key.wasPressedThisFrame)
            {
                // 상자 하나 — 10건이 한 프레임에 몰린다. 큐가 병합·정렬·슬롯 제한을 처리한다
                ToastRequest[] burst = { Circuit(), Credit(120), Oxygen(), Circuit(), Repair(), Cell(), Circuit(), Lens(), Credit(80), Oxygen() };
                foreach (var r in burst) toasts.Enqueue(r);
                tracker.AddProgress("circuit", 3);
                tracker.AddProgress("oxygen", 2);
                tracker.AddProgress("cell", 1);
            }
            if (kb.digit3Key.wasPressedThisFrame) StartCoroutine(SameItem());
            if (kb.digit4Key.wasPressedThisFrame) toasts.Enqueue(Core());
            if (kb.digit5Key.wasPressedThisFrame) tracker.CompleteCurrentMain();
        }

        IEnumerator SameItem()
        {
            var wait = new WaitForSeconds(0.2f);
            for (int i = 0; i < 6; i++)
            {
                toasts.Enqueue(Cell());
                tracker.AddProgress("cell");
                yield return wait;
            }
        }

        void OnQuestCompleted(QuestTrackerView.QuestDef q)
        {
            if (q.isMain)
            {
                banner.Show("임무 완료", q.title, q.rewardText);
                if (q.rewardCredit > 0) toasts.Enqueue(Credit(q.rewardCredit));
            }
            else toasts.Enqueue(new ToastRequest("repeat-done", "반복 과제 완료", Rarity.Uncommon));
        }
    }
}
