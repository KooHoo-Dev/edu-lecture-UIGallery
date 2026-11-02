using System;
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.PopupQueueStack
{
    /// <summary>
    /// 시험용 입력 — 숫자키로 갤러리의 이벤트 버튼과 같은 상황을 만든다.
    /// 1: 로비 진입 (점검 공지 · 출석 · 이벤트를 대기열로)   2: 상점 → 구매 확인   3: 분해 확인
    /// 4: 연결 끊김 (시스템 창이 끼어들고 0.5초 뒤 탐사 보상 창이 대기열로)
    /// '오늘 하루 보지 않기' 는 날짜를 PlayerPrefs 에 적어 두고 그날은 대기열에 넣지 않는다.
    /// </summary>
    public class PopupManagerDemo : MonoBehaviour
    {
        [SerializeField] Popup notice;
        [SerializeField] Popup attendance;
        [SerializeField] Popup eventBanner;
        [SerializeField] Popup shop;
        [SerializeField] Popup buyConfirm;
        [SerializeField] Popup dismantleConfirm;
        [SerializeField] Popup offline;
        [SerializeField] Popup lateReward;

        const string HideEventKey = "popup.event.hiddenDate";
        static string Today => DateTime.Now.ToString("yyyyMMdd");

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            PopupManager m = PopupManager.Instance;

            if (kb.digit1Key.wasPressedThisFrame)
            {
                m.Enqueue(notice);
                m.Enqueue(attendance);
                if (PlayerPrefs.GetString(HideEventKey) != Today) m.Enqueue(eventBanner);
            }
            if (kb.digit2Key.wasPressedThisFrame)
            {
                m.Open(shop);
                m.Open(buyConfirm);
            }
            if (kb.digit3Key.wasPressedThisFrame) m.Open(dismantleConfirm);
            if (kb.digit4Key.wasPressedThisFrame) StartCoroutine(Disconnect());
        }

        IEnumerator Disconnect()
        {
            PopupManager.Instance.Open(offline);
            yield return new WaitForSecondsRealtime(0.5f);
            PopupManager.Instance.Enqueue(lateReward);   // 시스템 창이 닫힐 때까지 대기열에서 기다린다
        }

        /// <summary>이벤트 창의 '오늘 하루 보지 않기' Toggle.onValueChanged 에 연결</summary>
        public void SetHideEventToday(bool hide)
        {
            if (hide) PlayerPrefs.SetString(HideEventKey, Today);
            else PlayerPrefs.DeleteKey(HideEventKey);
        }

        /// <summary>각 창의 닫기·확인 버튼 onClick 에 연결 (창마다 자기 Popup 을 인자로)</summary>
        public void Close(Popup p) => PopupManager.Instance.Close(p);
    }
}
