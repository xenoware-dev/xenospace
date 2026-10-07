import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChannelSchema, type Channel, type ChatMessage, type CursorPage,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { useChannelRoom, useSocket } from '@/lib/socket.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { shortDate, timeOfDay } from '@/lib/format.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Counter } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState, Skeleton } from '@/components/ui/Spinner.jsx';
import { Modal } from '@/components/ui/Modal.jsx';
import { Select, TextInput } from '@/components/ui/Field.jsx';
import { SearchField } from '@/components/ui/Toolbar.jsx';
import { MemberPicker } from '@/components/MemberPicker.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { Chat as ChatIcon, Plus, Send, Team } from '@/components/icons.jsx';

/**
 * Team chat.
 *
 * Channel list beside a message pane. Sends are optimistic with a client-side
 * id, which the server treats as an idempotency key — a retry after a dropped
 * response reconciles with the stored row instead of posting twice.
 */
export function ChatPage() {
  const { channelId: routeChannelId } = useParams();
  const navigate = useNavigate();
  const { allows } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: channels, isLoading, error, refetch } = useQuery({
    queryKey: keys.channels,
    queryFn: () => api.get<Channel[]>('/chat/channels'),
    refetchInterval: 60_000,
  });

  const channelId = routeChannelId ?? channels?.[0]?.id;
  const channel = channels?.find((c) => c.id === channelId);

  const filtered = useMemo(() => {
    if (!channels) return [];
    if (!search) return channels;
    const term = search.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(term) || c.topic?.toLowerCase().includes(term));
  }, [channels, search]);

  return (
    <Page
      fullBleed
      title="Team Chat"
      description={channel ? channel.topic ?? `#${channel.name}` : 'Conversations with your team.'}
      actions={
        allows('chat:channel_create') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            New channel
          </Button>
        )
      }
    >
      {isLoading ? (
        <div className="p-6"><LoadingState label="Loading channels" /></div>
      ) : error ? (
        <div className="p-6"><ErrorState message="Chat could not be loaded." onRetry={() => void refetch()} /></div>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden px-4 pb-4 sm:px-6 lg:grid-cols-[16rem_1fr]">
          {/* ------------------------------------------------ channel list */}
          <Card padded={false} className="hidden min-h-0 flex-col overflow-hidden lg:flex">
            <div className="shrink-0 border-b border-[var(--line-subtle)] p-2">
              <SearchField value={search} onChange={setSearch} placeholder="Find a channel…" />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <li className="px-2 py-6 text-center text-2xs text-[var(--ink-muted)]">No channels match.</li>
              ) : (
                filtered.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${candidate.id}`)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors',
                        candidate.id === channelId
                          ? 'bg-[var(--wash-selected)] text-[var(--ink-primary)]'
                          : 'text-[var(--ink-secondary)] hover:bg-[var(--wash-hover)]',
                      )}
                    >
                      <span aria-hidden="true" className="shrink-0 text-[var(--ink-faint)]">
                        {candidate.kind === 'DIRECT' ? <Team size={13} /> : <span className="text-xs">#</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate-line text-xs', candidate.unreadCount > 0 && 'font-semibold')}>
                          {candidate.name}
                        </span>
                        {candidate.lastMessage && (
                          <span className="block truncate-line text-[10px] text-[var(--ink-faint)]">
                            {candidate.lastMessage.author.name.split(' ')[0]}: {candidate.lastMessage.body || 'attachment'}
                          </span>
                        )}
                      </span>
                      {candidate.unreadCount > 0 && <Counter value={candidate.unreadCount} tone="accent" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Card>

          {/* ------------------------------------------------- message pane */}
          {channelId && channel ? (
            <ChannelPane channel={channel} />
          ) : (
            <Card>
              <EmptyState
                icon={<ChatIcon size={20} />}
                title="No channel selected"
                message={channels?.length === 0 ? 'Create a channel to start talking.' : 'Pick a channel from the list.'}
                action={
                  channels?.length === 0 && allows('chat:channel_create') ? (
                    <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                      New channel
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}
        </div>
      )}

      <CreateChannelModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

function ChannelPane({ channel }: { channel: Channel }) {
  const { user } = useAuth();
  const { typing, setTyping } = useSocket();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);

  useChannelRoom(channel.id);

  const { data, isLoading } = useQuery({
    queryKey: keys.messages(channel.id),
    queryFn: () => api.get<CursorPage<ChatMessage>>(`/chat/channels/${channel.id}/messages`, { limit: 50 }),
  });

  // Mark read on open and whenever new messages land while it is open.
  useEffect(() => {
    void api.post(`/chat/channels/${channel.id}/read`).then(() => {
      void queryClient.invalidateQueries({ queryKey: keys.channels });
    });
  }, [channel.id, data?.items.length, queryClient]);

  // Stick to the bottom as messages arrive, which is what a chat log should do.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [data?.items.length, channel.id]);

  const send = useMutate(
    (body: string) =>
      api.post<ChatMessage>(`/chat/channels/${channel.id}/messages`, {
        body,
        // A per-send random id makes the write idempotent server-side.
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        mentions: [],
        attachmentIds: [],
      }),
    { invalidates: [keys.messages(channel.id), keys.channels] },
  );

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setDraft('');
    setTyping(channel.id, false);
    send.mutate(body);
  };

  /** Broadcasts a typing signal, throttled and self-cancelling. */
  const onDraftChange = (value: string) => {
    setDraft(value);
    if (typingTimer.current === null) {
      setTyping(channel.id, true);
    } else {
      window.clearTimeout(typingTimer.current);
    }
    typingTimer.current = window.setTimeout(() => {
      setTyping(channel.id, false);
      typingTimer.current = null;
    }, 2500);
  };

  const whoIsTyping = (typing.get(channel.id) ?? []).filter((name) => name !== user?.name);

  const toggleReaction = useMutate(
    ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.post(`/chat/channels/${channel.id}/messages/${messageId}/reactions`, { emoji }),
    { invalidates: [keys.messages(channel.id)] },
  );

  // Grouped by day, and consecutive messages from one person are merged so the
  // log reads as conversation rather than a list of stamped rows.
  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const out: Array<{ day: string; messages: Array<{ message: ChatMessage; merged: boolean }> }> = [];
    let previous: ChatMessage | null = null;
    for (const message of items) {
      const day = message.createdAt.slice(0, 10);
      let group = out.find((entry) => entry.day === day);
      if (!group) {
        group = { day, messages: [] };
        out.push(group);
        previous = null;
      }
      const merged =
        previous !== null &&
        previous.author.id === message.author.id &&
        new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
      group.messages.push({ message, merged });
      previous = message;
    }
    return out;
  }, [data]);

  return (
    <Card padded={false} className="flex min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--line-subtle)] px-4 py-2.5">
        <span aria-hidden="true" className="text-[var(--ink-faint)]">
          {channel.kind === 'DIRECT' ? <Team size={14} /> : <span className="text-sm">#</span>}
        </span>
        <div className="min-w-0">
          <h2 className="truncate-line text-xs font-semibold">{channel.name}</h2>
          {channel.topic && <p className="truncate-line text-[10px] text-[var(--ink-faint)]">{channel.topic}</p>}
        </div>
        <span className="ml-auto text-2xs text-[var(--ink-faint)]">
          {channel.memberCount} {channel.memberCount === 1 ? 'member' : 'members'}
        </span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={<ChatIcon size={18} />}
            title="No messages yet"
            message={`Say hello in ${channel.kind === 'DIRECT' ? 'this conversation' : `#${channel.name}`}.`}
          />
        ) : (
          grouped.map((group) => (
            <div key={group.day}>
              {/* Day separator, so a long log stays navigable. */}
              <div className="my-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--line-subtle)]" />
                <span className="text-[10px] font-medium text-[var(--ink-faint)]">
                  {group.day === new Date().toISOString().slice(0, 10) ? 'Today' : shortDate(group.day)}
                </span>
                <span className="h-px flex-1 bg-[var(--line-subtle)]" />
              </div>

              <ul className="flex flex-col">
                {group.messages.map(({ message, merged }) => {
                  const isMine = message.author.id === user?.id;
                  return (
                    <li
                      key={message.id}
                      className={cn('group flex gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--wash-hover)]', merged ? 'mt-0' : 'mt-2')}
                    >
                      <span className="w-7 shrink-0">
                        {!merged && <Avatar user={message.author} size="md" showPresence />}
                      </span>
                      <div className="min-w-0 flex-1">
                        {!merged && (
                          <div className="flex items-baseline gap-2">
                            <span className={cn('text-xs font-semibold', isMine && 'text-[var(--accent)]')}>
                              {message.author.name}
                            </span>
                            <span className="text-[10px] text-[var(--ink-faint)]">
                              {timeOfDay(message.createdAt)}
                            </span>
                          </div>
                        )}
                        {message.deletedAt ? (
                          <p className="text-xs text-[var(--ink-faint)] italic">This message was deleted.</p>
                        ) : (
                          <div className="text-sm">
                            <Markdown content={message.body} />
                          </div>
                        )}
                        {message.editedAt && !message.deletedAt && (
                          <span className="text-[10px] text-[var(--ink-faint)]">edited</span>
                        )}

                        {message.reactions.length > 0 && (
                          <ul className="mt-1 flex flex-wrap gap-1">
                            {message.reactions.map((reaction) => (
                              <li key={reaction.emoji}>
                                <button
                                  type="button"
                                  onClick={() => toggleReaction.mutate({ messageId: message.id, emoji: reaction.emoji })}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-[var(--radius-full)] px-1.5 py-0.5 text-[10px] transition-colors',
                                    reaction.userIds.includes(user?.id ?? '')
                                      ? 'bg-[var(--accent-wash)] text-[var(--accent)]'
                                      : 'bg-[var(--surface-3)] text-[var(--ink-secondary)] hover:bg-[var(--wash-active)]',
                                  )}
                                >
                                  <span aria-hidden="true">{reaction.emoji}</span>
                                  <span className="tabular-nums">{reaction.count}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Quick reactions, revealed on hover. */}
                      <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {['👍', '🎉', '👀'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            aria-label={`React with ${emoji}`}
                            onClick={() => toggleReaction.mutate({ messageId: message.id, emoji })}
                            className="rounded-[var(--radius-xs)] px-1 text-xs transition-transform hover:scale-125"
                          >
                            {emoji}
                          </button>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* --------------------------------------------------------- composer */}
      <div className="shrink-0 border-t border-[var(--line-subtle)] p-3">
        {whoIsTyping.length > 0 && (
          <p aria-live="polite" className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[var(--ink-muted)]">
            <span aria-hidden="true" className="flex gap-0.5">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1 animate-pulse rounded-full bg-[var(--ink-faint)]"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </span>
            {whoIsTyping.join(', ')} {whoIsTyping.length === 1 ? 'is' : 'are'} typing…
          </p>
        )}

        <div className="flex items-end gap-2 rounded-[var(--radius-md)] bg-[var(--surface-inset)] p-1.5 ring-1 ring-inset ring-[var(--line)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter adds a line, as in every chat client.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={10_000}
            placeholder={`Message ${channel.kind === 'DIRECT' ? channel.name : `#${channel.name}`}`}
            aria-label="Message"
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-[var(--ink-faint)]"
          />
          <IconButton
            label="Send message"
            size="sm"
            variant="primary"
            loading={send.isPending}
            disabled={!draft.trim()}
            onClick={submit}
          >
            <Send size={14} />
          </IconButton>
        </div>
        <p className="mt-1 text-[10px] text-[var(--ink-faint)]">
          Markdown supported · Enter to send, Shift+Enter for a new line
        </p>
      </div>
    </Card>
  );
}

function CreateChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<Channel['kind']>('PUBLIC');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutate((input: unknown) => api.post<Channel>('/chat/channels', input), {
    invalidates: [keys.channels],
    successMessage: 'Channel created',
    errorMessage: 'Could not create the channel',
    onSuccess: (channel) => {
      setName(''); setTopic(''); setMemberIds([]); setErrors({});
      onClose();
      navigate(`/chat/${channel.id}`);
    },
  });

  const submit = () => {
    const parsed = createChannelSchema.safeParse({
      name, topic: topic || undefined, kind, memberIds,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New channel"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>Create channel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput
          label="Name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          error={errors.name}
          placeholder="platform-team"
          icon={<span className="text-xs">#</span>}
        />
        <TextInput
          label="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What is this channel for?"
        />
        <Select
          label="Visibility"
          value={kind}
          onChange={(e) => setKind(e.target.value as Channel['kind'])}
          hint={kind === 'PUBLIC' ? 'Anyone in the workspace can join.' : 'Only invited people can see it.'}
        >
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Private</option>
        </Select>
        <MemberPicker label="Members" selected={memberIds} onChange={setMemberIds} max={500} />
      </div>
    </Modal>
  );
}
