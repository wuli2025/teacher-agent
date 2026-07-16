<#
.SYNOPSIS
  课件批量产线:spec + imgjobs → 并发生图 → 原生引擎出 .pptx → 索引页。

.DESCRIPTION
  与 build/build_all.py(python-pptx 那条老产线)同一套编排思路,但底座换成 Polaris 自己的
  原生引擎:模型只出 spec(polaris.slides.json),polaris-forge 确定性落 OOXML。相对老产线:
    · 产物是**真文本框 + 真图片框**,PowerPoint 里 100% 可编辑(老产线 python-pptx 亦可编辑,
      但这条线与软件内「演示工坊」同源同构 —— 对话里做和批量跑,出的是同一种东西)
    · **每页带演讲者备注**(老产线 0 页备注)
    · 零 Python 依赖,生图也走 polaris-forge image(纯 Rust)

  输入目录结构:
    <root>/spec/<id>.json            spec v1(见 skills/polaris-deck-studio/SKILL.md)
    <root>/spec/<id>.imgjobs.json    [{path, prompt, ratio}] 配图任务
    <root>/img/                      生图落这里(spec 里 image 字段指向它)
  输出:
    <root>/<课件名>.pptx + <root>/索引.html

.PARAMETER Root
  批次工作目录。

.PARAMETER Jobs
  生图并发数。默认 6(与 build_all.py 一致;再高容易撞 MiniMax 限流)。

.PARAMETER SkipImages
  跳过生图(图已在盘上时重跑出片用)。

.EXAMPLE
  pwsh scripts/batch-decks.ps1 -Root "C:\Users\mi\Desktop\课件批量"
#>
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [int]$Jobs = 6,
  [switch]$SkipImages
)

$ErrorActionPreference = "Stop"

# ── 定位 polaris-forge ──────────────────────────────────────────────
# 优先用仓里 release 构建的;没有就退到 ~/Polaris/bin 的随包版本。
$repo = Split-Path -Parent $PSScriptRoot
$candidates = @(
  (Join-Path $repo "src-tauri\target\release\polaris-forge.exe"),
  (Join-Path $env:USERPROFILE "Polaris\bin\polaris-forge.exe")
)
$FORGE = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $FORGE) {
  throw "找不到 polaris-forge。先跑:cargo build -p polaris-cli --release"
}
Write-Host "[forge] $FORGE"

$specDir = Join-Path $Root "spec"
$imgDir = Join-Path $Root "img"
New-Item -ItemType Directory -Force -Path $imgDir | Out-Null
if (-not (Test-Path $specDir)) { throw "缺 spec 目录: $specDir" }

$specs = Get-ChildItem $specDir -Filter "*.json" | Where-Object { $_.Name -notlike "*.imgjobs.json" }
if (-not $specs) { throw "spec 目录里没有 .json" }
Write-Host "[spec] 发现 $($specs.Count) 份"

# ── 1. 收集配图任务 ─────────────────────────────────────────────────
# 注意变量名:PowerShell 变量大小写不敏感,叫 $jobs 会把 [int]$Jobs 参数覆盖掉 → 类型约束报错。
$imgJobs = @()
foreach ($s in $specs) {
  $ij = Join-Path $specDir "$($s.BaseName).imgjobs.json"
  if (-not (Test-Path $ij)) { continue }
  foreach ($j in (Get-Content $ij -Raw -Encoding UTF8 | ConvertFrom-Json)) {
    # 已存在且够大就跳过 —— 幂等,重跑不重复烧生图额度(沿用 build_all.py 的 >10KB 判据)
    if ((Test-Path $j.path) -and ((Get-Item $j.path).Length -gt 10000)) { continue }
    $r = if ($j.ratio) { $j.ratio } else { "16:9" }
    $imgJobs += [PSCustomObject]@{ path = $j.path; prompt = $j.prompt; ratio = $r }
  }
}

# ── 2. 并发生图 ─────────────────────────────────────────────────────
if ($imgJobs.Count -and -not $SkipImages) {
  Write-Host "[img] 待生成 $($imgJobs.Count) 张,并发 $Jobs"
  $total = $imgJobs.Count
  $done = 0
  $fails = @()
  $imgJobs | ForEach-Object -ThrottleLimit $Jobs -Parallel {
    $r = & $using:FORGE image --prompt="$($_.prompt)" --out="$($_.path)" --ratio="$($_.ratio)" 2>&1
    [PSCustomObject]@{
      name = Split-Path $_.path -Leaf
      ok   = ($LASTEXITCODE -eq 0) -and (Test-Path $_.path)
      err  = if ($LASTEXITCODE -ne 0) { ($r | Out-String).Trim() } else { "" }
    }
  } | ForEach-Object {
    $done++
    $tag = if ($_.ok) { "OK  " } else { "FAIL" }
    Write-Host ("[img] {0}/{1} {2} {3} {4}" -f $done, $total, $tag, $_.name, $_.err)
    if (-not $_.ok) { $fails += $_ }
  }
  # 生图失败**不**中断:引擎会把缺图页降级成无图版式 + warning,先把课件交出来。
  if ($fails.Count) { Write-Warning "[img] $($fails.Count) 张失败,相关页将降级为无图版式" }
} elseif ($SkipImages) {
  Write-Host "[img] 已跳过"
} else {
  Write-Host "[img] 无需生成(图都在)"
}

# ── 3. 出片 ─────────────────────────────────────────────────────────
$results = @()
foreach ($s in $specs) {
  $spec = Get-Content $s.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  # 课件名取封面标题;没有就用文件名
  $cover = $spec.slides | Where-Object { $_.layout -in @("title", "image-full") } | Select-Object -First 1
  $title = if ($cover.title) { $cover.title } else { $s.BaseName }
  $safe = ($title -replace '[\\/:*?"<>|]', '_')
  $out = Join-Path $Root "$safe`_课件.pptx"

  $raw = & $FORGE spec-pptx --spec="$($s.FullName)" --out="$out" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "[deck] $($s.BaseName) 出片失败: $(($raw | Out-String).Trim())"
    continue
  }
  $r = $raw | ConvertFrom-Json
  $results += [PSCustomObject]@{
    id = $s.BaseName; title = $title; file = (Split-Path $out -Leaf)
    slides = $r.slides; images = $r.images; notes = $r.notes_pages
    theme = $r.theme; warnings = $r.warnings
  }
  $w = if ($r.warnings.Count) { " ⚠ $($r.warnings.Count) 条告警" } else { "" }
  Write-Host ("[deck] {0} · {1}页 · {2}图 · {3}备注{4}" -f $title, $r.slides, $r.images, $r.notes_pages, $w)
  foreach ($x in $r.warnings) { Write-Host "        ! $x" -ForegroundColor DarkYellow }
}

# ── 4. 索引页 ───────────────────────────────────────────────────────
$cards = ($results | ForEach-Object {
    @"
<div class=card><div class=t>$($_.title)</div>
<div class=m>$($_.slides) 页 · $($_.images) 图 · $($_.notes) 页备注 · $($_.theme)</div>
<a href="$([uri]::EscapeDataString($_.file))">打开课件 →</a></div>
"@
  }) -join "`n"

$html = @"
<!doctype html><meta charset=utf-8><title>课件批量 · 原生引擎版</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;background:#eef1f6;color:#222;padding:40px 20px;margin:0}
.wrap{max-width:980px;margin:0 auto}
h1{font-size:26px;color:#2c4661;margin:0 0 6px}
.sub{color:#5A6068;font-size:13.5px;margin-bottom:24px;line-height:1.7}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
.card{background:#fff;border-radius:10px;padding:16px 18px;box-shadow:0 2px 10px rgba(0,0,0,.07);border-left:5px solid #2c4661}
.t{font-size:17px;font-weight:800;margin-bottom:4px}
.m{font-size:12px;color:#888;margin-bottom:10px;font-family:Consolas,monospace}
a{font-size:13.5px;color:#2c4661;text-decoration:none;font-weight:600}
.note{margin-top:26px;background:#fff;border-radius:10px;padding:16px 20px;font-size:13px;color:#5A6068;line-height:1.8}
</style>
<div class=wrap><h1>课件批量 · 原生引擎版</h1>
<div class=sub>polaris.slides.json → polaris-forge 原生 OOXML · 配图 MiniMax image-01 · 共 $($results.Count) 套</div>
<div class=grid>$cards</div>
<div class=note><b>与老产线(python-pptx)的差别</b><br>
· 文字与配图都是<b>真对象</b>,PowerPoint/WPS 里可选中、可改字、可换图、可挪位<br>
· <b>每页带演讲者备注</b>(口播稿),投影给学生的是骨架,教师看的是备注<br>
· 与软件内「演示工坊」同源同构 —— 对话里做和批量跑,出的是同一种东西<br>
· 零 Python 依赖,生图亦走 polaris-forge image(纯 Rust)</div></div>
"@
$idx = Join-Path $Root "索引.html"
Set-Content -Path $idx -Value $html -Encoding UTF8

# ── 5. 收尾 ─────────────────────────────────────────────────────────
$totW = ($results | ForEach-Object { $_.warnings.Count } | Measure-Object -Sum).Sum
Write-Host ""
Write-Host ("[done] {0} 套 · 共 {1} 页 · {2} 张图 · {3} 页备注 · 告警 {4} 条" -f `
    $results.Count,
  (($results | Measure-Object slides -Sum).Sum),
  (($results | Measure-Object images -Sum).Sum),
  (($results | Measure-Object notes -Sum).Sum),
  $totW)
Write-Host "[done] 索引: $idx"
