// 카드 한 장 — 뒷면(등급 예고)과 앞면(항목). 뒤집기는 가로 크기 1 → 0 → 1 사이에 면을 바꾼다 (실제 시간).
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.GachaRevealOdds
{
    public class GachaCardView : MonoBehaviour
    {
        [SerializeField] GameObject back;
        [SerializeField] Image backFrame;
        [SerializeField] Image backMark;
        [SerializeField] TextMeshProUGUI backGrade;
        [SerializeField] GameObject face;
        [SerializeField] Image faceFrame;
        [SerializeField] Image faceIcon;
        [SerializeField] TextMeshProUGUI faceName;
        [SerializeField] TextMeshProUGUI faceGrade;
        [SerializeField] GameObject forcedTag;

        [Tooltip("영웅 · 희귀 · 일반 순서. 색만으로 구분하지 않게 모양(별 · 마름모 · 원)도 다르게")]
        [SerializeField] Sprite[] gradeMarks = new Sprite[3];
        [SerializeField] Color[] gradeColors = { new(1f, 0.8f, 0.3f), new(0.76f, 0.6f, 1f), new(0.56f, 0.71f, 0.86f) };

        public bool Flipped { get; private set; }
        public Grade Grade { get; private set; }

        /// <summary>엎은 채로 결과를 묶는다 — 결과는 이미 서버가 정했고, 뒷면은 등급만 보여 준다</summary>
        public void Bind(GachaTable table, int itemIndex, bool forced)
        {
            GachaItem it = table.items[itemIndex];
            Grade = it.grade;
            int g = (int)it.grade;
            backFrame.color = faceFrame.color = gradeColors[g];
            backMark.sprite = gradeMarks[g];
            backMark.color = gradeColors[g];
            backGrade.text = faceGrade.text = GachaTable.GradeNames[g];
            faceIcon.sprite = it.icon;
            faceName.text = it.displayName;
            forcedTag.SetActive(forced);
            Flipped = false;
            back.SetActive(true);
            face.SetActive(false);
            transform.localScale = Vector3.one;
        }

        public IEnumerator Flip(float seconds)
        {
            if (Flipped) yield break;
            Flipped = true;
            float half = Mathf.Max(0.01f, seconds * 0.5f);
            for (float t = 0f; t < half; t += Time.unscaledDeltaTime)
            {
                transform.localScale = new Vector3(1f - t / half, 1f, 1f);
                yield return null;
            }
            back.SetActive(false);
            face.SetActive(true);
            for (float t = 0f; t < half; t += Time.unscaledDeltaTime)
            {
                transform.localScale = new Vector3(t / half, 1f, 1f);
                yield return null;
            }
            transform.localScale = Vector3.one;
        }

        /// <summary>건너뛰기 · 중단 — 연출 없이 바로 앞면</summary>
        public void ShowFaceNow()
        {
            Flipped = true;
            back.SetActive(false);
            face.SetActive(true);
            transform.localScale = Vector3.one;
        }
    }
}
