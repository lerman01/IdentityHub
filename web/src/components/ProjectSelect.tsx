import type { ProjectDto } from '@identityhub/shared';
import { CheckIcon, ChevronsUpDownIcon, FolderKanbanIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_]*$/;

interface Props {
  projects: ProjectDto[];
  isLoading: boolean;
  value: string | null;
  onChange: (projectKey: string) => void;
}

/**
 * "Select or write a Jira project": a combobox over the user's visible
 * projects, plus a free-text escape hatch — typing an exact key (e.g. from a
 * workspace with >50 projects) offers "Use project key …" directly.
 */
export function ProjectSelect({ projects, isLoading, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = projects.find((p) => p.key === value);
  const typedKey = search.trim().toUpperCase();
  const typedKeyIsNovel = useMemo(
    () =>
      KEY_SHAPE.test(typedKey) &&
      !projects.some((p) => p.key.toUpperCase() === typedKey),
    [typedKey, projects],
  );

  function pick(key: string) {
    onChange(key.toUpperCase());
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between sm:w-80"
          disabled={isLoading}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FolderKanbanIcon className="size-4 shrink-0 text-muted-foreground" />
            {isLoading ? (
              'Loading projects…'
            ) : selected ? (
              <span className="truncate">
                {selected.name} <span className="text-muted-foreground">({selected.key})</span>
              </span>
            ) : value ? (
              <span className="truncate">{value}</span>
            ) : (
              <span className="text-muted-foreground">Select a Jira project…</span>
            )}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type a project key…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matching project.</CommandEmpty>
            <CommandGroup>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.key} ${project.name}`}
                  onSelect={() => pick(project.key)}
                >
                  <CheckIcon
                    className={cn('size-4', project.key === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{project.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{project.key}</span>
                </CommandItem>
              ))}
              {typedKeyIsNovel && (
                <CommandItem value={`use-key-${typedKey}`} onSelect={() => pick(typedKey)}>
                  <span>
                    Use project key <span className="font-mono font-medium">{typedKey}</span>
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
