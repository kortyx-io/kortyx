"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import type { ChatSession } from "@/providers/chat-sessions";

/**
 * Collapsible left rail for the canvas agent. Uses the platform's
 * `icon` collapse mode — when collapsed it stays on screen as a thin
 * icon-only column rather than disappearing. Hosts the agent logo, the
 * "New chat" action, and the recent-chats list (rename / delete via a
 * three-dot menu per item).
 */
export function ChatSidebar() {
  const { toggleSidebar, state } = useSidebar();
  const { sessions, currentChatId, startNewChat, switchToChat, removeChat } =
    useChatSessions();
  const isCollapsed = state === "collapsed";

  // Show every session sorted by recency; the active one is highlighted via
  // `isActive` on its menu button.
  const recentChats = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);

  return (
    <>
      <Sidebar collapsible="icon" className="relative">
        <SidebarHeader className="items-left relative flex h-16 px-2">
          <Link
            href="/"
            className="my-auto flex items-center"
            aria-label="Home"
          >
            <div className="flex shrink-0 items-center gap-2">
              <Avatar className="size-8 rounded-md">
                <AvatarImage src="/logo.png" alt="" className="rounded-md" />
                <AvatarFallback className="rounded-md bg-primary font-semibold text-primary-foreground text-sm">
                  K
                </AvatarFallback>
              </Avatar>
              <span className="font-semibold text-sm group-data-[collapsible=icon]:hidden">
                Kortyx Canvas
              </span>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">
          <SidebarGroup className="shrink-0 pt-2">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={startNewChat} tooltip="New chat">
                    <SquarePen />
                    <span>New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="group-data-[collapsible=icon]:hidden flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarGroupLabel className="shrink-0">
              Recent chats
            </SidebarGroupLabel>
            <SidebarGroupContent className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto">
              {recentChats.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No recent chats yet
                </p>
              ) : (
                <SidebarMenu className="gap-0.5">
                  {recentChats.map((chat) => (
                    <RecentChatItem
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === currentChatId}
                      onSelect={() => switchToChat(chat.id)}
                      onRename={() => setRenameTarget(chat)}
                      onDelete={() => removeChat(chat.id)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-0 pb-2">
          <SidebarSeparator className="!mx-0" />
          <SidebarMenu className="px-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? <ChevronsRight /> : <ChevronsLeft />}
                <span>{isCollapsed ? "Expand" : "Collapse"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <RenameChatDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
      />
    </>
  );
}

/**
 * A single recent-chat row. Compact (no left icon, reduced vertical
 * padding) with a hover-revealed three-dot menu for rename / delete.
 */
function RecentChatItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  chat: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onSelect}
        isActive={isActive}
        tooltip={chat.title}
        // Override cxp-ui's default `px-4 py-6` so the rows stack tightly
        // and the chat list reads as a list, not a series of cards.
        // `pr-8` reserves space for the absolutely-positioned three-dot
        // SidebarMenuAction so the title truncates before reaching it.
        // When active, cxp-ui adds `border-l-4 pl-3`; shave the left
        // padding to `pl-2` (with `!`) so the title doesn't shift right
        // by the width of the accent border.
        className={`!h-8 !pr-6 !py-1 text-sm ${isActive ? "!pl-3" : "!pl-4"}`}
      >
        <span className="truncate">{chat.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            aria-label={`Open menu for chat: ${chat.title}`}
            showOnHover
            className="cursor-pointer"
          >
            <MoreHorizontal />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="mr-2 size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/**
 * Modal for renaming a chat. Pre-fills the current title and commits the
 * new one via the sessions store. Cancelling or clearing the input is a
 * no-op (we don't accept empty titles).
 */
function RenameChatDialog({
  target,
  onClose,
}: {
  target: ChatSession | null;
  onClose: () => void;
}) {
  const { updateChatTitle } = useChatSessions();
  const [value, setValue] = useState("");

  // Re-seed the input each time the dialog opens (or switches to a
  // different chat). `target` reference changes only on open / close /
  // switch — typing doesn't change it — so we won't clobber the user's
  // in-progress edits on every keystroke.
  useEffect(() => {
    setValue(target?.title ?? "");
  }, [target]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) {
      onClose();
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    updateChatTitle(target.id, trimmed);
    onClose();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Chat name"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
