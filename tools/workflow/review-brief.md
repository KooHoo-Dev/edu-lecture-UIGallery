# Specimen review brief (shared by all reviewers)

You review new specimens for UI Gallery: a teaching gallery of game UI patterns. Each specimen is a live web re-implementation (React + TypeScript + CSS Modules, rendered at a 1920×1080 logical resolution) plus Unity 6.3 implementations for UGUI and UI Toolkit, shown as text in the app. A worker model wrote each specimen from a task file. Do a critical code and content review. Write the report in Korean.

## Files (read only)

- Each specimen has a review folder `C:\Users\user\UIGallery\_review\<id>\` (made by `tools/workflow/prepare-review.sh`):
  - `task.md`: the task the worker received.
  - `web/`: `index.tsx`, `meta.ts`, `style.module.css` and any helper modules.
  - `unity/ugui/`, `unity/uitk/`: the Unity files (`.cs`, `.uxml`, `.uss`).
  - `shots/`: headless captures. `default`, `juice0` (= "effect off", the deliberate bad example), events, presets, `mobile` (520 px wide) are virtual-time captures in which game loops barely advance; `live-*` are real-time captures.
  - `worker-report.txt`: the worker's own report and the verify log. Verify it; do not trust it.
- Specification: `C:\Users\user\UIGallery\docs\specimen-guide.md` (read all of it) and `docs\agent-contract.md`.
- Candidate card: `research\next-batch-candidates.json` (search the id) and `docs\next-specimens-research.md`.
- Reference implementations: `src\specimens\health-bar-trail\` and the samples named in `task.md`, with their `src\unity\<id>\` folders. Other merged specimens live in the same folders.
- App code when needed: meta schema `src\core\types.ts`, shared utilities `src\core\*.ts(x)` (hooks, stageKeys, inputLock, flash, countup, placement, virtualList), stage `src\app\Stage.tsx`, prompts `src\core\prompts.ts`, checks `tools\check.py`, Unity compile `tools\unity-compile.ps1`.

## Already verified (do not re-report)

`npx tsc --noEmit` passes. The specimen's C# compiles with Unity 6000.3's Roslyn against a real Unity project's references (UGUI, TextMeshPro, Input System) with zero errors. `npm run build` and `python tools/check.py` pass (file rules, namespaces, UXML parses as XML, stage-key rules, size budget, offline run). Note that nothing has imported the UXML/USS into a Unity editor or run the C# in Play mode.

## What to report

1. Defects ranked by severity. Each: file and line, what is wrong, and a concrete failure scenario (what a student or the gallery would see). Cover:
   - Web: the props contract (`params` all visibly change the screen, `juice=false` is a convincing common mistake rather than "nothing", `playing`/`timeScale` respected, `trigger` events each visible, `autoplay` loop, `thumbnail` first frame meaningful), per-frame updates through refs rather than setState, keyboard through `core/stageKeys` only, hotspot `data-part` elements always present and pointing at the right part, 9:16 and narrow layouts, flashing rules, colour not the only state cue.
   - Logic: the pattern's algorithm itself (correctness, edge cases, determinism where claimed).
   - Unity: correctness on Unity 6.3 (lifecycle, coroutines stopped in OnDisable with state reset, input locks on press time, Input System only, `FindFirstObjectByType`), UGUI hierarchy/components vs `meta.unity.ugui.hierarchy`, UI Toolkit features that USS does not support, UXML element names with namespace, whether web and Unity behave the same.
   - Content: Korean writing, accuracy of goals/mistakes/timings (they go into copyable prompts), content policy (game names only in `inspiredBy`, at most two borrowed visual axes, unverified screen descriptions marked, no original assets or wording), the shared world (외곽 탐사대).
2. Claims in the text and the worker report that the code does not support.
3. Verdict: mergeable as is, mergeable after listed fixes, or needs rework, with the exact fix list, required first.
4. Separately: anything the app, shared core, checks or guide should change (common-component candidates included).

Do not modify, create or delete files. Do not run the repo's tools or anything that writes. Reading files and viewing images is fine. Keep the report under about 80 lines, defects first.
