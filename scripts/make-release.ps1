param(
    [string]$Version = "1.1.0"
)
# 把 release-build 里的应用打成 zip（zip 根目录：DSH Desktop/ + 使用说明.txt）
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root "release-build\DSH Desktop-win32-x64"
if (-not (Test-Path $appDir)) { throw "未找到 $appDir，请先运行 electron-packager（npm run pack:release 会自动执行）" }

$releaseDir = Join-Path $root "release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$zipPath = Join-Path $releaseDir "DSH-Desktop-v$Version-win32-x64.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$tmp = Join-Path $env:TEMP "dsh-release-$PID"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Copy-Item -Recurse $appDir (Join-Path $tmp "DSH Desktop")
Copy-Item (Join-Path $root "使用说明.txt") (Join-Path $tmp "使用说明.txt")

Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $tmp -Recurse -Force

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Output "release zip: $zipPath ($mb MB)"
