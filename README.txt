# PontoPro — Empresa (V2) — Arquivos Separados

## Como usar (local)
1) Abra o `index.html` no navegador.
- Observação: alguns navegadores bloqueiam módulos via `file://`.
- Se acontecer, rode um servidor local simples.

### Jeito rápido (Windows)
- Abra o terminal na pasta e rode:
  - `python -m http.server 5173`
- Depois abra:
  - `http://localhost:5173`

## Vercel
Você pode subir essa pasta como site estático.
- `index.html` é a entrada.

## Supabase
Crie as tabelas `employees_v2` e `entries_v2` (o SQL aparece no app se faltar).
Auth: cada pessoa tem login. (nesta versão: todos podem ver/editar tudo)

## Onde trocar URL/KEY
`js/config.js`
