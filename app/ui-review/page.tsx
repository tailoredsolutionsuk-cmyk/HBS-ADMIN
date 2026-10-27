"use client";
// Temporary local UI review only. Never include this route in a release.
import { useEffect, useState } from "react";
import AdminPage from "../admin/page";

const clients = [{ id: "sample-one", business_name: "Northside Garage", industry: "Automotive", email: "hello@example.com", phone: "0161 000 0000", website: "https://example.com", domain: "example.com", status: "active", portal_enabled: false }, { id: "sample-two", business_name: "Riverside Studio", industry: "Design", email: null, phone: null, website: null, domain: null, status: "active", portal_enabled: false }];
const leads = ["Northfield Motors", "Oakwood Interiors", "Greenway Gardens", "Harbour Fitness"].map((name, index) => ({ id: `lead-${index}`, business_name: name, status: ["New", "Contacted", "Proposal", "Won"][index], probability: 20, estimated_value: 650, main_location: "Manchester", phone: "0161 000 0000", source: "Google Sheets: Leads For Outreach", notes: "Services listed: Local business services\nCustomer reviews listed: 4.8 from 52 reviews", next_action: index === 0 ? "Call to discuss a new website" : "Follow up on the proposal", next_action_at: new Date(Date.now() + (index - 1) * 86400000).toISOString(), created_at: new Date().toISOString(), name, stage_changed_at: new Date().toISOString(), converted_business_id: null }));
const tasks = ["Review the homepage design", "Connect the website analytics", "Send the project update"].map((title, index) => ({ id: `task-${index}`, title, client_id: index < 2 ? "sample-one" : "sample-two", notes: "Check the details before the client review.", status: index === 1 ? "in_progress" : "todo", priority: index === 0 ? "high" : "medium", category: "client work", done: false, due_date: "2026-10-27", updated_at: new Date().toISOString() }));
const crm = { clients, clientAnalytics: [], leads, tasks, notes: [], activities: [], portalUsers: [], projectActivities: [], permissions: { canEdit: true, canManagePortal: true }, metrics: { clients: 2, openLeads: 3, pipelineValue: 1950, weightedValue: 780, overdueFollowUps: 1, tasksDue: 3 } };

export default function UiReview() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, options) => {
      const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href).pathname;
      if (!path.startsWith("/api/admin/")) return original(input, options);
      if (options?.method && options.method !== "GET") return Response.json({ detail: "Sample preview: changes are disabled." }, { status: 409 });
      if (path === "/api/admin/crm") return Response.json(crm);
      if (path === "/api/admin/overview") return Response.json({ websites: clients.map((client) => ({ name: client.business_name, domain: client.domain || "In progress", type: "Business", status: "Live", color: "mint", updated: "Today", deployment: "Ready" })), activities: [{ title: "Website updated", detail: "Northside Garage homepage is ready to review", time: "Today", tone: "success" }], stats: { activeWebsites: 2, deployments: 4, teamMembers: 1, uptime: "99.9%", pageViews30d: 1842 } });
      return Response.json({ error: "Sample preview: this connection is unavailable." }, { status: 503 });
    };
    setReady(true);
    return () => { window.fetch = original; };
  }, []);
  return ready ? <AdminPage /> : <p>Loading local sample preview…</p>;
}
