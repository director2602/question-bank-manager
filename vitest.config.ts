import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The 'server-only' package intentionally throws when imported
      // outside a Next.js Server Component (see node_modules/server-only)
      // — Next itself resolves it to this same no-op empty.js file in any
      // context that isn't the RSC server bundle. Aliasing it here lets
      // Vitest unit-test server-only-tagged modules (lib/pdf, lib/docx,
      // lib/csv/paperCsvExport.ts, etc.) directly, the same way Next does.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
})
