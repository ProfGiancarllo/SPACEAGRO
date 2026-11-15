# SpaceAgro

Aplicação web aberta que ajuda o produtor rural a decidir **o que plantar, quando plantar e quanto produzir**, cruzando dados de satélite e clima da NASA com o mapa dos talhões da fazenda, o zoneamento de risco climático, o mercado agrícola e o diário de safra. A assistente **Estrela** responde em linguagem simples, por texto ou por voz.

Projeto da equipe SpaceAgro para o **NASA Space Apps Challenge 2026**, desafio *Adapting Farms with NASA Data*, evento local de Rio Verde (GO). O código é aberto e livre para qualquer pessoa usar.

- Produção (app completo, com Estrela e contas): https://spaceagro.pro
- Site estático (GitHub Pages): https://profgiancarllo.github.io/myroca/
- Documentação técnica: [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)
- Camada de mercado: [docs/mercado-dados.md](docs/mercado-dados.md)
- Roteiro da demonstração: [docs/roteiro-demonstracao.md](docs/roteiro-demonstracao.md)
- Servidor da Estrela (Cloudflare Worker): [worker/LEIA-ME.md](worker/LEIA-ME.md)

## Sumário

1. [O que o app faz](#o-que-o-app-faz)
2. [Arquitetura](#arquitetura)
3. [Como rodar](#como-rodar)
4. [Variáveis de ambiente e chaves](#variáveis-de-ambiente-e-chaves)
5. [Publicação](#publicação)
6. [Atualização automática dos dados](#atualização-automática-dos-dados)
7. [Scripts](#scripts)
8. [Estrutura de pastas](#estrutura-de-pastas)
9. [Dados da NASA usados](#dados-da-nasa-usados)
10. [Materiais de terceiros e licenças](#materiais-de-terceiros-e-licenças)
11. [Uso de Super Intelligence (SI / IA)](#uso-de-super-intelligence-si--ia)

## O que o app faz

### Página inicial
- Página comercial mostrada antes do login, em português, inglês e espanhol (`src/landing/`).
- Globo 3D girando com os **focos de calor reais das últimas 24 h** na América do Sul (NASA FIRMS, VIIRS NOAA-20).
- Voo automático até a fazenda de demonstração, com **tour guiado talhão por talhão** (cultura, área, fase de hoje e colheita prevista), água da fazenda (nascente, poço, rio), foco de calor mais próximo e totais.
- Seções de problema, solução, telas reais do app, previsões, impacto e modelo de negócio.
- Atalhos: **`/demonstracao`** abre direto a fazenda de demonstração, sem cadastro (ex.: https://spaceagro.pro/demonstracao); `/#inicio` abre a página inicial mesmo com sessão ativa; `/#entrar` e `/#criar-conta` vão direto para o acesso.

### Mapa e talhões
- Mapa de satélite (MapLibre GL) com os talhões da fazenda e a fazenda de demonstração real de Rio Verde (limites do CAR).
- Ferramentas do mapa: **desenhar talhão**, **marcar com um toque** (contorno traçado pela cor da imagem), **ajustar cantos**, **medir distância e área**, **ir para talhão** (busca por nome ou cultura).
- Importação de KML, GeoJSON e listas de coordenadas; exportação em GeoJSON e KML.
- Estruturas e água: sede, silos, curral, estação meteorológica, nascentes, poços, rios e reserva legal.

### Satélite e alertas
- **Saúde da lavoura por talhão** (Landsat 8/9): vigor (NDVI), água na folha (NDMI), zona fraca do talhão e alerta de talhões que merecem visita.
- **Estresse hídrico por talhão** (ECOSTRESS, índice ESI a 70 m).
- **Camadas da NASA no mapa**: Landsat/HLS 30 m, cor verdadeira diária (VIIRS), NDVI (MODIS), chuva (IMERG), umidade do solo (SMAP) e temperatura da superfície (MODIS).
- **Alerta de queimadas** perto da fazenda (NASA FIRMS, VIIRS 375 m).

### Clima e previsões
- Cartão "Clima na fazenda" com previsão por hora para 48 h, chance de chuva, vento, umidade, nascer e pôr do sol e **janela boa para pulverizar** (Open-Meteo).
- Histórico de chuva e temperatura no talhão (NASA POWER).
- **Calendário de safra** com fase da lavoura e colheita prevista; botão **"+1 semana"** (também +2, +4 semanas e voltar) para simular o avanço da lavoura no mapa.

### Planejamento de safra ("Safra e decisões")
- Compara culturas por talhão e responde **qual opção deixa mais dinheiro e por quê**.
- Cruza janela de plantio (ZARC/MAPA), regras de rotação (Embrapa), clima (NASA POWER), produtividade (histórico do talhão e CONAB Goiás) e mercado (preço, custo e margem por cenário).
- Previsão de produtividade pela rota `/forecast` do servidor.

### Mercado
- Cotações de commodities (soja, milho, trigo, algodão e outras) e dólar, com variação em 12 meses e painel de mercado.

### Diário de safra
- Registro de plantio, adubação, aplicações, chuva, monitoramento e colheita por talhão, por texto ou por voz.

### Estrela, a assistente
- Responde perguntas sobre a fazenda com os dados reais de todos os talhões, clima, previsões (16 dias e meses), receita, custo, margem e manejo (modelo Claude, da Anthropic).
- Reconhece perguntas de tempo ("Posso pulverizar?") e responde com a mesma previsão do cartão de clima.
- **Voz natural**: ElevenLabs como voz principal e OpenAI como reserva; o microfone usa o reconhecimento de fala do navegador.
- Sem servidor configurado, responde com regras locais.

### Contas e administração
- Contas locais (no navegador) ou no servidor (PostgreSQL), com dados da fazenda sincronizados.
- Painel de **super admin**: chaves do Claude, do ElevenLabs e da OpenAI, modelo, voz, teste da Estrela e gestão de contas (redefinir senha).

### Idiomas
- App em português, inglês, espanhol, alemão e francês (`src/i18n/`); inglês por padrão até a pessoa escolher outro.
- Página inicial em português, inglês e espanhol, usando a mesma escolha do app.

## Arquitetura

```
Navegador (Vite + TypeScript, sem framework de UI, MapLibre GL)
  │  arquivos estáticos (dist/) + public/data/*.json
  ▼
Servidor Node (server/server.mjs, Docker)          ← mesmo código do Cloudflare Worker
  ├─ /api/...        Estrela (worker/estela-worker.js)
  │    POST /api            pergunta para a Estrela (Claude)
  │    POST /api/tts        voz (ElevenLabs; OpenAI como reserva)
  │    POST /api/forecast   previsão de produtividade
  │    POST /api/fires      focos de calor perto da fazenda (FIRMS)
  │    POST /api/om         plano B do Open-Meteo
  │    POST /api/admin/*    painel de super admin (exige ADMIN_PASSWORD)
  ├─ /api/auth/*, /api/data, /api/accounts/*   contas e fazendas (server/accounts.mjs)
  └─ /healthz        verificação de saúde
        │
        ▼
  PostgreSQL (contas e fazendas)    Volume /data (chaves e config salvas pelo painel)
```

- Sem o servidor, o app funciona como site estático: mapa, talhões, satélite, clima e planejamento continuam; a Estrela usa regras locais e as contas ficam no navegador.
- As chaves de API ficam **só no servidor**. Nunca use o prefixo `VITE_` em chaves: tudo com `VITE_` vai junto no código do site.

## Como rodar

Requisitos: Node.js 22 e npm. Para os scripts de dados, Python 3.11.

```bash
npm install
npm run dev
```

Abre em http://localhost:3000. Para ligar a Estrela no desenvolvimento, aponte o app para um servidor:

```bash
VITE_ESTELA_URL=https://spaceagro.pro/api npm run dev
```

Validação e build:

```bash
npm run lint
```

```bash
npx vite build --base=./
```

Servidor completo em container (app + Estrela + contas):

```bash
docker build -t spaceagro .
```

```bash
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... -e ADMIN_PASSWORD=... -v spaceagro_data:/data spaceagro
```

## Variáveis de ambiente e chaves

### Servidor (Portainer / Docker)

Definidas em **Stacks → spaceagro → Environment variables**. Cada variável também precisa estar listada em `environment:` no editor da stack ([deploy/portainer-stack.yml](deploy/portainer-stack.yml)).

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DB_PASSWORD` | sim | Senha do PostgreSQL da stack |
| `ANTHROPIC_API_KEY` | sim, para a Estrela | Respostas da Estrela (Claude) |
| `ADMIN_PASSWORD` | recomendada | Senha do painel de super admin |
| `ELEVENLABS_API_KEY` | não | Voz principal da Estrela (permissão Text to Speech) |
| `ELEVENLABS_VOICE_ID` | com a chave acima | ID da voz no ElevenLabs |
| `ELEVENLABS_MODEL` | não | `eleven_multilingual_v2` (padrão), `eleven_flash_v2_5` ou `eleven_turbo_v2_5` |
| `OPENAI_API_KEY` | não | Voz de reserva da Estrela |
| `FIRMS_MAP_KEY` | não | Alertas de queimadas no app (rota `/fires`) |
| `MODEL` / `TTS_VOICE` | não | Modelo do Claude e voz da OpenAI padrão |
| `ALLOWED_ORIGIN`, `SITE_URL` | já na stack | Domínio público do app |
| `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` ou `DATABASE_URL` | já na stack | Banco das contas |
| `DATA_DIR` | não | Onde o painel grava chaves e config (padrão `/data`, use um volume) |

As chaves também podem ser cadastradas pelo painel de super admin, que as guarda no volume `/data` e nunca as devolve ao navegador.

### GitHub Actions (Settings → Secrets and variables)

| Nome | Tipo | Para que serve |
|---|---|---|
| `FRED_API_KEY` | secret | Preços de mercado no build (sem ela, o app usa valores de exemplo) |
| `EARTHDATA_USER`, `EARTHDATA_PASS` | secret | Login NASA Earthdata para o ECOSTRESS |
| `VITE_ESTELA_URL` | variable | Endereço da Estrela no site do GitHub Pages |

### Build da imagem Docker

| Argumento | Padrão |
|---|---|
| `VITE_ESTELA_URL` | `https://spaceagro.pro/api` |
| `VITE_FORECAST_URL` | `https://spaceagro.pro/api/forecast` |
| `FRED_API_KEY` | vazio |

## Publicação

- **Produção (spaceagro.pro):** cada push em `main` gera a imagem `ghcr.io/profgiancarllo/myroca:latest` ([.github/workflows/docker-image.yml](.github/workflows/docker-image.yml)). No Portainer, use **Update the stack** com **Re-pull image** para trocar o container.
- **GitHub Pages:** cada push em `main` atualiza o mercado, faz o build e publica `dist/` no ramo `gh-pages` ([.github/workflows/publicar-site.yml](.github/workflows/publicar-site.yml)).
- **Cloudflare Worker (alternativa):** cole `worker/estela-worker.js` no editor da Cloudflare e configure as chaves como Secrets ([worker/LEIA-ME.md](worker/LEIA-ME.md)).

## Atualização automática dos dados

| Workflow | Quando | O que gera |
|---|---|---|
| [Saúde da lavoura por satélite](.github/workflows/saude-satelite.yml) | a cada 2 dias, 09:17 UTC | `public/data/saude-talhoes.json` (Landsat 8/9 via Planetary Computer) |
| [Estresse hídrico por satélite](.github/workflows/estresse-hidrico.yml) | todo dia, 09:43 UTC | `public/data/estresse-hidrico.json` (ECOSTRESS via Earthdata) |
| [Sondagem ECOSTRESS](.github/workflows/ecostress-sondagem.yml) | manual | Lista as cenas ECOSTRESS dos últimos 90 dias |
| [Publicar site](.github/workflows/publicar-site.yml) | push em `main` | Mercado (`public/data/mercado.json`) e site no GitHub Pages |
| [Imagem Docker](.github/workflows/docker-image.yml) | push em `main` | Imagem da produção no GitHub Container Registry |

## Scripts

| Script | Uso |
|---|---|
| `scripts/saude_satelite.py` | Saúde da lavoura por talhão (Landsat) |
| `scripts/estresse_hidrico.py` | Estresse hídrico por talhão (ECOSTRESS) |
| `scripts/ecostress_sondagem.py` | Conta as cenas ECOSTRESS disponíveis |
| `scripts/zarc_rioverde.py` | Gera a janela de plantio (ZARC) de Rio Verde a partir do CSV do MAPA |
| `scripts/conab_goias.py` | Resume as séries da CONAB de Goiás para a Estrela |
| `scripts/atualizar-mercado.mjs` | Baixa preços de commodities e dólar (FRED) |
| `scripts/update-landing-fires.mjs` | Atualiza os focos de calor do globo da página inicial (arquivo público do FIRMS, sem chave) |
| `colab/modis_planetary.py` | Séries históricas MODIS para análise |

Dependências Python (instaladas nos workflows): `pystac-client planetary-computer odc-stac rasterio shapely pyproj pandas numpy` e `earthaccess`.

## Estrutura de pastas

```
src/
  index.ts            aplicação principal (estado, telas, eventos)
  landing/            página inicial, globo e tour (globe.ts), textos (landingText.ts)
  auth/               login, contas locais e no servidor
  admin/              painel de super admin
  components/         mapa, ferramentas, satélite, estresse hídrico, queimadas, safra, mercado, diário
  estela/             assistente Estrela (chat, voz, contexto da fazenda)
  utils/              regras agronômicas, rotação, calendário, clima, NASA, mercado, geometria
  i18n/               textos em pt, en, es, de, fr
  data/               limites da fazenda de demonstração (CAR)
public/
  data/               JSON gerados pelos scripts (saúde, estresse, focos, ZARC, CONAB, mercado)
  assets/             marca (brand/) e imagens da página inicial (landing/)
server/               servidor Node de produção e contas (PostgreSQL)
worker/               servidor da Estrela (também roda como Cloudflare Worker)
scripts/              geração e atualização de dados
deploy/               stack do Portainer
docs/                 documentação técnica e roteiro
colab/                análises em Python
```

## Licença

Código e conteúdo originais da equipe: [Apache License 2.0](LICENSE).

## Dados da NASA usados

| Dado | Para que serve no app | Fonte |
|---|---|---|
| NASA POWER (chuva, temperatura, radiação, umidade) | Clima do talhão, janela de semeadura, diário de safra | https://power.larc.nasa.gov |
| Landsat 8/9 Collection 2 Level-2 (NASA/USGS) | Saúde da lavoura por talhão (NDVI, NDMI, zona fraca) | via Microsoft Planetary Computer |
| NASA HLS L30 (Landsat 8/9, 30 m) | Camada "Landsat 30 m" do mapa | https://gibs.earthdata.nasa.gov |
| ECOSTRESS (ESI, 70 m) | Estresse hídrico por talhão | NASA LP DAAC, via Earthdata |
| NASA FIRMS (VIIRS 375 m) | Alerta de queimadas perto da fazenda e globo da página inicial | https://firms.modaps.eosdis.nasa.gov |
| NASA GIBS: VIIRS NOAA-20 cor verdadeira, MODIS NDVI, IMERG (chuva), SMAP (umidade do solo), MODIS LST (temperatura da superfície) | Camadas do mapa | https://gibs.earthdata.nasa.gov |
| MODIS 13Q1, 15A2H, 16A2 v6.1 (NDVI, EVI, LAI, FPAR, ET) | Séries históricas no caderno de análise ([colab/](colab/)) | via Microsoft Planetary Computer |

Dados da NASA e do USGS são de domínio público (governo dos EUA).

## Materiais de terceiros e licenças

| Material | Uso | Licença / termos |
|---|---|---|
| Microsoft Planetary Computer | Espelho em COG dos dados Landsat e MODIS | Dados NASA/USGS em domínio público; termos de uso do Planetary Computer |
| Open-Meteo | Previsão do tempo por hora e complemento do histórico recente | CC BY 4.0 — https://open-meteo.com |
| FRED (Federal Reserve Bank of St. Louis) | Preços internacionais de commodities (séries do FMI) e dólar (DEXBZUS) | Dados públicos; fontes originais: FMI e Federal Reserve Board |
| OpenStreetMap | Mapa de ruas (camada opcional) | ODbL — © OpenStreetMap contributors |
| Esri World Imagery e rótulos | Imagem de satélite de alta resolução (mapa e globo) | Termos de uso da Esri, com crédito no mapa. **Não é licença aberta**: pode ser trocada pela camada NASA GIBS ou OSM no seletor de camadas |
| ZARC — Zoneamento Agrícola de Risco Climático (MAPA) | Janelas de plantio de Rio Verde | Dados abertos do governo federal (Brasil) |
| CONAB — séries históricas e levantamentos de safra | Produtividade de Goiás | Dados abertos do governo federal (Brasil) |
| SICAR — Cadastro Ambiental Rural | Limites da fazenda de demonstração (CAR GO-5218805-945560B98BAC4CAC87AECD90F33C618A) | Dados públicos do SICAR; o arquivo não traz nome nem documento do proprietário |
| Embrapa | Regras agronômicas de rotação de culturas | Publicações técnicas públicas, citadas em `src/utils/rotation.ts` |
| Anthropic (Claude) | Respostas da Estrela | Termos comerciais da API da Anthropic |
| ElevenLabs | Voz principal da Estrela | Termos da API do ElevenLabs (plano pago com licença comercial) |
| OpenAI (`gpt-4o-mini-tts`) | Voz de reserva da Estrela | Termos da API da OpenAI |
| MapLibre GL JS | Motor do mapa e do globo | BSD-3-Clause |
| PostgreSQL | Banco das contas e fazendas | PostgreSQL License |
| Vite, TypeScript | Build e linguagem | MIT, Apache-2.0 |
| Fontes Inter e JetBrains Mono (Google Fonts) | Tipografia | SIL Open Font License 1.1 |

## Uso de Super Intelligence (SI / IA)

Conforme o FAQ do Space Apps, descrevemos aqui como usamos ferramentas de SI:

- **Desenvolvimento do código:** boa parte do código foi escrita com o assistente Claude (Anthropic), via Claude Code, sob direção e revisão da equipe. Os commits feitos com ele aparecem com autoria "Claude" ou com a linha `Co-Authored-By` no histórico do git.
- **Imagens:** as cenas da abertura (`public/intro/*.jpg`) foram geradas com ferramentas de geração de imagem por SI. A foto da equipe com trajes de astronauta é uma montagem. Os ícones e a marca foram criados pela equipe.
- **Dentro do app:** a assistente Estrela usa o modelo Claude (Anthropic) para responder a partir dos dados da NASA e das regras agronômicas do app. A voz é sintetizada pelo ElevenLabs, com o modelo de fala da OpenAI (`gpt-4o-mini-tts`) como reserva.
- **O que não é SI:** as recomendações de plantio, rotação e risco vêm de regras explícitas e verificáveis em `src/utils/` (ZARC, Embrapa, limiares de clima), não de um modelo.

## Equipe

Equipe SpaceAgro — Rio Verde (GO), Brasil.
