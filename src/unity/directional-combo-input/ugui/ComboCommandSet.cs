// 방향 커맨드 데이터 — 커맨드 이름 · 시퀀스 · 재사용 대기를 화면과 분리한 ScriptableObject.
// UGUI(ComboHud) 와 UI Toolkit(ComboHudUITK) 이 같은 에셋을 읽는다.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.DirectionalComboInput
{
    public enum ComboDir { Up, Down, Left, Right }

    [Serializable]
    public class ComboCommand
    {
        public string id;
        public string displayName;
        [TextArea] public string desc;
        public Sprite icon;
        public ComboDir[] sequence;
        [Tooltip("재사용 대기 (초, 게임 시간)")]
        public float cooldown = 10f;
    }

    [CreateAssetMenu(menuName = "UI Gallery/Combo Command Set", fileName = "ComboCommandSet")]
    public class ComboCommandSet : ScriptableObject
    {
        public List<ComboCommand> commands = new();

        /// <summary>커맨드 i 가 다른 커맨드의 앞부분인가 (완성해도 더 긴 후보가 남는다)</summary>
        public bool IsPrefixOfAnother(int i)
        {
            ComboDir[] a = commands[i].sequence;
            if (a == null) return false;
            for (int j = 0; j < commands.Count; j++)
            {
                ComboDir[] b = commands[j].sequence;
                if (j != i && b != null && b.Length > a.Length && StartsWith(b, a)) return true;
            }
            return false;
        }

        public static bool StartsWith(IReadOnlyList<ComboDir> seq, IReadOnlyList<ComboDir> head)
        {
            if (head.Count > seq.Count) return false;
            for (int k = 0; k < head.Count; k++)
                if (seq[k] != head[k]) return false;
            return true;
        }

        // 에셋을 새로 만들면 예제 커맨드를 채운다 (외곽 탐사대 지원 요청)
        void Reset()
        {
            const ComboDir U = ComboDir.Up, D = ComboDir.Down, L = ComboDir.Left, R = ComboDir.Right;
            commands = new List<ComboCommand>
            {
                New("scout", "정찰 드론", "주변 잔해 드론 표시", 8f, L, U, R),
                New("wing", "정찰 드론 편대", "넓은 구역을 오래 표시", 20f, L, U, R, U, D),
                New("supply", "보급 투하", "수리 키트 · 산소 캔 상자", 15f, U, L, D, D),
                New("coolant", "냉각 셀 지원", "과열한 장비를 식힌다", 10f, L, L, D, R),
                New("repair", "수리 키트 투하", "근처 동료 체력 회복", 12f, R, U, L, D),
                New("shield", "방어막 발생기", "10초 동안 피해 막기", 20f, D, R, U, L),
                New("relay", "통신 중계기", "세라와의 통신 복구", 30f, U, R, L, L, U),
            };
        }

        static ComboCommand New(string id, string name, string desc, float cooldown, params ComboDir[] seq) =>
            new() { id = id, displayName = name, desc = desc, cooldown = cooldown, sequence = seq };

        // 데이터를 넣을 때 접두사 겹침을 알려 준다 — 완성 즉시 발동이면 긴 쪽은 쓸 수 없다
        void OnValidate()
        {
            if (commands == null) return;
            for (int i = 0; i < commands.Count; i++)
            {
                if (commands[i].sequence == null || commands[i].sequence.Length == 0)
                {
                    Debug.LogWarning($"[ComboCommandSet] '{commands[i].displayName}' 시퀀스가 비어 있다", this);
                    continue;
                }
                for (int j = 0; j < commands.Count; j++)
                {
                    if (i == j || commands[j].sequence == null) continue;
                    if (commands[j].sequence.Length == commands[i].sequence.Length && StartsWith(commands[j].sequence, commands[i].sequence) && i < j)
                        Debug.LogWarning($"[ComboCommandSet] '{commands[i].displayName}' 와 '{commands[j].displayName}' 시퀀스가 같다", this);
                }
                if (IsPrefixOfAnother(i))
                    Debug.Log($"[ComboCommandSet] '{commands[i].displayName}' 은 다른 커맨드의 앞부분 — ComboMatcher.PrefixWait 가 0 이면 긴 쪽에 닿을 수 없다", this);
            }
        }
    }
}
