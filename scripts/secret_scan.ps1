Param(
  [string]$Root = "."
)

$ErrorActionPreference = "Stop"

$patterns = @(
  "AIza[0-9A-Za-z\-_]{20,}",
  "sk-[0-9A-Za-z\-_]{20,}",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[0-9A-Za-z\-_]+\.[0-9A-Za-z\-_]+",
  "SG\.[0-9A-Za-z\-_]{16,}\.[0-9A-Za-z\-_]{16,}"
)

$tracked = & git -C $Root ls-files
if (-not $tracked) {
  Write-Host "No tracked files found to scan." -ForegroundColor Yellow
  exit 0
}

$findings = @()
foreach ($rel in $tracked) {
  $filePath = Join-Path $Root $rel
  if (-not (Test-Path $filePath -PathType Leaf)) { continue }
  foreach ($pattern in $patterns) {
    $matches = Select-String -Path $filePath -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue
    foreach ($m in $matches) {
      $findings += [PSCustomObject]@{
        File = $filePath
        Line = $m.LineNumber
        Match = $m.Line.Trim()
        Pattern = $pattern
      }
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Host "Potential secrets detected:" -ForegroundColor Yellow
  $findings | Select-Object File, Line, Pattern, Match | Format-Table -AutoSize
  exit 1
}

Write-Host "No high-signal secret patterns detected." -ForegroundColor Green
exit 0
