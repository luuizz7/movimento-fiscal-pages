# Movimento Fiscal — DNSA / NSA

Site estático para organizar notas fiscais e gerar um ZIP com a estrutura de pastas do Movimento Fiscal. Feito para funcionar diretamente no GitHub Pages, sem backend.

## Estrutura gerada

### DNSA

```text
Movimento Fiscal (DNSA) (Mês) de (Ano)/
├── Compras/
│   ├── Tiny/
│   │   ├── NFE/
│   │   └── NFC/
│   └── Mercado Livre/
└── Vendas/
    ├── Tiny/
    └── Mercado Livre/
```

### NSA

```text
Movimento Fiscal (NSA) (Mês) de (Ano)/
├── Compras/
│   ├── Tiny/
│   └── Mercado Livre/
└── Vendas/
    ├── Tiny/
    └── Mercado Livre/
```

## Recursos

- Seleção DNSA / NSA.
- Seleção de mês e ano.
- Layout em “visão explodida” da árvore de pastas.
- Arrastar arquivos ou pastas inteiras para cada destino.
- Seleção manual de múltiplos arquivos.
- Contagem e tamanho dos arquivos por pasta e no total.
- Geração do ZIP no próprio navegador.
- Barra de progresso durante a compactação.
- Botão de download liberado somente após o ZIP estar pronto.
- Nenhum arquivo é enviado para servidor.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo `movimento-fiscal`.
2. Envie **todos os arquivos deste projeto** para a raiz do repositório.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`.
6. Salve. Em alguns instantes o GitHub mostrará a URL do site.

## Teste local

Você pode abrir `index.html` diretamente no navegador. Para reproduzir melhor o ambiente do GitHub Pages, use um servidor local simples, por exemplo:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Dependências

Nenhuma. O gerador de ZIP foi implementado em JavaScript puro, sem CDN e sem bibliotecas externas.
