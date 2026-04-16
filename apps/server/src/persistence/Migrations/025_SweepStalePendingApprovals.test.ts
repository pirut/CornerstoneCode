import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("025_SweepStalePendingApprovals", (it) => {
  it.effect(
    "resolves pending approvals for non-running sessions and recomputes thread counts",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* runMigrations({ toMigrationInclusive: 24 });

        // Seed three threads with different session states.
        yield* sql`
          INSERT INTO projection_threads (
            thread_id,
            project_id,
            title,
            model_selection_json,
            runtime_mode,
            interaction_mode,
            branch,
            worktree_path,
            latest_turn_id,
            created_at,
            updated_at,
            archived_at,
            latest_user_message_at,
            pending_approval_count,
            pending_user_input_count,
            has_actionable_proposed_plan,
            deleted_at
          )
          VALUES
            (
              'thread-stopped',
              'project-1',
              'Stopped thread',
              '{"provider":"codex","model":"gpt-5-codex"}',
              'approval-required',
              'plan',
              NULL,
              NULL,
              'turn-stopped',
              '2026-04-15T00:00:00.000Z',
              '2026-04-15T00:00:00.000Z',
              NULL,
              NULL,
              1,
              0,
              0,
              NULL
            ),
            (
              'thread-no-session',
              'project-1',
              'Orphan thread',
              '{"provider":"codex","model":"gpt-5-codex"}',
              'approval-required',
              'plan',
              NULL,
              NULL,
              'turn-orphan',
              '2026-04-15T00:00:00.000Z',
              '2026-04-15T00:00:00.000Z',
              NULL,
              NULL,
              2,
              0,
              0,
              NULL
            ),
            (
              'thread-running',
              'project-1',
              'Running thread',
              '{"provider":"codex","model":"gpt-5-codex"}',
              'approval-required',
              'plan',
              NULL,
              NULL,
              'turn-running',
              '2026-04-15T00:00:00.000Z',
              '2026-04-15T00:00:00.000Z',
              NULL,
              NULL,
              1,
              0,
              0,
              NULL
            )
        `;

        yield* sql`
          INSERT INTO projection_thread_sessions (
            thread_id,
            status,
            provider_name,
            provider_session_id,
            provider_thread_id,
            active_turn_id,
            last_error,
            updated_at
          )
          VALUES
            (
              'thread-stopped',
              'stopped',
              'codex',
              NULL,
              NULL,
              NULL,
              NULL,
              '2026-04-15T01:00:00.000Z'
            ),
            (
              'thread-running',
              'running',
              'codex',
              NULL,
              NULL,
              'turn-running',
              NULL,
              '2026-04-15T01:00:00.000Z'
            )
        `;

        yield* sql`
          INSERT INTO projection_pending_approvals (
            request_id,
            thread_id,
            turn_id,
            status,
            decision,
            created_at,
            resolved_at
          )
          VALUES
            (
              'approval-stopped',
              'thread-stopped',
              'turn-stopped',
              'pending',
              NULL,
              '2026-04-15T00:30:00.000Z',
              NULL
            ),
            (
              'approval-orphan-1',
              'thread-no-session',
              'turn-orphan',
              'pending',
              NULL,
              '2026-04-15T00:31:00.000Z',
              NULL
            ),
            (
              'approval-orphan-2',
              'thread-no-session',
              'turn-orphan',
              'pending',
              NULL,
              '2026-04-15T00:32:00.000Z',
              NULL
            ),
            (
              'approval-running',
              'thread-running',
              'turn-running',
              'pending',
              NULL,
              '2026-04-15T00:33:00.000Z',
              NULL
            )
        `;

        yield* runMigrations({ toMigrationInclusive: 25 });

        const approvalRows = yield* sql<{
          readonly requestId: string;
          readonly status: string;
          readonly decision: string | null;
          readonly resolvedAt: string | null;
        }>`
          SELECT
            request_id AS "requestId",
            status,
            decision,
            resolved_at AS "resolvedAt"
          FROM projection_pending_approvals
          ORDER BY request_id
        `;
        assert.deepStrictEqual(approvalRows, [
          {
            requestId: "approval-orphan-1",
            status: "resolved",
            decision: null,
            // No session row → falls back to the approval's created_at.
            resolvedAt: "2026-04-15T00:31:00.000Z",
          },
          {
            requestId: "approval-orphan-2",
            status: "resolved",
            decision: null,
            resolvedAt: "2026-04-15T00:32:00.000Z",
          },
          {
            requestId: "approval-running",
            status: "pending",
            decision: null,
            resolvedAt: null,
          },
          {
            requestId: "approval-stopped",
            status: "resolved",
            decision: null,
            // Session row exists → uses its updated_at.
            resolvedAt: "2026-04-15T01:00:00.000Z",
          },
        ]);

        const threadRows = yield* sql<{
          readonly threadId: string;
          readonly pendingApprovalCount: number;
        }>`
          SELECT
            thread_id AS "threadId",
            pending_approval_count AS "pendingApprovalCount"
          FROM projection_threads
          ORDER BY thread_id
        `;
        assert.deepStrictEqual(threadRows, [
          { threadId: "thread-no-session", pendingApprovalCount: 0 },
          { threadId: "thread-running", pendingApprovalCount: 1 },
          { threadId: "thread-stopped", pendingApprovalCount: 0 },
        ]);
      }),
  );
});
