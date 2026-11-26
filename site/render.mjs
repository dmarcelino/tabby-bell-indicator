// SPDX-License-Identifier: MIT
// Turns README.md into the project page. Nothing here touches the file
// system, so it can be tested with plain strings; site/build.mjs does the I/O.
import { Marked } from 'marked'
import posix from 'node:path/posix'

export const REPO_URL = 'https://github.com/dmarcelino/tabby-bell-indicator'
export const SITE_URL = 'https://tabby-bell-indicator.dariomarcelino.com/'

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Splits `doc/a.md?x=1#part` into the path and the `?query#anchor` suffix. */
function splitHref (href) {
    const cut = href.search(/[?#]/)
    return cut === -1 ? { path: href, suffix: '' } : { path: href.slice(0, cut), suffix: href.slice(cut) }
}

/** Encodes each segment of a `/`-separated path for use in a URL. */
const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/')

/**
 * Resolves a README href. Absolute URLs and in-page anchors return null.
 * Anything else is a path relative to the repo root (as on GitHub, a
 * leading `/` also means the repo root), returned decoded and normalized.
 */
export function repoPath (href) {
    if (href === '' || href.startsWith('#') || href.startsWith('//') || SCHEME.test(href)) {
        return null
    }
    const { path, suffix } = splitHref(href)
    let decoded
    try {
        decoded = decodeURIComponent(path)
    } catch {
        throw new Error(`README link "${href}" is not a valid URL path`)
    }
    const normalized = posix.normalize(decoded.replace(/^\/+/, ''))
    if (normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`README link "${href}" points outside the repo`)
    }
    return { path: normalized === '.' ? '' : normalized, suffix }
}

/** Recursively collects the visible text of inline tokens. */
function plainText (tokens) {
    return tokens.map((t) => (t.tokens ? plainText(t.tokens) : t.text ?? '')).join('')
}

/**
 * Renders README Markdown to HTML.
 * - Relative images keep a relative URL and are listed in `assets`, so they
 *   are served next to the page.
 * - Other relative links point to the file on GitHub at `ref`.
 * - Every repo path the README refers to is listed in `paths`, so the build
 *   can check that each one exists.
 */
export function renderReadme (markdown, { ref = 'main' } = {}) {
    const assets = new Set()
    const paths = new Set()
    let title = null
    const blobBase = `${REPO_URL}/blob/${encodePath(ref)}/`

    const marked = new Marked({
        gfm: true,
        walkTokens (token) {
            if (token.type === 'heading' && token.depth === 1 && title === null) {
                title = plainText(token.tokens).trim()
            }
            if (token.type !== 'link' && token.type !== 'image') {
                return
            }
            const target = repoPath(token.href)
            if (!target) {
                return
            }
            paths.add(target.path)
            if (token.type === 'image') {
                assets.add(target.path)
                token.href = encodePath(target.path) + target.suffix
            } else {
                token.href = blobBase + encodePath(target.path) + target.suffix
            }
        },
    })

    const html = marked.parse(markdown).trim()
    return { html, title, assets: [...assets], paths: [...paths] }
}

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/**
 * Replaces `{{name}}` placeholders. Values are HTML-escaped, except the keys
 * listed in `raw`. A placeholder without a value is an error, so a typo in
 * the template can't reach the page.
 */
export function fillTemplate (template, values, { raw = [] } = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        if (!(key in values)) {
            throw new Error(`Template placeholder {{${key}}} has no value`)
        }
        return raw.includes(key) ? String(values[key]) : escapeHtml(values[key])
    })
}

/** Returns the repo paths for which `exists(path)` is false. */
export function findMissing (paths, exists) {
    return paths.filter((p) => !exists(p))
}

/** Builds the full page from the README, the template and package metadata. */
export function buildPage ({ readme, template, description, ref = 'main', year }) {
    const { html, title, assets, paths } = renderReadme(readme, { ref })
    if (!title) {
        throw new Error('README has no top-level "# " heading to use as the page title')
    }
    const page = fillTemplate(template, {
        title,
        description,
        canonical: SITE_URL,
        sourceUrl: REPO_URL,
        licenseUrl: `${REPO_URL}/blob/${encodePath(ref)}/LICENSE`,
        year,
        content: html,
    }, { raw: ['content'] })
    return { html: page, assets, paths: [...new Set([...paths, 'LICENSE'])] }
}
