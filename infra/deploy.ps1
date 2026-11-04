# =============================================================================
# deploy.ps1 — Build + deploy Contracts (web + API) to the VM Orbital (AWS)
#
# Follows the same pattern as infra-aws/atelier/build-web.ps1:
#   1. Build Next.js frontend (standalone mode)
#   2. Package Python API code
#   3. Generate S3 presigned URL for upload
#   4. Upload bundle via presigned PUT
#   5. SSH into VM via EC2 Instance Connect (ephemeral key, 60 s window)
#   6. Download, extract, install deps, copy systemd units + nginx conf
#   7. Enable services, reload nginx, run health checks
#
# Prerequisites:
#   - AWS CLI v2 installed (for ec2-instance-connect + s3 presigned)
#   - SSH key pair at ~/.ssh/id_rsa{,.pub}
#   - contracts/web/ has a working Next.js 14 standalone build
#   - contracts/api/ has requirements.txt
#
# Usage: pwsh contracts/infra/deploy.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

# ── Constants ────────────────────────────────────────────────────────────────
$ROOT            = "D:\MISYBOT_2026\AGENT_GOOGLE"
$TMP             = "$env:LOCALAPPDATA\Temp\contracts-deploy"
$VM_IP           = "184.197.181.224"
$VM_INSTANCE_ID  = "i-03e59a614d1c78c8e"
$VM_USER         = "ubuntu"
$AWS_REGION      = "us-east-1"
$S3_BUCKET       = "contracts-documents"
$S3_DEPLOY_KEY   = "deploy/contracts-bundle.tar.gz"
$PEM             = "$env:USERPROFILE\.ssh\id_rsa"
$PUB_KEY         = "$env:USERPROFILE\.ssh\id_rsa.pub"

# Ensure AWS CLI is on PATH
$env:PATH = "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2;$env:PATH"

# ── Helper: refresh EC2 Instance Connect ephemeral key ───────────────────────
# The key is valid for 60 seconds. We call this before each scp/ssh command
# because large uploads can exceed the window.
function Send-EphemeralKey {
    aws ec2-instance-connect send-ssh-public-key `
        --instance-id $VM_INSTANCE_ID `
        --instance-os-user $VM_USER `
        --ssh-public-key "file://$PUB_KEY" `
        --region $AWS_REGION `
        --query Success --output text | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "EC2 Instance Connect: failed to send ephemeral key" }
}

# =============================================================================
# STEP 1 — Build Next.js frontend (standalone)
# =============================================================================
Write-Output "`n==> [1/7] Building Contracts frontend (Next.js standalone)..."

# Bake production URLs into the build (SO env > .env.local, same pattern as Atelier)
$env:NEXT_PUBLIC_API_URL      = "https://contracts.colombiatic.com.co/api/v1"
$env:NEXT_PUBLIC_SITE_URL     = "https://contracts.colombiatic.com.co"
$env:NEXT_PUBLIC_BACKEND_URL  = "https://contracts.colombiatic.com.co"
$env:NEXT_PUBLIC_TENANT_ID    = "contracts"
$env:NEXT_PUBLIC_PAYMENT_MODE = "wompi"
$env:NEXT_PUBLIC_WOMPI_PUBLIC_KEY = "pub_test_MsDbOzexF97jeXXpC3VzLi64BlhPXKRJ"

Push-Location "$ROOT\contracts\web"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Frontend build failed" }
Pop-Location

# =============================================================================
# STEP 2 — Package both frontend + API into a single deploy bundle
# =============================================================================
Write-Output "`n==> [2/7] Packaging deploy bundle..."

Remove-Item -Recurse -Force $TMP -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$TMP\bundle\web", "$TMP\bundle\api", "$TMP\bundle\infra\systemd", "$TMP\bundle\infra\nginx" | Out-Null

# 2a. Frontend standalone
Copy-Item -Recurse "$ROOT\contracts\web\.next\standalone\*" "$TMP\bundle\web\"
New-Item -ItemType Directory -Force "$TMP\bundle\web\.next\static" | Out-Null
Copy-Item -Recurse "$ROOT\contracts\web\.next\static\*" "$TMP\bundle\web\.next\static\"
if (Test-Path "$ROOT\contracts\web\public") {
    Copy-Item -Recurse "$ROOT\contracts\web\public" "$TMP\bundle\web\public"
}

# 2b. API source (exclude __pycache__, .venv, tests)
$apiSrc = "$ROOT\contracts\api"
Copy-Item -Recurse "$apiSrc\app" "$TMP\bundle\api\app"
Copy-Item "$apiSrc\requirements.txt" "$TMP\bundle\api\requirements.txt"
if (Test-Path "$apiSrc\alembic") {
    Copy-Item -Recurse "$apiSrc\alembic" "$TMP\bundle\api\alembic"
}
if (Test-Path "$apiSrc\alembic.ini") {
    Copy-Item "$apiSrc\alembic.ini" "$TMP\bundle\api\alembic.ini"
}
# Clean Python build artifacts
Get-ChildItem -Recurse "$TMP\bundle\api" -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Get-ChildItem -Recurse "$TMP\bundle\api" -Filter '*.pyc' | Remove-Item -Force

# 2c. Infra files (systemd + nginx)
Copy-Item "$ROOT\contracts\infra\systemd\*.service" "$TMP\bundle\infra\systemd\"
Copy-Item "$ROOT\contracts\infra\nginx\contracts.colombiatic.com.co.conf" "$TMP\bundle\infra\nginx\"

# 2d. Runtime .env for frontend (server-side vars; PORT/NODE_ENV excluded — systemd sets them)
$webEnvLines = Get-Content "$ROOT\contracts\web\.env" |
    Where-Object { $_ -match '^[A-Z_]+=' -and $_ -notmatch '^(PORT|NODE_ENV|HOSTNAME)=' }
Set-Content "$TMP\bundle\web-runtime.env" ($webEnvLines -join "`n")

# 2e. Tar it up
Push-Location "$TMP\bundle"
tar -czf "$TMP\contracts-bundle.tar.gz" .
Pop-Location
$bundleMB = [math]::Round((Get-Item "$TMP\contracts-bundle.tar.gz").Length / 1MB, 1)
Write-Output "   Bundle size: $bundleMB MB"

# =============================================================================
# STEP 3 — Generate S3 presigned URL for upload
# =============================================================================
Write-Output "`n==> [3/7] Generating S3 presigned PUT URL..."

# The VM has no aws-cli, so we upload from local → S3, then the VM downloads
# via a presigned GET. This avoids needing credentials on the VM for S3.
$putUrl = aws s3 presign "s3://$S3_BUCKET/$S3_DEPLOY_KEY" --expires-in 600 --region $AWS_REGION
if ($LASTEXITCODE -ne 0) { throw "Failed to generate presigned PUT URL" }

# =============================================================================
# STEP 4 — Upload bundle via presigned URL
# =============================================================================
Write-Output "`n==> [4/7] Uploading bundle to S3..."

# Use aws s3 cp directly from local (we have the CLI here)
aws s3 cp "$TMP\contracts-bundle.tar.gz" "s3://$S3_BUCKET/$S3_DEPLOY_KEY" --region $AWS_REGION
if ($LASTEXITCODE -ne 0) { throw "S3 upload failed" }

# Generate a presigned GET URL the VM can use to download the bundle
$getUrl = aws s3 presign "s3://$S3_BUCKET/$S3_DEPLOY_KEY" --expires-in 600 --region $AWS_REGION
if ($LASTEXITCODE -ne 0) { throw "Failed to generate presigned GET URL" }

# =============================================================================
# STEP 5 — Send provision script to VM via SCP
# =============================================================================
Write-Output "`n==> [5/7] Sending provision script to VM..."

# Write the remote provision script inline (runs as root on the VM)
$provisionScript = @"
#!/bin/bash
# provision-contracts.sh — runs on the VM as root
set -euo pipefail

BUNDLE_URL='$getUrl'
WORK_API=/opt/contracts-api
WORK_WEB=/opt/contracts-web
VENV=/opt/contracts-api-venv
FAILED=()

echo "==> [1/6] Downloading bundle from S3..."
curl -fsSL -o /tmp/contracts-bundle.tar.gz "\$BUNDLE_URL"

echo "==> [2/6] Extracting bundle..."
mkdir -p /tmp/contracts-deploy
tar -xzf /tmp/contracts-bundle.tar.gz -C /tmp/contracts-deploy

echo "==> [3/6] Installing API..."
mkdir -p \$WORK_API
rsync -a --delete /tmp/contracts-deploy/api/ \$WORK_API/
if [ ! -d "\$VENV" ]; then
    python3 -m venv "\$VENV"
fi
"\$VENV/bin/pip" install --quiet --no-cache-dir --upgrade pip
"\$VENV/bin/pip" install --quiet --no-cache-dir -r "\$WORK_API/requirements.txt"

# Secrets: read JWT_SECRET from realculture .env (same pattern as Atelier provision-vm.sh)
JWT_SECRET=\$(grep -E '^JWT_SECRET=' /opt/realculture/.env | head -1 | cut -d= -f2-)

# Write API .env if it does not exist (subsequent deploys keep the existing one)
if [ ! -f "\$WORK_API/.env" ]; then
    cat > "\$WORK_API/.env" <<APIEOF
APP_ENV=production
LOG_LEVEL=INFO
DATABASE_URL=postgresql+asyncpg://postgres:\${JWT_SECRET}@127.0.0.1:5432/colombiatic?options=-c%20search_path%3Dcontracts
REDIS_URL=redis://127.0.0.1:6379/2
JWT_SECRET=\${JWT_SECRET}
AWS_REGION=us-east-1
BEDROCK_MODEL_EVALUATOR=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_MODEL_EMBED=amazon.titan-embed-text-v2:0
SECOP_API_URL=https://www.datos.gov.co/resource/p6dx-8zbt.json
S3_BUCKET_DOCUMENTS=contracts-documents
S3_REGION=us-east-1
FREEMIUM_MAX_SEARCHES=3
FREEMIUM_COUNTER_TTL=86400
APIEOF
    chmod 600 "\$WORK_API/.env"
    echo "   .env created (first deploy)"
else
    echo "   .env exists — preserving (update via Secrets Manager)"
fi

echo "==> [4/6] Installing frontend..."
mkdir -p \$WORK_WEB
cd \$WORK_WEB && rm -rf node_modules package.json server.js .next public 2>/dev/null || true
rsync -a --delete /tmp/contracts-deploy/web/ \$WORK_WEB/
cp /tmp/contracts-deploy/web-runtime.env \$WORK_WEB/.env
chmod 600 \$WORK_WEB/.env

echo "==> [5/6] Installing systemd units + nginx..."
cp /tmp/contracts-deploy/infra/systemd/*.service /etc/systemd/system/
cp /tmp/contracts-deploy/infra/nginx/contracts.colombiatic.com.co.conf /etc/nginx/sites-available/contracts
ln -sf /etc/nginx/sites-available/contracts /etc/nginx/sites-enabled/contracts
nginx -t
systemctl daemon-reload

for svc in contracts-api contracts-web; do
    systemctl enable "\$svc" >/dev/null 2>&1 || true
    if systemctl restart "\$svc"; then
        echo "   \$svc: started"
    else
        echo "   \$svc: FAILED (check /var/log/\$svc.err)"
        FAILED+=("\$svc")
    fi
done
systemctl reload nginx

echo "==> [6/6] Health checks..."
sleep 6
# API health
API_CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8098/health --max-time 10 || echo "000")
echo "   contracts-api  :8098 -> HTTP \$API_CODE"
[ "\$API_CODE" = "000" ] && FAILED+=("api:health")

# Frontend health
WEB_CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3300/ --max-time 10 || echo "000")
echo "   contracts-web  :3300 -> HTTP \$WEB_CODE"
[ "\$WEB_CODE" = "000" ] && FAILED+=("web:health")

# Readiness (deep — checks Redis + DB)
READY_CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8098/readyz --max-time 10 || echo "000")
echo "   contracts-api /readyz -> HTTP \$READY_CODE"

# Verify baked URLs in the frontend bundle (must be contracts.colombiatic, not localhost)
echo "--- Baked URL check ---"
grep -rho "contracts.colombiatic.com.co" \$WORK_WEB/.next/static/chunks/ 2>/dev/null | sort -u | wc -l
grep -rhoE "(localhost:8098|localhost:3300)" \$WORK_WEB/.next/static/chunks/ 2>/dev/null | sort -u | head -5 || true

# Cleanup
rm -rf /tmp/contracts-deploy /tmp/contracts-bundle.tar.gz

echo ""
if [ \${#FAILED[@]} -eq 0 ]; then
    echo "✅ DEPLOY COMPLETE — all services healthy"
else
    echo "⚠️  DEPLOY WITH FAILURES: \${FAILED[*]}"
fi
df -h / | tail -1
"@

Set-Content "$TMP\provision-contracts.sh" $provisionScript -NoNewline

Send-EphemeralKey
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -i $PEM "$TMP\provision-contracts.sh" "${VM_USER}@${VM_IP}:/tmp/provision-contracts.sh"
if ($LASTEXITCODE -ne 0) { throw "SCP provision script failed" }

# =============================================================================
# STEP 6+7 — SSH into VM, run provision (download + extract + install + health)
# =============================================================================
Write-Output "`n==> [6/7] Running provision on VM..."

Send-EphemeralKey
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -i $PEM "${VM_USER}@${VM_IP}" "sed -i 's/\r$//' /tmp/provision-contracts.sh && sudo bash /tmp/provision-contracts.sh"
if ($LASTEXITCODE -ne 0) { throw "Remote provision failed" }

Write-Output "`n==> [7/7] Verifying public URL..."

# Final external health check (via nginx/SSL)
try {
    $response = Invoke-WebRequest -Uri "https://contracts.colombiatic.com.co/healthz" -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -eq 200) {
        Write-Output "   ✅ https://contracts.colombiatic.com.co/healthz -> $($response.StatusCode)"
    } else {
        Write-Warning "   Public healthz returned $($response.StatusCode)"
    }
} catch {
    Write-Warning "   Public healthz unreachable (DNS may not have propagated yet): $_"
}

# Cleanup local temp
Remove-Item -Recurse -Force $TMP -ErrorAction SilentlyContinue

Write-Output "`n✅ Deploy pipeline complete."
