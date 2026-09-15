import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { summarizeClientAnalytics, type ClientPageView } from "../../../../lib/crm/client-analytics";

export const dynamic = "force-dynamic";

const editableRoles = new Set(["owner", "admin", "editor"]);
const deletableRoles = new Set(["owner", "admin"]);
const pipelineStages = new Set(["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"]);
const taskStatuses = new Set(["todo", "in_progress", "blocked", "done"]);
const taskPriorities = new Set(["low", "medium", "high", "urgent"]);

async function getAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 }) };

  const { data: admin } = await supabase.from("admin_users").select("email,role").eq("user_id", userId).maybeSingle();
  if (!admin) return { error: NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 }) };
  return { supabase, userId, admin };
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalDate(value: unknown) {
  const date = clean(value, 40);
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function probability(value: unknown, fallback = 10) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

export async function GET() {
  const auth = await getAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;

  const analyticsSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [clients, leads, tasks, notes, activities, pageViews] = await Promise.all([
    supabase.from("clients").select("id,business_name,short_name,email,phone,website,domain,industry,status,created_at,updated_at").eq("archived", false).order("business_name"),
    supabase.from("leads").select("id,business_name,contact_name,name,email,phone,status,source,project_type,estimated_value,assigned_to,notes,help_needed,next_action,next_action_at,probability,lost_reason,won_at,last_contacted_at,stage_changed_at,converted_business_id,converted_at,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("checklist_items").select("id,client_id,title,notes,done,due_date,position,category,priority,status,assigned_to,created_at,completed_at,updated_at").order("done").order("due_date", { ascending: true, nullsFirst: false }).order("position"),
    supabase.from("crm_notes").select("id,entity_type,entity_id,note,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("crm_activities").select("id,entity_type,entity_id,action,detail,created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("page_views").select("client_id,path,timestamp,visitor_hash,referrer,device,browser").not("client_id", "is", null).gte("timestamp", analyticsSince).order("timestamp", { ascending: false }).limit(5000),
  ]);

  const failed = [clients, leads, tasks, notes, activities, pageViews].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: "CRM_QUERY_FAILED", detail: failed.error.message }, { status: 500 });

  const clientRows = clients.data ?? [];
  const leadRows = leads.data ?? [];
  const openStatuses = new Set(["new", "contacted", "qualified", "proposal"]);
  const openLeads = leadRows.filter((lead) => openStatuses.has(String(lead.status || "new").toLowerCase()));
  const now = Date.now();
  return NextResponse.json({
    admin,
    permissions: { canEdit: editableRoles.has(admin.role) },
    clients: clientRows,
    clientAnalytics: summarizeClientAnalytics(clientRows.map((client) => client.id), (pageViews.data ?? []) as ClientPageView[]),
    leads: leadRows,
    tasks: tasks.data ?? [],
    notes: notes.data ?? [],
    activities: activities.data ?? [],
    metrics: {
      clients: clientRows.length,
      openLeads: openLeads.length,
      pipelineValue: openLeads.reduce((total, lead) => total + Number(lead.estimated_value || 0), 0),
      weightedValue: openLeads.reduce((total, lead) => total + Number(lead.estimated_value || 0) * Number(lead.probability || 0) / 100, 0),
      overdueFollowUps: openLeads.filter((lead) => lead.next_action_at && new Date(lead.next_action_at).valueOf() < now).length,
      tasksDue: (tasks.data ?? []).filter((task) => !task.done).length,
    },
  });
}

export async function POST(request: Request) {
  const auth = await getAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, userId, admin } = auth;
  if (!editableRoles.has(admin.role)) return NextResponse.json({ error: "READ_ONLY_ACCESS" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const entity = clean(body.entity, 30);
  let result;
  let activityEntity = entity;
  let activityId = "";
  let detail = "";

  if (entity === "lead") {
    const businessName = clean(body.businessName, 200);
    if (!businessName) return NextResponse.json({ error: "BUSINESS_NAME_REQUIRED" }, { status: 400 });
    result = await supabase.from("leads").insert({
      business_name: businessName,
      name: clean(body.contactName, 200) || businessName,
      contact_name: clean(body.contactName, 200) || null,
      email: clean(body.email, 320),
      phone: clean(body.phone, 50),
      help_needed: clean(body.helpNeeded, 1000),
      source: clean(body.source, 100) || "Admin",
      status: pipelineStages.has(clean(body.status, 50)) ? clean(body.status, 50) : "New",
      estimated_value: Number(body.estimatedValue) || null,
      probability: probability(body.probability),
      next_action: clean(body.nextAction, 500) || null,
      next_action_at: optionalDate(body.nextActionAt),
      assigned_to: admin.email,
      updated_at: new Date().toISOString(),
    }).select().single();
    activityId = result.data?.id ?? "";
    detail = `Lead created for ${businessName}`;
  } else if (entity === "client") {
    const businessName = clean(body.businessName, 200);
    if (!businessName) return NextResponse.json({ error: "BUSINESS_NAME_REQUIRED" }, { status: 400 });
    const id = `client-${crypto.randomUUID()}`;
    result = await supabase.from("clients").insert({
      id,
      business_name: businessName,
      short_name: businessName,
      email: clean(body.email, 320) || null,
      phone: clean(body.phone, 50) || null,
      status: "active",
      updated_at: new Date().toISOString(),
    }).select().single();
    activityId = id;
    detail = `Client created: ${businessName}`;
  } else if (entity === "task") {
    const title = clean(body.title, 300);
    if (!title) return NextResponse.json({ error: "TASK_TITLE_REQUIRED" }, { status: 400 });
    const id = `task-${crypto.randomUUID()}`;
    const status = taskStatuses.has(clean(body.status, 30)) ? clean(body.status, 30) : "todo";
    const priority = taskPriorities.has(clean(body.priority, 20)) ? clean(body.priority, 20) : "medium";
    result = await supabase.from("checklist_items").insert({ id, title, client_id: clean(body.clientId, 200) || null, notes: clean(body.notes, 2000) || null, due_date: clean(body.dueDate, 10) || null, category: clean(body.category, 80) || "General", priority, status, done: status === "done", assigned_to: userId, completed_at: status === "done" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).select().single();
    activityId = id;
    detail = `Task created: ${title}`;
  } else if (entity === "note") {
    const note = clean(body.note, 5000);
    const entityType = clean(body.entityType, 20);
    const entityId = clean(body.entityId, 200);
    if (!note || !entityId || !["client", "lead"].includes(entityType)) return NextResponse.json({ error: "INVALID_NOTE" }, { status: 400 });
    result = await supabase.from("crm_notes").insert({ entity_type: entityType, entity_id: entityId, note, created_by: userId }).select().single();
    activityEntity = entityType;
    activityId = entityId;
    detail = "Note added";
  } else if (entity === "conversion") {
    const leadId = clean(body.id, 100);
    if (!leadId) return NextResponse.json({ error: "LEAD_ID_REQUIRED" }, { status: 400 });
    const conversion = await supabase.rpc("convert_lead_to_client", { p_lead_id: leadId });
    if (conversion.error) return NextResponse.json({ error: "LEAD_CONVERSION_FAILED", detail: conversion.error.message }, { status: 500 });
    activityEntity = "lead";
    activityId = leadId;
    detail = `Lead converted to client ${conversion.data}`;
    result = { data: { clientId: conversion.data }, error: null };
  } else {
    return NextResponse.json({ error: "INVALID_ENTITY" }, { status: 400 });
  }

  if (result.error) return NextResponse.json({ error: "CRM_WRITE_FAILED", detail: result.error.message }, { status: 500 });
  await supabase.from("crm_activities").insert({ entity_type: activityEntity, entity_id: activityId, action: `${entity}_created`, detail, created_by: userId });
  return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await getAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, userId, admin } = auth;
  if (!editableRoles.has(admin.role)) return NextResponse.json({ error: "READ_ONLY_ACCESS" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const entity = clean(body.entity, 30);
  const id = clean(body.id, 200);
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  let result;
  let detail = "Record updated";

  if (entity === "lead") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      const status = clean(body.status, 50);
      if (!pipelineStages.has(status)) return NextResponse.json({ error: "INVALID_PIPELINE_STAGE" }, { status: 400 });
      updates.status = status;
      updates.stage_changed_at = new Date().toISOString();
      updates.probability = status === "Won" ? 100 : status === "Lost" ? 0 : probability(body.probability, status === "Proposal" ? 70 : status === "Qualified" ? 45 : status === "Contacted" ? 25 : 10);
      if (status === "Won") updates.won_at = new Date().toISOString();
    }
    if (body.estimatedValue !== undefined) updates.estimated_value = Number(body.estimatedValue) || null;
    if (body.notes !== undefined) updates.notes = clean(body.notes, 5000) || null;
    if (body.helpNeeded !== undefined) updates.help_needed = clean(body.helpNeeded, 2000);
    if (body.nextAction !== undefined) updates.next_action = clean(body.nextAction, 500) || null;
    if (body.nextActionAt !== undefined) updates.next_action_at = optionalDate(body.nextActionAt);
    if (body.probability !== undefined && body.status === undefined) updates.probability = probability(body.probability);
    if (body.lostReason !== undefined) updates.lost_reason = clean(body.lostReason, 1000) || null;
    if (body.lastContactedAt !== undefined) updates.last_contacted_at = optionalDate(body.lastContactedAt);
    result = await supabase.from("leads").update(updates).eq("id", id).select().single();
    detail = `Lead moved to ${updates.status || "updated"}`;
  } else if (entity === "client") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.businessName !== undefined) updates.business_name = clean(body.businessName, 200);
    if (body.email !== undefined) updates.email = clean(body.email, 320) || null;
    if (body.phone !== undefined) updates.phone = clean(body.phone, 50) || null;
    if (body.status !== undefined) updates.status = clean(body.status, 50);
    result = await supabase.from("clients").update(updates).eq("id", id).select().single();
    detail = "Client details updated";
  } else if (entity === "task") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      const title = clean(body.title, 300);
      if (!title) return NextResponse.json({ error: "TASK_TITLE_REQUIRED" }, { status: 400 });
      updates.title = title;
    }
    if (body.notes !== undefined) updates.notes = clean(body.notes, 2000) || null;
    if (body.clientId !== undefined) updates.client_id = clean(body.clientId, 200) || null;
    if (body.dueDate !== undefined) updates.due_date = clean(body.dueDate, 10) || null;
    if (body.category !== undefined) updates.category = clean(body.category, 80) || "General";
    if (body.priority !== undefined) {
      const priority = clean(body.priority, 20);
      if (!taskPriorities.has(priority)) return NextResponse.json({ error: "INVALID_TASK_PRIORITY" }, { status: 400 });
      updates.priority = priority;
    }
    if (body.status !== undefined) {
      const status = clean(body.status, 30);
      if (!taskStatuses.has(status)) return NextResponse.json({ error: "INVALID_TASK_STATUS" }, { status: 400 });
      const done = status === "done";
      updates.status = status;
      updates.done = done;
      updates.completed_at = done ? new Date().toISOString() : null;
      detail = done ? "Task completed" : `Task marked ${status.replace("_", " ")}`;
    } else if (body.done !== undefined) {
      const done = Boolean(body.done);
      updates.done = done;
      updates.status = done ? "done" : "todo";
      updates.completed_at = done ? new Date().toISOString() : null;
      detail = done ? "Task completed" : "Task reopened";
    }
    result = await supabase.from("checklist_items").update(updates).eq("id", id).select().single();
  } else {
    return NextResponse.json({ error: "INVALID_ENTITY" }, { status: 400 });
  }

  if (result.error) return NextResponse.json({ error: "CRM_WRITE_FAILED", detail: result.error.message }, { status: 500 });
  await supabase.from("crm_activities").insert({ entity_type: entity, entity_id: id, action: `${entity}_updated`, detail, created_by: userId });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: Request) {
  const auth = await getAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, userId, admin } = auth;
  if (!deletableRoles.has(admin.role)) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (clean(body.entity, 30) !== "task") return NextResponse.json({ error: "INVALID_ENTITY" }, { status: 400 });
  const id = clean(body.id, 200);
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });

  const result = await supabase.from("checklist_items").delete().eq("id", id).select("id,title").single();
  if (result.error) return NextResponse.json({ error: "CRM_WRITE_FAILED", detail: result.error.message }, { status: 500 });
  await supabase.from("crm_activities").insert({ entity_type: "task", entity_id: id, action: "task_deleted", detail: `Task deleted: ${result.data.title}`, created_by: userId });
  return NextResponse.json({ data: { id } });
}
