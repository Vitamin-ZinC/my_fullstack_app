param(
  [string]$ApiUrl = "https://orken.life",
  [string]$PasswordFile = ".runtime/docs-access-password.txt",
  [string]$SeenFile = ".runtime/founder-inbox-watcher-seen.json",
  [int]$Limit = 50,
  [switch]$IncludeNormal
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PasswordFile)) {
  throw "Docs password file not found: $PasswordFile"
}

$password = (Get-Content -LiteralPath $PasswordFile -Raw).Trim()
if (-not $password) {
  throw "Docs password file is empty: $PasswordFile"
}

$seen = @{}
if (Test-Path -LiteralPath $SeenFile) {
  try {
    $rawSeen = Get-Content -LiteralPath $SeenFile -Raw | ConvertFrom-Json
    foreach ($property in $rawSeen.PSObject.Properties) {
      $seen[$property.Name] = [bool]$property.Value
    }
  } catch {
    $seen = @{}
  }
}

$body = @{
  password = $password
  limit = $Limit
} | ConvertTo-Json -Depth 4

$response = Invoke-RestMethod -Method Post -Uri "$($ApiUrl.TrimEnd('/'))/api/docs/intake/list" -ContentType "application/json" -Body $body
$items = @($response.items)
$terminalStatuses = @("DONE", "IGNORED", "REJECTED", "ANSWERED_BY_BACKEND")
$candidates = $items | Where-Object {
  $terminalStatuses -notcontains $_.codexStatus -and
  ($_.codexStatus -eq "QUEUED" -or $_.queueStatus -eq "QUEUED" -or $_.priority -eq "URGENT") -and
  ($IncludeNormal -or $_.priority -eq "URGENT" -or $_.codexStatus -eq "QUEUED") -and
  -not $seen.ContainsKey($_.id)
}

foreach ($item in $candidates) {
  $seen[$item.id] = $true
}

$seenDir = Split-Path -Parent $SeenFile
if ($seenDir -and -not (Test-Path -LiteralPath $seenDir)) {
  New-Item -ItemType Directory -Path $seenDir | Out-Null
}
$seen | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $SeenFile -Encoding UTF8

[pscustomobject]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  total = $items.Count
  newCount = @($candidates).Count
  newItems = @($candidates | Select-Object id, title, type, priority, decision, queueStatus, codexStatus, bridgeStatus, summary, sanitizedBody, createdAt)
} | ConvertTo-Json -Depth 8
