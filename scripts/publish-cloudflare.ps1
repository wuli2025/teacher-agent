# ─────────────────────────────────────────────────────────────
# 把某个版本的安装包 + latest.json 同步到自托管更新站 teacher-agent.pages.dev
#
# 什么时候用它：
#   · 仓库没配 CLOUDFLARE_API_TOKEN → release.yml 的自托管那步会跳过，用这个补上；
#   · 自托管源供了旧包 / Pages 部署失败 → 手动重发。
#
# 平时不需要手跑：配了 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID 后，
# release.yml 的 publish job 会自动做同样的事。
#
# 依赖：gh（已登录）+ npx wrangler（已 `wrangler login`，本机是 OAuth，不用 API token）。
#
# 用法：
#   pwsh scripts/publish-cloudflare.ps1 -Tag v1.0.2
# ─────────────────────────────────────────────────────────────
param(
  [Parameter(Mandatory = $true)][string]$Tag,
  [string]$Repo = "wuli2025/teacher-agent",
  [string]$Project = "teacher-agent"
)

$ErrorActionPreference = "Stop"
$version = $Tag.TrimStart("v")

# 站点内容整个重建：Pages 每次 deploy 是「整站快照」，留着上一版的残留会让
# downloads/ 里堆旧包。只保留本版 = 与 GitHub Release 一一对应。
$site = Join-Path $env:TEMP "teacher-agent-site"
if (Test-Path $site) { Remove-Item $site -Recurse -Force }
$downloads = New-Item -ItemType Directory -Path (Join-Path $site "downloads") -Force

Write-Host "→ 从 $Repo 的 $Tag 拉取 Release 资产..."
gh release download $Tag -R $Repo -D $downloads.FullName --clobber
if ($LASTEXITCODE -ne 0) { throw "拉取 Release 资产失败：$Tag 是否已发布？" }

# latest.json 必须在，它是客户端 endpoints 的第一顺位；缺了这次部署就没意义。
$latest = Join-Path $downloads.FullName "latest.json"
if (-not (Test-Path $latest)) { throw "Release $Tag 里没有 latest.json，发版 CI 可能没跑完" }

$got = (Get-Content $latest -Raw | ConvertFrom-Json).version
if ($got -ne $version) { throw "latest.json 里的版本是 $got，与 $Tag 对不上" }

Get-ChildItem $downloads.FullName | ForEach-Object {
  "   {0,-52} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB)
}

Write-Host "→ 部署到 Cloudflare Pages ($Project)..."
npx --yes wrangler pages deploy $site --project-name $Project --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw "wrangler 部署失败" }

# 只看 HTTP 200 不够：Pages 对未知路径可能回 200 的 HTML，得真解析出版本号才算数。
Write-Host "→ 验证自托管端点..."
foreach ($i in 1..5) {
  try {
    $r = Invoke-RestMethod "https://$Project.pages.dev/downloads/latest.json" -TimeoutSec 20
    if ($r.version -eq $version) { Write-Host "✓ 自托管 latest.json 已是 $version"; exit 0 }
    Write-Host "   第 $i 次：拿到 $($r.version)，期望 $version，10s 后重试"
  } catch {
    Write-Host "   第 $i 次：$($_.Exception.Message)，10s 后重试"
  }
  Start-Sleep -Seconds 10
}
throw "自托管 latest.json 未同步到 $version（Pages 边缘生效有延迟，可稍后再验一次）"
