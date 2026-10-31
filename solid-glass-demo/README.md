# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Solid Glass (this sandbox)

Set up with the Solid Glass README: Vite + React 19 + Tailwind 4, `npx shadcn@latest init --template vite --base base --preset nova`,
then `npx shadcn@latest add deeplethe/solid-glass/solid-glass`. `src/index.css` imports Tailwind, tw-animate-css, shadcn/tailwind.css and
`./solid-glass.css`, and nothing else (the `:root` / `.dark` variables from `shadcn init` were removed).

Run it: `npm install && npm run dev` (http://localhost:5195). Separate from `frontend/` on purpose: Anees is on React 18 with no Tailwind.
