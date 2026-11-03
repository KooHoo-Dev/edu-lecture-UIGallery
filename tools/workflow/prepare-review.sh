#!/bin/sh
# 잡 브랜치(dispatch/<id>) 하나의 표본을 리뷰 폴더 _review/<id>/ 로 모으고 화면을 찍는다.
#   sh tools/workflow/prepare-review.sh <표본 id> [shot.py 상태 ...]
#   예: sh tools/workflow/prepare-review.sh branching-route-map default juice0 event:advance preset:dense mobile
# 상태를 주지 않으면 default juice0 mobile. 리뷰어에게는 tools/workflow/review-brief.md 와 이 폴더를 준다.
set -e
ID=$1
shift
[ $# -gt 0 ] || set -- default juice0 mobile
REPO=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$REPO/_review/$ID"
WT="$(cygpath -m "${TMPDIR:-/tmp}")/uig-rv-$ID"
rm -rf "$OUT"
mkdir -p "$OUT/web" "$OUT/unity" "$OUT/shots"

awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$REPO/jobs/$ID.md" > "$OUT/task.md"
git -C "$REPO" worktree add -q --detach "$WT" "dispatch/$ID"
cp "$WT/src/specimens/$ID/"* "$OUT/web/"
cp -r "$WT/src/unity/$ID/"* "$OUT/unity/"
(
  cd "$WT"
  python tools/shot.py "$ID" "$@"
  node tools/live.mjs "$ID" --no-build wait:4000 stage:live-4s wait:8000 stage:live-12s wait:12000 stage:live-24s   # 자동 데모 두 바퀴째 버그를 잡는다
) > "$OUT/shots.log" 2>&1
cp "$WT/_shots/$ID/"*.png "$OUT/shots/"
node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" "$WT"
git -C "$REPO" worktree prune

# 워커의 마지막 보고와 검증 결과 (JayDispatch 실행 기록의 마지막 시도)
RUN=$(ls -d "$HOME"/.jay-dispatch/repos/UIGallery-*/runs/"$ID"/*/ 2>/dev/null | tail -1)
if [ -n "$RUN" ]; then
  {
    node -e "const t=require('fs').readFileSync(process.argv[1],'utf8');try{console.log(JSON.parse(t).result||'')}catch{console.log(t)}" "$RUN/stdout.log"
    echo
    tail -40 "$RUN/verify.log" 2>/dev/null || true
  } > "$OUT/worker-report.txt"
fi
find "$OUT" -type f | sed "s|$OUT/||" | sort | tr '\n' ' '
echo
