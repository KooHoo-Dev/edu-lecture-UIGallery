// 받은 보상 결과 창 — 같은 종류끼리 묶은 요약 + 입력 잠금.
// 창이 열린 직후 inputLockSeconds 동안 확인 입력을 막는다. 판정은 '처리한 시각' 이 아니라 '누른 시각' 으로 한다:
// 받기 연타의 마지막 몇 번이 창이 뜨자마자 확인으로 들어가 무엇을 받았는지 못 보고 닫히는 것을 막는다.
// 시계는 Time.realtimeSinceStartupAsDouble — Input System 의 InputAction.CallbackContext.time 과 같은 기준이다.
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.BattlePassTrack
{
    [RequireComponent(typeof(CanvasGroup))]
    public class ClaimResultPopup : MonoBehaviour
    {
        [SerializeField] TextMeshProUGUI title;
        [Tooltip("요약 줄 (종류마다 한 줄). 모자라면 '외 N종'")]
        [SerializeField] TextMeshProUGUI[] lines = new TextMeshProUGUI[6];
        [SerializeField] Image lockFill;
        [SerializeField] TextMeshProUGUI lockText;
        [SerializeField] Button okButton;
        [Tooltip("열린 직후 확인 입력을 막는 시간 (초). 0 이면 잠금 없음 = 나쁜 예")]
        [Range(0f, 0.6f)]
        [SerializeField] float inputLockSeconds = 0.3f;

        public bool IsOpen { get; private set; }
        public event Action Closed;

        CanvasGroup group;
        double openedAt = double.NegativeInfinity;
        int blocked;

        void Awake()
        {
            group = GetComponent<CanvasGroup>();
            // 버튼 onClick 은 손을 뗄 때 불린다(누른 시각보다 늦다). 그래서 잠금 중에는 interactable 을 꺼 클릭 자체를 받지 않는다
            okButton.onClick.AddListener(() => Confirm(Time.realtimeSinceStartupAsDouble));
            SetVisible(false);
        }

        public void Show(PassModel model, IReadOnlyList<TierRef> got)
        {
            List<string> sum = model.Summarize(got);
            title.text = got.Count > 1 ? $"보상 {got.Count}개 모두 받음" : "보상 받음";
            for (int i = 0; i < lines.Length; i++)
                lines[i].text = i < sum.Count ? (i == lines.Length - 1 && sum.Count > lines.Length ? $"외 {sum.Count - i}종" : sum[i]) : "";
            openedAt = Time.realtimeSinceStartupAsDouble;
            blocked = 0;
            SetVisible(true);
        }

        /// <summary>확인 입력. pressedAt = 누른 시각 (InputAction 이면 context.time)</summary>
        public void Confirm(double pressedAt)
        {
            if (!IsOpen) return;
            if (inputLockSeconds > 0f && pressedAt >= openedAt && pressedAt - openedAt < inputLockSeconds)
            {
                blocked++;   // 잠금 중에 누른 입력 — 버린다 (버퍼에 넣지도 않는다)
                return;
            }
            SetVisible(false);
            Closed?.Invoke();
        }

        void Update()
        {
            if (!IsOpen) return;
            float p = inputLockSeconds <= 0f ? 1f : Mathf.Clamp01((float)((Time.realtimeSinceStartupAsDouble - openedAt) / inputLockSeconds));
            lockFill.fillAmount = p;
            okButton.interactable = p >= 1f;
            lockText.text = inputLockSeconds > 0f ? $"입력 잠금 {inputLockSeconds * 1000f:0}ms{(blocked > 0 ? $" · 막은 입력 {blocked}" : "")}" : "입력 잠금 없음";
        }

        void SetVisible(bool on)
        {
            IsOpen = on;
            group.alpha = on ? 1f : 0f;
            group.interactable = on;
            group.blocksRaycasts = on;   // 열린 동안 뒤의 트랙을 누르지 못하게
        }
    }
}
