#requires -Version 5.1

[CmdletBinding()]
param(
  [switch]$SkipCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-development-common.ps1")

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$doctor = Join-Path $PSScriptRoot "windows-doctor.ps1"

Write-Host "Preparing QuotaDeck for native Windows development..." -ForegroundColor Cyan
& $doctor -SkipPnpm
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$pnpmVersion = Get-PinnedPnpmVersion -ProjectRoot $projectRoot
$userNpmDirectory = Join-Path $env:APPDATA "npm"
New-Item -ItemType Directory -Path $userNpmDirectory -Force | Out-Null

$corepack = Get-Command "corepack.cmd" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $corepack) {
  Write-Host "Activating pnpm $pnpmVersion with Corepack in $userNpmDirectory..."
  Invoke-CheckedNativeCommand -FilePath $corepack.Source -Arguments @(
    "enable",
    "--install-directory",
    $userNpmDirectory
  )
  Invoke-CheckedNativeCommand -FilePath $corepack.Source -Arguments @(
    "install",
    "--global",
    "pnpm@$pnpmVersion"
  )
} else {
  $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $npm) {
    throw "Neither Corepack nor npm.cmd is available. Repair the native Windows Node.js installation."
  }
  Write-Host "Corepack is unavailable; installing pnpm $pnpmVersion into the Windows user npm directory..."
  Invoke-CheckedNativeCommand -FilePath $npm.Source -Arguments @(
    "install",
    "--global",
    "pnpm@$pnpmVersion"
  )
}

$remainingPathEntries = @(
  $env:Path -split ';' |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_ -ne $userNpmDirectory }
)
$env:Path = (@($userNpmDirectory) + $remainingPathEntries) -join ';'
$pnpm = Join-Path $userNpmDirectory "pnpm.cmd"
if (-not (Test-Path $pnpm)) {
  throw "pnpm.cmd was not created in $userNpmDirectory."
}

$userPathEntries = @(
  [System.Environment]::GetEnvironmentVariable("Path", "User") -split ';' |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
)
if ($userPathEntries -notcontains $userNpmDirectory) {
  $updatedUserPath = ($userPathEntries + $userNpmDirectory) -join ';'
  [System.Environment]::SetEnvironmentVariable("Path", $updatedUserPath, "User")
  Write-Host "Added $userNpmDirectory to the Windows user PATH."
}

Push-Location $projectRoot
try {
  Write-Host "Installing locked dependencies..."
  Invoke-CheckedNativeCommand -FilePath $pnpm -Arguments @("install", "--frozen-lockfile")

  & $doctor
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  if (-not $SkipCheck) {
    Write-Host "Running the full Windows validation suite..."
    Invoke-CheckedNativeCommand -FilePath $pnpm -Arguments @("check")
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "QuotaDeck is ready for native Windows development." -ForegroundColor Green
Write-Host "Start it with: pnpm windows:dev"
