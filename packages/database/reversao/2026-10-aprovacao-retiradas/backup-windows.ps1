<#
.SYNOPSIS
  Backup do banco de produção da Festaê e teste de restauração isolado, no Windows.

.DESCRIPTION
  Só LÊ a produção. A sessão com o banco é aberta como "somente leitura" e o
  pg_dump é leitura por natureza. Nada é gravado, alterado ou apagado lá.

  O que faz, em ordem:
    1. Pede que você confira e crie o backup manual no Railway (na tela).
    2. Lê a versão do Postgres e, numa transação só de leitura, tira a "foto"
       (última migration, contagens, somas e a assinatura de cada tabela) e o
       pg_dump do MESMO instante.
    3. Restaura o dump num Postgres local, num container SEM REDE.
    4. Compara a foto da produção com a do restauro, linha a linha.
    5. Criptografa o dump e as fotos com 7-Zip (AES-256, a senha você digita)
       e apaga as cópias abertas.

  Precisa de: Docker Desktop aberto e 7-Zip instalado (winget install 7zip.7zip).
  O endereço do banco é colado na hora, fica só na memória desta janela e é
  apagado no fim. Nunca cole esse endereço em chat, e-mail ou arquivo.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\backup-windows.ps1
#>
[CmdletBinding()]
param(
  # Onde guardar o backup. Uma subpasta com data e hora é criada dentro dela.
  [string]$Destino = (Join-Path $env:USERPROFILE "festae-backup"),
  [string]$SeteZip = (Join-Path $env:ProgramFiles "7-Zip\7z.exe")
)

$ErrorActionPreference = "Stop"
$Carimbo = Get-Date -Format "yyyyMMdd-HHmm"
$Pasta = Join-Path $Destino $Carimbo
$Scripts = Join-Path $Pasta "scripts"
$Isolado = "festae-restauro-$Carimbo"
$Dump = "festae-$Carimbo.dump"
$Arquivo7z = Join-Path $Pasta "festae-$Carimbo.7z"

function Passo([string]$Texto) {
  Write-Host ""
  Write-Host "== $Texto" -ForegroundColor Cyan
}

function Parar([string]$Texto) {
  Write-Host ""
  Write-Host "PAROU: $Texto" -ForegroundColor Red
  exit 1
}

function Executar-Docker {
  & docker @args
  if ($LASTEXITCODE -ne 0) { Parar "o comando 'docker $($args[0])' falhou (código $LASTEXITCODE). Veja a mensagem acima." }
}

try {
  Passo "0. Conferências"
  & docker version --format "{{.Server.Version}}" | Out-Null
  if ($LASTEXITCODE -ne 0) { Parar "o Docker Desktop não está rodando. Abra o Docker Desktop, espere ficar pronto e rode de novo." }
  if (-not (Test-Path $SeteZip)) { Parar "7-Zip não encontrado em $SeteZip. Instale com: winget install 7zip.7zip" }
  foreach ($f in "verificar-banco.sql", "assinaturas.sql", "no-container.sh") {
    if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { Parar "falta o arquivo $f ao lado deste script." }
  }
  # Cópias com quebra de linha do Linux: o Git do Windows pode ter trocado
  # para CRLF, e o sh e o psql do container não aceitam.
  New-Item -ItemType Directory -Force -Path $Scripts | Out-Null
  foreach ($f in "verificar-banco.sql", "assinaturas.sql", "no-container.sh") {
    $texto = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $f)) -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText((Join-Path $Scripts $f), $texto)
  }
  Write-Host "  Docker e 7-Zip prontos. Pasta deste backup: $Pasta"

  Passo "1. Backup no Railway (na tela do Railway)"
  Write-Host "  a) Abra o serviço do Postgres > aba Backups. Confira a data e a hora dos backups que já existem."
  Write-Host "  b) Crie um backup manual agora e espere ele aparecer na lista, com a hora de agora."
  Write-Host "  c) Abra o serviço do backend > Deployments. Anote o commit do deploy ativo."
  $criado = Read-Host "  O backup manual de agora aparece na lista? (s/n)"
  if ($criado -ne "s") { Parar "crie o backup manual no Railway antes de continuar." }
  $commitAtivo = Read-Host "  Commit do deploy ativo do backend (os 7 primeiros caracteres)"

  Passo "2. Endereço do banco de produção"
  Write-Host "  No Railway: serviço do Postgres > Variables > DATABASE_PUBLIC_URL > copiar."
  $seguro = Read-Host "  Cole aqui (não aparece na tela)" -AsSecureString
  $url = [System.Net.NetworkCredential]::new("", $seguro).Password
  if ($url -notmatch "^postgres(ql)?://") { Parar "isso não parece o endereço do Postgres (deve começar com postgresql://)." }
  # O docker recebe a variável pelo nome (-e PGURL), nunca o valor na linha de comando.
  $env:PGURL = $url
  $url = $null

  Passo "3. Versão do Postgres de produção (só leitura)"
  $versao = & docker run --rm -e PGURL -v "${Scripts}:/scripts:ro" "postgres:17-alpine" sh /scripts/no-container.sh versao
  if ($LASTEXITCODE -ne 0) { Parar "não consegui ler a produção. Confira o endereço colado." }
  $principal = [math]::Floor([int](($versao | Select-Object -Last 1).Trim()) / 10000)
  $Imagem = "postgres:$principal-alpine"
  Write-Host "  Postgres $principal. Dump e restauro usam a imagem $Imagem."

  Passo "4. Foto e pg_dump da produção, no mesmo instante (só leitura)"
  Executar-Docker run --rm -e PGURL -v "${Scripts}:/scripts:ro" -v "${Pasta}:/saida" $Imagem sh /scripts/no-container.sh backup $Dump "foto-producao.txt"
  Remove-Item Env:PGURL
  $fotoProducao = Get-Content (Join-Path $Pasta "foto-producao.txt")
  $migration = ($fotoProducao | Where-Object { $_ -like "ultima_migration*" }) -replace "^ultima_migration \| ", ""
  $tamanho = [math]::Round((Get-Item (Join-Path $Pasta $Dump)).Length / 1MB, 2)
  Write-Host "  Dump gerado: $Dump ($tamanho MB). Última migration aplicada: $migration"

  Passo "5. Restauração num Postgres local isolado (container sem rede)"
  Executar-Docker run -d --name $Isolado --network none -e POSTGRES_HOST_AUTH_METHOD=trust -v "${Scripts}:/scripts:ro" -v "${Pasta}:/saida" $Imagem | Out-Null
  Executar-Docker exec $Isolado sh /scripts/no-container.sh esperar
  Executar-Docker exec $Isolado sh /scripts/no-container.sh restaurar $Dump "foto-restauro.txt"
  $fotoRestauro = Get-Content (Join-Path $Pasta "foto-restauro.txt")

  Passo "6. Comparação: produção x restauro"
  $tabelas = @($fotoProducao | Where-Object { $_ -match "^[a-z0-9_]+ \| \d+ \| [0-9a-f]{32}$" }).Count
  $diferencas = Compare-Object $fotoProducao $fotoRestauro -CaseSensitive
  if ($diferencas) {
    $resultado = "DIFERENTES"
    Write-Host "  DIFERENTES. Linhas que não batem (=> só na produção, <= só no restauro):" -ForegroundColor Red
    $diferencas | ForEach-Object { Write-Host "    $($_.SideIndicator) $($_.InputObject)" }
  } else {
    $resultado = "IGUAIS"
    Write-Host "  IGUAIS: $tabelas tabelas com a mesma quantidade de linhas e a mesma assinatura; contagens e somas idênticas." -ForegroundColor Green
  }

  Passo "7. Criptografia (7-Zip, AES-256)"
  Write-Host "  Escolha uma senha forte e guarde-a num gerenciador de senhas. Sem ela, o backup não abre."
  & $SeteZip a -t7z -mhe=on -p $Arquivo7z (Join-Path $Pasta $Dump) (Join-Path $Pasta "foto-producao.txt") (Join-Path $Pasta "foto-restauro.txt")
  if ($LASTEXITCODE -ne 0) { Parar "o 7-Zip não conseguiu criar o arquivo. As cópias abertas continuam em $Pasta." }
  Write-Host "  Conferindo o arquivo criptografado (digite a mesma senha):"
  & $SeteZip t -p $Arquivo7z
  if ($LASTEXITCODE -ne 0) { Parar "o arquivo criptografado não passou na conferência. As cópias abertas continuam em $Pasta." }
  Remove-Item (Join-Path $Pasta $Dump), (Join-Path $Pasta "foto-producao.txt"), (Join-Path $Pasta "foto-restauro.txt")
  Write-Host "  Criptografado e conferido. As cópias abertas foram apagadas."

  Passo "Resumo (pode me enviar só estas linhas)"
  Write-Host "  Backup manual no Railway: confirmado na tela"
  Write-Host "  Commit do deploy ativo: $commitAtivo"
  Write-Host "  Última migration aplicada: $migration"
  Write-Host "  Restauro x produção: $resultado ($tabelas tabelas)"
  Write-Host ""
  Write-Host "  Arquivo: $Arquivo7z"
  Write-Host "  Copie-o para um segundo lugar fora deste computador (HD externo ou cofre pessoal do OneDrive)."
}
finally {
  $ErrorActionPreference = "Continue"
  Remove-Item Env:PGURL -ErrorAction SilentlyContinue
  if (& docker ps -a -q --filter "name=^$Isolado$") { & docker rm -f $Isolado | Out-Null }
}
