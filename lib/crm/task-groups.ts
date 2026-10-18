type ClientForTasks = { id: string; business_name: string };
type TaskForClient = { client_id: string | null };

export function groupTasksByClient<T extends TaskForClient>(
  clients: ClientForTasks[],
  tasks: T[],
  clientFilter: string,
  search: string,
) {
  const query = search.trim().toLowerCase();
  const tasksByClient = new Map<string, T[]>();
  const knownClientIds = new Set(clients.map((client) => client.id));
  for (const task of tasks) {
    const id = task.client_id && knownClientIds.has(task.client_id) ? task.client_id : "internal";
    tasksByClient.set(id, [...(tasksByClient.get(id) ?? []), task]);
  }

  const groups = clients
    .filter((client) => clientFilter === "all" || clientFilter === client.id)
    .filter((client) => !query || client.business_name.toLowerCase().includes(query) || tasksByClient.has(client.id))
    .map((client) => ({ id: client.id, name: client.business_name, tasks: tasksByClient.get(client.id) ?? [] }));

  if ((clientFilter === "all" || clientFilter === "internal") && tasksByClient.has("internal")) {
    groups.push({ id: "internal", name: "HBS internal", tasks: tasksByClient.get("internal") ?? [] });
  }
  return groups;
}
