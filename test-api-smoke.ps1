# Script de Smoke Test para el API
$apiUrl = "http://localhost:5002/api/health"

Write-Host "Probando conexión a $apiUrl..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -Method Get
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ API Health Check Exitoso!" -ForegroundColor Green
        Write-Host "Respuesta:"
        Write-Host $response.Content
    } else {
        Write-Host "❌ API Health Check Falló con código: $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error al conectar con el API: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Asegúrate de que el servidor esté corriendo (npm start en Server/)" -ForegroundColor Yellow
}
