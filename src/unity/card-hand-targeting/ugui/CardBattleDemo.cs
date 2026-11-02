using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.CardHandTargeting
{
    /// <summary>
    /// 시험용 전투 진행 — 덱 섞기 · 뽑기 · 턴 종료 · 적이 의도대로 행동.
    /// 손패 UI(HandView)와 적 UI(EnemyView)는 이 스크립트를 몰라도 동작한다. 실제 게임의 전투 관리자 자리.
    /// </summary>
    public class CardBattleDemo : MonoBehaviour
    {
        [SerializeField] HandView hand;
        [SerializeField] List<EnemyView> enemies = new();
        [SerializeField] List<CardData> deck = new();
        [SerializeField] int handSize = 5;
        [Tooltip("새 카드가 날아오는 자리 (Hand 기준 좌표 — 뽑을 더미)")]
        [SerializeField] Vector2 drawPileLocal = new(-860f, -60f);
        [SerializeField] Button endTurnButton;
        [SerializeField] TextMeshProUGUI playerText;
        [SerializeField] TextMeshProUGUI incomingText;
        [SerializeField] int maxHp = 50;

        readonly List<CardData> draw = new();
        readonly List<CardData> discard = new();
        int hp, block;

        void Start()
        {
            hp = maxHp;
            draw.AddRange(deck);
            Shuffle(draw);
            hand.Played += OnPlayed;
            endTurnButton.onClick.AddListener(() =>
            {
                // 클릭한 버튼이 선택된 채 남으면 다음 턴에 카드를 쓰려고 누른 Submit 이 턴 종료까지 눌러 버린다
                // (버튼의 Navigation 도 None 으로 둔다)
                if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
                StartCoroutine(EnemyTurn());
            });
            hand.StartTurn();
            Draw(handSize);
            RefreshPlayer();
        }

        void OnDestroy()
        {
            if (hand != null) hand.Played -= OnPlayed;
        }

        void OnPlayed(CardData c, EnemyView target)
        {
            block += c.block;
            hp = Mathf.Min(maxHp, hp + c.heal);
            discard.Add(c);
            RefreshPlayer();
        }

        void Draw(int n)
        {
            for (int i = 0; i < n; i++)
            {
                if (draw.Count == 0)
                {
                    draw.AddRange(discard);   // 뽑을 더미가 비면 버린 더미를 섞어 다시
                    discard.Clear();
                    Shuffle(draw);
                }
                if (draw.Count == 0) return;
                CardData c = draw[^1];
                draw.RemoveAt(draw.Count - 1);
                hand.AddCard(c, drawPileLocal);
            }
        }

        IEnumerator EnemyTurn()
        {
            endTurnButton.interactable = false;
            discard.AddRange(hand.DiscardAll());
            foreach (EnemyView e in enemies) e.StartEnemyTurn();
            foreach (EnemyView e in enemies)
            {
                if (!e.Alive) continue;
                int dmg = e.Act();
                int absorbed = Mathf.Min(block, dmg);
                block -= absorbed;
                hp -= dmg - absorbed;
                RefreshPlayer();
                yield return new WaitForSeconds(0.55f);   // 누가 무엇을 했는지 따라갈 수 있게
            }
            foreach (EnemyView e in enemies) e.NextIntent();
            block = 0;   // 내 방어는 내 턴이 시작될 때 사라진다
            hand.StartTurn();
            Draw(handSize);
            RefreshPlayer();
            endTurnButton.interactable = true;
        }

        void RefreshPlayer()
        {
            playerText.text = block > 0 ? $"{hp}/{maxHp}  방어 {block}" : $"{hp}/{maxHp}";
            int incoming = 0;
            foreach (EnemyView e in enemies) incoming += e.IncomingDamage;
            // 의도를 합쳐 "이번 턴에 막아야 할 양" 을 보여 준다 — 계획의 근거
            incomingText.text = block > 0 ? $"들어올 피해 {incoming} → 방어 후 {Mathf.Max(0, incoming - block)}" : $"들어올 피해 {incoming}";
        }

        static void Shuffle(List<CardData> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = Random.Range(0, i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }
    }
}
