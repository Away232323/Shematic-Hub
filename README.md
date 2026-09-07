# Schematic Hub

Minecraft Schematic storefront for **Away232323**.

## Features

- Public catalog with search, category filters and price filters
- Categories: Traps, Builds, Farms, Redstone, PvP, Decoration and Other
- Price range: Free to 5 €
- Free schematics can be uploaded directly as `.litematic`, `.schem` or `.schematic`
- Preview images supported
- Admin upload page writes directly to this repository through the GitHub API
- Admin access is currently hard-limited to the GitHub account `Away232323`
- Automatic GitHub Pages deployment

## Admin upload

Open `admin.html` on the live site.

Create a **Fine-grained Personal Access Token** in GitHub with access only to this repository and the repository permission:

- Contents: Read and write

The token is entered into the admin page and stored only in browser `sessionStorage` for the current session. It is never committed into this repository.

## Free vs Paid

Free schematics are stored in the public repository and can be downloaded directly.

Paid schematic files are intentionally **not** uploaded to this public repository because that would allow users to bypass payment by opening the raw GitHub file. A paid listing therefore stores a price and a purchase URL instead. Use a payment/download service for the actual paid file delivery.

## Data

Catalog metadata is stored in `data/schematics.json`.
Free files are stored in `schematics/` and preview images in `previews/`.
