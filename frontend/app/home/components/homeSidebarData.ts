import type { ConversationListItem, SidebarMentorGroup, SidebarWorkspaceGroup } from '@/app/home/types';
import type { MentorListItem } from '@/lib/mentors/types';
import type { WorkspaceSummary } from '@/lib/workspaces';

export interface ConversationSummaryRow {
  id: string;
  title: string | null;
  mentor_id: string | null;
  workspace_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface HomeNavigationData {
  mentors: MentorListItem[];
  workspaces: WorkspaceSummary[];
  conversations: ConversationListItem[];
}

export function buildSidebarGroups(
  mentorSource: MentorListItem[],
  conversationSource: ConversationListItem[]
): SidebarMentorGroup[] {
  const groups: SidebarMentorGroup[] = [
    {
      mentor_id: null,
      mentor_name: 'Orchard',
      mentor_accent_color: null,
      last_activity_at: null,
      conversations: [],
    },
    ...mentorSource.map((mentor) => ({
      mentor_id: mentor.id,
      mentor_name: mentor.name,
      mentor_accent_color: mentor.accent_color,
      last_activity_at: null,
      conversations: [],
    })),
  ];

  const groupByMentorId = new Map(
    groups.map((group) => [group.mentor_id ?? '__orchard__', group])
  );

  for (const conversation of conversationSource.filter((entry) => !entry.workspace_id)) {
    const key = conversation.mentor_id ?? '__orchard__';
    const group = groupByMentorId.get(key);
    if (!group) continue;

    group.conversations.push(conversation);
    if (
      !group.last_activity_at
      || new Date(conversation.updated_at).getTime()
        > new Date(group.last_activity_at).getTime()
    ) {
      group.last_activity_at = conversation.updated_at;
    }
  }

  for (const group of groups) {
    group.conversations.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  const activeGroups = groups
    .filter((group) => group.last_activity_at)
    .sort(
      (a, b) =>
        new Date(b.last_activity_at || 0).getTime()
        - new Date(a.last_activity_at || 0).getTime()
    );

  const inactiveGroups = groups
    .filter((group) => !group.last_activity_at)
    .sort((a, b) => a.mentor_name.localeCompare(b.mentor_name));

  return [...activeGroups, ...inactiveGroups];
}

export function buildWorkspaceGroups(
  workspaceSource: WorkspaceSummary[],
  conversationSource: ConversationListItem[]
): SidebarWorkspaceGroup[] {
  const groups = workspaceSource.map((workspace) => ({
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    workspace_icon: workspace.icon,
    workspace_accent_color: workspace.accent_color,
    workspace_description: workspace.description,
    last_activity_at: null as string | null,
    conversations: [] as ConversationListItem[],
  }));

  const groupByWorkspaceId = new Map(
    groups.map((group) => [group.workspace_id, group])
  );

  for (const conversation of conversationSource) {
    if (!conversation.workspace_id) continue;
    const group = groupByWorkspaceId.get(conversation.workspace_id);
    if (!group) continue;

    group.conversations.push(conversation);
    if (
      !group.last_activity_at
      || new Date(conversation.updated_at).getTime()
        > new Date(group.last_activity_at).getTime()
    ) {
      group.last_activity_at = conversation.updated_at;
    }
  }

  for (const group of groups) {
    group.conversations.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  return groups.sort((a, b) => {
    const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
    const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.workspace_name.localeCompare(b.workspace_name);
  });
}

export function mapConversationSummary(
  row: ConversationSummaryRow,
  mentorSource: MentorListItem[],
  workspaceSource: WorkspaceSummary[]
): ConversationListItem {
  const mentor = row.mentor_id
    ? mentorSource.find((entry) => entry.id === row.mentor_id) || null
    : null;
  const workspace = row.workspace_id
    ? workspaceSource.find((entry) => entry.id === row.workspace_id) || null
    : null;

  return {
    id: row.id,
    title: row.title?.trim() || 'New chat',
    mentor_id: row.mentor_id ?? null,
    workspace_id: row.workspace_id ?? null,
    updated_at: row.updated_at,
    created_at: row.created_at,
    mentor_name: mentor?.name || 'Orchard',
    mentor_accent_color: mentor?.accent_color || null,
    workspace_name: workspace?.name || null,
    workspace_icon: workspace?.icon || null,
    workspace_accent_color: workspace?.accent_color || null,
  };
}

export function sortConversationsByUpdatedAtDesc(
  conversations: ConversationListItem[]
): ConversationListItem[] {
  return [...conversations].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}
