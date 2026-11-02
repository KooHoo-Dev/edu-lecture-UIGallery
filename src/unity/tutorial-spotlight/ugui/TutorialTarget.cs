using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.TutorialSpotlightSample
{
    /// <summary>
    /// 튜토리얼이 가리킬 수 있는 버튼에 붙인다. 버튼의 본래 기능(onClick)은 그대로 두고,
    /// 눌렸다는 사실만 Clicked 이벤트로 알린다 → 튜토리얼 전용 가짜 버튼을 만들지 않는다.
    /// </summary>
    [RequireComponent(typeof(Button))]
    public class TutorialTarget : MonoBehaviour
    {
        public string id;

        static readonly Dictionary<string, TutorialTarget> registry = new();
        public static event Action<string> Clicked;

        public RectTransform Rect => (RectTransform)transform;

        public static TutorialTarget Find(string id) => registry.TryGetValue(id, out var t) ? t : null;

        // 닫힌 서랍 안의 버튼도 찾을 수 있게 OnEnable 이 아니라 Awake/OnDestroy 에서 등록한다
        // (단, 한 번도 켜진 적 없는 오브젝트는 Awake 가 불리지 않는다 — 서랍은 '꺼 두기' 대신 화면 밖으로 밀어 두자)
        void Awake()
        {
            registry[id] = this;
            GetComponent<Button>().onClick.AddListener(() => Clicked?.Invoke(id));
        }

        void OnDestroy()
        {
            if (registry.TryGetValue(id, out var t) && t == this) registry.Remove(id);
        }
    }
}
