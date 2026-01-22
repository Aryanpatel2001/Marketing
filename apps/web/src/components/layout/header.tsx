'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/hooks';
import { getInitials } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/store';
import {
  Bell,
  HelpCircle,
  LogOut,
  Mail,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

export function DashboardHeader() {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { setMobileMenuOpen, commandPaletteOpen, setCommandPaletteOpen } = useUIStore();

  const userFullName = user ? `${user.firstName} ${user.lastName}` : '';

  return (
    <>
      <header className="bg-background sticky top-0 z-40 flex h-16 items-center gap-4 border-b px-4 sm:px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="flex-1">
          <div className="relative max-w-md">
            <Button
              variant="outline"
              className="text-muted-foreground w-full justify-start text-sm sm:pr-12 md:w-64"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <Search className="mr-2 h-4 w-4" />
              <span className="hidden md:inline">Search...</span>
              <span className="md:hidden">Search</span>
              <kbd className="bg-muted pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border px-1.5 font-mono text-xs font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="bg-destructive absolute right-1 top-1 h-2 w-2 rounded-full" />
            <span className="sr-only">Notifications</span>
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.avatar} alt={userFullName} />
                  <AvatarFallback>{getInitials(userFullName)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userFullName}</p>
                  <p className="text-muted-foreground text-xs leading-none">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/help">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help & Support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => logout()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Command palette */}
      <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>
              <Search className="mr-2 h-4 w-4" />
              Search contacts
            </CommandItem>
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>
              <Mail className="mr-2 h-4 w-4" />
              Create campaign
            </CommandItem>
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>
              <User className="mr-2 h-4 w-4" />
              Add contact
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>Dashboard</CommandItem>
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>Contacts</CommandItem>
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>Campaigns</CommandItem>
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>Analytics</CommandItem>
            <CommandItem onSelect={() => setCommandPaletteOpen(false)}>Settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
