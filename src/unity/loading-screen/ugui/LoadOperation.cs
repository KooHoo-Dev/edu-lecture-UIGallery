// 로딩 작업 묶음 — 진짜 씬 로드(SceneLoadOperation)와 시험용 가짜 로드(FakeLoadOperation)를 같은 로딩 화면이 다루게 하는 인터페이스.
// 핵심: SceneManager.LoadSceneAsync 에 allowSceneActivation = false 를 주면 progress 는 0.9 에서 멈추고 활성화를 기다린다.
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UIGallery.LoadingScreen
{
    /// <summary>로딩 화면이 보는 '불러오는 중인 무언가'</summary>
    public interface ILoadOperation
    {
        /// <summary>0~1. 활성화를 미루면 0.9 에서 멈춘다 (AsyncOperation.progress 와 같은 규칙)</summary>
        float Progress { get; }
        bool IsDone { get; }
        /// <summary>활성화 허락 (= allowSceneActivation = true). 이 뒤에 0.9 → 1</summary>
        void AllowActivation();
        /// <summary>단계 수 (모르면 0 — 진짜 씬 로드는 단계를 알려 주지 않는다)</summary>
        int StageCount { get; }
        int StageIndex { get; }
        string StageLabel { get; }
    }

    /// <summary>로딩 화면 컴포넌트 공통 (UGUI · UI Toolkit). 시험용 스크립트가 어느 쪽이든 Run 을 부른다</summary>
    public interface ILoadingScreen
    {
        void Run(ILoadOperation operation);
        bool IsRunning { get; }
    }

    /// <summary>진짜 씬 로드</summary>
    public class SceneLoadOperation : ILoadOperation
    {
        readonly AsyncOperation op;

        public SceneLoadOperation(string sceneName, LoadSceneMode mode = LoadSceneMode.Single)
        {
            op = SceneManager.LoadSceneAsync(sceneName, mode);
            if (op == null)
            {
                Debug.LogError($"씬 '{sceneName}' 을 불러올 수 없다 — Build Profiles 의 씬 목록에 있는지 확인");
                return;
            }
            op.allowSceneActivation = false;   // 0.9 에서 멈추고 '준비 완료' 를 기다린다
        }

        public float Progress => op == null ? 1f : op.progress;
        public bool IsDone => op == null || op.isDone;
        public void AllowActivation()
        {
            if (op != null) op.allowSceneActivation = true;
        }
        public int StageCount => 0;
        public int StageIndex => -1;
        public string StageLabel => null;
    }
}
