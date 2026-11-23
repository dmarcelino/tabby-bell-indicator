// SPDX-License-Identifier: MIT
import * as path from 'node:path'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default (_env, argv) => {
    const isDev = argv.mode === 'development'
    return {
        target: 'node',
        entry: path.resolve(dirname, 'src/index.ts'),
        mode: isDev ? 'development' : 'production',
        devtool: isDev ? 'source-map' : false,
        output: {
            path: path.resolve(dirname, 'dist'),
            filename: 'index.js',
            library: { type: 'umd' },
            clean: true,
        },
        optimization: {
            minimize: false,
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /\.spec\.ts$/,
                    use: {
                        loader: 'ts-loader',
                        options: { onlyCompileBundledFiles: true },
                    },
                },
            ],
        },
        // Provided by Tabby at runtime. Never bundle these.
        externals: [
            /^@angular\//,
            /^@ng-bootstrap\//,
            /^rxjs(\/|$)/,
            /^tabby-/,
            ...builtinModules,
            ...builtinModules.map(m => `node:${m}`),
        ],
    }
}
