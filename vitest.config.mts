// SPDX-License-Identifier: MIT
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/*.spec.ts', 'site/**/*.spec.mjs'],
        environment: 'node',
    },
})
