import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { useCommandPaletteStore } from "../commandPaletteStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import {
  startNewLocalThreadFromContext,
  startNewThreadFromContext,
} from "../lib/chatThreadActions";
import { isTerminalFocused } from "../lib/terminalFocus";
import { resolveShortcutCommand, workspaceTabJumpIndexFromCommand } from "../keybindings";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useWorkspaceLayoutStore } from "../workspaceLayoutStore";
import { resolveSidebarNewThreadEnvMode } from "~/components/Sidebar.logic";
import { useSettings } from "~/hooks/useSettings";
import { useServerKeybindings } from "~/rpc/serverState";

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadKeysSize = useThreadSelectionStore((state) => state.selectedThreadKeys.size);
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread, routeThreadRef } =
    useHandleNewThread();
  const keybindings = useServerKeybindings();
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalState(state.terminalStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  const appSettings = useSettings();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (useCommandPaletteStore.getState().open) {
        return;
      }

      if (event.key === "Escape" && selectedThreadKeysSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void startNewLocalThreadFromContext({
          activeDraftThread,
          activeThread,
          defaultProjectRef,
          defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
          handleNewThread,
        });
        return;
      }

      if (command === "chat.new") {
        event.preventDefault();
        event.stopPropagation();
        void startNewThreadFromContext({
          activeDraftThread,
          activeThread,
          defaultProjectRef,
          defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
          handleNewThread,
        });
        return;
      }

      if (command && command.startsWith("workspace.")) {
        const workspaceStore = useWorkspaceLayoutStore.getState();
        switch (command) {
          case "workspace.splitRight": {
            const focused = workspaceStore.tabs.find(
              (tab) => tab.id === workspaceStore.activeTabId,
            );
            if (!focused) break;
            workspaceStore.splitPane(
              focused.focusedPaneId,
              { kind: "empty" },
              "horizontal",
              "after",
            );
            event.preventDefault();
            break;
          }
          case "workspace.closePane":
            workspaceStore.closeFocusedPane();
            event.preventDefault();
            break;
          case "workspace.focusLeft":
            workspaceStore.focusInDirection("left");
            event.preventDefault();
            break;
          case "workspace.focusRight":
            workspaceStore.focusInDirection("right");
            event.preventDefault();
            break;
          case "workspace.newTab":
            workspaceStore.newTab();
            event.preventDefault();
            break;
          case "workspace.closeTab":
            workspaceStore.closeActiveTab();
            event.preventDefault();
            break;
          case "workspace.nextTab":
            workspaceStore.focusNextTab();
            event.preventDefault();
            break;
          case "workspace.previousTab":
            workspaceStore.focusPreviousTab();
            event.preventDefault();
            break;
          default: {
            const tabIndex = workspaceTabJumpIndexFromCommand(command);
            if (tabIndex !== null) {
              workspaceStore.focusTabByIndex(tabIndex);
              event.preventDefault();
            }
          }
        }
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    defaultProjectRef,
    selectedThreadKeysSize,
    terminalOpen,
    appSettings.defaultThreadEnvMode,
  ]);

  return null;
}

function ChatRouteLayout() {
  return (
    <>
      <ChatRouteGlobalShortcuts />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context }) => {
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChatRouteLayout,
});
