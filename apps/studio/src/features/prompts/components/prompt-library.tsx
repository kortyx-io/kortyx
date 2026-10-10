"use client";
import type { PromptContent } from "@kortyx/prompts";
import type {
  PromptCategory,
  PromptLibrary,
  PromptMutation,
} from "@kortyx/telemetry-contracts";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs";
import { Collapsible } from "radix-ui";
import { useRef, useState } from "react";
import {
  DataTable,
  type DataTableColumn,
  DataTableProvider,
} from "@/components/data-table";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { DetailLink } from "@/components/detail/detail-link";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter } from "@/lib/scoped-navigation";
import { promptRequest } from "../api/client";
import {
  usePromptLibrary,
  useRefreshPromptData,
} from "../hooks/use-prompt-data";
import { categoryPath, initialPrompt } from "../lib/presentation";
import { PromptActionSurface } from "./prompt-action-surface";
import {
  assetActions,
  PromptAssetActionDialog,
  PromptAssetMenu,
} from "./prompt-asset-actions";
import { PromptBulkActions } from "./prompt-bulk-actions";
import { PromptDiff } from "./prompt-diff";
import { PromptFields, validateEditor } from "./prompt-fields";
import { PromptImport } from "./prompt-import";

type CategoryAction = {
  type: "create" | "rename" | "move" | "delete";
  category?: PromptCategory;
};
export function PromptLibraryView({
  initial,
  initialError = "",
  categoryId,
}: {
  initial: PromptLibrary | null;
  initialError?: string;
  categoryId?: string;
}) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoryTrigger = useRef<HTMLButtonElement>(null);
  const closeCategories = () => {
    setCategoriesOpen(false);
    categoryTrigger.current?.focus();
  };
  const router = useRouter(),
    [error, setError] = useState(initialError),
    [working, setWorking] = useState(false);
  const [query, setQuery] = useStudioQueryStates(
    {
      assetAction: parseAsStringLiteral(assetActions),
      actionAsset: parseAsString,
      q: parseAsString.withDefault(""),
      cursor: parseAsString.withDefault("0"),
      archived: parseAsString.withDefault("false"),
      collapsed: parseAsArrayOf(parseAsString).withDefault([]),
    },
    // Client-only panels must not replay an older transition after dismissal.
    { shallow: true, startTransition: undefined },
  );
  const [categoryAction, setCategoryAction] = useState<CategoryAction | null>(
      null,
    ),
    [name, setName] = useState(""),
    [destination, setDestination] = useState("");
  const [creating, setCreating] = useState(false),
    [promptName, setPromptName] = useState(""),
    [key, setKey] = useState(""),
    [content, setContent] = useState<PromptContent>(
      structuredClone(initialPrompt),
    ),
    [review, setReview] = useState<PromptContent | null>(null),
    [fieldsValid, setFieldsValid] = useState(true);
  const [selected, setSelected] = useState<PromptLibrary["assets"]>([]),
    [importing, setImporting] = useState(false);
  const libraryPath = `library?${new URLSearchParams({ search: query.q, cursor: query.cursor, archived: query.archived, ...(categoryId ? { categoryId } : {}) })}`;
  const {
    data: library,
    error: readError,
    isLoading: loading,
  } = usePromptLibrary(initial, libraryPath);
  const refreshPromptData = useRefreshPromptData();
  const refresh = async () => {
    await refreshPromptData();
  };
  const categories = library?.categories ?? [],
    permissions = library?.permissions;
  const run = async (mutation: PromptMutation) => {
    setWorking(true);
    setError("");
    try {
      await promptRequest("actions", mutation);
      await refresh();
      setCategoryAction(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Prompt action failed.",
      );
    } finally {
      setWorking(false);
    }
  };
  const categoryForm = (action: CategoryAction) => {
    setCategoriesOpen(false);
    setName(
      action.type === "create"
        ? action.category
          ? `${categoryPath(categories, action.category.id).replace(/ \/ /g, "/")}/`
          : ""
        : (action.category?.name ?? ""),
    );
    setDestination(
      action.type === "move" ? (action.category?.parentId ?? "root") : "",
    );
    setError("");
    setCategoryAction(action);
  };
  const categoryActions = (category: PromptCategory) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label={`${category.name} category actions`}
          disabled={!permissions?.edit}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="data-[state=closed]:animate-none!"
      >
        <DropdownMenuItem
          onSelect={() => categoryForm({ type: "create", category })}
        >
          New subcategory
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => categoryForm({ type: "rename", category })}
        >
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => categoryForm({ type: "move", category })}
        >
          Move category
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => categoryForm({ type: "delete", category })}
        >
          Delete category…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const tree = (parentId: string | null, depth = 0): React.ReactNode =>
    categories
      .filter((category) => category.parentId === parentId)
      .map((category) => {
        const hasChildren = categories.some(
            (child) => child.parentId === category.id,
          ),
          collapsed = query.collapsed.includes(category.id);
        return (
          <div key={category.id}>
            <div
              className={`flex items-center rounded-md ${categoryId === category.id ? "bg-muted" : "hover:bg-muted/50"}`}
              style={{ paddingLeft: Math.min(depth, 5) * 12 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${category.name}`}
                disabled={!hasChildren}
                onClick={() =>
                  void setQuery({
                    collapsed: collapsed
                      ? query.collapsed.filter((id) => id !== category.id)
                      : [...query.collapsed, category.id],
                  })
                }
              >
                {hasChildren &&
                  (collapsed ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  ))}
              </Button>
              <Link
                onClick={() => setCategoriesOpen(false)}
                title={categoryPath(categories, category.id)}
                href={`/prompts/categories/${category.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-xs"
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{category.name}</span>
              </Link>
              {categoryActions(category)}
            </div>
            {!collapsed && tree(category.id, depth + 1)}
          </div>
        );
      });
  const assets = library?.assets ?? [];
  const actionAsset = assets.find((asset) => asset.id === query.actionAsset);
  const columns: DataTableColumn<PromptLibrary["assets"][number]>[] = [
    {
      key: "selection",
      label: "Select",
      defaultWidth: 64,
      cellClassName: "text-center",
      render: (asset) => (
        <input
          type="checkbox"
          className="block mx-auto"
          aria-label={`Select ${asset.name}`}
          checked={selected.some((item) => item.id === asset.id)}
          disabled={
            selected.length >= 100 &&
            !selected.some((item) => item.id === asset.id)
          }
          onChange={(event) =>
            setSelected((current) =>
              event.target.checked
                ? [...current, asset]
                : current.filter((item) => item.id !== asset.id),
            )
          }
        />
      ),
    },
    {
      key: "name",
      label: "Prompt",
      defaultWidth: 300,
      render: (asset) => (
        <div className="min-w-0 space-y-1">
          <DetailLink
            href={`/prompts/${asset.id}`}
            className="block truncate text-xs font-medium hover:underline"
          >
            {asset.name}
          </DetailLink>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {asset.key}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      defaultWidth: 180,
      render: (asset) => (
        <span className="block truncate text-xs text-muted-foreground">
          {categoryPath(categories, asset.categoryId)}
        </span>
      ),
    },
    {
      key: "live",
      label: "Live",
      defaultWidth: 125,
      render: (asset) => {
        const live = asset.assignments.find((item) => item.tag === "live");
        return (
          <span
            className={`text-xs ${live ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
          >
            {live ? `v${live.version}` : "Not live"}
          </span>
        );
      },
    },
    {
      key: "latest",
      label: "Newest version",
      defaultWidth: 110,
      render: (asset) => (
        <span className="font-mono text-xs">v{asset.latestVersion}</span>
      ),
    },
    {
      key: "updated",
      label: "Updated",
      defaultWidth: 160,
      render: (asset) => (
        <span className="text-xs text-muted-foreground">
          {new Date(asset.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      defaultWidth: 80,
      cellClassName: "text-center",
      render: (asset) =>
        permissions && (
          <PromptAssetMenu
            asset={asset}
            permissions={permissions}
            label={`Actions for ${asset.name}`}
            onAction={(action) =>
              void setQuery({ assetAction: action, actionAsset: asset.id })
            }
          />
        ),
    },
  ];
  const categoryNavigation = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Categories
        </h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label="New category"
          disabled={!permissions?.edit}
          onClick={() => categoryForm({ type: "create" })}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>
      <Link
        onClick={() => setCategoriesOpen(false)}
        href="/prompts"
        className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${!categoryId ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
      >
        <FileText className="size-3.5" />
        All prompts
      </Link>
      <Link
        onClick={() => setCategoriesOpen(false)}
        href="/prompts/categories/root"
        className="mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-muted/50"
      >
        <Folder className="size-3.5" />
        Root
      </Link>
      {tree(null)}
    </>
  );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h1 className="text-sm font-semibold">Prompts</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Version, test and ship the prompts behind your workflows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!permissions?.edit}
            onClick={() => setImporting(true)}
          >
            Import
          </Button>
          <DetailLink
            href="/prompts/groups"
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs hover:bg-muted"
          >
            <Users className="size-3.5" />
            Test groups
            <span className="text-muted-foreground">
              {library?.groups.length ?? 0}
            </span>
          </DetailLink>
          <Button
            size="sm"
            disabled={!permissions?.edit}
            onClick={() => {
              setPromptName("");
              setKey("");
              setContent(structuredClone(initialPrompt));
              setError("");
              setCreating(true);
            }}
          >
            <Plus className="size-3.5" />
            New prompt
          </Button>
        </div>
      </header>
      {(error || readError) && !categoryAction && !creating && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/5 px-5 py-3 text-xs text-destructive"
        >
          <span>{error || readError?.message}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError("");
              void refresh().catch((cause) => setError(String(cause)));
            }}
          >
            Retry
          </Button>
        </div>
      )}
      <div
        className="relative isolate flex min-h-0 flex-1 overflow-hidden"
        data-prompt-library-body
      >
        {categoriesOpen && (
          <button
            type="button"
            aria-label="Close categories"
            tabIndex={-1}
            className="absolute inset-0 z-10 bg-background/40 xl:hidden"
            onClick={closeCategories}
          />
        )}
        <Collapsible.Root
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
          className="w-11 shrink-0 border-r px-1.5 py-3 xl:hidden"
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              categoriesOpen &&
              event.currentTarget.contains(event.target as Node)
            ) {
              event.preventDefault();
              event.stopPropagation();
              closeCategories();
            }
          }}
        >
          <Collapsible.Trigger asChild>
            <Button
              ref={categoryTrigger}
              size="icon"
              variant="ghost"
              className="relative z-30"
              aria-label={
                categoriesOpen ? "Collapse categories" : "Open categories"
              }
              title={categoriesOpen ? "Collapse categories" : "Categories"}
            >
              <PanelLeft className="size-4" />
            </Button>
          </Collapsible.Trigger>
          <Collapsible.Content
            role="navigation"
            aria-label="Prompt categories"
            className="absolute inset-y-0 left-0 z-20 w-64 max-w-[calc(100%-3rem)] overflow-y-auto border-r bg-background p-3 shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-left-full data-[state=open]:duration-200 data-[state=open]:ease-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left-full data-[state=closed]:duration-200 data-[state=closed]:ease-in motion-reduce:animate-none! [&>div:first-child]:pl-8"
          >
            {categoryNavigation}
          </Collapsible.Content>
        </Collapsible.Root>
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r p-3 xl:block">
          {categoryNavigation}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <div className="relative min-w-36 flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
              <Input
                aria-label="Search prompts"
                placeholder="Search prompts…"
                className="h-9 pl-9 text-xs"
                value={query.q}
                onChange={(event) =>
                  void setQuery({ q: event.target.value, cursor: "0" })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {library?.totalCount ?? 0} prompts {loading ? "· Loading…" : ""}
            </p>
          </div>
          {(assets.length > 0 || selected.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
              <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label="Select visible prompts"
                  disabled={assets.length === 0}
                  checked={
                    assets.length > 0 &&
                    assets.every((asset) =>
                      selected.some((item) => item.id === asset.id),
                    )
                  }
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [
                            ...current,
                            ...assets.filter(
                              (asset) =>
                                !current.some((item) => item.id === asset.id),
                            ),
                          ].slice(0, 100)
                        : current.filter(
                            (item) =>
                              !assets.some((asset) => asset.id === item.id),
                          ),
                    )
                  }
                />
                Select page
              </label>
              {selected.length > 0 && library && (
                <PromptBulkActions
                  selected={selected}
                  library={library ?? undefined}
                  onClear={() => setSelected([])}
                  onDone={async () => {
                    await refresh();
                    setSelected([]);
                  }}
                />
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <DataTableProvider columns={columns}>
              <DataTable
                className="rounded-none border-0 shadow-none"
                data={assets}
                getRowKey={(asset) => asset.id}
                emptyState={
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <FileText className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">
                      {query.q
                        ? "No matching prompts"
                        : "Your prompt library starts here"}
                    </p>
                    <p className="max-w-xs px-4 text-xs text-muted-foreground">
                      {query.q
                        ? "Try a different name or key."
                        : "Create a prompt, connect your application, and test a candidate before promoting it."}
                    </p>
                  </div>
                }
              />
            </DataTableProvider>
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
            <EvalDropdown
              label="Prompt status"
              value={query.archived}
              options={[
                { value: "false", label: "Active prompts" },
                { value: "true", label: "Archived prompts" },
              ]}
              onChange={(value) =>
                void setQuery({ archived: value, cursor: "0" })
              }
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading || query.cursor === "0"}
                onClick={() =>
                  void setQuery({
                    cursor: String(Math.max(0, Number(query.cursor) - 100)),
                  })
                }
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !library?.nextCursor}
                onClick={() =>
                  void setQuery({ cursor: library?.nextCursor ?? "0" })
                }
              >
                Next
              </Button>
            </div>
          </footer>
        </section>
      </div>
      {library && actionAsset && query.assetAction && (
        <PromptAssetActionDialog
          key={`${actionAsset.id}-${query.assetAction}`}
          action={query.assetAction}
          asset={actionAsset}
          library={library}
          onClose={() =>
            void setQuery({ assetAction: null, actionAsset: null })
          }
          onDone={refresh}
        />
      )}
      <PromptImport
        open={importing}
        onClose={() => setImporting(false)}
        onDone={refresh}
      />
      <PromptActionSurface
        modal
        confirmation={categoryAction?.type === "delete"}
        busy={working}
        open={Boolean(categoryAction)}
        onClose={() => {
          if (!working) setCategoryAction(null);
        }}
        title={
          categoryAction?.type === "delete"
            ? "Delete category"
            : categoryAction?.type === "move"
              ? "Move category"
              : categoryAction?.type === "rename"
                ? "Rename category"
                : "New category"
        }
        description={
          categoryAction?.type === "delete"
            ? "Move all prompts in this category and its subcategories to a destination."
            : "Categories organize your prompt library."
        }
        actions={
          <Button
            size="sm"
            type="submit"
            form="prompt-category-form"
            variant={
              categoryAction?.type === "delete" ? "destructive" : "default"
            }
            disabled={
              working ||
              (categoryAction?.type === "delete" ||
              categoryAction?.type === "move"
                ? !destination
                : !name.trim())
            }
          >
            {working
              ? "Saving…"
              : categoryAction?.type === "delete"
                ? "Move prompts & delete"
                : "Save category"}
          </Button>
        }
        closeLabel="Close category editor"
      >
        <form
          id="prompt-category-form"
          className="space-y-5 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!categoryAction) return;
            const category = categoryAction.category;
            const action: PromptMutation =
              categoryAction.type === "create"
                ? { action: "category-create", path: name }
                : categoryAction.type === "rename"
                  ? {
                      action: "category-update",
                      id: category!.id,
                      expectedRevision: category!.revision,
                      name,
                    }
                  : categoryAction.type === "move"
                    ? {
                        action: "category-update",
                        id: category!.id,
                        expectedRevision: category!.revision,
                        parentId: destination === "root" ? null : destination,
                      }
                    : {
                        action: "category-delete",
                        id: category!.id,
                        expectedRevision: category!.revision,
                        destinationId:
                          destination === "root" ? null : destination,
                      };
            void run(action);
          }}
        >
          {(error || readError) && (
            <p role="alert" className="text-xs text-destructive">
              {error || readError?.message}
            </p>
          )}
          {categoryAction?.type === "create" ||
          categoryAction?.type === "rename" ? (
            <div className="space-y-2">
              <label htmlFor="category-name" className="text-xs font-medium">
                {categoryAction.type === "create" ? "Category path" : "Name"}
              </label>
              <Input
                id="category-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Canvas/Testing"
                required
              />
              {categoryAction?.type === "create" && (
                <p className="text-xs text-muted-foreground">
                  Use / to create nested categories.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium">
                {categoryAction?.type === "delete"
                  ? "Move prompts to"
                  : "New parent"}
              </p>
              <EvalDropdown
                label="Destination category"
                value={destination}
                options={[
                  { value: "root", label: "Root" },
                  ...categories
                    .filter(
                      (item) =>
                        item.id !== categoryAction?.category?.id &&
                        !categoryPath(categories, item.id).startsWith(
                          `${categoryPath(categories, categoryAction?.category?.id ?? null)} /`,
                        ),
                    )
                    .map((item) => ({
                      value: item.id,
                      label: categoryPath(categories, item.id),
                    })),
                ]}
                onChange={setDestination}
              />
            </div>
          )}
        </form>
      </PromptActionSurface>
      <DetailInspectorDrawer
        open={creating}
        onClose={() => {
          if (!working) setCreating(false);
        }}
        title="New prompt"
        description="The key is the stable reference your application registers."
        closeLabel="Close new prompt"
        bodyClassName="flex flex-col overflow-hidden p-0"
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {(error || readError) && (
            <p role="alert" className="text-xs text-destructive">
              {error || readError?.message}
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="new-prompt-name" className="text-xs font-medium">
              Name
            </label>
            <Input
              id="new-prompt-name"
              value={promptName}
              onChange={(event) => setPromptName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="new-prompt-key" className="text-xs font-medium">
              Key
            </label>
            <Input
              id="new-prompt-key"
              className="font-mono"
              placeholder="canvas/classify-intent"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Keys stay stable when you rename or move a prompt.
            </p>
          </div>
          <PromptFields
            library={library ?? undefined}
            key={String(creating)}
            value={content}
            onChange={setContent}
            onValidityChange={setFieldsValid}
          />
        </div>
        <footer className="flex justify-end gap-2 border-t p-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreating(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={
              working || !fieldsValid || !promptName.trim() || !key.trim()
            }
            onClick={() => {
              try {
                setReview(structuredClone(validateEditor(content)));
                setError("");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Check prompt fields.",
                );
              }
            }}
          >
            Review version
          </Button>
        </footer>
      </DetailInspectorDrawer>
      {review && (
        <PromptDiff
          before={{
            ...initialPrompt,
            messages: [
              { role: "system", content: "" },
              { role: "user", content: "" },
            ],
          }}
          after={review}
          beforeLabel="New prompt"
          afterLabel="Version 1"
          saving
          working={working}
          onClose={() => setReview(null)}
          onAccept={async (note) => {
            setWorking(true);
            setError("");
            try {
              const result = (await promptRequest("actions", {
                action: "create",
                key,
                name: promptName,
                categoryId:
                  !categoryId || categoryId === "root" ? null : categoryId,
                content: review,
                note,
                idempotencyKey: crypto.randomUUID(),
              })) as { id: string };
              setReview(null);
              setCreating(false);
              await refresh();
              router.push(`/prompts/${result.id}`);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not create prompt.",
              );
              setReview(null);
            } finally {
              setWorking(false);
            }
          }}
        />
      )}
    </div>
  );
}
