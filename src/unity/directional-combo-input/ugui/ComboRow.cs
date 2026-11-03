// 커맨드 목록 한 줄 (UGUI 프리팹) — 이름 · 화살표 칸 · 상태 글 · 재사용 대기 · 접두사 기다림 게이지.
// 무엇을 그릴지는 ComboHud 가 State 로 넘긴다. 이 줄은 판정을 모른다.
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DirectionalComboInput
{
    public class ComboRow : MonoBehaviour
    {
        public struct State
        {
            /// <summary>맞게 넣은 칸 수 (후보가 아니면 0)</summary>
            public int lit;
            public bool candidate;
            public bool pending;
            public bool cooling;
            /// <summary>접두사가 맞지 않음 (흐리게)</summary>
            public bool mismatch;
            public float cooldown01;
            public float wait01;
            public string status;
            public bool warn;
        }

        [SerializeField] Image background;
        [SerializeField] Image icon;
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] TextMeshProUGUI statusText;
        [Tooltip("화살표 칸 Image ×5 — 시퀀스보다 많은 칸은 끈다")]
        [SerializeField] Image[] cells;
        [Tooltip("칸마다 자식 화살표 Image (위쪽을 가리키는 스프라이트 하나를 돌려 쓴다)")]
        [SerializeField] Image[] glyphs;
        [Tooltip("다음에 넣을 칸에 옮겨 붙이는 두꺼운 금색 테두리 (9-slice Image, 앵커 전체 채움 · 바깥으로 4px)")]
        [SerializeField] RectTransform nextFrame;
        [Tooltip("Image Type Filled · Horizontal")]
        [SerializeField] Image cooldownFill;
        [SerializeField] Image waitFill;
        [SerializeField] CanvasGroup group;

        [Header("색")]
        [SerializeField] Color rowNormal = new(1f, 1f, 1f, 0.03f);
        [SerializeField] Color rowCandidate = new(0.37f, 0.9f, 0.79f, 0.08f);
        [SerializeField] Color cellNormal = new(0.05f, 0.09f, 0.13f, 1f);
        [SerializeField] Color cellLit = new(0.37f, 0.9f, 0.79f, 1f);
        [SerializeField] Color glyphLight = new(0.81f, 0.88f, 0.94f, 1f);
        [SerializeField] Color glyphDark = new(0.02f, 0.16f, 0.14f, 1f);
        [SerializeField] Color statusNormal = new(0.79f, 0.85f, 0.9f, 1f);
        [SerializeField] Color statusWarn = new(1f, 0.69f, 0.6f, 1f);
        [Range(0f, 1f)] [SerializeField] float mismatchAlpha = 0.28f;

        public void Bind(ComboCommand c)
        {
            nameText.text = c.displayName;
            icon.sprite = c.icon;
            icon.enabled = c.icon != null;
            for (int k = 0; k < cells.Length; k++)
            {
                bool on = k < c.sequence.Length;
                cells[k].gameObject.SetActive(on);
                if (on) glyphs[k].rectTransform.localEulerAngles = new Vector3(0f, 0f, Angle(c.sequence[k]));
            }
        }

        /// <summary>위쪽 화살표 스프라이트를 돌릴 각도 (UGUI 의 Z 회전은 반시계 +)</summary>
        public static float Angle(ComboDir d) => d switch
        {
            ComboDir.Left => 90f,
            ComboDir.Down => 180f,
            ComboDir.Right => -90f,
            _ => 0f,
        };

        public void Paint(in State s)
        {
            group.alpha = s.mismatch ? mismatchAlpha : s.cooling ? 0.45f : 1f;
            background.color = s.candidate ? rowCandidate : rowNormal;
            for (int k = 0; k < cells.Length; k++)
            {
                if (!cells[k].gameObject.activeSelf) continue;
                bool lit = k < s.lit;   // 맞은 칸: 채움 + 진한 화살표
                cells[k].color = lit ? cellLit : cellNormal;
                glyphs[k].color = lit ? glyphDark : glyphLight;
            }
            // 다음 칸: 채움색이 아니라 두꺼운 금색 테두리 모양으로 (웹 해설 1 과 같게, 색만으로 구분하지 않는다)
            int next = s.lit;
            bool showNext = s.candidate && !s.pending && next < cells.Length && cells[next].gameObject.activeSelf;
            nextFrame.gameObject.SetActive(showNext);
            if (showNext && nextFrame.parent != cells[next].transform)
            {
                nextFrame.SetParent(cells[next].transform, false);   // 앵커 전체 채움이라 칸 크기를 그대로 따른다
                nextFrame.SetAsLastSibling();
            }
            statusText.text = s.status;
            statusText.color = s.warn ? statusWarn : statusNormal;
            cooldownFill.fillAmount = s.cooldown01;
            waitFill.fillAmount = s.wait01;
        }
    }
}
