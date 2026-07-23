# ─────────────────────────────────────────────────────────────
# 把某个版本的安装包 + latest.json 同步到自托管更新源（Cloudflare R2）。
#
# 什么时候用它：
#   · 仓库没配 CLOUDFLARE_API_TOKEN → release.yml 的自托管那步会直接报错停下（private 仓下
#     自托管是唯一活源，不能静默跳过），此时用这个脚本从本机补传；
#   · 自托管源供了旧包 / 上传失败 → 手动重发。
#
# 平时不需要手跑：配了 CLOUDFLARE_API_TOKEN(Object Read & Write) + CLOUDFLARE_ACCOUNT_ID 后，
# release.yml 的 publish job 会自动做同样的事。
#
# 为什么是 R2 不是 Pages：Pages 单文件上限 25MiB，本项目装包 win ~119MB / mac ~235MB。
#
# 依赖：gh（已登录）+ npx wrangler（已 `wrangler login`，本机 OAuth，不用 API token）。
#
# 用法：
#   pwsh scripts/publish-r2.ps1 -Tag v1.0.2
# ─────────────────────────────────────────────────────────────
param(
  [Parameter(Mandatory = $true)][string]$Tag,
  [string]$Repo = "wuli2025/teacher-agent",
  [string]$Bucket = "teacher-agent-dist",
  # 自定义域（v1.0.3+ 客户端的第一顺位）。r2.dev 是同一个桶的另一个门，
  # v1.0.2 及更早的客户端写死走它；两者同桶，验一个即可证明对象已就位。
  [string]$PublicBase = "https://teacher-dl.llmwiki.cloud/downloads"
)

$ErrorActionPreference = "Stop"
$version = $Tag.TrimStart("v")

$dir = Join-Path $env:TEMP "teacher-agent-dist-$version"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
New-Item -ItemType Directory -Path $dir -Force | Out-Null

Write-Host "→ 从 $Repo 的 $Tag 拉取 Release 资产..."
gh release download $Tag -R $Repo -D $dir --clobber
if ($LASTEXITCODE -ne 0) { throw "拉取 Release 资产失败：$Tag 是否已发布？" }

# latest.json 必须在，它是客户端 endpoints 的第一顺位；缺了这次上传就没意义。
$latestPath = Join-Path $dir "latest.json"
if (-not (Test-Path $latestPath)) { throw "Release $Tag 里没有 latest.json，发版 CI 可能没跑完" }
$got = (Get-Content $latestPath -Raw | ConvertFrom-Json).version
if ($got -ne $version) { throw "latest.json 里的版本是 $got，与 $Tag 对不上" }

# wrangler r2 object put 是单次 PUT，硬上限 300 MiB。v1.0.11 起 mac 的 .app.tar.gz /
# .dmg 都涨过了这条线：不跳过的话第一个文件就抛异常，Windows 包与 latest.json 一起传不上去。
# 跳过的同时要删掉桶里的同名旧对象 —— mac 更新包文件名不带版本号，留着旧的会让客户端
# 白下几百 MB 再验签失败；删掉则 404 快速回落 gh-proxy/github。
$LIMIT = 300MB
$all = Get-ChildItem $dir -File | Where-Object { $_.Name -ne "latest.json" }
$assets = @()
$skipped = @()
foreach ($f in $all) {
  if ($f.Length -gt $LIMIT) {
    "   ⏭ 跳过 {0,-40} {1,7:N1} MB（> 300 MiB 上限，该平台走 github 镜像）" -f $f.Name, ($f.Length / 1MB) | Write-Host
    $skipped += $f.Name
    npx --yes wrangler@4 r2 object delete "$Bucket/downloads/$($f.Name)" --remote 2>&1 | Out-Null
    continue
  }
  "   → 上传 {0,-40} {1,7:N1} MB" -f $f.Name, ($f.Length / 1MB) | Write-Host
  npx --yes wrangler@4 r2 object put "$Bucket/downloads/$($f.Name)" --file $f.FullName --remote
  if ($LASTEXITCODE -ne 0) { throw "上传失败：$($f.Name)" }
  $assets += $f
}
# Windows 装包是自托管的主路径，它没上去等于这条源没意义。
if ($skipped | Where-Object { $_ -match 'x64-setup\.exe$' }) {
  throw "Windows 装包超过 300 MiB，自托管主路径断了：需改用 S3 多段上传或压缩体积"
}
npx --yes wrangler@4 r2 object put "$Bucket/downloads/latest.json" `
  --file $latestPath --content-type application/json --remote
if ($LASTEXITCODE -ne 0) { throw "上传 latest.json 失败" }

# 只看 HTTP 200 不够：得真解析出版本号、且每个包都真能下，才算这条源可用。
Write-Host "→ 验证自托管端点..."
foreach ($i in 1..5) {
  try {
    $r = Invoke-RestMethod "$PublicBase/latest.json" -TimeoutSec 20
    if ($r.version -eq $version) {
      foreach ($f in $assets) {
        $code = (Invoke-WebRequest "$PublicBase/$($f.Name)" -Method Head -TimeoutSec 30).StatusCode
        if ($code -ne 200) { throw "自托管缺包：$code $($f.Name)" }
        Write-Host "   ✓ 200 $($f.Name)"
      }
      if ($skipped) { Write-Host "  ⏭ 未上自托管（超 300 MiB，走 github 镜像）：$($skipped -join ', ')" }
      Write-Host "✓ 自托管源已是 $version，装包齐全"
      exit 0
    }
    Write-Host "   第 $i 次：拿到 $($r.version)，期望 $version，10s 后重试"
  } catch {
    Write-Host "   第 $i 次：$($_.Exception.Message)，10s 后重试"
  }
  Start-Sleep -Seconds 10
}
throw "自托管 latest.json 未同步到 $version（边缘生效有延迟，可稍后再验一次）"
