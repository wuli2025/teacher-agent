# 用真 PowerPoint 把导出的 .pptx 逐页渲成 PNG —— goal 第六节 2.「必须重新渲染最终导出的实际 PPTX」
# 用法: pwsh -File render_pptx.ps1 -Pptx <绝对路径.pptx> -Out <输出目录> [-Width 1600]
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 1600
)
$ErrorActionPreference = "Stop"
$Pptx = (Resolve-Path $Pptx).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
Get-ChildItem $Out -Filter *.png -ErrorAction SilentlyContinue | Remove-Item -Force

$app = New-Object -ComObject PowerPoint.Application
try {
  # msoTrue=-1: PowerPoint 不允许隐藏主窗口，用 WithWindow:=msoFalse 打开即可
  $pres = $app.Presentations.Open($Pptx, $true, $false, $false)   # ReadOnly, Untitled, WithWindow=false
  $h = [int]($Width * 9 / 16)
  $pres.Export($Out, "PNG", $Width, $h)
  $n = $pres.Slides.Count
  $pres.Close()
  $files = Get-ChildItem $Out -Include *.png -Recurse | Sort-Object Name
  Write-Output "导出 $($files.Count)/$n 页 -> $Out"
}
finally {
  try { $app.Quit() } catch {}
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
