#requires -Version 5.1

[CmdletBinding()]
param(
  [switch]$SkipPnpm
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-development-common.ps1")

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$failures = New-Object "System.Collections.Generic.List[string]"
$warnings = New-Object "System.Collections.Generic.List[string]"

function Write-Check {
  param(
    [ValidateSet("OK", "WARN", "FAIL")]
    [string]$Status,
    [string]$Message
  )

  $color = switch ($Status) {
    "OK" { "Green" }
    "WARN" { "Yellow" }
    default { "Red" }
  }
  Write-Host "[$Status] $Message" -ForegroundColor $color
}

function Add-Failure {
  param([string]$Message)
  $failures.Add($Message)
  Write-Check -Status "FAIL" -Message $Message
}

function Add-Warning {
  param([string]$Message)
  $warnings.Add($Message)
  Write-Check -Status "WARN" -Message $Message
}

function Find-NativeCommand {
  param([string[]]$Names)

  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) {
      return $command
    }
  }
  return $null
}

Write-Host "QuotaDeck native Windows development doctor" -ForegroundColor Cyan
Write-Host "Repository: $projectRoot"
Write-Host ""

$isWindows = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
if (-not $isWindows) {
  Write-Check -Status "FAIL" -Message "This workflow must run in native Windows PowerShell."
  exit 1
}

$isWslInterop = -not [string]::IsNullOrWhiteSpace($env:WSL_INTEROP) -or
  -not [string]::IsNullOrWhiteSpace($env:WSL_DISTRO_NAME)
$isWslShare = $projectRoot -match '^\\\\(?:wsl\$|wsl\.localhost)\\'
if ($isWslInterop -or $isWslShare) {
  Write-Check -Status "FAIL" -Message "WSL interop was detected. Open a normal Windows PowerShell terminal and use the checkout on a Windows drive."
  exit 1
}
Write-Check -Status "OK" -Message "Running directly on Windows without WSL interop."

if ($projectRoot -notmatch '^[A-Za-z]:\\') {
  Add-Failure "The repository must be checked out on a local Windows drive; UNC and remote filesystem paths are unsupported."
} else {
  Write-Check -Status "OK" -Message "Repository is on a local Windows drive."
}

$gitCommand = Find-NativeCommand -Names @("git.exe", "git.cmd")
if ($null -eq $gitCommand) {
  Add-Failure "Git for Windows is missing from PATH. Install it from https://git-scm.com/download/win."
} else {
  try {
    $gitVersion = Invoke-CheckedNativeCommand -FilePath $gitCommand.Source -Arguments @("--version") -CaptureOutput
    Write-Check -Status "OK" -Message "$gitVersion ($($gitCommand.Source))"
  } catch {
    Add-Failure $_.Exception.Message
  }
}

$nodeCommand = Find-NativeCommand -Names @("node.exe")
if ($null -eq $nodeCommand) {
  Add-Failure "Native Node.js is missing from PATH. Install Node.js 22 or newer for Windows x64."
} else {
  try {
    $nodePlatform = Invoke-CheckedNativeCommand -FilePath $nodeCommand.Source -Arguments @("-p", "process.platform") -CaptureOutput
    $nodeArchitecture = Invoke-CheckedNativeCommand -FilePath $nodeCommand.Source -Arguments @("-p", "process.arch") -CaptureOutput
    $nodeVersion = Invoke-CheckedNativeCommand -FilePath $nodeCommand.Source -Arguments @("--version") -CaptureOutput
    $nodeMajor = [int](($nodeVersion.TrimStart("v") -split '\.')[0])
    if ($nodePlatform -ne "win32") {
      Add-Failure "Node.js must be the native Windows build; found $nodePlatform/$nodeArchitecture."
    } elseif ($nodeMajor -lt 22) {
      Add-Failure "Node.js 22 or newer is required; found $nodeVersion."
    } else {
      Write-Check -Status "OK" -Message "Node.js $nodeVersion for $nodePlatform/$nodeArchitecture ($($nodeCommand.Source))"
      if ($nodeArchitecture -ne "x64") {
        Add-Warning "Node.js is $nodeArchitecture, not x64. Development, typechecking, and tests work; only 'pnpm windows:package --x64' requires an x64 Node.js (or x64 emulation)."
      }
    }
  } catch {
    Add-Failure $_.Exception.Message
  }
}

if (-not $SkipPnpm) {
  try {
    $expectedPnpmVersion = Get-PinnedPnpmVersion -ProjectRoot $projectRoot
    $pnpmCommand = Find-NativeCommand -Names @("pnpm.cmd", "pnpm.exe", "pnpm.ps1")
    if ($null -eq $pnpmCommand) {
      Add-Failure "pnpm is missing from PATH. Run .\\scripts\\windows-setup.ps1 once."
    } else {
      $pnpmVersion = Invoke-CheckedNativeCommand -FilePath $pnpmCommand.Source -Arguments @("--version") -CaptureOutput
      if ($pnpmVersion -ne $expectedPnpmVersion) {
        Add-Failure "pnpm $expectedPnpmVersion is required; found $pnpmVersion. Run .\\scripts\\windows-setup.ps1."
      } else {
        Write-Check -Status "OK" -Message "pnpm $pnpmVersion ($($pnpmCommand.Source))"
        if ($pnpmCommand.Source -match '\\.cache\\codex-runtimes\\') {
          Add-Warning "pnpm currently comes from Codex's bundled runtime. Run .\\scripts\\windows-setup.ps1 to create a persistent Windows user shim."
        }
      }
    }
  } catch {
    Add-Failure $_.Exception.Message
  }
}

$terminalCommand = Find-NativeCommand -Names @("wt.exe")
if ($null -eq $terminalCommand) {
  Add-Warning "Windows Terminal is not on PATH; QuotaDeck development still works in PowerShell."
} else {
  Write-Check -Status "OK" -Message "Windows Terminal is available."
}

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
  Add-Warning "Dependencies are not installed yet. Run pnpm windows:setup."
}

Write-Host ""
if ($failures.Count -gt 0) {
  Write-Host "Native Windows development is not ready: $($failures.Count) required check(s) failed." -ForegroundColor Red
  exit 1
}

if ($warnings.Count -gt 0) {
  Write-Host "Native Windows development is ready with $($warnings.Count) optional warning(s)." -ForegroundColor Yellow
}
Write-Host "Native Windows development environment is ready." -ForegroundColor Green
exit 0
