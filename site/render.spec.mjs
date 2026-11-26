// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REPO_URL, SITE_URL, buildPage, fillTemplate, findMissing, renderReadme, repoPath } from './render.mjs'

const template = readFileSync(new URL('./template.html', import.meta.url), 'utf8')

describe('repoPath', () => {
    it('ignores absolute URLs and in-page anchors', () => {
        for (const href of ['https://github.com/Eugeny/tabby', 'http://example.com', 'mailto:a@example.com', '//cdn.example.com/x', '#install', '']) {
            expect(repoPath(href)).toBeNull()
        }
    })

    it('normalizes relative paths and keeps the query and anchor', () => {
        expect(repoPath('doc/TESTING.md')).toEqual({ path: 'doc/TESTING.md', suffix: '' })
        expect(repoPath('./doc/../LICENSE#mit')).toEqual({ path: 'LICENSE', suffix: '#mit' })
        expect(repoPath('/src/tabbyAdapter.ts?plain=1#L10')).toEqual({ path: 'src/tabbyAdapter.ts', suffix: '?plain=1#L10' })
        expect(repoPath('doc/my%20file.md')).toEqual({ path: 'doc/my file.md', suffix: '' })
    })

    it('rejects paths outside the repo', () => {
        expect(() => repoPath('../other/README.md')).toThrow(/outside the repo/)
    })
})

describe('renderReadme', () => {
    it('leaves absolute links and anchors unchanged', () => {
        const { html, paths } = renderReadme('[Tabby](https://github.com/Eugeny/tabby) and [below](#install)')
        expect(html).toContain('<a href="https://github.com/Eugeny/tabby">Tabby</a>')
        expect(html).toContain('<a href="#install">below</a>')
        expect(paths).toEqual([])
    })

    it('points relative links to GitHub at the given ref, keeping anchors', () => {
        const md = '[tests](doc/TESTING.md), [license](LICENSE#text), [adapter](src/tabbyAdapter.ts)'
        const { html, paths } = renderReadme(md, { ref: 'v0.2.0' })
        expect(html).toContain(`href="${REPO_URL}/blob/v0.2.0/doc/TESTING.md"`)
        expect(html).toContain(`href="${REPO_URL}/blob/v0.2.0/LICENSE#text"`)
        expect(html).toContain(`href="${REPO_URL}/blob/v0.2.0/src/tabbyAdapter.ts"`)
        expect(paths).toEqual(['doc/TESTING.md', 'LICENSE', 'src/tabbyAdapter.ts'])
    })

    it('uses main when no ref is given', () => {
        const { html } = renderReadme('[tests](doc/TESTING.md)')
        expect(html).toContain(`href="${REPO_URL}/blob/main/doc/TESTING.md"`)
    })

    it('encodes refs and paths in URLs', () => {
        const { html } = renderReadme('[notes](doc/my%20notes.md)', { ref: 'feature/x y' })
        expect(html).toContain(`href="${REPO_URL}/blob/feature/x%20y/doc/my%20notes.md"`)
    })

    it('keeps relative images relative and lists them as assets', () => {
        const { html, assets, paths } = renderReadme('![A tab rings the bell.](./doc/demo.gif)')
        expect(html).toContain('<img src="doc/demo.gif" alt="A tab rings the bell.">')
        expect(assets).toEqual(['doc/demo.gif'])
        expect(paths).toEqual(['doc/demo.gif'])
    })

    it('renders the Markdown structures the README uses', () => {
        const md = [
            '# Title',
            '## Section',
            '- item with `code`',
            '',
            '| Where | When |',
            '|---|---|',
            '| here | now |',
            '',
            '1. Step:',
            '   ```sh',
            '   npm ci',
            '   ```',
            '',
            '![alt](doc/demo.gif)',
        ].join('\n')
        const { html } = renderReadme(md)
        expect(html).toContain('<h1>Title</h1>')
        expect(html).toContain('<h2>Section</h2>')
        expect(html).toContain('<li>item with <code>code</code></li>')
        expect(html).toMatch(/<table>[\s\S]*<th>Where<\/th>[\s\S]*<td>here<\/td>[\s\S]*<\/table>/)
        expect(html).toMatch(/<ol>\s*<li>Step:<pre><code class="language-sh">npm ci\n<\/code><\/pre>/)
        expect(html).toContain('<img src="doc/demo.gif" alt="alt">')
    })

    it('takes the title from the first top-level heading, as plain text', () => {
        expect(renderReadme('Intro\n\n## Sub\n\n# `tabby`-bell\n\n# Later').title).toBe('tabby-bell')
        expect(renderReadme('## Only a subheading').title).toBeNull()
    })
})

describe('fillTemplate', () => {
    it('escapes values except raw ones', () => {
        const out = fillTemplate('<t>{{a}}</t>{{b}}', { a: '<x & "y">', b: '<p>ok</p>' }, { raw: ['b'] })
        expect(out).toBe('<t>&lt;x &amp; &quot;y&quot;&gt;</t><p>ok</p>')
    })

    it('fails on a placeholder without a value', () => {
        expect(() => fillTemplate('{{missing}}', {})).toThrow(/\{\{missing\}\}/)
    })
})

describe('findMissing', () => {
    it('returns the paths that do not exist', () => {
        const existing = new Set(['LICENSE', 'doc/demo.gif'])
        expect(findMissing(['LICENSE', 'doc/missing.md', 'doc/demo.gif'], (p) => existing.has(p))).toEqual(['doc/missing.md'])
    })
})

describe('buildPage', () => {
    const readme = '# tabby-bell-indicator\n\nSee [tests](doc/TESTING.md).\n\n![demo](doc/demo.gif)\n'
    const page = buildPage({ readme, template, description: 'Shows a bell & more', ref: 'v1.2.3', year: 2026 })

    it('fills the template with the README, title and metadata', () => {
        expect(page.html).toContain('<title>tabby-bell-indicator</title>')
        expect(page.html).toContain('<meta name="description" content="Shows a bell &amp; more">')
        expect(page.html).toContain(`<link rel="canonical" href="${SITE_URL}">`)
        expect(page.html).toContain('<h1>tabby-bell-indicator</h1>')
        expect(page.html).toContain(`href="${REPO_URL}/blob/v1.2.3/doc/TESTING.md"`)
        expect(page.html).toContain('&copy; 2026')
        expect(page.html).not.toMatch(/\{\{\w+\}\}/)
    })

    it('links to the source, npm and dariomarcelino.com', () => {
        expect(page.html).toContain(`<a href="${REPO_URL}">Source</a>`)
        expect(page.html).toContain('<a href="https://www.npmjs.com/package/tabby-bell-indicator">npm</a>')
        expect(page.html).toMatch(/<a class="avatar-link" href="https:\/\/dariomarcelino\.com"/)
        expect(page.html).toContain(`href="${REPO_URL}/blob/v1.2.3/LICENSE"`)
    })

    it('contains no script', () => {
        expect(page.html).not.toMatch(/<script/i)
    })

    it('lists assets, and every repo path to check including LICENSE', () => {
        expect(page.assets).toEqual(['doc/demo.gif'])
        expect(page.paths).toEqual(['doc/TESTING.md', 'doc/demo.gif', 'LICENSE'])
    })

    it('fails without a top-level heading', () => {
        expect(() => buildPage({ readme: 'no heading', template, description: '', year: 2026 })).toThrow(/heading/)
    })
})

describe('the real README', () => {
    it('builds without errors and keeps every section', () => {
        const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
        const { html } = buildPage({ readme, template, description: 'x', year: 2026 })
        for (const heading of readme.match(/^#{1,3} .+$/gm)) {
            const text = heading.replace(/^#+ /, '')
            expect(html).toContain(`>${text}</h`)
        }
    })
})
