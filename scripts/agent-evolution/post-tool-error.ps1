param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pythonScript = Join-Path $PSScriptRoot "post-tool-error.py"

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python $pythonScript @Arguments
    exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $pythonScript @Arguments
    exit $LASTEXITCODE
}

throw "Python is required to run $pythonScript"
