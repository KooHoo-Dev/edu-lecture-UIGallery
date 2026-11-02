using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.CardHandTargeting
{
    /// <summary>
    /// 카드 한 장 = 판정용 루트(투명 Image, 부채꼴 제자리에 가만히 있다) + 그림 Visual(들어 올림 · 끌기로 움직인다).
    /// 움직이는 그림으로 호버를 판정하면, 카드가 올라가 포인터에서 벗어나고 → 내려오고 → 다시 걸리며 떨린다.
    /// 그래서 호버 중에만 그림 쪽 판정(visualHit)을 켜서 '제자리 + 올린 카드' 를 함께 판정한다.
    /// 위치 계산은 HandView 가 하고, 이 스크립트는 입력을 넘기고 그림을 목표 자세로 따라가게 한다.
    /// </summary>
    [RequireComponent(typeof(CanvasGroup))]
    public class CardView : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        [SerializeField] RectTransform visual;
        [Tooltip("Visual 의 바탕 Image — 호버 중에만 Raycast Target 을 켠다")]
        [SerializeField] Image visualHit;
        [SerializeField] Image frame;
        [SerializeField] Image art;
        [SerializeField] Image costBadge;
        [SerializeField] TextMeshProUGUI costText;
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] TextMeshProUGUI typeText;
        [SerializeField] TextMeshProUGUI bodyText;
        [SerializeField] GameObject aimMark;
        [SerializeField] Color attackColor = new(1f, 0.54f, 0.48f);
        [SerializeField] Color skillColor = new(0.44f, 0.71f, 1f);
        [SerializeField] Color costColor = new(1f, 0.82f, 0.4f);
        [SerializeField] Color noCostColor = new(1f, 0.35f, 0.42f);

        public CardData Data { get; private set; }
        public CanvasGroup Group { get; private set; }
        /// <summary>Hand 기준 좌표의 지금 그림 자세</summary>
        public HandView.Pose VisualPose => pose;

        HandView hand;
        HandView.Pose pose;
        bool posed;
        Vector2 shake;

        void Awake() => Group = GetComponent<CanvasGroup>();

        public void Init(HandView owner, CardData data, HandView.Pose spawn)
        {
            hand = owner;
            Data = data;
            pose = spawn;
            posed = true;
            frame.color = data.kind == CardKind.Attack ? attackColor : skillColor;
            art.sprite = data.art;
            costText.text = data.cost.ToString();
            nameText.text = data.displayName;
            typeText.text = (data.kind == CardKind.Attack ? "공격" : "기술") + " · " + (data.target == CardTarget.Enemy ? "적 하나" : data.target == CardTarget.Self ? "자신" : "모든 적");
            bodyText.text = data.description;
            aimMark.SetActive(data.target == CardTarget.Enemy);   // 끌면 화살표가 나온다는 표시
            visualHit.raycastTarget = false;
        }

        /// <summary>쓸 수 없으면 흐리게 + 비용 빨갛게 — 집기 전에 알 수 있게</summary>
        public void SetPlayable(bool playable)
        {
            costBadge.color = playable ? costColor : noCostColor;
            frame.color = playable ? (Data.kind == CardKind.Attack ? attackColor : skillColor) : new Color(0.29f, 0.33f, 0.4f);
            art.color = bodyText.color = nameText.color = new Color(1f, 1f, 1f, playable ? 1f : 0.45f);
        }

        public void SetHovered(bool on) => visualHit.raycastTarget = on;

        /// <summary>판정용 루트를 부채꼴 제자리에 둔다 (움직이지 않는다)</summary>
        public void PlaceRoot(HandView.Pose rest)
        {
            var rt = (RectTransform)transform;
            rt.anchoredPosition = rest.pos;
            rt.localEulerAngles = new Vector3(0f, 0f, rest.rot);
        }

        /// <summary>그림이 목표 자세를 지수 감쇠로 따라간다 — 프레임레이트와 상관없이 같은 속도</summary>
        public void Follow(HandView.Pose target, float lambda)
        {
            if (!posed) pose = target;
            float k = 1f - Mathf.Exp(-lambda * Time.unscaledDeltaTime);
            pose.pos = Vector2.Lerp(pose.pos, target.pos, k);
            pose.rot = Mathf.LerpAngle(pose.rot, target.rot, k);
            pose.scale = Mathf.Lerp(pose.scale, target.scale, k);
            posed = true;

            // Hand 기준 자세 → 루트 기준 자세 (루트는 회전해 있으니 되돌려서 계산)
            var rt = (RectTransform)transform;
            float rootRot = rt.localEulerAngles.z;
            visual.localPosition = Quaternion.Euler(0f, 0f, -rootRot) * (Vector3)(pose.pos + shake - rt.anchoredPosition);
            visual.localEulerAngles = new Vector3(0f, 0f, pose.rot - rootRot);
            visual.localScale = Vector3.one * pose.scale;
        }

        public void Shake()
        {
            StopAllCoroutines();
            StartCoroutine(ShakeRoutine());
        }

        IEnumerator ShakeRoutine()
        {
            for (float t = 0f; t < 0.35f; t += Time.unscaledDeltaTime)
            {
                shake = new Vector2(Mathf.Sin(t * 60f) * 10f * (1f - t / 0.35f), 0f);
                yield return null;
            }
            shake = Vector2.zero;
        }

        void OnDisable()
        {
            StopAllCoroutines();
            shake = Vector2.zero;
        }

        public void OnPointerEnter(PointerEventData e) => hand.SetHover(this);
        public void OnPointerExit(PointerEventData e) => hand.ClearHover(this);
        public void OnBeginDrag(PointerEventData e) => hand.BeginDrag(this, e);
        public void OnDrag(PointerEventData e) => hand.Drag(this, e);
        public void OnEndDrag(PointerEventData e) => hand.EndDrag(this, e);
    }
}
