// 버튼을 '누른 시각' 을 기록한다 — Button.onClick 은 손을 뗄 때 불려서, 잠금 중 누르고 풀린 뒤 떼면 통과해 버린다.
using UnityEngine;
using UnityEngine.EventSystems;

namespace UIGallery.GachaRevealOdds
{
    public class PressStamp : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        float pressedAt = -1f;
        int upFrame = -1;

        public void OnPointerDown(PointerEventData eventData) => pressedAt = Time.unscaledTime;
        public void OnPointerUp(PointerEventData eventData) => upFrame = Time.frameCount;

        /// <summary>
        /// 마우스 · 터치 클릭이면 누른 시각, 키보드 · 패드(Submit)면 지금 시각. 읽으면 지운다.
        /// 포인터 클릭은 손을 뗀 그 프레임에 온다 — 누르고 밖으로 끌어 클릭이 안 된 기록이 나중 Submit 에 섞이지 않게 프레임으로 가린다
        /// </summary>
        public float Take()
        {
            float t = pressedAt >= 0f && upFrame == Time.frameCount ? pressedAt : Time.unscaledTime;
            pressedAt = -1f;
            return t;
        }
    }
}
