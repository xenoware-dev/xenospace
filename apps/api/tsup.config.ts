import { defineConfig } from 'tsup';

export default defineConfig({
  // Separate entries: the migration CLI must not be part of the server bundle.
  entry: ['src/index.ts', 'src/db/migrate.cli.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // The shared workspace package is TS source, so it must be bundled in.
  noExternal: ['@xenospace/shared'],
  // Native and WASM-backed modules must stay external or their binaries break.
  external: ['@node-rs/argon2', '@electric-sql/pglite', 'pg-native'],
  banner: { js: "import { createRequire as _cr } from 'module'; const require = _cr(import.meta.url);" },
  // Migrations are read from disk at runtime, so the .sql files must ship
  // alongside the bundle.
  publicDir: false,
  onSuccess: 'node -e "const{cpSync,mkdirSync}=require(\'fs\');mkdirSync(\'dist/migrations\',{recursive:true});cpSync(\'src/db/migrations\',\'dist/migrations\',{recursive:true,filter:p=>!p.endsWith(\'.ts\')})"',
});
