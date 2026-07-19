function Invoke-CheckedNativeCommand {
  [CmdletBinding()]
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [switch]$CaptureOutput
  )

  if ($CaptureOutput) {
    $output = & $FilePath @Arguments 2>&1
  } else {
    & $FilePath @Arguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }

  if ($CaptureOutput) {
    return (($output | Out-String).Trim())
  }
}

function Get-PinnedPnpmVersion {
  [CmdletBinding()]
  param([string]$ProjectRoot)

  $package = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
  $packageManager = [string]$package.packageManager
  if ($packageManager -notmatch '^pnpm@(?<Version>\d+\.\d+\.\d+)$') {
    throw "package.json must pin packageManager to an exact pnpm version."
  }
  return $Matches.Version
}
