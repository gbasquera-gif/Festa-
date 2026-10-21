<#
.SYNOPSIS
  Backup do banco de produção da Festaê e teste de restauração isolado, no Windows.

.DESCRIPTION
  Só LÊ a produção: a foto roda numa transação somente leitura e o pg_dump é
  leitura por natureza. Nada é gravado, alterado ou apagado lá.

  O que faz, em ordem:
    1. Pede que você confira e crie o backup manual no Railway (na tela).
    2. Lê a versão do Postgres e, numa transação só de leitura, tira a "foto"
       (última migration, contagens, somas, estrutura, assinatura de cada
       tabela e posição das sequências) e o pg_dump do MESMO instantâneo
       (pg_export_snapshot + pg_dump --snapshot).
    3. Restaura o dump num Postgres local, num container SEM REDE, com os
       dados só na memória (nada do restauro fica em disco).
    4. Compara a foto da produção com a do restauro, linha a linha.
    5. Criptografa o dump e as fotos com 7-Zip (AES-256, a senha você digita),
       confere o arquivo, grava o SHA-256 ao lado e apaga as cópias abertas.
       Se algo falhar no meio, as cópias abertas também são apagadas.

  O endereço do banco é colado na hora e fica só na memória desta janela. Ele
  chega ao container pela entrada padrão: não aparece em argumento, em
  variável do container nem em arquivo. Nunca cole esse endereço em chat,
  e-mail ou arquivo.

  Precisa de: Docker Desktop aberto e 7-Zip instalado (winget install 7zip.7zip).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\backup-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\backup-windows.ps1 -Conferir C:\Users\voce\festae-backup\20261022-2130\festae-20261022-2130.7z
  Confere uma cópia do backup (em outro disco, por exemplo): senha e SHA-256.
#>
[CmdletBinding()]
param(
  # Onde guardar o backup (padrão: festae-backup na pasta do usuário). Uma
  # subpasta com data e hora é criada dentro dela.
  [string]$Destino,
  # Padrão: o 7-Zip instalado em Arquivos de Programas.
  [string]$SeteZip,
  # Só confere um .7z já criado (e o .sha256 ao lado dele), sem tocar em banco nenhum.
  [string]$Conferir
)

$ErrorActionPreference = "Stop"
if (-not $Destino) { $Destino = Join-Path ([Environment]::GetFolderPath("UserProfile")) "festae-backup" }
if (-not $SeteZip) { $SeteZip = Join-Path ([Environment]::GetFolderPath("ProgramFiles")) "7-Zip\7z.exe" }
$Carimbo = Get-Date -Format "yyyyMMdd-HHmm"
$Pasta = Join-Path $Destino $Carimbo
$Scripts = Join-Path $Pasta "scripts"
$Isolado = "festae-restauro-$Carimbo"
$Dump = "festae-$Carimbo.dump"
$Arquivo7z = Join-Path $Pasta "festae-$Carimbo.7z"
$Abertos = @($Dump, "foto-producao.txt", "foto-restauro.txt")
$concluido = $false
$seguro = $null

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

# O endereço só existe em texto aberto durante a chamada, e vai pela entrada padrão.
function Na-Producao {
  [System.Net.NetworkCredential]::new("", $seguro).Password | & docker run -i --rm -v "${Scripts}:/scripts:ro" -v "${Pasta}:/saida" @args
}

function Dentro-De-Repositorio([string]$Caminho) {
  $atual = [System.IO.Path]::GetFullPath($Caminho)
  while ($atual) {
    if (Test-Path (Join-Path $atual ".git")) { return $true }
    $acima = [System.IO.Path]::GetDirectoryName($atual)
    if ($acima -eq $atual) { break }
    $atual = $acima
  }
  return $false
}

function Hash-Do-Arquivo([string]$Caminho) {
  (Get-FileHash -Algorithm SHA256 -Path $Caminho).Hash.ToLower()
}

if ($Conferir) {
  if (-not (Test-Path $SeteZip)) { Parar "7-Zip não encontrado em $SeteZip." }
  if (-not (Test-Path $Conferir)) { Parar "arquivo não encontrado: $Conferir" }
  $esperado = "$Conferir.sha256"
  if (Test-Path $esperado) {
    $anotado = ((Get-Content $esperado -Raw).Trim() -split "\s+")[0]
    if ($anotado -ne (Hash-Do-Arquivo $Conferir)) { Parar "o SHA-256 não bate com o anotado em ${esperado}: a cópia está corrompida ou foi alterada." }
    Write-Host "  SHA-256 confere com $esperado." -ForegroundColor Green
  } else {
    Write-Host "  Sem o arquivo .sha256 ao lado: conferindo só a senha e a integridade interna."
  }
  Write-Host "  Digite a senha do backup:"
  & $SeteZip t -p $Conferir
  if ($LASTEXITCODE -ne 0) { Parar "o arquivo não abriu ou não passou na conferência do 7-Zip." }
  Write-Host ""
  Write-Host "OK: a cópia abre com a senha e está íntegra." -ForegroundColor Green
  exit 0
}

try {
  Passo "0. Conferências"
  & docker version --format "{{.Server.Version}}" | Out-Null
  if ($LASTEXITCODE -ne 0) { Parar "o Docker Desktop não está rodando. Abra o Docker Desktop, espere ficar pronto e rode de novo." }
  if (-not (Test-Path $SeteZip)) { Parar "7-Zip não encontrado em $SeteZip. Instale com: winget install 7zip.7zip" }
  if (Dentro-De-Repositorio $Destino) { Parar "a pasta de destino fica dentro de um repositório Git ($Destino). Escolha uma fora dele, para o backup nunca ir parar no GitHub." }
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
  if ([System.Net.NetworkCredential]::new("", $seguro).Password -notmatch "^postgres(ql)?://") {
    Parar "isso não parece o endereço do Postgres (deve começar com postgresql://)."
  }

  Passo "3. Versão do Postgres de produção (só leitura)"
  $versao = Na-Producao "postgres:17-alpine" sh /scripts/no-container.sh versao
  if ($LASTEXITCODE -ne 0) { Parar "não consegui ler a produção. Confira o endereço colado." }
  $principal = [math]::Floor([int](($versao | Select-Object -Last 1).Trim()) / 10000)
  $Imagem = "postgres:$principal-alpine"
  Write-Host "  Postgres $principal. Dump e restauro usam a imagem $Imagem."

  Passo "4. Foto e pg_dump da produção, no mesmo instantâneo (só leitura)"
  Na-Producao $Imagem sh /scripts/no-container.sh backup $Dump "foto-producao.txt"
  if ($LASTEXITCODE -ne 0) { Parar "o backup da produção falhou. Veja a mensagem acima." }
  $seguro.Dispose()
  $seguro = $null
  $fotoProducao = Get-Content (Join-Path $Pasta "foto-producao.txt")
  $migration = ($fotoProducao | Where-Object { $_ -like "ultima_migration*" }) -replace "^ultima_migration \| ", ""
  $tamanho = [math]::Round((Get-Item (Join-Path $Pasta $Dump)).Length / 1MB, 2)
  Write-Host "  Dump gerado: $Dump ($tamanho MB). Última migration aplicada: $migration"

  Passo "5. Restauração num Postgres local isolado (sem rede, dados só na memória)"
  Executar-Docker run -d --name $Isolado --network none --tmpfs /var/lib/postgresql/data -e PGDATA=/var/lib/postgresql/data/pgdata -e POSTGRES_HOST_AUTH_METHOD=trust -v "${Scripts}:/scripts:ro" -v "${Pasta}:/saida" $Imagem | Out-Null
  Executar-Docker exec $Isolado sh /scripts/no-container.sh esperar
  Executar-Docker exec $Isolado sh /scripts/no-container.sh restaurar $Dump "foto-restauro.txt"
  $fotoRestauro = Get-Content (Join-Path $Pasta "foto-restauro.txt")

  Passo "6. Comparação: produção x restauro"
  $tabelas = @($fotoProducao | Where-Object { $_ -match "^[a-z0-9_]+ \| \d+ \| [0-9a-f]{32}$" }).Count
  $sequencias = @($fotoProducao | Where-Object { $_ -like "sequencia *" }).Count
  $diferencas = Compare-Object $fotoProducao $fotoRestauro -CaseSensitive
  if ($diferencas) {
    $resultado = "DIFERENTES"
    Write-Host "  DIFERENTES. Linhas que não batem (=> só na produção, <= só no restauro):" -ForegroundColor Red
    $diferencas | ForEach-Object { Write-Host "    $($_.SideIndicator) $($_.InputObject)" }
  } else {
    $resultado = "IGUAIS"
    Write-Host "  IGUAIS: estrutura, $tabelas tabelas (mesmas linhas, coluna por coluna) e $sequencias sequências; contagens e somas idênticas." -ForegroundColor Green
  }

  Passo "7. Criptografia (7-Zip, AES-256)"
  Write-Host "  Escolha uma senha forte e guarde-a num gerenciador de senhas. Sem ela, o backup não abre."
  & $SeteZip a -t7z -mhe=on -p $Arquivo7z (Join-Path $Pasta $Dump) (Join-Path $Pasta "foto-producao.txt") (Join-Path $Pasta "foto-restauro.txt")
  if ($LASTEXITCODE -ne 0) { Parar "o 7-Zip não conseguiu criar o arquivo." }
  Write-Host "  Conferindo o arquivo criptografado (digite a mesma senha):"
  & $SeteZip t -p $Arquivo7z
  if ($LASTEXITCODE -ne 0) { Parar "o arquivo criptografado não passou na conferência." }
  $hash = Hash-Do-Arquivo $Arquivo7z
  Set-Content -Path "$Arquivo7z.sha256" -Value "$hash  $(Split-Path -Leaf $Arquivo7z)" -Encoding ASCII
  $concluido = $true
  Write-Host "  Criptografado e conferido. SHA-256: $hash"

  Passo "Resumo (pode me enviar só estas linhas)"
  Write-Host "  Backup manual no Railway: confirmado na tela"
  Write-Host "  Commit do deploy ativo: $commitAtivo"
  Write-Host "  Última migration aplicada: $migration"
  Write-Host "  Restauro x produção: $resultado (estrutura, $tabelas tabelas, $sequencias sequências)"
  Write-Host "  SHA-256 do arquivo: $hash"
  Write-Host ""
  Write-Host "  Arquivo: $Arquivo7z"
  Write-Host "  Copie o .7z e o .sha256 para um segundo lugar fora deste computador (HD externo ou cofre pessoal do OneDrive)."
  Write-Host "  Para conferir uma cópia depois: .\backup-windows.ps1 -Conferir <caminho da cópia>.7z"
}
finally {
  $ErrorActionPreference = "Continue"
  if ($seguro) { $seguro.Dispose() }
  if (& docker ps -a -q --filter "name=^$Isolado$") { & docker rm -f -v $Isolado | Out-Null }
  # Nada com dado real fica aberto no disco: com o backup concluído, o que
  # sobra está criptografado; se parou no meio, as cópias abertas saem.
  foreach ($f in $Abertos) {
    $caminho = Join-Path $Pasta $f
    if (Test-Path $caminho) { Remove-Item -Force $caminho }
  }
  if (-not $concluido -and (Test-Path $Pasta)) {
    Write-Host "  O backup não foi concluído. As cópias abertas foram apagadas; rode de novo." -ForegroundColor Yellow
  }
}
