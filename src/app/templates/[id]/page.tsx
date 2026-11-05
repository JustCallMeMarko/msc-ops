import { and, eq, isNull } from "drizzle-orm";
import { TemplateMapping } from "@/components/templates/template-mapping";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getDb } from "@/lib/db/client";
import { templates } from "@/lib/db/schema";

export default async function TemplateMappingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await getDb();
  const [template] = await db.select({ name: templates.name }).from(templates)
    .where(and(eq(templates.id, id), isNull(templates.deletedAt))).limit(1);
  return <WorkspaceShell breadcrumbLabel={template?.name ?? "Template"}><TemplateMapping id={id} /></WorkspaceShell>;
}
