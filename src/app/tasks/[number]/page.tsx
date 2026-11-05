import { and, eq, isNull } from "drizzle-orm";
import { TaskDetailView } from "@/components/ops/task-detail-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";

type Props = { params: Promise<{ number: string }> };

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: Props) {
  const { number } = await params;
  let breadcrumbLabel = `#${number}`;
  const taskNumber = Number(number);
  if (Number.isInteger(taskNumber) && taskNumber > 0) {
    const { db } = await getDb();
    const [task] = await db.select({ title: tasks.title }).from(tasks)
      .where(and(eq(tasks.number, taskNumber), isNull(tasks.deletedAt))).limit(1);
    if (task) breadcrumbLabel = `#${taskNumber} ${task.title}`;
  }
  return <WorkspaceShell breadcrumbLabel={breadcrumbLabel}><TaskDetailView number={number} /></WorkspaceShell>;
}
