# Samples the test server (the process listening on port 4100) every 2 seconds: CPU seconds, memory, threads, handles.
param([string]$Out = "$PSScriptRoot\server-resources.csv", [int]$Seconds = 400)
$conn = Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction Stop | Select-Object -First 1
$procId = $conn.OwningProcess
"time,cpu_seconds,working_set_mb,threads,handles" | Out-File -FilePath $Out -Encoding ascii
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $p) { break }
  ("{0},{1:N2},{2:N1},{3},{4}" -f (Get-Date -Format "HH:mm:ss"), $p.CPU, ($p.WorkingSet64 / 1MB), $p.Threads.Count, $p.HandleCount) | Out-File -FilePath $Out -Append -Encoding ascii
  Start-Sleep -Seconds 2
}
