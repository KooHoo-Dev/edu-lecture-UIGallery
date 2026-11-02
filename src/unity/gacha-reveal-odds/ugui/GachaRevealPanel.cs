// 뽑기 화면 — 요청 → 서버 응답(결과 확정) → 1단계 등급 예고 → 2단계 한 장씩 공개 → 결과 + 입력 잠금.
// - 결과는 GachaServer 가 정한다. 이 스크립트는 받은 결과를 보여 주기만 한다 (난수를 굴리지 않는다)
// - 건너뛰기: skip 플래그 하나로 남은 대기를 모두 끊고 남은 카드를 즉시 앞면으로
// - 탭 한 번 = 한 장: advance 플래그는 지금 기다리는 단계 하나만 끝낸다
// - 결과가 열린 직후 inputLockSeconds 동안 뽑기 버튼을 막는다 (누른 시각으로 판정 — PressStamp)
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.GachaRevealOdds
{
    public class GachaRevealPanel : MonoBehaviour
    {
        [SerializeField] GachaTable table;

        [Header("무대")]
        [SerializeField] CanvasGroup beam;
        [SerializeField] Image beamMark;
        [SerializeField] TextMeshProUGUI beamLabel;
        [SerializeField] RectTransform cardRoot;
        [SerializeField] GachaCardView cardPrefab;
        [Tooltip("영웅 강조 번쩍임. Raycast Target 끔")]
        [SerializeField] CanvasGroup flash;
        [Tooltip("연출 중에만 켜지는 무대 전체 투명 버튼 — 탭 = 다음 장")]
        [SerializeField] Button tapCatcher;
        [SerializeField] Button skipButton;

        [Header("버튼 · 천장 · 기록")]
        [SerializeField] Button pull1Button;
        [SerializeField] Button pull10Button;
        [SerializeField] Image lockBar;
        [SerializeField] TextMeshProUGUI pityText;
        [SerializeField] Image pityFill;
        [SerializeField] Button exchangeButton;
        [SerializeField] TextMeshProUGUI serverLog;
        [SerializeField] OddsTableView oddsView;
        [SerializeField] Sprite[] gradeMarks = new Sprite[3];
        [SerializeField] Color[] gradeColors = { new(1f, 0.8f, 0.3f), new(0.76f, 0.6f, 1f), new(0.56f, 0.71f, 0.86f) };

        [Header("타이밍 (실제 시간)")]
        [SerializeField] float teaseSeconds = 0.9f;
        [SerializeField] float dealSeconds = 0.45f;
        [SerializeField] float flipSeconds = 0.42f;
        [SerializeField] float heroHoldSeconds = 0.7f;
        [SerializeField] float inputLockSeconds = 0.4f;

        readonly List<GachaCardView> cards = new();
        static readonly Queue<float> flashTimes = new();

        // Enter Play Mode 옵션으로 도메인 리로드를 끄면 static 이 이전 실행 값을 들고 있다 — 시작할 때 비운다
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => flashTimes.Clear();
        GachaServer server;
        Coroutine running;
        bool skip, advance;
        float unlockAt = -1f;

        public GachaServer Server => server ??= new GachaServer();
        public GachaTable Table => table;
        public bool Busy => running != null;

        void Awake()
        {
            pull1Button.onClick.AddListener(() => Pull(1, pull1Button.GetComponent<PressStamp>().Take()));
            pull10Button.onClick.AddListener(() => Pull(10, pull10Button.GetComponent<PressStamp>().Take()));
            tapCatcher.onClick.AddListener(Advance);
            skipButton.onClick.AddListener(Skip);
            exchangeButton.onClick.AddListener(Exchange);
        }

        void OnEnable()
        {
            oddsView.Build(table);   // 확률표는 추첨과 같은 에셋에서
            UpdatePity(Server.SinceHero, Server.Points);
            SetBusy(false);
            // 연출 도중 꺼졌다 켜졌다(재접속) — 서버가 이미 정한 결과를 다시 받아 처음부터 보여 준다. 새로 뽑지 않는다
            if (Server.Unseen != null) running = StartCoroutine(Resume(Server.Unseen));
        }

        IEnumerator Resume(PullResult r)
        {
            SetBusy(true);
            skip = advance = false;
            serverLog.text = $"재접속 — 확인하지 않은 결과 {r.items.Count}개를 다시 받음";
            yield return Reveal(r);
            running = null;
        }

        void OnDisable()
        {
            // 연출 중에 꺼지면 코루틴을 멈추고 화면을 결과 상태로 정리한다 (다시 켰을 때 코루틴 두 개가 겹치지 않게)
            StopAllCoroutines();
            running = null;
            foreach (GachaCardView c in cards) c.ShowFaceNow();   // 이전 결과 카드. 확인하지 않은 새 결과는 Server.Unseen 에 남아 OnEnable 에서 이어진다
            beam.alpha = 0f;
            flash.alpha = 0f;
            UpdatePity(Server.SinceHero, Server.Points);
            SetBusy(false);
        }

        public void Skip() => skip = true;
        public void Advance() => advance = true;

        /// <summary>pressedAt = 버튼을 누른 시각 (Time.unscaledTime). 결과 직후 잠금 중이면 무시</summary>
        public void Pull(int count, float pressedAt)
        {
            if (running != null || pressedAt < unlockAt) return;
            running = StartCoroutine(PullRoutine(count));
        }

        IEnumerator PullRoutine(int count)
        {
            SetBusy(true);
            skip = advance = false;
            serverLog.text = $"→ 요청 {count}회 …";
            ShowBeam(null, "서버 응답 대기…");

            PullResult result = null;
            yield return Server.Request(table, count, r => result = r);   // 결과 · 천장이 여기서 확정
            if (result.items.Count == 0)
            {
                serverLog.text = "← 응답 거절: 표 검사 실패 (콘솔 참고)";
                beam.alpha = 0f;
                SetBusy(false);
                running = null;
                yield break;
            }
            serverLog.text = $"← 응답: 결과 {count}개 확정 (내용은 공개 뒤에)";

            yield return Reveal(result);
            running = null;
        }

        IEnumerator Reveal(PullResult r)
        {
            // 1단계: 가장 높은 등급만 먼저 — 확정된 결과에서 만든 예고라 거짓이 없다
            Grade best = r.Best(table);
            ShowBeam(best, GachaTable.GradeNames[(int)best] + " 신호");
            yield return Wait(teaseSeconds);
            beam.alpha = 0f;

            // 2단계: 엎은 카드를 깔고 (뒷면 = 등급) 한 장씩 뒤집는다
            foreach (GachaCardView c in cards) Destroy(c.gameObject);
            cards.Clear();
            for (int i = 0; i < r.items.Count; i++)
            {
                GachaCardView card = Instantiate(cardPrefab, cardRoot);
                card.Bind(table, r.items[i], r.forced.Contains(i));
                cards.Add(card);
            }
            yield return Wait(dealSeconds);

            // 공개 간격 = flipSeconds (뒤집기 시간 포함). 뒤집기는 간격의 80%, 최대 0.42초 — 웹 표본과 같은 규칙
            float flipDuration = Mathf.Min(flipSeconds * 0.8f, 0.42f);
            foreach (GachaCardView card in cards)
            {
                if (skip) break;
                advance = false;
                yield return card.Flip(flipDuration);
                bool hero = card.Grade == Grade.Hero;
                if (hero) StartCoroutine(HeroEmphasis(card.transform));
                yield return Wait(flipSeconds - flipDuration + (hero ? heroHoldSeconds : 0f));
            }
            foreach (GachaCardView card in cards) if (!card.Flipped) card.ShowFaceNow();   // 건너뛰기: 남은 장 즉시

            // 결과: 이제야 천장 카운터 · 로그를 갱신하고, 입력 잠금을 건 뒤 버튼을 켠다
            Server.Acknowledge();
            serverLog.text = $"← 결과 {r.items.Count}개{(r.forced.Count > 0 ? " · 천장 발동" : "")}";
            UpdatePity(r.sinceHero, r.points);
            unlockAt = Time.unscaledTime + inputLockSeconds;
            SetBusy(false);
            StartCoroutine(LockBar());
        }

        /// <summary>대기. 건너뛰기면 즉시, 탭이면 이 대기 하나만 끝낸다</summary>
        IEnumerator Wait(float seconds)
        {
            for (float t = 0f; t < seconds && !skip && !advance; t += Time.unscaledDeltaTime) yield return null;
            advance = false;
        }

        IEnumerator HeroEmphasis(Transform card)
        {
            if (RequestFlash()) flash.alpha = 1f;
            for (float t = 0f; t < 0.3f; t += Time.unscaledDeltaTime)
            {
                float k = t / 0.3f;
                flash.alpha = Mathf.Min(flash.alpha, 1f - k);
                card.localScale = Vector3.one * (1f + 0.14f * Mathf.Sin(k * Mathf.PI));
                yield return null;
            }
            flash.alpha = 0f;
            card.localScale = Vector3.one;
        }

        /// <summary>번쩍임 제한 — 1초에 3번까지 (WCAG 2.3.1). 넘으면 이번 번쩍임만 건너뛴다</summary>
        static bool RequestFlash()
        {
            float now = Time.unscaledTime;
            while (flashTimes.Count > 0 && now - flashTimes.Peek() > 1f) flashTimes.Dequeue();
            if (flashTimes.Count >= 3) return false;
            flashTimes.Enqueue(now);
            return true;
        }

        IEnumerator LockBar()
        {
            while (Time.unscaledTime < unlockAt)
            {
                lockBar.fillAmount = 1f - (unlockAt - Time.unscaledTime) / Mathf.Max(0.01f, inputLockSeconds);
                yield return null;
            }
            lockBar.fillAmount = 1f;
        }

        void Exchange()
        {
            if (running != null || !Server.Exchange(table)) return;
            foreach (GachaCardView c in cards) Destroy(c.gameObject);
            cards.Clear();
            GachaCardView card = Instantiate(cardPrefab, cardRoot);
            card.Bind(table, table.exchangeItem, true);
            card.ShowFaceNow();
            cards.Add(card);
            serverLog.text = $"← 응답: {table.items[table.exchangeItem].displayName} 교환 완료";
            UpdatePity(Server.SinceHero, Server.Points);
        }

        void ShowBeam(Grade? grade, string label)
        {
            beam.alpha = 1f;
            beamMark.enabled = grade.HasValue;
            if (grade.HasValue)
            {
                beamMark.sprite = gradeMarks[(int)grade.Value];
                beamMark.color = beamLabel.color = gradeColors[(int)grade.Value];
            }
            else beamLabel.color = Color.white;
            beamLabel.text = label;
        }

        void UpdatePity(int sinceHero, int points)
        {
            bool guarantee = table.pityMode == PityMode.Guarantee;
            int now = guarantee ? sinceHero : points;
            int remain = Mathf.Max(1, table.pityCount - sinceHero);
            pityText.text = guarantee
                ? (remain <= 1 ? "다음 1회 영웅 확정" : $"영웅 확정까지 {remain}회  ({sinceHero} / {table.pityCount})")
                : $"교환 포인트 {points} / {table.pityCount}";
            pityFill.fillAmount = Mathf.Clamp01((float)now / table.pityCount);
            exchangeButton.gameObject.SetActive(!guarantee);
            exchangeButton.interactable = !guarantee && points >= table.pityCount && running == null;
        }

        void SetBusy(bool busy)
        {
            pull1Button.interactable = pull10Button.interactable = !busy;
            tapCatcher.gameObject.SetActive(busy);
            skipButton.gameObject.SetActive(busy);
            if (busy) exchangeButton.interactable = false;
            else exchangeButton.interactable = table.pityMode == PityMode.Exchange && Server.Points >= table.pityCount;
        }
    }
}
