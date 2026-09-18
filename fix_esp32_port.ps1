# Fix ESP32 COM port conflict with Bluetooth
try {
    Write-Host "Resolving ESP32 port conflict..." -ForegroundColor Cyan

    # 1. Change CP210x to COM12
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Enum\USB\VID_10C4&PID_EA60\0001\Device Parameters" -Name "PortName" -Value "COM12" -Force
    Write-Host "Set CP210x PortName to COM12." -ForegroundColor Green

    # 2. Restart CP210x PnP device
    pnputil /restart-device "USB\VID_10C4&PID_EA60\0001"
    Write-Host "Restarted CP210x device." -ForegroundColor Green

    # 3. Disable conflicting Bluetooth COM3 if present
    Get-PnpDevice | Where-Object { $_.FriendlyName -like "*Bluetooth*COM3*" } | ForEach-Object {
        Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false
        Write-Host "Disabled conflicting Bluetooth COM3 link: $($_.InstanceId)" -ForegroundColor Yellow
    }

    Write-Host "Success! The ESP32 should now be active on COM12." -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 3
