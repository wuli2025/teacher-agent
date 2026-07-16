# ─────────────────────────────────────────────────────────────
# 把某个版本的安装包 + latest.json 同步到自托管更新源（Cloudflare R2）。
#
# 什么时候用它：
#   · 仓库没配 CLOUDFLARE_API_TOKEN → release.yml 的自托管那步会跳过，用这个补上；
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
  [string]$PublicBase = "https://pub-667c9f15cb424a8db14d7b4ef7bbb481.r2.dev/downloads"
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

# latest.json 最后传：装包先就位，避免「latest.json 已指新版、包还没上去」的空窗期。
$assets = Get-ChildItem $dir -File | Where-Object { $_.Name -ne "latest.json" }
foreach ($f in $assets) {
  "   → {0,-40} {1,7:N1} MB" -f $f.Name, ($f.Length / 1MB) | Write-Host
  npx --yes wrangler@4 r2 object put "$Bucket/downloads/$($f.Name)" --file $f.FullName --remote
  if ($LASTEXITCODE -ne 0) { throw "上传失败：$($f.Name)" }
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
