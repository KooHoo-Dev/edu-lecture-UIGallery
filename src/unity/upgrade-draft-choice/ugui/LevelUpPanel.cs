using System;
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.UpgradeDraftChoice
{
    /// <summary>
    /// 레벨업 패널 — 세계를 멈추고(Time.timeScale = 0) 카드를 차례로 띄운다.
    /// - 등장 직후 lockSeconds 동안은 고르기를 무시한다(입력 잠금 — 연타한 손이 잘못 고르지 않게).
    ///   판정은 '누른 시각' 으로: Button.onClick 은 손을 뗄 때 불려서, 잠금 중 누르고 풀린 뒤 떼면 통과해 버린다
    /// - 잠금이 풀리면 첫 카드를 선택 → 패드 · 키보드로 바로 고른다
    /// - 리롤 · 추방은 횟수가 정해진 자원. 0 이면 버튼 비활성 + 숫자 빨갛게
    /// 레벨이 오를 때 Show() 를 부르고(한꺼번에 여러 번 올라도 된다), Chosen 이벤트로 결과를 받는다.
    /// </summary>
    public class LevelUpPanel : MonoBehaviour
    {
        [SerializeField] CanvasGroup group;
        [SerializeField] RectTransform cardRoot;
        [SerializeField] UpgradeCardView cardPrefab;
        [Tooltip("Image · Filled Horizontal — 잠금이 풀릴 때까지 찬다")]
        [SerializeField] Image lockBar;
        [SerializeField] Button rerollButton;
        [SerializeField] TextMeshProUGUI rerollCount;
        [SerializeField] Button banishButton;
        [SerializeField] TextMeshProUGUI banishCount;

        [Header("데이터")]
        [SerializeField] List<Upgrade> pool = new();
        [Tooltip("고를 것이 모자랄 때 채우는 보상 (응급 수리 · 크레딧 상자)")]
        [SerializeField] List<Upgrade> fillers = new();

        [Header("값")]
        [SerializeField] int choices = 3;
        [Tooltip("무기 · 보조 각각의 슬롯 수. 가득 차면 새 것은 나오지 않는다")]
        [SerializeField] int slotLimit = 4;
        [SerializeField] float lockSeconds = 0.4f;
        [SerializeField] float staggerSeconds = 0.09f;
        [SerializeField] float closeDelay = 0.45f;
        [SerializeField] int rerolls = 2;
        [SerializeField] int banishes = 1;
        [SerializeField] Color emptyColor = new(1f, 0.54f, 0.58f);

        public UpgradeDraft.Build Build { get; } = new();
        public event Action<UpgradeDraft.Offer> Chosen;

        readonly List<UpgradeCardView> cards = new();
        readonly System.Random rnd = new();
        float savedTimeScale = 1f;
        float unlockAt;
        int pending;   // 패널이 떠 있는 동안 더 오른 레벨
        bool open, picked, banishMode;

        void Awake()
        {
            Build.slotLimit = slotLimit;
            Hide();
            rerollButton.onClick.AddListener(Reroll);
            banishButton.onClick.AddListener(() =>
            {
                banishMode = banishes > 0 && !banishMode;
                UpdateButtons();
            });
        }

        void OnDisable()
        {
            // 열린 채 꺼지면(씬 전환 등) 세계가 멈춘 채로 남는다
            if (!open) return;
            StopAllCoroutines();
            open = false;
            pending = 0;
            if (Time.timeScale == 0f) Time.timeScale = savedTimeScale;
        }

        public void Show()
        {
            if (open)
            {
                pending++;   // 고르는 중에 또 올랐다 — 닫을 때 이어서 띄운다
                return;
            }
            open = true;
            savedTimeScale = Time.timeScale;
            Time.timeScale = 0f;   // 세계 정지. 이 패널의 연출은 모두 실제 시간
            group.alpha = 1f;
            group.blocksRaycasts = true;
            group.interactable = true;
            Deal(UpgradeDraft.Draw(pool, Build, choices, fillers, rnd));
        }

        void Hide()
        {
            group.alpha = 0f;
            group.blocksRaycasts = false;
            group.interactable = false;
        }

        void Deal(List<UpgradeDraft.Offer> offers)
        {
            StopAllCoroutines();
            foreach (UpgradeCardView c in cards) Destroy(c.gameObject);
            cards.Clear();
            picked = false;
            banishMode = false;
            for (int i = 0; i < offers.Count; i++)
            {
                UpgradeCardView card = Instantiate(cardPrefab, cardRoot);
                int idx = i;
                card.Bind(offers[i], Build);
                card.Button.onClick.AddListener(() => OnCard(idx));
                card.PlayIn(i * staggerSeconds);
                cards.Add(card);
            }
            UpdateButtons();
            StartCoroutine(Lock());
        }

        IEnumerator Lock()
        {
            // CanvasGroup.interactable 로 막지 않는다 — 모든 카드가 Disabled 색으로 깜빡이고, 누른 시각을 판정하지 못한다
            unlockAt = Time.unscaledTime + lockSeconds;
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
            while (Time.unscaledTime < unlockAt)
            {
                lockBar.fillAmount = 1f - (unlockAt - Time.unscaledTime) / lockSeconds;
                yield return null;
            }
            lockBar.fillAmount = 1f;
            if (cards.Count > 0 && EventSystem.current != null) EventSystem.current.SetSelectedGameObject(cards[0].gameObject);
        }

        void OnCard(int idx)
        {
            if (picked) return;
            // 마우스 · 터치는 누른 시각, 키보드 · 패드(Submit)는 지금 시각으로 판정
            float pressedAt = cards[idx].TakePressTime();
            if ((pressedAt >= 0f ? pressedAt : Time.unscaledTime) < unlockAt) return;
            if (banishMode)
            {
                Banish(idx);
                return;
            }
            picked = true;
            UpgradeDraft.Offer o = cards[idx].Offer;
            Build.Apply(o);
            Chosen?.Invoke(o);
            StartCoroutine(Close(idx));
        }

        IEnumerator Close(int idx)
        {
            rerollButton.interactable = false;
            banishButton.interactable = false;
            for (int i = 0; i < cards.Count; i++) cards[i].SetPicked(i == idx);
            yield return new WaitForSecondsRealtime(closeDelay);   // 무엇을 골랐는지 확인할 시간
            if (pending > 0)
            {
                pending--;   // 밀린 레벨업 — 세계는 멈춘 채 다음 카드
                Deal(UpgradeDraft.Draw(pool, Build, choices, fillers, rnd));
                yield break;
            }
            foreach (UpgradeCardView c in cards) Destroy(c.gameObject);
            cards.Clear();
            Hide();
            open = false;
            if (Time.timeScale == 0f) Time.timeScale = savedTimeScale;   // 그 사이 다른 곳(일시정지 메뉴 등)이 바꿨다면 건드리지 않는다
        }

        void Reroll()
        {
            if (picked || rerolls <= 0) return;
            rerolls--;
            Deal(UpgradeDraft.Draw(pool, Build, choices, fillers, rnd));
        }

        void Banish(int idx)
        {
            UpgradeDraft.Offer o = cards[idx].Offer;
            if (banishes <= 0 || o.level < 0) return;   // 대체 보상은 추방하지 않는다
            banishes--;
            banishMode = false;
            Build.banished.Add(o.upgrade);   // 이번 판에 다시 나오지 않는다

            // 그 자리만 새로 뽑는다 — 지금 보이는 다른 카드와 겹치지 않게 잠시 추방 목록에 넣었다 뺀다
            var temp = new List<Upgrade>();
            var shown = new List<Upgrade>();
            for (int i = 0; i < cards.Count; i++)
            {
                Upgrade u = cards[i].Offer.upgrade;
                if (i != idx) shown.Add(u);
                if (cards[i].Offer.level >= 0 && Build.banished.Add(u)) temp.Add(u);
            }
            UpgradeDraft.Offer fresh = UpgradeDraft.Draw(pool, Build, 1, fillers, rnd, shown)[0];
            foreach (Upgrade u in temp) Build.banished.Remove(u);

            cards[idx].Bind(fresh, Build);
            cards[idx].PlayIn(0f);
            UpdateButtons();
        }

        void UpdateButtons()
        {
            rerollButton.interactable = rerolls > 0;
            banishButton.interactable = banishes > 0;
            rerollCount.text = rerolls.ToString();
            banishCount.text = banishMode ? "선택" : banishes.ToString();   // 추방 모드: 다음에 고른 카드를 뺀다
            rerollCount.color = rerolls > 0 ? Color.white : emptyColor;   // 다 쓴 자원은 빨간 0 — 왜 안 눌리는지 보이게
            banishCount.color = banishes > 0 ? Color.white : emptyColor;
        }
    }
}
