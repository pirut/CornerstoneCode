/**
 * Horizontal tab strip for workspace tab groups.
 *
 * - Renders one tab per `TabGroup` in the active workspace layout store.
 * - Drag-to-reorder via @dnd-kit.
 * - Left-click selects the tab; middle-click or close button closes it.
 * - Double-click a tab title to rename inline.
 * - Right side exposes "split right", "split down", and "close pane" buttons
 *   so the multi-pane feature is discoverable, plus a "+" for a new tab.
 */

import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Columns2Icon, PlusIcon, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useMemo,
  useState,
} from "react";

import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { useComposerDraftStore } from "../composerDraftStore";
import { useActiveTabId, useWorkspaceLayoutStore, useWorkspaceTabs } from "../workspaceLayoutStore";
import {
  findLeaf,
  getAllLeaves,
  type PaneTarget,
  type TabGroup,
  type TabId,
} from "../workspaceLayoutTree";

function useDerivedTabTitle(tab: TabGroup): string {
  const focusedTarget: PaneTarget = useMemo(() => {
    const leaf = findLeaf(tab.root, tab.focusedPaneId);
    return leaf?.target ?? { kind: "empty" };
  }, [tab.root, tab.focusedPaneId]);

  const serverThreadRef = useMemo(() => {
    if (focusedTarget.kind !== "server") return null;
    return {
      environmentId: focusedTarget.environmentId,
      threadId: focusedTarget.threadId,
    };
  }, [focusedTarget]);

  const serverThreadSelector = useMemo(
    () => createThreadSelectorByRef(serverThreadRef),
    [serverThreadRef],
  );
  const serverThreadTitle = useStore((state) => serverThreadSelector(state)?.title ?? null);

  const draftTitle = useComposerDraftStore((store) => {
    if (focusedTarget.kind !== "draft") return null;
    const session = store.getDraftSession(focusedTarget.draftId);
    return session ? "Draft" : null;
  });

  if (tab.title !== null) return tab.title;
  if (focusedTarget.kind === "server") {
    return serverThreadTitle ?? "Thread";
  }
  if (focusedTarget.kind === "draft") {
    return draftTitle ?? "Draft";
  }
  return "New tab";
}

interface WorkspaceTabViewProps {
  tab: TabGroup;
  isActive: boolean;
  canClose: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (title: string | null) => void;
}

function WorkspaceTabView(props: WorkspaceTabViewProps) {
  const { tab, isActive, canClose, onSelect, onClose, onRename } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const derivedTitle = useDerivedTabTitle(tab);
  const isEditing = editingValue !== null;

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 20 : undefined,
    }),
    [isDragging, transform, transition],
  );

  const paneCount = useMemo(() => getAllLeaves(tab.root).length, [tab.root]);

  const onTitleDoubleClick = useCallback(() => {
    setEditingValue(tab.title ?? derivedTitle);
  }, [derivedTitle, tab.title]);

  const commitEdit = useCallback(() => {
    if (editingValue === null) return;
    const trimmed = editingValue.trim();
    onRename(trimmed.length === 0 ? null : trimmed);
    setEditingValue(null);
  }, [editingValue, onRename]);

  const onTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setEditingValue(null);
      }
    },
    [commitEdit],
  );

  // Tab selection must live on `onClick` (not `onPointerDown`) because the
  // dnd-kit sortable adapter injects its own `onPointerDown` in `listeners`
  // which, when spread, overrides any `onPointerDown` we attach to the same
  // element. `onClick` only fires when the drag activation distance is not
  // reached, which is exactly the "user clicked without dragging" we want.
  const onTabClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isEditing) return;
      if (event.button !== 0) return;
      onSelect();
    },
    [isEditing, onSelect],
  );

  // Middle-click close via `onAuxClick` — fires on pointer-up for non-primary
  // buttons and does not conflict with dnd-kit's primary-button listeners.
  const onTabAuxClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      event.preventDefault();
      if (canClose) {
        onClose();
      }
    },
    [canClose, onClose],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex min-w-[96px] max-w-[240px] shrink-0 cursor-pointer items-center gap-1 border-r border-border px-2 py-1 text-xs select-none [-webkit-app-region:no-drag]",
        isActive
          ? "bg-background text-foreground"
          : "bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground",
        isDragging && "ring-1 ring-primary",
      )}
      onClick={onTabClick}
      onAuxClick={onTabAuxClick}
      title={`${derivedTitle} (${paneCount} pane${paneCount === 1 ? "" : "s"})`}
      {...attributes}
      {...listeners}
    >
      {isEditing ? (
        <input
          className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
          value={editingValue ?? ""}
          onChange={(event) => setEditingValue(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={onTitleKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={onTitleDoubleClick}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {derivedTitle}
        </span>
      )}
      {canClose ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-4 rounded-sm text-muted-foreground opacity-60 hover:opacity-100"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label="Close tab"
        >
          <span aria-hidden="true">×</span>
        </Button>
      ) : null}
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ label, icon, onClick, disabled }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-9 shrink-0 rounded-none border-l border-border text-muted-foreground hover:bg-card/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={label}
            onClick={onClick}
            disabled={disabled ?? false}
          >
            {icon}
          </Button>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

export function WorkspaceTabBar() {
  const tabs = useWorkspaceTabs();
  const activeTabId = useActiveTabId();
  const setActiveTab = useWorkspaceLayoutStore((state) => state.setActiveTab);
  const newTab = useWorkspaceLayoutStore((state) => state.newTab);
  const closeTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const moveTab = useWorkspaceLayoutStore((state) => state.moveTab);
  const renameTab = useWorkspaceLayoutStore((state) => state.renameTab);
  const splitFocusedPane = useWorkspaceLayoutStore((state) => state.splitFocusedPane);
  const closeFocusedPane = useWorkspaceLayoutStore((state) => state.closeFocusedPane);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activePaneCount = useMemo(
    () => (activeTab ? getAllLeaves(activeTab.root).length : 0),
    [activeTab],
  );
  const canCloseActivePane = activePaneCount > 1 || tabs.length > 1;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = tabIds.indexOf(active.id as TabId);
      const toIndex = tabIds.indexOf(over.id as TabId);
      if (fromIndex < 0 || toIndex < 0) return;
      moveTab(fromIndex, toIndex);
    },
    [moveTab, tabIds],
  );

  const onSplitRight = useCallback(() => {
    if (!activeTab) return;
    const focusedLeaf = findLeaf(activeTab.root, activeTab.focusedPaneId);
    // Seed the new pane with the same target as the focused pane so the user
    // immediately sees a meaningful side-by-side view and can swap either side.
    const seed: PaneTarget = focusedLeaf?.target ?? { kind: "empty" };
    splitFocusedPane(seed, "horizontal", "after");
  }, [activeTab, splitFocusedPane]);

  return (
    <div className="drag-region flex h-9 w-full shrink-0 items-stretch border-b border-border bg-card/20 text-foreground">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div className="flex min-w-0 flex-nowrap items-stretch">
              {tabs.map((tab) => (
                <WorkspaceTabView
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  canClose={tabs.length > 1}
                  onSelect={() => setActiveTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onRename={(title) => renameTab(tab.id, title)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <ToolbarButton
        label="Split pane right"
        icon={<Columns2Icon className="size-3.5" aria-hidden="true" />}
        onClick={onSplitRight}
        disabled={!activeTab}
      />
      <ToolbarButton
        label="Close focused pane"
        icon={<XIcon className="size-3.5" aria-hidden="true" />}
        onClick={() => closeFocusedPane()}
        disabled={!canCloseActivePane}
      />
      <ToolbarButton
        label="New tab"
        icon={<PlusIcon className="size-3.5" aria-hidden="true" />}
        onClick={() => newTab()}
      />
    </div>
  );
}
