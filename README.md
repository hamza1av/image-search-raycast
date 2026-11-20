# DuckDuckGo Image Search for Raycast

Search DuckDuckGo images from Raycast, browse them in a grid, and copy the image you pick to the clipboard as PNG. It's handy for dropping logos and icons into architecture diagrams (Excalidraw, draw.io, Figma, Keynote and so on).

No Python and no API key. The extension calls DuckDuckGo directly with Raycast's built-in `fetch` (`src/ddg.ts`): it first fetches a per-query token from the DuckDuckGo page, then queries the JSON endpoint behind the image tab. `scripts/ddg-images.sh` does the same with curl + jq for use in a terminal.

## Install (local, not from the Store)

You need Node 22+ (`brew install node`).

```bash
cd ddg-image-search
npm install
npm run dev        # opens Raycast and registers the extension
```

After the first `npm run dev`, the command stays in Raycast. You can stop the dev server with Ctrl+C and the extension keeps working.

## How it works

1. Type your query and press **↩** to search. Typing alone never starts a search.
2. In the results, **h / j / k / l** move left / down / up / right. You don't need a modifier key, and the arrow keys also work.
3. **↩** copies the selected image. **Esc** takes you back to the search with your query kept.

## Keys

| Key | Action |
| --- | --- |
| ↩ | Search (search screen) / copy image as PNG (results; pixels, so it pastes straight into most apps) |
| ⌘⇧F | Copy as PNG file (for Finder, Slack and other file drops) |
| ⌘S | Save PNG to ~/Downloads |
| ⌘Y | Larger preview |
| ⌘⇧C | Copy image URL |
| ⌘O / ⌘⇧O | Open source page / open image in browser |
| ⌘R | Reload results |

Use the dropdown on the right of the search bar to filter results. **Transparent** is the default, which mostly returns PNG logos and icons with no background. **Free to Share** limits results to openly licensed images.

Any format macOS can read (JPG, WebP, GIF and so on) is converted to PNG with the built-in `sips`. If a site blocks downloading the full-size file, the extension falls back to DuckDuckGo's thumbnail and tells you so.

## Preferences

Region, SafeSearch, Max Results, Grid Columns, and whether to close Raycast after copying. Turn that last one off to grab several images in a row.

## When search stops working

This uses DuckDuckGo's unofficial image endpoint. DuckDuckGo rate-limits heavy use (wait a minute) and may change the endpoint. If it breaks for good, the two requests in `src/ddg.ts` are the place to fix it. The open-source Python package [`ddgs`](https://github.com/deedy5/ddgs) tracks those changes and is a good reference.

## Terminal version (curl + jq)

```bash
scripts/ddg-images.sh "postgres logo" transparent
# width  height  image-url  title  (tab-separated)

# pick one with fzf and copy the URL:
scripts/ddg-images.sh "postgres logo" transparent | fzf --bind 'ctrl-j:down,ctrl-k:up' | cut -f3 | pbcopy
```
