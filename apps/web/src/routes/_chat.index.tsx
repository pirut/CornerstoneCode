import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { WorkspaceShell } from "../components/WorkspaceShell";
import { buildThreadRouteParams } from "../threadRoutes";
import type { PaneTarget } from "../workspaceLayoutTree";

function ChatIndexRouteView() {
  const navigate = useNavigate();
  const onFocusedTargetChange = useCallback(
    (target: PaneTarget) => {
      if (target.kind === "server") {
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams({
            environmentId: target.environmentId,
            threadId: target.threadId,
          }),
          replace: true,
        });
        return;
      }
      if (target.kind === "draft") {
        void navigate({
          to: "/draft/$draftId",
          params: { draftId: target.draftId },
          replace: true,
        });
      }
    },
    [navigate],
  );

  return <WorkspaceShell urlTarget={null} onFocusedTargetChange={onFocusedTargetChange} />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
