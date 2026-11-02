using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 대화 기록 한 줄 (프리팹 루트에 붙인다). MonoBehaviour 는 클래스 이름과 파일 이름이 같아야 컴포넌트로 붙는다.
    /// </summary>
    public class LogEntry : MonoBehaviour
    {
        [SerializeField] Image icon;
        [SerializeField] TMP_Text who;
        [SerializeField] TMP_Text body;

        public void Set(string speaker, string role, Sprite face, string text)
        {
            if (icon != null)
            {
                icon.sprite = face;
                icon.enabled = face != null;
            }
            if (who != null) who.text = string.IsNullOrEmpty(role) ? speaker : $"{speaker}  <size=80%><color=#9AA3AE>{role}</color></size>";
            body.text = text;
        }
    }
}
