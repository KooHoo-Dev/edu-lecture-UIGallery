// 시험용 — 실제 씬 없이 로딩 화면을 돌려 본다. 1 빠른 · 2 느린 · 3 중간 멈칫 · R 보통 (UGUI · UI Toolkit 어느 로딩 화면이든).
// sceneName 을 채우면 R 키가 그 씬을 진짜로 불러온다 (Build Profiles 의 씬 목록에 있어야 한다).
// LoadSceneMode.Single 이라 이 오브젝트는 새 씬에서 사라진다. 로딩 화면은 persistAcrossScenes(DontDestroyOnLoad)로 남아 페이드를 마친다.
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.LoadingScreen
{
    public class LoadingScreenDemo : MonoBehaviour
    {
        [Tooltip("LoadingView(UGUI) 또는 LoadingViewUITK")]
        [SerializeField] MonoBehaviour screen;
        [Tooltip("비워 두면 가짜 로드만 쓴다")]
        [SerializeField] string sceneName = "";
        [SerializeField] bool runOnStart = true;

        ILoadingScreen Screen => screen as ILoadingScreen;

        void Start()
        {
            if (Screen == null) Debug.LogError("screen 에 LoadingView 나 LoadingViewUITK 를 넣는다");
            else if (runOnStart) Screen.Run(new FakeLoadOperation(FakeLoadOperation.Normal()));
        }

        void Update()
        {
            Keyboard k = Keyboard.current;
            if (k == null || Screen == null) return;
            // 숫자 키도 '아무 키' 라서 준비 완료 화면에서는 계속으로도 처리된다 — 새 로드는 화면이 끝난 뒤에만
            if (Screen.IsRunning) return;
            if (k.digit1Key.wasPressedThisFrame) Screen.Run(new FakeLoadOperation(FakeLoadOperation.Fast()));
            else if (k.digit2Key.wasPressedThisFrame) Screen.Run(new FakeLoadOperation(FakeLoadOperation.Slow()));
            else if (k.digit3Key.wasPressedThisFrame) Screen.Run(new FakeLoadOperation(FakeLoadOperation.Hitch()));
            else if (k.rKey.wasPressedThisFrame)
                Screen.Run(string.IsNullOrEmpty(sceneName) ? new FakeLoadOperation(FakeLoadOperation.Normal()) : new SceneLoadOperation(sceneName));
        }
    }
}
