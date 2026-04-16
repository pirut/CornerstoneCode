/**
 * Zustand store for the workspace layout (top-level tab groups + split-pane
 * trees). Persisted to localStorage so pane arrangements survive reloads.
 *
 * Design decisions (see `.plans/imperative-dazzling-puppy.md`):
 * - URL tracks the *focused* pane's target. Other panes live only in this
 *   store.
 * - Inactive tabs stay mounted-but-hidden at the render layer; this store
 *   knows which tab is active but does not manage mount state.
 * - Split tree operations are delegated to pure helpers in
 *   `workspaceLayoutTree.ts`.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { resolveStorage } from "./lib/storage";
import {
  type LayoutNode,
  type LayoutNodeId,
  type PaneId,
  type PaneTarget,
  type SplitDirection,
  type SplitPosition,
  type FocusDirection,
  type TabGroup,
  type TabId,
  createEmptyTab,
  createTabWithTarget,
  ensureFocusedPane,
  findAdjacentLeaf,
  findLeaf,
  findTabIndex,
  getAllLeaves,
  newPaneId,
  newLayoutNodeId,
  newTabId,
  removeLeafFromTree,
  replaceLeafTarget,
  setSplitWeightsInTree,
  splitLeafInTree,
  targetsEqual,
} from "./workspaceLayoutTree";

export const WORKSPACE_LAYOUT_STORAGE_KEY = "t3code:workspace-layout:v1";
const WORKSPACE_LAYOUT_STORAGE_VERSION = 1;

interface WorkspaceLayoutState {
  tabs: ReadonlyArray<TabGroup>;
  activeTabId: TabId;
}

export interface WorkspaceLayoutActions {
  setActiveTab: (tabId: TabId) => void;
  setFocusedPane: (paneId: PaneId) => void;
  openInFocusedPane: (target: PaneTarget) => void;
  openInPane: (paneId: PaneId, target: PaneTarget) => void;
  splitFocusedPane: (
    target: PaneTarget,
    direction: SplitDirection,
    position?: SplitPosition,
  ) => PaneId | null;
  splitPane: (
    paneId: PaneId,
    target: PaneTarget,
    direction: SplitDirection,
    position?: SplitPosition,
  ) => PaneId | null;
  closePane: (paneId: PaneId) => void;
  closeFocusedPane: () => void;
  focusInDirection: (direction: FocusDirection) => void;
  setSplitWeights: (nodeId: LayoutNodeId, weights: ReadonlyArray<number>) => void;
  newTab: (target?: PaneTarget) => TabId;
  closeTab: (tabId: TabId) => void;
  closeActiveTab: () => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  renameTab: (tabId: TabId, title: string | null) => void;
  focusNextTab: () => void;
  focusPreviousTab: () => void;
  focusTabByIndex: (index: number) => void;
}

export type WorkspaceLayoutStore = WorkspaceLayoutState & WorkspaceLayoutActions;

function createInitialState(): WorkspaceLayoutState {
  const tab = createEmptyTab();
  return {
    tabs: [tab],
    activeTabId: tab.id,
  };
}

function updateActiveTab(
  state: WorkspaceLayoutState,
  updater: (tab: TabGroup) => TabGroup,
): WorkspaceLayoutState {
  const index = findTabIndex(state.tabs, state.activeTabId);
  if (index === -1) return state;
  const current = state.tabs[index];
  if (!current) return state;
  const updated = updater(current);
  if (updated === current) return state;
  const nextTabs = [...state.tabs];
  nextTabs[index] = ensureFocusedPane(updated);
  return { ...state, tabs: nextTabs };
}

function updateTabById(
  state: WorkspaceLayoutState,
  tabId: TabId,
  updater: (tab: TabGroup) => TabGroup,
): WorkspaceLayoutState {
  const index = findTabIndex(state.tabs, tabId);
  if (index === -1) return state;
  const current = state.tabs[index];
  if (!current) return state;
  const updated = updater(current);
  if (updated === current) return state;
  const nextTabs = [...state.tabs];
  nextTabs[index] = ensureFocusedPane(updated);
  return { ...state, tabs: nextTabs };
}

function findTabContainingPane(
  tabs: ReadonlyArray<TabGroup>,
  paneId: PaneId,
): { tab: TabGroup; index: number } | null {
  for (let i = 0; i < tabs.length; i += 1) {
    const tab = tabs[i];
    if (!tab) continue;
    if (findLeaf(tab.root, paneId)) return { tab, index: i };
  }
  return null;
}

function closePaneInTabs(state: WorkspaceLayoutState, paneId: PaneId): WorkspaceLayoutState {
  const match = findTabContainingPane(state.tabs, paneId);
  if (!match) return state;
  const { tab, index } = match;
  const nextRoot = removeLeafFromTree(tab.root, paneId);
  if (nextRoot === null) {
    // Last pane in this tab — close the tab.
    return closeTabInternal(state, tab.id);
  }
  const nextFocused =
    tab.focusedPaneId === paneId
      ? (getAllLeaves(nextRoot)[0]?.paneId ?? newPaneId())
      : tab.focusedPaneId;
  const nextTab: TabGroup = { ...tab, root: nextRoot, focusedPaneId: nextFocused };
  const nextTabs = [...state.tabs];
  nextTabs[index] = ensureFocusedPane(nextTab);
  return { ...state, tabs: nextTabs };
}

function closeTabInternal(state: WorkspaceLayoutState, tabId: TabId): WorkspaceLayoutState {
  const index = findTabIndex(state.tabs, tabId);
  if (index === -1) return state;
  const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (nextTabs.length === 0) {
    const fresh = createEmptyTab();
    return { tabs: [fresh], activeTabId: fresh.id };
  }
  const nextActiveTabId =
    state.activeTabId === tabId
      ? (nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? nextTabs[0]?.id ?? state.activeTabId)
      : state.activeTabId;
  return { tabs: nextTabs, activeTabId: nextActiveTabId };
}

// ------- Store creation ---------------------------------------------------

function createWorkspaceLayoutStorage() {
  return resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
}

interface PersistedWorkspaceLayoutStoreState {
  tabs?: ReadonlyArray<TabGroup>;
  activeTabId?: TabId;
}

export function migratePersistedWorkspaceLayoutStoreState(
  persistedState: unknown,
  _version: number,
): PersistedWorkspaceLayoutStoreState {
  if (persistedState && typeof persistedState === "object") {
    const candidate = persistedState as PersistedWorkspaceLayoutStoreState;
    if (candidate.tabs && candidate.activeTabId) {
      return candidate;
    }
  }
  return {};
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setActiveTab: (tabId) =>
        set((state) => {
          if (state.activeTabId === tabId) return state;
          if (findTabIndex(state.tabs, tabId) === -1) return state;
          return { ...state, activeTabId: tabId };
        }),

      setFocusedPane: (paneId) =>
        set((state) =>
          updateActiveTab(state, (tab) => {
            if (tab.focusedPaneId === paneId) return tab;
            if (!findLeaf(tab.root, paneId)) return tab;
            return { ...tab, focusedPaneId: paneId };
          }),
        ),

      openInFocusedPane: (target) =>
        set((state) =>
          updateActiveTab(state, (tab) => {
            const existing = findLeaf(tab.root, tab.focusedPaneId);
            if (existing && targetsEqual(existing.target, target)) return tab;
            return { ...tab, root: replaceLeafTarget(tab.root, tab.focusedPaneId, target) };
          }),
        ),

      openInPane: (paneId, target) =>
        set((state) => {
          const match = findTabContainingPane(state.tabs, paneId);
          if (!match) return state;
          return updateTabById(state, match.tab.id, (tab) => {
            const existing = findLeaf(tab.root, paneId);
            if (existing && targetsEqual(existing.target, target)) return tab;
            return {
              ...tab,
              root: replaceLeafTarget(tab.root, paneId, target),
              focusedPaneId: paneId,
            };
          });
        }),

      splitFocusedPane: (target, direction, position = "after") => {
        const state = get();
        const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
        if (!activeTab) return null;
        return get().splitPane(activeTab.focusedPaneId, target, direction, position);
      },

      splitPane: (paneId, target, direction, position = "after") => {
        const match = findTabContainingPane(get().tabs, paneId);
        if (!match) return null;
        const { tree, newLeaf } = splitLeafInTree(
          match.tab.root,
          paneId,
          target,
          direction,
          position,
        );
        set((state) =>
          updateTabById(state, match.tab.id, (tab) => ({
            ...tab,
            root: tree,
            focusedPaneId: newLeaf.paneId,
          })),
        );
        return newLeaf.paneId;
      },

      closePane: (paneId) => set((state) => closePaneInTabs(state, paneId)),

      closeFocusedPane: () =>
        set((state) => {
          const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
          if (!activeTab) return state;
          return closePaneInTabs(state, activeTab.focusedPaneId);
        }),

      focusInDirection: (direction) =>
        set((state) =>
          updateActiveTab(state, (tab) => {
            const neighbor = findAdjacentLeaf(tab.root, tab.focusedPaneId, direction);
            if (!neighbor) return tab;
            if (tab.focusedPaneId === neighbor.paneId) return tab;
            return { ...tab, focusedPaneId: neighbor.paneId };
          }),
        ),

      setSplitWeights: (nodeId, weights) =>
        set((state) =>
          updateActiveTab(state, (tab) => {
            const nextRoot = setSplitWeightsInTree(tab.root, nodeId, weights);
            if (nextRoot === tab.root) return tab;
            return { ...tab, root: nextRoot };
          }),
        ),

      newTab: (target) => {
        const tab = target ? createTabWithTarget(target) : createEmptyTab();
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        }));
        return tab.id;
      },

      closeTab: (tabId) => set((state) => closeTabInternal(state, tabId)),

      closeActiveTab: () => set((state) => closeTabInternal(state, state.activeTabId)),

      moveTab: (fromIndex, toIndex) =>
        set((state) => {
          if (fromIndex === toIndex) return state;
          if (fromIndex < 0 || fromIndex >= state.tabs.length) return state;
          if (toIndex < 0 || toIndex >= state.tabs.length) return state;
          const nextTabs = [...state.tabs];
          const [moved] = nextTabs.splice(fromIndex, 1);
          if (!moved) return state;
          nextTabs.splice(toIndex, 0, moved);
          return { ...state, tabs: nextTabs };
        }),

      renameTab: (tabId, title) =>
        set((state) =>
          updateTabById(state, tabId, (tab) => {
            if (tab.title === title) return tab;
            return { ...tab, title };
          }),
        ),

      focusNextTab: () =>
        set((state) => {
          if (state.tabs.length <= 1) return state;
          const index = findTabIndex(state.tabs, state.activeTabId);
          if (index === -1) return state;
          const nextIndex = (index + 1) % state.tabs.length;
          const nextTab = state.tabs[nextIndex];
          if (!nextTab) return state;
          return { ...state, activeTabId: nextTab.id };
        }),

      focusPreviousTab: () =>
        set((state) => {
          if (state.tabs.length <= 1) return state;
          const index = findTabIndex(state.tabs, state.activeTabId);
          if (index === -1) return state;
          const nextIndex = (index - 1 + state.tabs.length) % state.tabs.length;
          const nextTab = state.tabs[nextIndex];
          if (!nextTab) return state;
          return { ...state, activeTabId: nextTab.id };
        }),

      focusTabByIndex: (index) =>
        set((state) => {
          if (index < 0 || index >= state.tabs.length) return state;
          const target = state.tabs[index];
          if (!target) return state;
          if (state.activeTabId === target.id) return state;
          return { ...state, activeTabId: target.id };
        }),
    }),
    {
      name: WORKSPACE_LAYOUT_STORAGE_KEY,
      version: WORKSPACE_LAYOUT_STORAGE_VERSION,
      storage: createJSONStorage(createWorkspaceLayoutStorage),
      migrate: migratePersistedWorkspaceLayoutStoreState,
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.tabs || state.tabs.length === 0) {
          const fresh = createEmptyTab();
          state.tabs = [fresh];
          state.activeTabId = fresh.id;
          return;
        }
        // Make sure activeTabId points at a real tab.
        if (findTabIndex(state.tabs, state.activeTabId) === -1) {
          const firstTab = state.tabs[0];
          if (firstTab) state.activeTabId = firstTab.id;
        }
      },
    },
  ),
);

// ------- Selector helpers -------------------------------------------------

export function useActiveTab(): TabGroup | null {
  return useWorkspaceLayoutStore((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    return tab ?? null;
  });
}

export function useActiveTabRoot(): LayoutNode | null {
  return useWorkspaceLayoutStore((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    return tab?.root ?? null;
  });
}

export function useFocusedPane(): {
  tabId: TabId;
  paneId: PaneId;
  target: PaneTarget;
} | null {
  return useWorkspaceLayoutStore(
    useShallow((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
      if (!tab) return null;
      const leaf = findLeaf(tab.root, tab.focusedPaneId);
      if (!leaf) return null;
      return { tabId: tab.id, paneId: leaf.paneId, target: leaf.target };
    }),
  );
}

export function useWorkspaceTabs(): ReadonlyArray<TabGroup> {
  return useWorkspaceLayoutStore((state) => state.tabs);
}

export function useActiveTabId(): TabId {
  return useWorkspaceLayoutStore((state) => state.activeTabId);
}

export function selectFocusedPane(state: WorkspaceLayoutStore): {
  tabId: TabId;
  paneId: PaneId;
  target: PaneTarget;
} | null {
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
  if (!tab) return null;
  const leaf = findLeaf(tab.root, tab.focusedPaneId);
  if (!leaf) return null;
  return { tabId: tab.id, paneId: leaf.paneId, target: leaf.target };
}

export function getWorkspaceLayoutState(): WorkspaceLayoutState {
  const store = useWorkspaceLayoutStore.getState();
  return { tabs: store.tabs, activeTabId: store.activeTabId };
}

export function workspaceLayoutActions(): WorkspaceLayoutActions {
  const store = useWorkspaceLayoutStore.getState();
  return {
    setActiveTab: store.setActiveTab,
    setFocusedPane: store.setFocusedPane,
    openInFocusedPane: store.openInFocusedPane,
    openInPane: store.openInPane,
    splitFocusedPane: store.splitFocusedPane,
    splitPane: store.splitPane,
    closePane: store.closePane,
    closeFocusedPane: store.closeFocusedPane,
    focusInDirection: store.focusInDirection,
    setSplitWeights: store.setSplitWeights,
    newTab: store.newTab,
    closeTab: store.closeTab,
    closeActiveTab: store.closeActiveTab,
    moveTab: store.moveTab,
    renameTab: store.renameTab,
    focusNextTab: store.focusNextTab,
    focusPreviousTab: store.focusPreviousTab,
    focusTabByIndex: store.focusTabByIndex,
  };
}

// ------- One-shot "new node id" exports for external composition ----------

export { newLayoutNodeId, newPaneId, newTabId };
