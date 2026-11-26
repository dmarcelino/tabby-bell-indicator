// SPDX-License-Identifier: MIT
// Builds the project page into _site/ from README.md: `npm run site`.
// SITE_REF sets the git ref that links to repo files point to (default: main).
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPage, findMissing } from './render.mjs'

const siteDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(siteDir, '..')
const outDir = path.join(root, '_site')

/** Repo paths always use `/`; turn one into a path on this OS. */
const fromRepo = (base, repoPath) => path.join(base, ...repoPath.split('/'))

async function build () {
    const [readme, template, pkg] = await Promise.all([
        readFile(path.join(root, 'README.md'), 'utf8'),
        readFile(path.join(siteDir, 'template.html'), 'utf8'),
        readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
    ])
    const ref = process.env.SITE_REF || 'main'

    const page = buildPage({
        readme,
        template,
        description: pkg.description,
        ref,
        year: new Date().getUTCFullYear(),
    })

    // Remove any earlier output first, so a failed build leaves no page behind.
    await rm(outDir, { recursive: true, force: true })

    const missing = findMissing(page.paths, (p) => existsSync(fromRepo(root, p)))
    if (missing.length > 0) {
        throw new Error(`README links to files that don't exist: ${missing.join(', ')}`)
    }

    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'index.html'), page.html, 'utf8')
    await copyFile(path.join(siteDir, 'style.css'), path.join(outDir, 'style.css'))
    for (const asset of page.assets) {
        const target = fromRepo(outDir, asset)
        await mkdir(path.dirname(target), { recursive: true })
        await copyFile(fromRepo(root, asset), target)
    }

    const files = ['index.html', 'style.css', ...page.assets]
    console.log(`Built the page for ${ref} into _site/: ${files.join(', ')}`)
}

build().catch((error) => {
    console.error(`Site build failed: ${error.message}`)
    process.exitCode = 1
})
