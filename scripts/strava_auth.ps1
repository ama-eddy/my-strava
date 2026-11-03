# Autorizza la tua app Strava personale a leggere le attività e stampa il refresh token.
# Da lanciare una volta sola, a mano:
#   powershell -ExecutionPolicy Bypass -File scripts\strava_auth.ps1
# Nell'app su strava.com/settings/api il "Authorization Callback Domain" deve essere: localhost

$clientId = Read-Host "Client ID"
$clientSecret = Read-Host "Client Secret"

$url = "https://www.strava.com/oauth/authorize?client_id=$clientId&response_type=code" +
       "&redirect_uri=http://localhost&approval_prompt=force&scope=activity:read_all"
Start-Process $url

Write-Host ""
Write-Host "Nel browser premi 'Autorizza'. Si aprira' una pagina che non carica (localhost): e' normale."
Write-Host "Copia dall'indirizzo il valore tra 'code=' e '&scope'."
$code = Read-Host "Code"

$resp = Invoke-RestMethod -Method Post -Uri "https://www.strava.com/oauth/token" -Body @{
    client_id     = $clientId
    client_secret = $clientSecret
    code          = $code
    grant_type    = "authorization_code"
}

Write-Host ""
Write-Host "Autorizzato come $($resp.athlete.firstname) $($resp.athlete.lastname)."
Write-Host "STRAVA_REFRESH_TOKEN = $($resp.refresh_token)"
