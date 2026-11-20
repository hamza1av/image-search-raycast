#!/usr/bin/env bash
# DuckDuckGo image search with curl + jq (no Python).
#
#   ./ddg-images.sh "kafka logo"               # any type
#   ./ddg-images.sh "kafka logo" transparent   # transparent | clipart | line | photo | gif
#
# Prints one result per line: width<TAB>height<TAB>image-url<TAB>title
# Pipe into fzf to pick one, e.g.:
#   ./ddg-images.sh "kafka logo" transparent | fzf --bind 'ctrl-j:down,ctrl-k:up' | cut -f3
set -euo pipefail

query="${1:?usage: ddg-images.sh <query> [type]}"
type="${2:-}"
region="${DDG_REGION:-wt-wt}"
ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

command -v jq >/dev/null || { echo "jq is required (brew install jq)" >&2; exit 1; }

# 1) Get the per-query token DuckDuckGo embeds in its HTML page.
vqd=$(curl -fsSG -A "$ua" --data-urlencode "q=$query" -d ia=images -d iax=images https://duckduckgo.com/ \
  | grep -oE "vqd=[\"']?[0-9-]+" | head -n1 | sed -E "s/^vqd=[\"']?//") || true
if [[ -z "$vqd" ]]; then
  echo "Could not get a search token from DuckDuckGo (probably rate-limited, try again in a minute)." >&2
  exit 1
fi

# 2) Ask the JSON endpoint behind the image tab. Filter slots: time,size,color,type,layout,license
args=(--data-urlencode "q=$query" --data-urlencode "vqd=$vqd" -d o=json -d "l=$region" -d p=1)
[[ -n "$type" ]] && args+=(--data-urlencode "f=,,,type:$type,,")

curl -fsSG -A "$ua" -H 'Referer: https://duckduckgo.com/' -H 'Accept: application/json' \
  "${args[@]}" https://duckduckgo.com/i.js \
  | jq -r '.results[] | [.width, .height, .image, .title] | @tsv'
