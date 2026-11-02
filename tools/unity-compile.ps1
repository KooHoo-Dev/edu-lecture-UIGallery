# Unity C# 컴파일 확인 (에디터 없이). Unity 가 만든 Assembly-CSharp.csproj 의 참조 · 정의 · 분석기를 빌려
# Unity 내장 Roslyn 으로 src/unity 의 C# 를 컴파일한다. 오류가 없으면 'exit 0'.
#
#   powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1                            # 모든 표본
#   powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen loading-screen   # 한 표본 (ugui + uitk 함께)
#   (Windows 기본 실행 정책이 스크립트를 막으므로 이 한 번만 Bypass 로 실행한다)
#
# 필요: Unity 6.3 에디터와, 그 버전으로 한 번 열어 둔 Unity 프로젝트(-Project). 새 Input System · UGUI 패키지가 있어야 한다.
# 한계: C# 컴파일만 본다. UXML · USS 임포트와 [UxmlElement] 생성 확인은 그 프로젝트의 Assets 에 복사해 에디터로 연다.
param(
  [string]$Specimen = '',
  [string]$Project = 'C:\Users\user\UIGallery-compile',
  [string]$Editor = 'C:\Program Files\Unity\Hub\Editor\6000.3.20f1\Editor'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sources = if ($Specimen) { Join-Path $root "src\unity\$Specimen" } else { Join-Path $root 'src\unity' }
if (-not (Test-Path $sources)) { throw "폴더 없음: $sources" }
$csproj = Join-Path $Project 'Assembly-CSharp.csproj'
if (-not (Test-Path $csproj)) { throw "Unity 프로젝트를 한 번 열어 csproj 를 만들어야 한다: $csproj" }
$data = Join-Path $Editor 'Data'

[xml]$x = Get-Content $csproj
$resolve = { param($p) if ([IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $Project $p } }
$refs = $x.Project.ItemGroup.Reference | Where-Object { $_ -and $_.HintPath } | ForEach-Object { & $resolve $_.HintPath } |
  Where-Object { (Split-Path $_ -Leaf) -notin @('Assembly-CSharp.dll', 'Assembly-CSharp-Editor.dll') }
$analyzers = $x.Project.ItemGroup.Analyzer | Where-Object { $_ } | ForEach-Object { & $resolve $_.Include }
$defines = ($x.Project.PropertyGroup.DefineConstants | Where-Object { $_ }) -join ';'
$files = Get-ChildItem $sources -Recurse -Filter *.cs | ForEach-Object FullName

$out = Join-Path ([IO.Path]::GetTempPath()) ("uig-compile-" + ($(if ($Specimen) { $Specimen } else { 'all' })))
New-Item -ItemType Directory -Force $out | Out-Null
# Unity 와 같게: C# 9, 미사용 필드 경고(0169 · 0649)는 끈다 — 인스펙터에서 채우는 필드라서
$rsp = @('-target:library', '-nologo', '-langversion:9.0', '-nostdlib+', '-unsafe-', "-out:$out\Check.dll", "-define:$defines", '-warn:4', '-nowarn:0169,0649')
$rsp += $refs | ForEach-Object { "-r:`"$_`"" }
$rsp += $analyzers | ForEach-Object { "-analyzer:`"$_`"" }
$rsp += $files | ForEach-Object { "`"$_`"" }
$rsp | Set-Content -Encoding utf8 "$out\check.rsp"

"C# $($files.Count)개 컴파일 (참조 $($refs.Count) · 분석기 $($analyzers.Count))"
& "$data\NetCoreRuntime\dotnet.exe" "$data\DotNetSdkRoslyn\csc.dll" "@$out\check.rsp" 2>&1 |
  Where-Object { $_ -notmatch 'CS2023|USG0001' } |
  ForEach-Object { $_ -replace [regex]::Escape($root + '\'), '' }
"exit $LASTEXITCODE"
exit $LASTEXITCODE
