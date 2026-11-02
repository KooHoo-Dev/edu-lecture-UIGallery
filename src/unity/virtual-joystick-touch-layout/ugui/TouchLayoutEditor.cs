using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.VirtualJoystickTouchLayout
{
    /// <summary>
    /// 배치 편집 켜기 · 저장 · 기본값. 버튼 onClick 에 ToggleEdit / Save / ResetToDefault 를 연결한다.
    /// 저장 형식: { items: [ { id, nx, ny, size } ] } — 위치는 SafeArea 안의 비율, 크기는 px 그대로. PlayerPrefs 에 JSON.
    /// </summary>
    public class TouchLayoutEditor : MonoBehaviour
    {
        const string Key = "touch-layout.v1";   // 저장 형식을 바꾸면 버전을 올려 옛 값을 무시한다

        [Serializable]
        class Entry
        {
            public string id;
            public float nx;
            public float ny;
            public float size;
        }

        [Serializable]
        class Saved
        {
            public List<Entry> items = new();
        }

        TouchLayoutItem[] items;
        readonly Dictionary<string, (Vector2 n, Vector2 size)> defaults = new();

        void Start()
        {
            items = FindObjectsByType<TouchLayoutItem>(FindObjectsSortMode.None);
            // 레이아웃이 확정된 뒤의 처음 배치를 기본값으로 기억
            Canvas.ForceUpdateCanvases();
            foreach (TouchLayoutItem it in items) defaults[it.id] = (it.Normalized, it.Rect.sizeDelta);
            Load();
        }

        public void ToggleEdit()
        {
            TouchLayoutItem.Editing = !TouchLayoutItem.Editing;
            foreach (TouchLayoutItem it in items)
                if (it.inputControl != null) it.inputControl.enabled = !TouchLayoutItem.Editing;
            if (!TouchLayoutItem.Editing) Save();
        }

        public void Save()
        {
            var saved = new Saved();
            foreach (TouchLayoutItem it in items)
            {
                Vector2 n = it.Normalized;
                saved.items.Add(new Entry { id = it.id, nx = n.x, ny = n.y, size = it.Rect.sizeDelta.x });
            }
            PlayerPrefs.SetString(Key, JsonUtility.ToJson(saved));
            PlayerPrefs.Save();
        }

        public void Load()
        {
            if (!PlayerPrefs.HasKey(Key)) return;
            Saved saved = JsonUtility.FromJson<Saved>(PlayerPrefs.GetString(Key));
            foreach (Entry e in saved.items)
            {
                TouchLayoutItem it = Array.Find(items, x => x.id == e.id);
                if (it == null) continue;
                it.Normalized = new Vector2(e.nx, e.ny);   // 비율 × 지금 SafeArea 크기
                it.Rect.sizeDelta = new Vector2(e.size, e.size);
            }
        }

        public void ResetToDefault()
        {
            foreach (TouchLayoutItem it in items)
            {
                if (!defaults.TryGetValue(it.id, out var d)) continue;
                it.Normalized = d.n;
                it.Rect.sizeDelta = d.size;
            }
            PlayerPrefs.DeleteKey(Key);
        }
    }
}
