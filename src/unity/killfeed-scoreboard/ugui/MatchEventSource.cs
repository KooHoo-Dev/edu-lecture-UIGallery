// 가짜 이벤트 소스 — 서버 대신 NetKillMessage 를 만들고, UI 가 쓰는 KillEvent 로 바꿔 알린다.
// 실제 게임에서는 Receive 를 Netcode RPC 수신이 부른다. 뷰는 KillReceived 와 MatchState 만 안다.
// 시험용 키: 1 내가 제압 · 2 내가 이탈 · 3 몰아치기 · 4 경계 밖 이탈 · R 처음부터
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using Random = UnityEngine.Random;

namespace UIGallery.KillfeedScoreboard
{
    /// <summary>네트워크로 오는 모양 그대로 — 이름 대신 번호, enum 대신 바이트, bool 대신 비트 (보내는 양을 줄인다)</summary>
    public struct NetKillMessage
    {
        public ushort attackerNetId;   // 0 = 환경 (경계 밖)
        public ushort victimNetId;
        public ushort assistNetId;     // 0 = 없음
        public byte weaponCode;
        public byte flags;
        public const byte FlagPrecision = 1;
    }

    public static class KillEventTranslator
    {
        /// <summary>네트워크 메시지 → UI 이벤트. 모르는 선수 · 무기면 false (늦게 온 메시지, 버전 차이)</summary>
        public static bool TryTranslate(in NetKillMessage m, MatchState match, out KillEvent e)
        {
            e = new KillEvent
            {
                attacker = IndexOf(match, m.attackerNetId),
                victim = IndexOf(match, m.victimNetId),
                assist = IndexOf(match, m.assistNetId),
                precision = (m.flags & NetKillMessage.FlagPrecision) != 0,
            };
            if (e.victim < 0 || m.weaponCode > (byte)Weapon.Boundary) return false;
            if (m.attackerNetId != 0 && e.attacker < 0) return false;   // 환경으로 치면 상대 팀에 점수가 간다
            e.weapon = (Weapon)m.weaponCode;
            return true;
        }

        static int IndexOf(MatchState match, ushort netId)
        {
            if (netId == 0) return -1;
            for (int i = 0; i < match.players.Count; i++)
                if (match.players[i].netId == netId) return i;
            return -1;
        }
    }

    /// <summary>가짜 경기 서버 (컴포넌트라 파일 이름과 같다)</summary>
    public class MatchEventSource : MonoBehaviour
    {
        [Tooltip("먼저 이 제압 수에 닿는 팀이 이긴다")]
        [SerializeField] int winScore = 50;
        [Tooltip("자동 이벤트 평균 간격 (초)")]
        [SerializeField] float meanInterval = 1.4f;
        [SerializeField] bool autoEvents = true;
        [SerializeField] List<PlayerStats> roster = new()
        {
            P("하린", Team.Orbit, 101, 0, 5, 3, 4, 2, 24, true),
            P("도윤", Team.Orbit, 102, 1, 4, 5, 4, 1, 38),
            P("세라", Team.Orbit, 103, 2, 6, 2, 3, 3, 61),
            P("민재", Team.Orbit, 104, 3, 3, 4, 5, 0, 45),
            P("유나", Team.Orbit, 105, 4, 2, 6, 3, 0, 132),
            P("지호", Team.Surface, 201, 0, 6, 2, 5, 2, 33),
            P("서연", Team.Surface, 202, 1, 5, 4, 4, 2, 52),
            P("건우", Team.Surface, 203, 2, 3, 3, 4, 1, 27),
            P("아라", Team.Surface, 204, 3, 3, 5, 4, 0, 148),
            P("준서", Team.Surface, 205, 4, 2, 2, 3, 0, 41),
        };

        public MatchState Match { get; private set; }
        public int MeIndex { get; private set; }
        public event Action<KillEvent> KillReceived;

        readonly Queue<(float at, NetKillMessage m)> scheduled = new();
        readonly List<int> picks = new();
        float clock, next;

        static PlayerStats P(string n, Team t, ushort id, int join, int td, int a, int o, int pr, int ping, bool me = false) =>
            new() { displayName = n, team = t, netId = id, joinOrder = join, takedowns = td, assists = a, outs = o, precisionHits = pr, ping = ping, isMe = me };

        void Awake()
        {
            Match = new MatchState(roster, winScore);
            MeIndex = roster.FindIndex(p => p.isMe);
            next = meanInterval;
        }

        void Update()
        {
            clock += Time.deltaTime;
            Keyboard k = Keyboard.current;
            if (k != null)
            {
                if (k.digit1Key.wasPressedThisFrame) Receive(Make(MeIndex, RandomOf(Team.Surface), Weapon.Longshot, true));
                else if (k.digit2Key.wasPressedThisFrame) Receive(Make(RandomOf(Team.Surface), MeIndex, Weapon.Pulse, false));
                else if (k.digit3Key.wasPressedThisFrame) Burst();
                else if (k.digit4Key.wasPressedThisFrame) Receive(Make(-1, RandomOf(Random.value < 0.5f ? Team.Orbit : Team.Surface), Weapon.Boundary, false));
                else if (k.rKey.wasPressedThisFrame) Match.Reset();
            }
            while (scheduled.Count > 0 && scheduled.Peek().at <= clock) Receive(scheduled.Dequeue().m);
            if (autoEvents && (next -= Time.deltaTime) <= 0f)
            {
                next = meanInterval * Random.Range(0.6f, 1.4f);
                Receive(RandomMessage());
            }
        }

        /// <summary>네트워크 수신 자리 — 번역 → 기록 갱신 → UI 이벤트</summary>
        public void Receive(NetKillMessage m)
        {
            if (!KillEventTranslator.TryTranslate(m, Match, out KillEvent e)) return;
            Match.Apply(e);
            KillReceived?.Invoke(e);
            // 경기 끝 — 데모는 바로 새 경기. 실제 게임은 여기서 결과 화면으로 간다
            if (Match.Remaining(Team.Orbit) == 0 || Match.Remaining(Team.Surface) == 0) Match.Reset();
        }

        /// <summary>몰아치기: 1초 안에 7건. 한 사람이 같은 무기로 세 번 — 피드가 합치는지 본다</summary>
        public void Burst()
        {
            Team side = Random.value < 0.5f ? Team.Orbit : Team.Surface;
            int star = RandomOf(side, MeIndex);
            for (int i = 0; i < 7; i++)
            {
                NetKillMessage m = i % 2 == 0 && i < 6 ? Make(star, RandomOf(side == Team.Orbit ? Team.Surface : Team.Orbit), Weapon.Pulse, false) : RandomMessage();
                scheduled.Enqueue((clock + i * 0.13f, m));
            }
        }

        NetKillMessage RandomMessage()
        {
            float x = Random.value;
            Weapon w = x < 0.4f ? Weapon.Pulse : x < 0.6f ? Weapon.Scatter : x < 0.75f ? Weapon.Longshot : x < 0.87f ? Weapon.Shock : x < 0.95f ? Weapon.Baton : Weapon.Boundary;
            Team side = Random.value < 0.5f ? Team.Orbit : Team.Surface;
            Team foe = side == Team.Orbit ? Team.Surface : Team.Orbit;
            if (w == Weapon.Boundary) return Make(-1, RandomOf(foe), w, false);
            bool precision = (w == Weapon.Pulse && Random.value < 0.3f) || (w == Weapon.Longshot && Random.value < 0.6f);
            return Make(RandomOf(side), RandomOf(foe), w, precision);
        }

        /// <summary>인덱스로 메시지를 만든다 (서버가 보낼 모양). 지원은 절반 확률로 가해자 팀의 다른 선수</summary>
        NetKillMessage Make(int attacker, int victim, Weapon w, bool precision)
        {
            PlayerStats a = Match.Get(attacker);
            int assist = a != null && Random.value < 0.5f ? RandomOf(a.team, attacker) : -1;
            return new NetKillMessage
            {
                attackerNetId = a?.netId ?? 0,
                victimNetId = Match.Get(victim)?.netId ?? 0,
                assistNetId = Match.Get(assist)?.netId ?? 0,
                weaponCode = (byte)w,
                flags = precision ? NetKillMessage.FlagPrecision : (byte)0,
            };
        }

        int RandomOf(Team t, int except = -1)
        {
            picks.Clear();
            for (int i = 0; i < Match.players.Count; i++)
                if (Match.players[i].team == t && i != except) picks.Add(i);
            return picks.Count > 0 ? picks[Random.Range(0, picks.Count)] : -1;
        }
    }
}
