# project-website Specification

## Purpose

Defines the plugin's public web page at `tabby-bell-indicator.dariomarcelino.com`: where its content comes from, what it shows and links to, how it looks, and when and where it is built and deployed.

## Requirements

### Requirement: Page content comes from the README
The page SHALL be generated from `README.md` each time it is built, and SHALL show all of the README's content in the same order. The repo SHALL NOT contain a hand-written copy of that content.

#### Scenario: README changes before a release
- **WHEN** a change to `README.md` is part of a released version
- **THEN** the page deployed for that version shows the changed text without any other file being edited

#### Scenario: README structures render
- **WHEN** the page is built from a README with headings, lists, a table, inline code, code blocks inside list items and an image
- **THEN** each of them appears on the page as the matching HTML element

### Requirement: Relative links in the README work on the page
Every relative link or image in the README SHALL work on the page. Images the README shows SHALL be served with the page. Links to other repo files SHALL point to that file on GitHub at the git ref the page was built from.

#### Scenario: Demo image
- **WHEN** the page is opened
- **THEN** the demo image from `doc/demo.gif` loads from the page's own domain and keeps its alt text

#### Scenario: Link to a repo file
- **WHEN** the page is built from tag `v0.2.0` and the README links to `doc/TESTING.md`
- **THEN** the link on the page points to `https://github.com/dmarcelino/tabby-bell-indicator/blob/v0.2.0/doc/TESTING.md`

#### Scenario: Absolute links are kept
- **WHEN** the README links to an absolute URL, such as the Tabby repository
- **THEN** the page links to the same URL, unchanged

### Requirement: Build fails on a broken relative link
The page build SHALL fail, with a message naming the link, if the README has a relative link or image whose target file does not exist in the repo.

#### Scenario: README links to a missing file
- **WHEN** the README links to `doc/missing.md` and no such file exists
- **THEN** the build exits with an error that names `doc/missing.md`, and produces no page

### Requirement: Page links to the source code and the npm package
The page SHALL link to the source repository `https://github.com/dmarcelino/tabby-bell-indicator` and to the npm package `https://www.npmjs.com/package/tabby-bell-indicator`, in the header, and SHALL link back to `https://dariomarcelino.com`.

#### Scenario: Visitor looks for the source
- **WHEN** a visitor opens the page
- **THEN** the header shows a "Source" link to the GitHub repository and an "npm" link to the npm package, and the avatar links to dariomarcelino.com

### Requirement: Page looks like dariomarcelino.com
The page SHALL use the same layout, fonts, colours, column width and header style as dariomarcelino.com, SHALL follow the visitor's light or dark system setting, and SHALL NOT run any JavaScript.

#### Scenario: Dark mode
- **WHEN** the visitor's system is set to dark mode
- **THEN** the page shows light text on a dark background, with the same colours as dariomarcelino.com in dark mode

#### Scenario: Phone-width screen
- **WHEN** the page is opened on a screen 360 CSS pixels wide
- **THEN** the text fits the width without the whole page scrolling sideways; only code blocks may scroll sideways

#### Scenario: No scripts
- **WHEN** the built page is inspected
- **THEN** it contains no `<script>` element and loads no script

### Requirement: Page is served at its own domain over HTTPS
The page SHALL be served at `https://tabby-bell-indicator.dariomarcelino.com/` with HTTPS enforced.

#### Scenario: Plain HTTP request
- **WHEN** a visitor opens `http://tabby-bell-indicator.dariomarcelino.com/`
- **THEN** they are redirected to the `https://` address and the page loads

### Requirement: Page is deployed after each release is published
After a release has been published to npm, the page SHALL be built from that release's tag and deployed. A release that fails before publishing SHALL NOT change the deployed page. Pull requests SHALL NOT deploy the page.

#### Scenario: Successful release
- **WHEN** tag `v0.2.0` is pushed and the release publishes version 0.2.0 to npm
- **THEN** the page is rebuilt from `v0.2.0` and deployed, and its links to repo files point to `v0.2.0`

#### Scenario: Release fails before publishing
- **WHEN** a pushed version tag fails its checks and nothing is published to npm
- **THEN** the deployed page stays as it was

#### Scenario: Pull request
- **WHEN** a pull request is opened or updated
- **THEN** the page is built but not deployed

### Requirement: Page can be deployed by hand
The maintainer SHALL be able to start a deploy by hand, from `main` or from a release tag, without making a release.

#### Scenario: Styling fix between releases
- **WHEN** the maintainer starts the page deploy by hand on `main`
- **THEN** the page is built from `main` and deployed, and its links to repo files point to `main`

### Requirement: Page build is checked in CI
Every pull request and every push to `main` SHALL build the page on Linux, macOS and Windows. A failed page build SHALL mark the check as failed.

#### Scenario: Pull request breaks a README link
- **WHEN** a pull request makes the README link to a file that doesn't exist
- **THEN** the CI check on that pull request reports failure on each operating system
