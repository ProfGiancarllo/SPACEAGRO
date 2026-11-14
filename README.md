# SpaceAgro

Aplicação web aberta que ajuda o produtor rural a decidir **o que plantar, quando plantar e como rotacionar culturas**, cruzando dados de satélite e clima da NASA com o mapa dos talhões da fazenda, o zoneamento de risco climático e o diário de safra.

Projeto da equipe SpaceAgro para o **NASA Space Apps Challenge 2026**, desafio *Adapting Farms with NASA Data*, evento local de Rio Verde (GO). Não é um produto comercial: o código é aberto e livre para qualquer pessoa usar.

- Site publicado: https://profgiancarllo.github.io/myroca/
- Documentação técnica: [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)
- Roteiro da demonstração: [docs/roteiro-demonstracao.md](docs/roteiro-demonstracao.md)

## Como rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:3000. O app funciona sem servidor próprio; a assistente Estrela (conversa e voz) precisa do Worker descrito em [worker/LEIA-ME.md](worker/LEIA-ME.md).

## Licença

Código e conteúdo originais da equipe: [Apache License 2.0](LICENSE).

## Dados da NASA usados

| Dado | Para que serve no app | Fonte |
|---|---|---|
| NASA POWER (chuva, temperatura, radiação, umidade) | Clima do talhão, janela de semeadura, diário de safra | https://power.larc.nasa.gov |
| NASA GIBS (VIIRS NOAA-20 / MODIS cor verdadeira) | Camada de satélite diária no mapa | https://gibs.earthdata.nasa.gov |
| NASA FIRMS (focos de calor VIIRS 375 m) | Alerta de fogo perto da fazenda | https://firms.modaps.eosdis.nasa.gov |
| Landsat 8/9 Collection 2 Level-2 (NASA/USGS) | Saúde da lavoura por talhão (verde e água na folha) | via Microsoft Planetary Computer |
| MODIS 13Q1, 15A2H, 16A2 v6.1 (NDVI, EVI, LAI, FPAR, ET) | Séries históricas no caderno de análise ([colab/](colab/)) | via Microsoft Planetary Computer |

Dados da NASA e do USGS são de domínio público (governo dos EUA).

## Materiais de terceiros e licenças

| Material | Uso | Licença / termos |
|---|---|---|
| Microsoft Planetary Computer | Espelho em COG dos dados Landsat e MODIS | Dados NASA/USGS em domínio público; termos de uso do Planetary Computer |
| Open-Meteo | Previsão do tempo e complemento do histórico recente | CC BY 4.0 — https://open-meteo.com |
| FRED (Federal Reserve Bank of St. Louis) | Preços internacionais de soja, milho, trigo e algodão (séries do FMI, *Primary Commodity Prices*) e dólar (DEXBZUS) | Dados públicos; fontes originais: FMI e Federal Reserve Board |
| OpenStreetMap | Mapa de ruas (camada opcional) | ODbL — © OpenStreetMap contributors |
| Esri World Imagery e rótulos | Imagem de satélite de alta resolução (camada padrão do mapa) | Termos de uso da Esri, com crédito no mapa. **Não é licença aberta**: pode ser trocada pela camada NASA GIBS ou OSM no seletor de camadas |
| ZARC — Zoneamento Agrícola de Risco Climático (MAPA) | Janelas de plantio de Rio Verde | Dados abertos do governo federal (Brasil) |
| CONAB — séries históricas e levantamentos de safra | Produtividade de Goiás | Dados abertos do governo federal (Brasil) |
| SICAR — Cadastro Ambiental Rural | Limites da fazenda de demonstração (CAR GO-5218805-945560B98BAC4CAC87AECD90F33C618A) | Dados públicos do SICAR; o arquivo não traz nome nem documento do proprietário |
| Embrapa | Regras agronômicas de rotação de culturas | Publicações técnicas públicas, citadas em `src/utils/rotation.ts` |
| MapLibre GL JS | Motor do mapa | BSD-3-Clause |
| Vite, TypeScript | Build e linguagem | MIT, Apache-2.0 |
| Fontes Inter e JetBrains Mono (Google Fonts) | Tipografia | SIL Open Font License 1.1 |

## Uso de Super Intelligence (SI / IA)

Conforme o FAQ do Space Apps, descrevemos aqui como usamos ferramentas de SI:

- **Desenvolvimento do código:** boa parte do código foi escrita com o assistente Claude (Anthropic), via Claude Code, sob direção e revisão da equipe. Os commits feitos com ele aparecem com autoria "Claude" ou com a linha `Co-Authored-By` no histórico do git.
- **Imagens:** as cenas da abertura (`public/intro/*.jpg`) foram geradas com ferramentas de geração de imagem por SI. Os ícones e a marca foram criados pela equipe.
- **Dentro do app:** a assistente virtual Estrela usa o modelo Claude (Anthropic) para responder perguntas a partir dos dados da NASA e das regras agronômicas do app, e a voz é sintetizada pelo modelo de fala da OpenAI (`gpt-4o-mini-tts`). As respostas indicam a fonte dos dados.
- **O que não é SI:** as recomendações de plantio, rotação e risco vêm de regras explícitas e verificáveis em `src/utils/` (ZARC, Embrapa, limiares de clima), não de um modelo.

## Equipe

Equipe SpaceAgro — Rio Verde (GO), Brasil.
