# Hipno App - Iniciar servidor local
Write-Host "🧘 Iniciando Hipno App..." -ForegroundColor Magenta
Write-Host ""

# Ir al directorio de la app
Set-Location "$PSScriptRoot"

# Verificar si existe dist
if (-not (Test-Path "dist")) {
    Write-Host "❌ No existe la carpeta dist. Ejecuta 'npm run build' primero." -ForegroundColor Red
    exit 1
}

# Iniciar servidor
Write-Host "📱 Abre tu navegador en: http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona Ctrl+C para detener el servidor" -ForegroundColor Yellow
Write-Host ""

# Usar npx serve para servir la app
npx serve -s dist -l 8080