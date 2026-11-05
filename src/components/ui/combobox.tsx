"use client";

import { useState } from "react";
import { Command } from "cmdk";
import { SearchIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";

export type ComboOption = { value: string; label: string };

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Choose…",
  disabled,
}: {
  options: ComboOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="w-full justify-between text-left font-normal"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "text-muted-foreground"}>{selected?.label ?? placeholder}</span>
        <SearchIcon size={14} />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-[6px] border border-border bg-popover shadow-lg">
          <Command>
            <Command.Input
              autoFocus
              className="h-9 w-full border-b border-border bg-transparent px-3 outline-none"
              placeholder="Search options…"
            />
            <Command.List className="max-h-56 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-2 text-sm text-muted-foreground">No results.</Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary"
                >
                  {option.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
