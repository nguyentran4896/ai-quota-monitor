param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

try {
  $rawInput = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($rawInput)) {
    Write-Output 'QuotaDeck - waiting for quota data'
    exit 0
  }

  $inputData = $rawInput | ConvertFrom-Json
  $normalizedLimits = [ordered]@{}

  if ($null -ne $inputData.rate_limits.five_hour) {
    $normalizedLimits.fiveHour = [ordered]@{
      usedPercent = [double]$inputData.rate_limits.five_hour.used_percentage
      resetsAt = [long]$inputData.rate_limits.five_hour.resets_at
    }
  }
  if ($null -ne $inputData.rate_limits.seven_day) {
    $normalizedLimits.sevenDay = [ordered]@{
      usedPercent = [double]$inputData.rate_limits.seven_day.used_percentage
      resetsAt = [long]$inputData.rate_limits.seven_day.resets_at
    }
  }

  if ($normalizedLimits.Count -eq 0) {
    Write-Output 'QuotaDeck - waiting for first Claude response'
    exit 0
  }

  $snapshot = [ordered]@{
    schemaVersion = 1
    observedAt = [DateTime]::UtcNow.ToString('o')
    cliVersion = if ($inputData.version) { [string]$inputData.version } else { $null }
    rateLimits = $normalizedLimits
  }

  $outputDirectory = [IO.Path]::GetDirectoryName($OutputPath)
  [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
  $temporaryPath = "${OutputPath}.${PID}.tmp"
  $snapshot | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath $temporaryPath -Encoding UTF8 -NoNewline
  Move-Item -LiteralPath $temporaryPath -Destination $OutputPath -Force

  $segments = @()
  if ($normalizedLimits.fiveHour) {
    $segments += ('5h {0:N0}% used' -f $normalizedLimits.fiveHour.usedPercent)
  }
  if ($normalizedLimits.sevenDay) {
    $segments += ('7d {0:N0}% used' -f $normalizedLimits.sevenDay.usedPercent)
  }
  Write-Output ('QuotaDeck - ' + ($segments -join ' | '))
} catch {
  # Status-line failures must not disrupt the user's Claude session or expose input data.
  Write-Output 'QuotaDeck - quota capture unavailable'
  exit 0
}
