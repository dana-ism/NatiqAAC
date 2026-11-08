# Run from backend after reviewing docs/admin.md. No password in args/history/env.
$ErrorActionPreference = 'Stop'
$bootstrapName = Read-Host 'Full name'
$bootstrapEmail = Read-Host 'Email'
$bootstrapPassword = Read-Host 'Password' -AsSecureString
$bootstrapConfirmation = Read-Host 'Repeat password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapPassword)
$confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapConfirmation)
$previousEncoding = $OutputEncoding
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
    if ($plainPassword -cne $plainConfirmation) { throw 'Passwords do not match' }
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    @{ fullName = $bootstrapName; email = $bootstrapEmail; password = $plainPassword } |
        ConvertTo-Json -Compress | node dist/admin/bootstrap-command.js
    if ($LASTEXITCODE -ne 0) { throw 'Bootstrap did not succeed; see docs/admin.md' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
    $plainPassword = $null
    $plainConfirmation = $null
    $bootstrapPassword.Dispose()
    $bootstrapConfirmation.Dispose()
    $OutputEncoding = $previousEncoding
}
