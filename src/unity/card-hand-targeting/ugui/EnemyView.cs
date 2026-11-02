using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.CardHandTargeting
{
    public enum IntentKind { Attack, Block, Buff }

    [Serializable]
    public struct EnemyIntent
    {
        public IntentKind kind;
        public int value;
        [Tooltip("공격 횟수 (1 이면 한 번)")]
        public int hits;
    }

    /// <summary>
    /// 적 하나 — 체력 · 방어 · 의도(다음 행동)를 데이터에서 계산해 그린다.
    /// 의도 = 아이콘 모양 + 수치 + 글자 (색만으로 구분하지 않는다). 강화 · 약화는 수치에 반영한다.
    /// HandView 가 겨누는 동안 SetPreview(카드) 로 깎일 체력 · 약화 후 공격을 미리 보여 준다.
    /// 실루엣 Image 는 Raycast Target 을 켜 둔다 — RaycastAll 로 이 적을 찾는다.
    /// </summary>
    public class EnemyView : MonoBehaviour
    {
        [SerializeField] string displayName = "잔해 드론";
        [SerializeField] int maxHp = 32;
        [SerializeField] List<EnemyIntent> pattern = new();

        [Header("의도")]
        [SerializeField] Image intentIcon;
        [SerializeField] Sprite attackIcon, blockIcon, buffIcon;
        [SerializeField] TextMeshProUGUI intentValue;
        [SerializeField] TextMeshProUGUI intentLabel;
        [SerializeField] bool showIntent = true;

        [Header("체력 · 표시")]
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] Image hpFill;
        [Tooltip("hpFill 뒤의 흰 막대 — 미리보기 동안 깎일 만큼 드러난다")]
        [SerializeField] Image hpPreview;
        [SerializeField] TextMeshProUGUI hpText;
        [SerializeField] GameObject blockBadge;
        [SerializeField] TextMeshProUGUI blockText;
        [SerializeField] GameObject brackets;
        [SerializeField] TextMeshProUGUI previewText;
        [Tooltip("화살표가 키보드로 겨눌 때 가리키는 점")]
        [SerializeField] RectTransform arrowAnchor;

        public int Hp { get; private set; }
        public int Block { get; private set; }
        public int Weak { get; private set; }
        public int Strength { get; private set; }
        public bool Alive => Hp > 0;
        public RectTransform ArrowAnchor => arrowAnchor;
        public EnemyIntent Intent => pattern[step % pattern.Count];

        int step;
        CardData preview;

        void Awake()
        {
            Hp = maxHp;
            nameText.text = displayName;
            Refresh();
        }

        /// <summary>이번 의도의 한 번당 피해 — 강화를 더하고, 약화면 25% 줄인다 (머리 위 숫자와 실제 피해가 같은 함수)</summary>
        public int IntentHit(int weak)
        {
            if (Intent.kind != IntentKind.Attack) return 0;
            int b = Intent.value + Strength;
            return weak > 0 ? Mathf.FloorToInt(b * 0.75f) : b;
        }

        public int IncomingDamage => Alive && Intent.kind == IntentKind.Attack ? IntentHit(Weak) * Mathf.Max(1, Intent.hits) : 0;

        /// <summary>이 카드를 맞으면 깎일 체력 (방어가 먼저) — 실제로 바꾸지 않는다</summary>
        public int PreviewLoss(CardData c)
        {
            int block = Block, hp = Hp;
            for (int i = 0; i < Mathf.Max(1, c.hits); i++)
            {
                int a = Mathf.Min(block, c.damage);
                block -= a;
                hp -= Mathf.Min(hp, c.damage - a);
            }
            return Hp - hp;
        }

        public void TakeCard(CardData c)
        {
            for (int i = 0; i < Mathf.Max(1, c.hits) && c.damage > 0; i++)
            {
                int a = Mathf.Min(Block, c.damage);
                Block -= a;
                Hp = Mathf.Max(0, Hp - (c.damage - a));
            }
            Weak += c.weak;
            preview = null;
            Refresh();
        }

        /// <summary>적 턴: 의도대로 행동하고 플레이어에게 줄 피해를 돌려준다</summary>
        public int Act()
        {
            int dmg = 0;
            if (Intent.kind == IntentKind.Attack) dmg = IncomingDamage;
            else if (Intent.kind == IntentKind.Block) Block += Intent.value;
            else Strength += Intent.value;
            if (Weak > 0) Weak--;
            Refresh();
            return dmg;
        }

        public void StartEnemyTurn()
        {
            Block = 0;   // 적의 방어는 적 턴이 시작될 때 사라진다
            Refresh();
        }

        public void NextIntent()
        {
            step++;
            Refresh();
        }

        public void SetPreview(CardData card)
        {
            preview = card;
            Refresh();
        }

        void Refresh()
        {
            bool aimed = preview != null;
            brackets.SetActive(aimed && Alive);
            int loss = aimed ? PreviewLoss(preview) : 0;
            hpPreview.fillAmount = (float)Hp / maxHp;
            hpFill.fillAmount = (float)(Hp - loss) / maxHp;
            hpText.text = $"{Hp}/{maxHp}";
            previewText.gameObject.SetActive(loss > 0);
            previewText.text = loss >= Hp ? "처치" : $"-{loss}";
            blockBadge.SetActive(Block > 0);
            blockText.text = Block.ToString();

            intentIcon.transform.parent.gameObject.SetActive(Alive);
            if (!showIntent)
            {
                intentIcon.enabled = false;
                intentValue.text = "?";
                intentLabel.text = "";
                return;
            }
            intentIcon.enabled = true;
            EnemyIntent it = Intent;
            intentIcon.sprite = it.kind == IntentKind.Attack ? attackIcon : it.kind == IntentKind.Block ? blockIcon : buffIcon;
            intentLabel.text = it.kind == IntentKind.Attack ? "공격" : it.kind == IntentKind.Block ? "방어" : "강화";
            if (it.kind == IntentKind.Attack)
            {
                int now = IntentHit(Weak);
                string hits = it.hits > 1 ? $"×{it.hits}" : "";
                // 약화 카드를 겨누면 "9 → 6" 처럼 바뀔 수치를 미리 (TMP 의 <s> 취소선)
                intentValue.text = aimed && preview.weak > 0 && Weak == 0 ? $"<s>{now}</s> {IntentHit(preview.weak)}{hits}" : $"{now}{hits}";
            }
            else intentValue.text = it.kind == IntentKind.Block ? it.value.ToString() : $"+{it.value}";
        }
    }
}
