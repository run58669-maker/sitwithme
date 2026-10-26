param(
    [string]$ThreadId = "01a175f8-0883-7641-b5d9-6e3974e7582a"
)

$ErrorActionPreference = "Stop"

function Protect-Text {
    param([AllowEmptyString()][string]$Text)

    if ($null -eq $Text) {
        return ""
    }

    $safe = $Text -replace "`r?`n", " "
    $safe = $safe -replace "\s+", " "

    $escapedHome = [regex]::Escape($HOME.TrimEnd('\', '/'))
    $safe = $safe -replace "(?i)$escapedHome", "~"
    $safe = $safe -replace "(?i)[A-Z]:\\Users\\[^\\\s]+", "~"
    $safe = $safe -replace "(?i)/Users/[^/\s]+", "~"

    $safe = $safe -replace '(?i)(\$env:[A-Z_][A-Z0-9_]*\s*=\s*)(''[^'']*''|"[^"]*"|[^\s;]+)', '$1<redacted>'
    $safe = $safe -replace '(?i)\b([A-Z][A-Z0-9_]{2,})=([^\s,;]+)', '$1=<redacted>'
    $safe = $safe -replace '(?i)("?(access_token|refresh_token|client_secret|api_key|password)"?\s*:\s*)("[^"]*"|''[^'']*''|[^,\s}]+)', '$1<redacted>'
    $safe = $safe -replace '(?i)\b(access_token|refresh_token|client_secret|api_key|password)\b\s*[:=]\s*([^\s,;]+)', '$1=<redacted>'
    $safe = $safe -replace '(?i)\b(Bearer|OAuth)\s+[A-Za-z0-9._~-]+', '$1 <redacted-token>'
    $safe = $safe -replace '\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '<redacted-token>'
    $safe = $safe -replace '(?i)\b(gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b', '<redacted-token>'

    return $safe.Trim()
}

function Limit-Text {
    param(
        [string]$Text,
        [int]$Length = 160
    )

    if ($Text.Length -le $Length) {
        return $Text
    }

    return $Text.Substring(0, $Length - 1) + [char]0x2026
}

$sessionRoot = Join-Path $HOME ".codex\sessions"
$rollout = Get-ChildItem -LiteralPath $sessionRoot -Recurse -File -Filter "*$ThreadId*.jsonl" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($null -eq $rollout) {
    throw "No rollout JSONL found for thread $ThreadId."
}

$repoRoot = (Split-Path -Parent $PSScriptRoot).TrimEnd('\', '/')
$users = New-Object System.Collections.Generic.List[string]
$files = New-Object System.Collections.Generic.List[string]
$stream = $null
$reader = $null

try {
    $shareMode = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $stream = New-Object System.IO.FileStream(
        $rollout.FullName,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        $shareMode
    )
    $reader = New-Object System.IO.StreamReader($stream)

    while (($line = $reader.ReadLine()) -ne $null) {
        try {
            $entry = $line | ConvertFrom-Json
        }
        catch {
            continue
        }

        if ($entry.type -ne "response_item") {
            continue
        }

        $payload = $entry.payload
        if ($payload.type -eq "message" -and $payload.role -eq "user") {
            $parts = @(
                $payload.content |
                    Where-Object { $_.type -eq "input_text" } |
                    ForEach-Object { $_.text }
            )
            $message = Protect-Text ($parts -join " ")
            if ($message) {
                $users.Add((Limit-Text $message))
            }
            continue
        }

        if ($payload.type -ne "custom_tool_call" -or $payload.name -ne "exec") {
            continue
        }

        $inputText = [string]$payload.input
        $matches = [regex]::Matches(
            $inputText,
            '\*\*\* (Add|Update|Delete) File: (.*?)(?:\\n|\r?\n)'
        )

        foreach ($match in $matches) {
            $operation = $match.Groups[1].Value
            $path = $match.Groups[2].Value.Trim().Replace('\\', '\')

            if ($path.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                $path = $path.Substring($repoRoot.Length).TrimStart('\', '/')
            }

            $path = Protect-Text $path
            $files.Add("[$operation] $path")
        }
    }
}
catch {
    throw "Could not read the rollout JSONL for thread $ThreadId."
}
finally {
    if ($null -ne $reader) {
        $reader.Dispose()
    }
    elseif ($null -ne $stream) {
        $stream.Dispose()
    }
}

$displayRollout = Protect-Text $rollout.FullName

Write-Output "Codex thread evidence"
Write-Output "Thread: $ThreadId"
Write-Output "Rollout: $displayRollout"
Write-Output ""
Write-Output "User messages"
for ($index = 0; $index -lt $users.Count; $index++) {
    Write-Output ("USER {0:D2}: {1}" -f ($index + 1), $users[$index])
}

Write-Output ""
Write-Output "File write/patch events"
for ($index = 0; $index -lt $files.Count; $index++) {
    Write-Output ("FILE {0:D3}: {1}" -f ($index + 1), $files[$index])
}

Write-Output ""
Write-Output "Totals"
Write-Output "User messages: $($users.Count)"
Write-Output "File write/patch events: $($files.Count)"
Write-Output "Unique files: $(@($files | Sort-Object -Unique).Count)"
