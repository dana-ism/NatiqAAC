param([Parameter(Mandatory = $true)][string]$CaFile)
$ErrorActionPreference = 'Stop'
$previous = @{}
foreach ($key in @('NODE_ENV', 'NATIQ_SUPABASE_DEV_BOOTSTRAP', 'NATIQ_SUPABASE_DEV_PROJECT_REF', 'NATIQ_SUPABASE_DEV_CA_FILE')) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
$previousEncoding = $OutputEncoding
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (-not (Test-Path -LiteralPath 'dist/admin/supabase-dev-command.js')) { throw 'Build backend before running this command' }
    $env:NODE_ENV = 'development'
    $env:NATIQ_SUPABASE_DEV_CA_FILE = (Resolve-Path -LiteralPath $CaFile).Path
    $env:NATIQ_SUPABASE_DEV_PROJECT_REF = Read-Host 'Confirmed DEVELOPMENT project reference'
    $env:NATIQ_SUPABASE_DEV_BOOTSTRAP = Read-Host 'Type CREATE_FIRST_ADMIN_IN_DEVELOPMENT to authorize one initial Admin'
    node dist/admin/supabase-dev-command.js --check
    if ($LASTEXITCODE -ne 0) { throw 'Preflight refused; no account details will be requested' }
    $bootstrapName = Read-Host 'Admin full name'
    $bootstrapEmail = Read-Host 'Admin email'
    $bootstrapPassword = Read-Host 'Admin password' -AsSecureString
    $bootstrapConfirmation = Read-Host 'Repeat password' -AsSecureString
    $passwordPointer = [IntPtr]::Zero
    $confirmationPointer = [IntPtr]::Zero
    try {
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapPassword)
        $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapConfirmation)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
        if ($plainPassword -cne $plainConfirmation) { throw 'Passwords do not match' }
        $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        @{fullName = $bootstrapName; email = $bootstrapEmail; password = $plainPassword} |
            ConvertTo-Json -Compress | node dist/admin/supabase-dev-command.js
        if ($LASTEXITCODE -ne 0) { throw 'Bootstrap stopped. Inspect the read-only account state before retrying.' }
    } finally {
        if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
        if ($confirmationPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer) }
        $plainPassword = $null
        $plainConfirmation = $null
        $bootstrapPassword.Dispose()
        $bootstrapConfirmation.Dispose()
    }
} finally {
    $OutputEncoding = $previousEncoding
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
    Pop-Location
}
