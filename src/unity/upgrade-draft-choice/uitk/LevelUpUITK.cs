using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.UpgradeDraftChoice
{
    /// <summary>
    /// UI Toolkit 판 레벨업 3택 — 추첨은 UGUI 폴더의 UpgradeDraft.cs · Upgrade.cs 를 그대로 쓴다.
    /// - 카드는 UpgradeCard.uxml 템플릿을 복제, 희귀도는 클래스(.card--rare …)
    /// - 순차 등장: 카드마다 .card--in 을 i × stagger 뒤에 붙인다 (USS transition 은 실제 시간)
    /// - 입력 잠금: 누른 시각(PointerDownEvent)으로 판정 — clicked 는 손을 뗄 때 불려서, 잠금 중 누르고 풀린 뒤 떼면 통과해 버린다
    /// (추방 버튼은 UGUI 판 LevelUpPanel.cs 에 있다)
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class LevelUpUITK : MonoBehaviour
    {
        [SerializeField] VisualTreeAsset cardTemplate;
        [SerializeField] List<Upgrade> pool = new();
        [SerializeField] List<Upgrade> fillers = new();
        [SerializeField] int choices = 3;
        [Tooltip("무기 · 보조 각각의 슬롯 수. 가득 차면 새 것은 나오지 않는다")]
        [SerializeField] int slotLimit = 4;
        [SerializeField] float lockSeconds = 0.4f;
        [SerializeField] long staggerMs = 90;
        [SerializeField] int rerolls = 2;

        public UpgradeDraft.Build Build { get; } = new();
        public event Action<UpgradeDraft.Offer> Chosen;

        static readonly string[] RarityClass = { "card--common", "card--rare", "card--epic" };
        static readonly string[] RarityName = { "일반", "희귀", "영웅" };

        VisualElement root, cards, lockFill;
        Button rerollButton;
        readonly System.Random rnd = new();
        float shownAt;
        float savedTimeScale = 1f;
        int pending;   // 패널이 떠 있는 동안 더 오른 레벨
        bool open, picked;

        void Awake() => Build.slotLimit = slotLimit;

        void OnEnable()
        {
            VisualElement doc = GetComponent<UIDocument>().rootVisualElement;
            root = doc.Q("levelup");
            cards = doc.Q("cards");
            lockFill = doc.Q("lock-fill");
            rerollButton = doc.Q<Button>("reroll");
            rerollButton.clicked += Reroll;
        }

        void OnDisable()
        {
            if (rerollButton != null) rerollButton.clicked -= Reroll;
            if (open && Time.timeScale == 0f) Time.timeScale = savedTimeScale;   // 열린 채 꺼지면 세계가 멈춘 채로 남는다
            open = false;
            pending = 0;
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
            Time.timeScale = 0f;
            root.AddToClassList("levelup--open");
            Deal();
        }

        void Deal()
        {
            cards.Clear();   // 이전 카드와 그 콜백을 함께 지운다
            picked = false;
            shownAt = Time.unscaledTime;
            List<UpgradeDraft.Offer> offers = UpgradeDraft.Draw(pool, Build, choices, fillers, rnd);
            for (int i = 0; i < offers.Count; i++)
            {
                UpgradeDraft.Offer o = offers[i];
                Button card = cardTemplate.Instantiate().Q<Button>("card");
                card.AddToClassList(RarityClass[(int)o.rarity]);
                card.Q<Label>("rarity").text = RarityName[(int)o.rarity];
                card.Q<Label>("kind").text = o.upgrade.kind == UpgradeKind.Weapon ? "무기" : "보조";
                card.Q<Label>("name").text = o.upgrade.displayName;
                card.Q<Label>("level").text = o.level < 0 ? "보상" : o.level == 0 ? "NEW" : $"Lv {o.level} → {Mathf.Min(UpgradeDraft.MaxLevel, o.level + 1)}";
                card.Q<Label>("diff").text = UpgradeDraft.DiffText(o, Build);
                if (o.upgrade.icon != null) card.Q("icon").style.backgroundImage = new StyleBackground(o.upgrade.icon);

                int idx = i;
                // 잠금은 '누른 순간' 으로 판정한다 (TrickleDown: Button 보다 먼저 받는다)
                bool pressedWhileLocked = false;
                card.RegisterCallback<PointerDownEvent>(_ => pressedWhileLocked = Locked(), TrickleDown.TrickleDown);
                card.clicked += () =>
                {
                    bool wasLocked = pressedWhileLocked;
                    pressedWhileLocked = false;   // 한 번 쓰고 지운다 — 남아 있으면 다음 키보드 Submit 까지 막는다
                    if (wasLocked || Locked()) return;
                    Pick(idx, o);
                };
                cards.Add(card);
                card.schedule.Execute(() => card.AddToClassList("card--in")).StartingIn(staggerMs * i + 16);
            }
            rerollButton.text = $"리롤 {rerolls}";
            rerollButton.SetEnabled(rerolls > 0);
            // 잠금이 풀리면 첫 카드에 포커스 (패드 · 키보드)
            cards.schedule.Execute(() => { if (cards.childCount > 0) cards[0].Focus(); }).StartingIn((long)(lockSeconds * 1000));
        }

        bool Locked() => Time.unscaledTime - shownAt < lockSeconds;

        void Update()
        {
            if (!open) return;
            lockFill.style.width = Length.Percent(Mathf.Clamp01((Time.unscaledTime - shownAt) / lockSeconds) * 100f);
        }

        void Pick(int idx, UpgradeDraft.Offer o)
        {
            if (picked) return;
            picked = true;
            Build.Apply(o);
            Chosen?.Invoke(o);
            rerollButton.SetEnabled(false);
            for (int i = 0; i < cards.childCount; i++) cards[i].AddToClassList(i == idx ? "card--picked" : "card--gone");
            root.schedule.Execute(Close).StartingIn(450);   // 무엇을 골랐는지 확인할 시간
        }

        void Close()
        {
            if (!open) return;
            if (pending > 0)
            {
                pending--;   // 밀린 레벨업 — 세계는 멈춘 채 다음 카드
                Deal();
                return;
            }
            root.RemoveFromClassList("levelup--open");
            cards.Clear();
            open = false;
            if (Time.timeScale == 0f) Time.timeScale = savedTimeScale;   // 그 사이 다른 곳이 바꿨다면 건드리지 않는다
        }

        void Reroll()
        {
            if (!open || picked || rerolls <= 0) return;
            rerolls--;
            Deal();
        }
    }
}
