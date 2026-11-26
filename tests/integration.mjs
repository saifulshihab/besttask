import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { io } from "socket.io-client";

// Exercises real HTTP authorization and persistence. Creates only its own
// uniquely named fixtures; never resets the database or modifies other data.
const base = process.env.BESTTASK_TEST_API ?? "http://localhost:4000/api";
const suffix = crypto.randomUUID().slice(0, 8);
const password = "Besttask-test-123!";
let assertions = 0;
async function request(actor, path, method = "GET", body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(actor ? { authorization: `Bearer ${actor.tokens.accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => undefined);
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(result?.error ?? "Unexpected response")}`,
  );
  assertions++;
  return result;
}
function check(condition, message) {
  assert.ok(condition, message);
  assertions++;
}
const actor = async (name) =>
  request(
    null,
    "/auth/register",
    "POST",
    {
      name: `QA ${name}`,
      email: `qa-${name}-${suffix}@taskflow.test`,
      password,
    },
    201,
  );
const [owner, admin, member, outsider] = await Promise.all([
  actor("owner"),
  actor("admin"),
  actor("member"),
  actor("outsider"),
]);
let ws;
// Chat sockets opened by the run; closed before the run ends, pass or fail.
const sockets = [];
try {
  ws = await request(
    owner,
    "/workspaces",
    "POST",
    { name: `Redesign QA ${suffix}` },
    201,
  );
  check(ws.role === "WORKSPACE_OWNER", "Creator owns workspace");
  for (const user of [admin, member])
    await request(
      owner,
      `/workspaces/${ws.id}/members`,
      "POST",
      { email: user.user.email },
      201,
    );
  const project = await request(
    owner,
    `/workspaces/${ws.id}/projects`,
    "POST",
    { name: "Assigned project", key: "QA" },
    201,
  );
  const hidden = await request(
    owner,
    `/workspaces/${ws.id}/projects`,
    "POST",
    { name: "Unassigned project", key: "HIDE" },
    201,
  );
  for (const [user, role] of [
    [admin, "ADMIN"],
    [member, "MEMBER"],
  ])
    await request(owner, `/projects/${project.id}/members`, "POST", {
      userId: user.user.id,
      role,
    });
  await request(member, `/workspaces/${ws.id}/members`, "GET", undefined, 403);
  await request(
    admin,
    `/workspaces/${ws.id}`,
    "PATCH",
    { name: "Forbidden" },
    403,
  );
  await request(
    admin,
    `/workspaces/${ws.id}/projects`,
    "POST",
    { name: "Forbidden" },
    403,
  );
  await request(member, `/projects/${hidden.id}`, "GET", undefined, 404);
  await request(outsider, `/projects/${project.id}`, "GET", undefined, 404);
  const visible = await request(member, `/workspaces/${ws.id}/projects`);
  check(
    visible.data.length === 1 && visible.data[0].id === project.id,
    "Project listing hides unassigned projects",
  );
  await request(admin, `/projects/${project.id}`, "PATCH", {
    name: "Renamed by admin",
    defaultStatus: "IN_REVIEW",
    defaultPriority: "HIGH",
  });
  await request(
    member,
    `/projects/${project.id}`,
    "PATCH",
    { name: "Forbidden" },
    403,
  );
  await request(
    admin,
    `/projects/${project.id}/archive`,
    "POST",
    undefined,
    403,
  );
  await request(admin, `/projects/${project.id}`, "DELETE", undefined, 403);
  await request(admin, `/projects/${project.id}`, "PATCH", { seats: 2 }, 400);
  await request(
    admin,
    `/projects/${project.id}/members/${admin.user.id}`,
    "DELETE",
    undefined,
    400,
  );
  await request(
    admin,
    `/projects/${project.id}/members/${admin.user.id}`,
    "PATCH",
    { role: "MEMBER" },
    400,
  );
  const label = await request(
    member,
    `/projects/${project.id}/labels`,
    "POST",
    { name: "Member label", color: "#0E7490" },
    201,
  );
  await request(
    member,
    `/labels/${label.id}`,
    "PATCH",
    { name: "Forbidden" },
    403,
  );
  await request(admin, `/labels/${label.id}`, "PATCH", { name: "Admin label" });
  const hiddenTask = await request(
    owner,
    `/projects/${hidden.id}/tasks`,
    "POST",
    { title: "Hidden task" },
    201,
  );
  const task = await request(
    member,
    `/projects/${project.id}/tasks`,
    "POST",
    { title: "Main task", assigneeId: member.user.id, labelIds: [label.id] },
    201,
  );
  check(
    task.status === "IN_REVIEW" &&
      task.priority === "HIGH" &&
      task.key === "QA-1",
    "Project defaults and readable task ID apply",
  );
  const override = await request(
    member,
    `/projects/${project.id}/tasks?projectId=${hidden.id}`,
  );
  check(
    override.data.length === 0,
    "Query projectId cannot override authorization scope",
  );
  await request(member, `/tasks/${hiddenTask.id}`, "GET", undefined, 404);
  const hiddenLabel = await request(
    owner,
    `/projects/${hidden.id}/labels`,
    "POST",
    { name: "Hidden label" },
    201,
  );
  await request(
    member,
    `/tasks/${task.id}/labels`,
    "POST",
    { labelId: hiddenLabel.id },
    400,
  );
  await request(
    member,
    `/tasks/${task.id}/assignee`,
    "PATCH",
    { assigneeId: outsider.user.id },
    400,
  );
  const sub = await request(
    member,
    `/projects/${project.id}/tasks`,
    "POST",
    { title: "Unfinished subtask", parentTaskId: task.id, status: "TODO" },
    201,
  );
  await request(member, `/tasks/${task.id}/status`, "PATCH", {
    status: "DONE",
  });
  await request(admin, `/tasks/${sub.id}`, "PATCH", {
    title: "Renamed subtask",
  });
  const comment = await request(
    member,
    `/tasks/${task.id}/comments`,
    "POST",
    { body: "My comment" },
    201,
  );
  await request(owner, `/comments/${comment.id}`, "DELETE", undefined, 403);
  await request(
    admin,
    `/comments/${comment.id}`,
    "PATCH",
    { body: "Forbidden" },
    403,
  );
  await request(member, `/comments/${comment.id}`, "PATCH", {
    body: "Edited own comment",
  });
  const view = await request(member, `/projects/${project.id}/views`, "POST", {
    name: "Mine",
    filters: { status: "DONE" },
  });
  await request(
    owner,
    `/projects/${project.id}/views/${view.id}`,
    "DELETE",
    undefined,
    404,
  );
  const ownerViews = await request(owner, `/projects/${project.id}/views`);
  check(ownerViews.length === 0, "Saved views are personal");
  const activity = await request(member, `/projects/${project.id}/activity`);
  check(
    activity.data.length > 0 &&
      activity.data.every((a) => a.projectId === project.id),
    "Project activity lists that project's events",
  );
  const taskEvents = await request(
    member,
    `/projects/${project.id}/activity?entityId=${task.id}`,
  );
  check(
    taskEvents.data.length > 0 &&
      taskEvents.data.every((a) => a.entityId === task.id),
    "Project activity narrows to one task",
  );
  await request(
    member,
    `/projects/${hidden.id}/activity`,
    "GET",
    undefined,
    404,
  );
  await request(member, `/workspaces/${ws.id}/activity`, "GET", undefined, 404);
  // Notifications: assignment, status changes and comments, never for your
  // own actions, and only for projects you can still open.
  const inbox = (user, query = "") =>
    request(user, `/workspaces/${ws.id}/notifications${query}`);
  check(
    (await inbox(member)).data.length === 0,
    "No notifications for your own actions",
  );
  const notifyTask = await request(
    admin,
    `/projects/${project.id}/tasks`,
    "POST",
    { title: "Notify me", assigneeId: member.user.id, dueDate: "2020-01-02" },
    201,
  );
  let memberInbox = await inbox(member);
  check(
    memberInbox.data.length === 1 &&
      memberInbox.data[0].type === "task.assigned" &&
      memberInbox.data[0].task.id === notifyTask.id &&
      memberInbox.data[0].task.key === notifyTask.key &&
      memberInbox.data[0].actor.id === admin.user.id,
    "Assignee is notified of a new assignment",
  );
  let summary = await request(
    member,
    `/workspaces/${ws.id}/notifications/summary`,
  );
  check(
    summary.unread === 1 && summary.overdue === 1 && summary.dueToday === 0,
    "Summary counts unread notifications and overdue tasks",
  );
  const otherSummary = await request(
    member,
    `/workspaces/${ws.id}/notifications/summary?projectId=${hidden.id}`,
  );
  check(
    otherSummary.unread === 1 && otherSummary.overdue === 0,
    "Due counts narrow to one project; unread stays workspace-wide",
  );
  await request(
    member,
    `/tasks/${notifyTask.id}/comments`,
    "POST",
    { body: "On it" },
    201,
  );
  const adminInbox = await inbox(admin);
  check(
    adminInbox.data.length === 1 &&
      adminInbox.data[0].type === "comment.created" &&
      adminInbox.data[0].metadata.excerpt === "On it",
    "Task creator is notified of comments",
  );
  await request(
    owner,
    `/tasks/${notifyTask.id}/comments`,
    "POST",
    { body: "Thanks" },
    201,
  );
  await request(admin, `/tasks/${notifyTask.id}/move`, "POST", {
    status: "IN_PROGRESS",
    beforeId: null,
  });
  memberInbox = await inbox(member);
  check(
    memberInbox.data.map((n) => n.type).join() ===
      "task.status_changed,comment.created,task.assigned" &&
      memberInbox.data[0].metadata.to === "IN_PROGRESS",
    "Assignee hears about comments and status changes, newest first",
  );
  check(
    (await inbox(admin)).data.length === 2 &&
      (await inbox(owner)).data.length === 0,
    "Commenters hear about later comments; status goes to assignee and creator",
  );
  await request(
    admin,
    `/notifications/${memberInbox.data[0].id}`,
    "PATCH",
    { read: true },
    404,
  );
  const marked = await request(
    member,
    `/notifications/${memberInbox.data[0].id}`,
    "PATCH",
    { read: true },
  );
  check(!!marked.readAt, "Recipient marks a notification read");
  check(
    (await inbox(member, "?unread=true")).data.length === 2,
    "Unread filter leaves out read notifications",
  );
  const allRead = await request(
    member,
    `/workspaces/${ws.id}/notifications/read-all`,
    "POST",
  );
  summary = await request(member, `/workspaces/${ws.id}/notifications/summary`);
  check(
    allRead.updated === 2 && summary.unread === 0,
    "Mark all read clears the unread count",
  );
  await request(
    outsider,
    `/workspaces/${ws.id}/notifications`,
    "GET",
    undefined,
    404,
  );
  await request(
    owner,
    `/projects/${project.id}/members/${admin.user.id}`,
    "DELETE",
  );
  check(
    (await inbox(admin)).data.length === 0,
    "Notifications hide when access to the project is lost",
  );
  await request(owner, `/projects/${project.id}/members`, "POST", {
    userId: admin.user.id,
    role: "ADMIN",
  });
  check(
    (await inbox(admin)).data.length === 2,
    "Notifications return with project access",
  );
  await request(owner, `/projects/${project.id}/archive`, "POST");
  await request(
    owner,
    `/tasks/${task.id}`,
    "PATCH",
    { title: "Forbidden" },
    400,
  );
  await request(owner, `/projects/${project.id}/unarchive`, "POST");
  const deletion = await request(member, `/tasks/${sub.id}`, "DELETE");
  await request(member, `/tasks/${sub.id}`, "GET", undefined, 404);
  await request(member, `/recovery/${deletion.recoveryId}/undo`, "POST");
  await request(member, `/tasks/${sub.id}`);
  const expired = await request(member, `/tasks/${sub.id}`, "DELETE");
  if (process.env.BESTTASK_TEST_RESTART === "1") {
    execFileSync("docker", ["compose", "restart", "api"], { stdio: "pipe" });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const health = await fetch(base.replace(/\/api$/, "") + "/health");
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    check(ready, "API recovered after restart");
  }
  await new Promise((resolve) => setTimeout(resolve, 6200));
  const denied = await fetch(base + `/recovery/${expired.recoveryId}/undo`, {
    method: "POST",
    headers: { authorization: `Bearer ${member.tokens.accessToken}` },
  });
  check([400, 404].includes(denied.status), "Undo rejected after six seconds");
  await request(
    owner,
    `/workspaces/${ws.id}/members/${member.user.id}`,
    "PATCH",
    { active: false },
  );
  await request(member, `/projects/${project.id}`, "GET", undefined, 404);
  const unassigned = await request(owner, `/tasks/${task.id}`);
  check(unassigned.assigneeId === null, "Deactivation clears task assignments");
  await request(
    owner,
    `/workspaces/${ws.id}/members/${member.user.id}`,
    "PATCH",
    { active: true },
  );
  await request(member, `/projects/${project.id}`);
  const ownSpace = await request(
    member,
    "/workspaces",
    "POST",
    { name: "Member becomes owner" },
    201,
  );
  check(
    ownSpace.role === "WORKSPACE_OWNER",
    "Members can own another workspace",
  );
  await request(member, `/workspaces/${ownSpace.id}`, "DELETE", undefined, 204);
  await request(owner, "/auth/me", "DELETE", { password }, 400);
  await request(
    owner,
    `/workspaces/${ws.id}/members`,
    "POST",
    { email: outsider.user.email },
    201,
  );
  await request(owner, `/projects/${project.id}`, "PATCH", { seats: 2 });
  await request(
    admin,
    `/projects/${project.id}/members`,
    "POST",
    { userId: outsider.user.id, role: "MEMBER" },
    409,
  );
  await request(owner, `/projects/${project.id}`, "PATCH", { seats: 1 }, 409);
  const otherWorkspace = await request(
    admin,
    "/workspaces",
    "POST",
    { name: "Admin owns another workspace" },
    201,
  );
  await request(owner, `/projects/${hidden.id}/members`, "POST", {
    userId: admin.user.id,
    role: "MEMBER",
  });
  await request(
    admin,
    `/projects/${hidden.id}`,
    "PATCH",
    { name: "Forbidden as project Member" },
    403,
  );
  const mixedRole = await request(admin, `/projects/${hidden.id}`);
  check(
    mixedRole.role === "MEMBER",
    "Workspace ownership and project Admin role do not leak into other projects",
  );
  await request(
    admin,
    `/workspaces/${otherWorkspace.id}`,
    "DELETE",
    undefined,
    204,
  );
  const concurrent = await Promise.all([
    request(
      member,
      `/projects/${project.id}/tasks`,
      "POST",
      { title: "Concurrent one" },
      201,
    ),
    request(
      member,
      `/projects/${project.id}/tasks`,
      "POST",
      { title: "Concurrent two" },
      201,
    ),
  ]);
  check(
    concurrent[0].number !== concurrent[1].number,
    "Concurrent task creation uses unique project sequence",
  );
  const labelDeletion = await request(admin, `/labels/${label.id}`, "DELETE");
  await request(
    member,
    `/recovery/${labelDeletion.recoveryId}/undo`,
    "POST",
    undefined,
    403,
  );
  await request(admin, `/recovery/${labelDeletion.recoveryId}/undo`, "POST");
  const projectDeletion = await request(
    owner,
    `/projects/${hidden.id}`,
    "DELETE",
  );
  await request(owner, `/projects/${hidden.id}`, "GET", undefined, 404);
  await request(owner, `/recovery/${projectDeletion.recoveryId}/undo`, "POST");
  const memberDeletion = await request(
    owner,
    `/workspaces/${ws.id}/members/${member.user.id}`,
    "DELETE",
  );
  await request(member, `/projects/${project.id}`, "GET", undefined, 404);
  await request(owner, `/recovery/${memberDeletion.recoveryId}/undo`, "POST");
  await request(member, `/projects/${project.id}`);
  await request(member, "/auth/me", "PATCH", {
    name: "QA Updated",
    theme: "dark",
    startPage: "list",
  });
  const preferences = await request(member, "/auth/me");
  check(
    preferences.theme === "dark" && preferences.startPage === "list",
    "Personal preferences persist",
  );
  const refreshed = await Promise.all([
    fetch(base + "/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: admin.tokens.refreshToken }),
    }),
    fetch(base + "/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: admin.tokens.refreshToken }),
    }),
  ]);
  check(
    refreshed.filter((r) => r.status === 200).length === 1 &&
      refreshed.filter((r) => r.status === 401).length === 1,
    "Only one concurrent refresh succeeds",
  );
  admin.tokens = (await refreshed.find((r) => r.status === 200).json()).tokens;

  // Chat. Channels are stored; messages are only relayed to live sockets.
  // State here: owner; admin (ADMIN) and member (MEMBER) on the project, its
  // two seats full; outsider is in the workspace but on no project.
  const channels = await request(member, `/projects/${project.id}/channels`);
  check(
    channels.length === 1 &&
      channels[0].name === "general" &&
      channels[0].isDefault,
    "Every project starts with #general",
  );
  const general = channels[0];
  await request(
    outsider,
    `/projects/${project.id}/channels`,
    "GET",
    undefined,
    404,
  );
  await request(
    member,
    `/projects/${project.id}/channels`,
    "POST",
    { name: "design" },
    403,
  );
  await request(
    admin,
    `/projects/${project.id}/channels`,
    "POST",
    { name: "Design review" },
    422,
  );
  const design = await request(
    admin,
    `/projects/${project.id}/channels`,
    "POST",
    { name: "Design" },
    201,
  );
  check(design.name === "design", "Channel names are stored lowercase");
  await request(
    owner,
    `/projects/${project.id}/channels`,
    "POST",
    { name: "design" },
    409,
  );
  await request(
    member,
    `/channels/${design.id}`,
    "PATCH",
    { name: "nope" },
    403,
  );
  const renamed = await request(admin, `/channels/${design.id}`, "PATCH", {
    name: "design-review",
  });
  check(renamed.name === "design-review", "Admins rename channels");
  await request(admin, `/channels/${general.id}`, "DELETE", undefined, 400);
  await request(member, `/channels/${design.id}`, "DELETE", undefined, 403);
  const channelDeletion = await request(
    admin,
    `/channels/${design.id}`,
    "DELETE",
  );
  check(
    (await request(member, `/projects/${project.id}/channels`)).length === 1,
    "Deleted channels leave the list",
  );
  await request(
    member,
    `/recovery/${channelDeletion.recoveryId}/undo`,
    "POST",
    undefined,
    403,
  );
  await request(admin, `/recovery/${channelDeletion.recoveryId}/undo`, "POST");
  check(
    (await request(member, `/projects/${project.id}/channels`)).length === 2,
    "Undo restores a deleted channel",
  );
  const [hiddenGeneral] = await request(
    owner,
    `/projects/${hidden.id}/channels`,
  );

  const origin = new URL(base).origin;
  const open = (user, workspaceId = ws.id, token = user.tokens.accessToken) =>
    new Promise((resolve) => {
      const socket = io(origin, {
        auth: { token, workspaceId },
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.once("connect", () => resolve({ socket }));
      socket.once("connect_error", (error) =>
        resolve({ error: error.data ?? { message: error.message } }),
      );
    });
  const connected = async (user, workspaceId, token) => {
    const result = await open(user, workspaceId, token);
    check(result.socket, `Socket connects: ${JSON.stringify(result.error)}`);
    return result.socket;
  };
  const send = (socket, event, payload) =>
    socket.timeout(5000).emitWithAck(event, payload);
  // Resolves with the first matching event; fails the run if none arrives.
  const next = (socket, event, match = () => true, ms = 4000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`Timed out waiting for ${event}`));
      }, ms);
      const handler = (data) => {
        if (!match(data)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      };
      socket.on(event, handler);
    });
  // True when no matching event arrives within the window.
  const silent = (socket, event, match = () => true, ms = 800) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        resolve(true);
      }, ms);
      const handler = (data) => {
        if (!match(data)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(false);
      };
      socket.on(event, handler);
    });

  check(
    (await open(member, ws.id, "not-a-token")).error?.status === 401,
    "Sockets need a valid access token",
  );
  check(
    (await open(member, crypto.randomUUID())).error?.status === 404,
    "Sockets need workspace membership",
  );
  const [ownerSocket, adminSocket, memberSocket, outsiderSocket] =
    await Promise.all(
      [owner, admin, member, outsider].map((user) => connected(user)),
    );

  const presence = await send(memberSocket, "presence:list", {
    projectId: project.id,
  });
  check(
    presence.ok &&
      [owner, admin, member].every((user) =>
        presence.data.userIds.includes(user.user.id),
      ) &&
      !presence.data.userIds.includes(outsider.user.id),
    "Presence lists who is online in the project",
  );
  const hiddenPresence = await send(memberSocket, "presence:list", {
    projectId: hidden.id,
  });
  check(
    !hiddenPresence.ok && hiddenPresence.error.status === 404,
    "Presence stays inside accessible projects",
  );

  const listChanged = next(
    memberSocket,
    "channels:changed",
    (event) => event.projectId === project.id,
  );
  await request(
    admin,
    `/projects/${project.id}/channels`,
    "POST",
    { name: "release" },
    201,
  );
  await listChanged;
  check(true, "Channel changes reach the project live");

  const delivered = next(
    adminSocket,
    "message:new",
    (message) => message.clientId === "c1",
  );
  const outsiderHears = silent(outsiderSocket, "message:new");
  const sent = await send(memberSocket, "message:send", {
    target: { channelId: general.id },
    body: "  Hello team  ",
    clientId: "c1",
  });
  check(
    sent.ok &&
      sent.data.body === "Hello team" &&
      sent.data.author.id === member.user.id,
    "Channel messages are acknowledged",
  );
  const received = await delivered;
  check(
    received.id === sent.data.id && received.channelId === general.id,
    "People on the project receive channel messages",
  );
  check(await outsiderHears, "People outside the project hear nothing");
  const blank = await send(memberSocket, "message:send", {
    target: { channelId: general.id },
    body: "   ",
  });
  check(!blank.ok && blank.error.status === 422, "Empty messages are refused");
  const elsewhere = await send(memberSocket, "message:send", {
    target: { channelId: hiddenGeneral.id },
    body: "Hi",
  });
  check(
    !elsewhere.ok && elsewhere.error.status === 404,
    "Channels of other projects are out of reach",
  );

  const dmArrives = next(
    adminSocket,
    "message:new",
    (message) => message.clientId === "d1",
  );
  const ownerOverhears = silent(
    ownerSocket,
    "message:new",
    (message) => message.clientId === "d1",
  );
  const dm = await send(memberSocket, "message:send", {
    target: { projectId: project.id, userId: admin.user.id },
    body: "Quick question",
    clientId: "d1",
  });
  check(
    dm.ok && dm.data.recipientId === admin.user.id && !dm.data.channelId,
    "Direct messages are acknowledged",
  );
  check(
    (await dmArrives).author.id === member.user.id,
    "The recipient receives the direct message",
  );
  check(await ownerOverhears, "Direct messages reach only the two people");
  const toOutsider = await send(memberSocket, "message:send", {
    target: { projectId: project.id, userId: outsider.user.id },
    body: "Hi",
  });
  check(
    !toOutsider.ok && toOutsider.error.status === 404,
    "Direct messages stay among the project's people",
  );
  const toSelf = await send(memberSocket, "message:send", {
    target: { projectId: project.id, userId: member.user.id },
    body: "Hi me",
  });
  check(
    !toSelf.ok && toSelf.error.status === 400,
    "No direct messages to yourself",
  );

  const ownerLeaves = next(
    memberSocket,
    "presence:changed",
    (event) =>
      event.userId === owner.user.id && event.projectId === project.id,
  );
  ownerSocket.disconnect();
  check(
    (await ownerLeaves).online === false,
    "Others see when someone goes offline",
  );
  const offline = await send(memberSocket, "message:send", {
    target: { projectId: project.id, userId: owner.user.id },
    body: "Are you there?",
  });
  check(
    !offline.ok && offline.error.status === 409,
    "Offline people can't be messaged",
  );

  const adminLoses = next(
    adminSocket,
    "access:changed",
    (event) => !event.projectIds.includes(project.id),
  );
  await request(
    owner,
    `/projects/${project.id}/members/${admin.user.id}`,
    "DELETE",
  );
  await adminLoses;
  const removedHears = silent(
    adminSocket,
    "message:new",
    (message) => message.clientId === "c2",
  );
  await send(memberSocket, "message:send", {
    target: { channelId: general.id },
    body: "After the removal",
    clientId: "c2",
  });
  check(
    await removedHears,
    "Removed people stop receiving the project's messages",
  );
  const removedSend = await send(adminSocket, "message:send", {
    target: { channelId: general.id },
    body: "Still here?",
  });
  check(
    !removedSend.ok && removedSend.error.status === 404,
    "Removed people can't post",
  );
  const adminBack = next(adminSocket, "access:changed", (event) =>
    event.projectIds.includes(project.id),
  );
  await request(owner, `/projects/${project.id}/members`, "POST", {
    userId: admin.user.id,
    role: "ADMIN",
  });
  await adminBack;

  const archivedOut = next(
    memberSocket,
    "access:changed",
    (event) => !event.projectIds.includes(project.id),
  );
  await request(owner, `/projects/${project.id}/archive`, "POST");
  await archivedOut;
  const archivedSend = await send(memberSocket, "message:send", {
    target: { channelId: general.id },
    body: "Anyone?",
  });
  check(
    !archivedSend.ok && archivedSend.error.status === 400,
    "Archived projects take no messages",
  );
  const restoredAccess = next(memberSocket, "access:changed", (event) =>
    event.projectIds.includes(project.id),
  );
  await request(owner, `/projects/${project.id}/unarchive`, "POST");
  await restoredAccess;

  const burst = await Promise.all(
    Array.from({ length: 25 }, () =>
      send(outsiderSocket, "message:send", {
        target: { channelId: general.id },
        body: "spam",
      }),
    ),
  );
  check(
    burst.some((result) => !result.ok && result.error.status === 429),
    "Sockets that send too fast are slowed down",
  );

  const rotated = await request(null, "/auth/refresh", "POST", {
    refreshToken: admin.tokens.refreshToken,
  });
  admin.tokens = rotated.tokens;
  const handover = await send(adminSocket, "session:refresh", {
    token: admin.tokens.accessToken,
  });
  check(handover.ok, "Sockets take over a refreshed session");
  const otherAccount = await send(adminSocket, "session:refresh", {
    token: member.tokens.accessToken,
  });
  check(
    !otherAccount.ok && otherAccount.error.status === 401,
    "Sockets can't switch to another account",
  );

  const second = await request(null, "/auth/login", "POST", {
    email: member.user.email,
    password,
  });
  const secondSocket = await connected(
    member,
    ws.id,
    second.tokens.accessToken,
  );
  const dropped = new Promise((resolve) =>
    secondSocket.once("disconnect", resolve),
  );
  await request(
    second,
    "/auth/logout",
    "POST",
    { refreshToken: second.tokens.refreshToken },
    204,
  );
  const reason = await Promise.race([
    dropped,
    new Promise((resolve) => setTimeout(() => resolve("still open"), 3000)),
  ]);
  check(
    reason === "io server disconnect",
    "Signing out closes that session's sockets",
  );
  check(memberSocket.connected, "Other sessions stay connected");
  for (const socket of sockets) socket.disconnect();
  await request(owner, `/workspaces/${ws.id}/transfer`, "POST", {
    userId: admin.user.id,
    assignments: [{ projectId: project.id, role: "MEMBER" }],
  });
  await request(owner, `/workspaces/${ws.id}/members`, "GET", undefined, 403);
  const transferred = await request(admin, `/workspaces/${ws.id}`);
  check(
    transferred.ownerId === admin.user.id &&
      transferred.role === "WORKSPACE_OWNER",
    "Exactly one new owner after transfer",
  );
  await request(admin, `/workspaces/${ws.id}`, "DELETE", undefined, 204);
  ws = null;
  await request(
    member,
    "/auth/logout",
    "POST",
    { refreshToken: member.tokens.refreshToken },
    204,
  );
  await request(member, "/auth/me", "GET", undefined, 401);
  console.log(`PASS: ${assertions} integration assertions`);
} finally {
  for (const socket of sockets) socket.disconnect();
  // Delete only this run's workspace and accounts. Keep cleanup failures visible.
  if (ws) {
    for (const user of [owner, admin]) {
      const response = await fetch(base + `/workspaces/${ws.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${user.tokens.accessToken}` },
      });
      if (response.ok) break;
    }
  }
  for (const user of [owner, admin, member, outsider]) {
    try {
      const fresh = await request(null, "/auth/login", "POST", {
        email: user.user.email,
        password,
      });
      await request(fresh, "/auth/me", "DELETE", { password });
    } catch (error) {
      console.error("Fixture cleanup failed:", error.message);
      process.exitCode = 1;
    }
  }
}
