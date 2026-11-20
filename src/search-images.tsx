import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Detail,
  getPreferenceValues,
  Grid,
  Icon,
  open,
  showHUD,
  showInFinder,
  showToast,
  Toast,
  Keyboard,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { clearCache, copyPngData, getLocalPng, saveToDownloads } from "./clipboard";
import { ImageResult, Prefs, searchImages } from "./ddg";

// Encoded as "type|license" so one dropdown can hold both filters.
const FILTERS = [
  { value: "transparent|", title: "Transparent (PNG-style)" },
  { value: "clipart|", title: "Clip Art" },
  { value: "line|", title: "Line Drawing" },
  { value: "|", title: "Any Type" },
  { value: "photo|", title: "Photos" },
  { value: "transparent|Share", title: "Transparent · Free to Share" },
  { value: "|Share", title: "Any · Free to Share" },
];

export default function SearchImages() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("transparent|");
  const { push } = useNavigation();
  const q = query.trim();

  return (
    <Grid
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search DuckDuckGo images, press ↵ to search… (e.g. postgres logo)"
      searchBarAccessory={<FilterDropdown value={filter} onChange={setFilter} />}
    >
      <Grid.EmptyView
        icon={Icon.MagnifyingGlass}
        title={q.length > 1 ? `Press ↵ to search for “${q}”` : "Type a query and press ↵"}
        description="In the results: h j k l to move · ↵ to copy · esc for a new search"
        actions={
          q.length > 1 ? (
            <ActionPanel>
              <Action
                title="Search"
                icon={Icon.MagnifyingGlass}
                onAction={() => push(<Results query={q} filter={filter} onFilterChange={setFilter} />)}
              />
            </ActionPanel>
          ) : undefined
        }
      />
    </Grid>
  );
}

function FilterDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Grid.Dropdown tooltip="Image type" storeValue value={value} onChange={onChange}>
      {FILTERS.map((f) => (
        <Grid.Dropdown.Item key={f.value} value={f.value} title={f.title} />
      ))}
    </Grid.Dropdown>
  );
}

// Raycast keeps keyboard focus in the search bar, so the results view keeps it empty and treats
// typed h/j/k/l as movement keys instead of text.
const MOVES: Record<string, "left" | "down" | "up" | "right"> = { h: "left", j: "down", k: "up", l: "right" };

function Results({
  query,
  filter: initialFilter,
  onFilterChange,
}: {
  query: string;
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  const prefs = getPreferenceValues<Prefs>();
  const columns = Number(prefs.columns) || 5;
  const [filter, setFilter] = useState(initialFilter);
  const [type, license] = filter.split("|");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const { data, isLoading, error, revalidate } = useCachedPromise(
    (q: string, t: string, l: string) => searchImages(q, { type: t, license: l }),
    [query, type, license],
    { keepPreviousData: true, failureToastOptions: { title: "Image search failed" } },
  );
  const results = data ?? [];

  function handleKeys(text: string) {
    if (results.length === 0) return;
    let index = Math.max(
      0,
      results.findIndex((r) => r.image === selectedId),
    );
    for (const ch of text.toLowerCase()) {
      const move = MOVES[ch];
      if (move === "left") index -= 1;
      else if (move === "right") index += 1;
      else if (move === "down") index += columns;
      else if (move === "up") index -= columns;
      index = Math.min(results.length - 1, Math.max(0, index));
    }
    setSelectedId(results[index].image);
  }

  return (
    <Grid
      columns={columns}
      aspectRatio="1"
      fit={Grid.Fit.Contain}
      inset={Grid.Inset.Small}
      filtering={false}
      isLoading={isLoading}
      navigationTitle={query}
      searchText=""
      onSearchTextChange={handleKeys}
      selectedItemId={selectedId}
      onSelectionChange={(id) => id && setSelectedId(id)}
      searchBarPlaceholder={`“${query}”  ·  h j k l move  ·  ↵ copy  ·  esc new search`}
      searchBarAccessory={
        <FilterDropdown
          value={filter}
          onChange={(v) => {
            setFilter(v);
            onFilterChange(v);
          }}
        />
      }
    >
      {error && results.length === 0 ? (
        <Grid.EmptyView
          icon={Icon.ExclamationMark}
          title="Search failed"
          description={error.message}
          actions={
            <ActionPanel>
              <Action title="Try Again" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      ) : (
        !isLoading && <Grid.EmptyView icon={Icon.Image} title="No images found" />
      )}
      {results.map((item) => (
        <Grid.Item
          key={item.image}
          id={item.image}
          content={{ source: item.thumbnail, fallback: Icon.Image }}
          title={item.title}
          subtitle={sizeLabel(item)}
          actions={<ImageActions item={item} onRefresh={revalidate} />}
        />
      ))}
    </Grid>
  );
}

function sizeLabel(item: ImageResult): string {
  const size = item.width && item.height ? `${item.width}×${item.height}` : "";
  return [size, item.domain].filter(Boolean).join(" · ");
}

/** Downloads/converts the image, runs `fn` on the local PNG, and reports the message `fn` returns. */
async function withImage(item: ImageResult, verb: string, fn: (file: string) => Promise<string>) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `${verb}…` });
  try {
    const { path, usedThumbnail } = await getLocalPng(item);
    const done = await fn(path);
    const note = usedThumbnail ? " (thumbnail — full size was blocked)" : "";
    if (getPreferenceValues<Prefs>().closeAfterCopy) {
      await toast.hide();
      await showHUD(`${done}${note}`);
      await closeMainWindow();
    } else {
      toast.style = Toast.Style.Success;
      toast.title = done;
      toast.message = note.trim() || undefined;
    }
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = `${verb} failed`;
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

function ImageActions({
  item,
  onRefresh,
  inDetail,
}: {
  item: ImageResult;
  onRefresh?: () => void;
  inDetail?: boolean;
}) {
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action
          title="Copy Image as PNG"
          icon={Icon.Clipboard}
          onAction={() => withImage(item, "Copying image", (f) => copyPngData(f).then(() => "Copied image"))}
        />
        <Action
          title="Copy as PNG File"
          icon={Icon.Document}
          shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
          onAction={() =>
            withImage(item, "Copying file", (f) => Clipboard.copy({ file: f }).then(() => "Copied PNG file"))
          }
        />
        <Action
          title="Save PNG to Downloads"
          icon={Icon.SaveDocument}
          shortcut={Keyboard.Shortcut.Common.Save}
          onAction={() =>
            withImage(item, "Saving", async (f) => {
              const dest = await saveToDownloads(f);
              await showInFinder(dest);
              return "Saved to Downloads";
            })
          }
        />
        {!inDetail && (
          <Action.Push
            title="Preview"
            icon={Icon.Eye}
            shortcut={Keyboard.Shortcut.Common.ToggleQuickLook}
            target={<ImagePreview item={item} />}
          />
        )}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy Image URL" content={item.image} shortcut={Keyboard.Shortcut.Common.Copy} />
        {item.url && (
          <Action.OpenInBrowser title="Open Source Page" url={item.url} shortcut={Keyboard.Shortcut.Common.Open} />
        )}
        <Action
          title="Open Image in Browser"
          icon={Icon.Globe}
          shortcut={Keyboard.Shortcut.Common.OpenWith}
          onAction={() => open(item.image)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        {onRefresh && (
          <Action
            title="Reload Results"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={onRefresh}
          />
        )}
        <Action
          title="Clear Image Cache"
          icon={Icon.Trash}
          onAction={async () => {
            await clearCache();
            await showToast({ title: "Image cache cleared" });
          }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function ImagePreview({ item }: { item: ImageResult }) {
  return (
    <Detail
      navigationTitle={item.title || "Preview"}
      markdown={`![${item.title.replace(/[[\]]/g, "")}](${item.image})`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Title" text={item.title} />
          {item.width > 0 && <Detail.Metadata.Label title="Size" text={`${item.width} × ${item.height}`} />}
          {item.domain && <Detail.Metadata.Label title="Domain" text={item.domain} />}
          {item.url && <Detail.Metadata.Link title="Source" target={item.url} text="Open page" />}
        </Detail.Metadata>
      }
      actions={<ImageActions item={item} inDetail />}
    />
  );
}
