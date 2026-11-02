using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace UIGallery.PopupQueueStack
{
    /// <summary>
    /// 팝업 관리자 — 모든 창은 여기를 거쳐 열고 닫는다.
    /// - 레이어: NormalLayer 아래 SystemLayer (같은 Canvas 의 형제 순서 = 그리는 순서). 시스템 창은 늘 일반 창 위
    /// - 레이어 안에서는 List 를 스택처럼 (맨 뒤 = 맨 위). Stack 대신 List 인 이유: 중간 창을 먼저 닫을 수 있게
    /// - 대기열: 접속 팝업을 priority 순으로 하나씩. 일반·시스템 창이 하나라도 열려 있으면 기다린다
    /// - 딤 한 장: 맨 위 창 바로 아래로 옮겨 다니며 그 아래 전부(로비·아래 창)의 입력을 막는다
    /// - 뒤로가기: 맨 위 창 하나만. 닫을 수 없는 창이면 흔들고, 창이 없으면 종료 확인
    /// </summary>
    public class PopupManager : MonoBehaviour
    {
        public static PopupManager Instance { get; private set; }

        [Header("레이어 루트 (전체 화면 RectTransform, 이 순서로 형제 배치)")]
        [SerializeField] RectTransform normalLayer;
        [SerializeField] RectTransform systemLayer;

        [Header("딤 — 전체 화면 검은 Image(α 0.6) · Raycast Target 켬 · Button.onClick → OnDimClicked")]
        [SerializeField] RectTransform dim;

        [Header("뒤로가기 — Input System 의 UI/Cancel 액션")]
        [Tooltip("기본 UI 액션의 Cancel 은 Esc · 패드 오른쪽 버튼에 묶여 있다. 안드로이드 뒤로 버튼은 Esc 키로 들어온다")]
        [SerializeField] InputActionReference cancelAction;
        [Tooltip("열린 창이 없을 때 뒤로가기로 띄울 종료 확인 창 (System 레이어)")]
        [SerializeField] Popup quitConfirm;

        [Header("대기열")]
        [Tooltip("창이 닫힌 뒤 다음 접속 팝업까지 간격. 0 이면 방금 누른 손가락이 다음 창 버튼을 누르기 쉽다")]
        [SerializeField] float queueGapSeconds = 0.25f;

        readonly List<Popup> normal = new();
        readonly List<Popup> system = new();
        readonly List<Popup> queue = new();
        Coroutine pumpRoutine;

        void Awake()
        {
            Instance = this;
            dim.gameObject.SetActive(false);
        }

        void OnEnable()
        {
            if (cancelAction == null) return;
            cancelAction.action.performed += OnCancel;
            cancelAction.action.Enable();
        }

        void OnDisable()
        {
            if (cancelAction != null) cancelAction.action.performed -= OnCancel;
        }

        void OnCancel(InputAction.CallbackContext _) => HandleBack();

        /// <summary>지금 조작할 창 — 시스템 레이어가 있으면 그 맨 위, 없으면 일반 레이어 맨 위</summary>
        public Popup Top =>
            system.Count > 0 ? system[system.Count - 1] :
            normal.Count > 0 ? normal[normal.Count - 1] : null;

        List<Popup> ListOf(Popup p) => p.layer == Popup.Layer.System ? system : normal;
        RectTransform RootOf(Popup p) => p.layer == Popup.Layer.System ? systemLayer : normalLayer;

        public void Open(Popup p)
        {
            if (p.IsOpen) return;
            ListOf(p).Add(p);
            p.transform.SetParent(RootOf(p), false);
            p.transform.SetAsLastSibling();          // 자기 레이어 안에서만 맨 위로
            p.Show();
            RefreshDim();
        }

        public void Close(Popup p)
        {
            if (!ListOf(p).Remove(p)) return;
            p.Hide();
            RefreshDim();
            // 선택이 방금 닫힌(곧 꺼질) 버튼에 남으면 키보드·패드 조작이 멈춘다 → 새 맨 위 창의 기본 버튼으로
            Popup top = Top;
            if (top != null && top.firstSelected != null && EventSystem.current != null)
                EventSystem.current.SetSelectedGameObject(top.firstSelected);
            SchedulePump();
        }

        /// <summary>접속 팝업처럼 '차례가 되면' 보여 줄 창</summary>
        public void Enqueue(Popup p)
        {
            if (p.IsOpen || queue.Contains(p)) return;
            int i = queue.FindIndex(q => q.priority > p.priority);   // 우선순위가 같으면 먼저 들어온 창이 먼저
            if (i < 0) queue.Add(p);
            else queue.Insert(i, p);
            Pump();
        }

        void SchedulePump()
        {
            if (pumpRoutine != null) StopCoroutine(pumpRoutine);
            pumpRoutine = StartCoroutine(PumpAfterGap());
        }

        IEnumerator PumpAfterGap()
        {
            yield return new WaitForSecondsRealtime(queueGapSeconds);
            pumpRoutine = null;
            Pump();
        }

        void Pump()
        {
            if (queue.Count == 0 || normal.Count > 0 || system.Count > 0) return;
            Popup next = queue[0];
            queue.RemoveAt(0);
            Open(next);
        }

        /// <summary>Esc · 안드로이드 뒤로 · 패드 오른쪽 버튼</summary>
        public void HandleBack()
        {
            Popup top = Top;
            if (top == null)
            {
                if (quitConfirm != null) Open(quitConfirm);   // 바로 종료하지 않는다 — 뒤로 연타는 습관
                return;
            }
            if (!top.closeOnBack)
            {
                top.Shake();
                return;
            }
            Close(top);
        }

        /// <summary>딤의 Button.onClick 에 연결</summary>
        public void OnDimClicked()
        {
            Popup top = Top;
            if (top == null) return;
            if (top.closeOnDim) Close(top);
            else top.Bump();
        }

        void RefreshDim()
        {
            Popup top = Top;
            dim.gameObject.SetActive(top != null);
            if (top == null) return;
            // 딤을 맨 위 창과 같은 레이어로 옮겨 그 창 바로 아래 형제로 둔다.
            // 같은 부모 안에서 딤이 이미 앞쪽에 있으면, 딤을 빼는 순간 창의 인덱스가 하나 당겨진다 → 1 을 뺀다
            dim.SetParent(top.transform.parent, false);
            int i = top.transform.GetSiblingIndex();
            if (dim.GetSiblingIndex() < i) i--;
            dim.SetSiblingIndex(i);
        }
    }
}
