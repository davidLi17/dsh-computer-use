# Runs the compiled helper inside the signed powershell.exe, for machines where
# Smart App Control (or another code-integrity policy) refuses to start the
# unsigned cu-helper.exe. Loading the assembly from bytes maps no executable
# image, so the policy has nothing to check. stdin / stdout stay the helper's
# JSON pipes: nothing here may write to stdout.
param([Parameter(Mandatory = $true)][string]$HelperExe)
$ErrorActionPreference = 'Stop'
$assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($HelperExe))
$code = $assembly.EntryPoint.Invoke($null, [object[]]@(, [string[]]@()))
exit [int]$code
