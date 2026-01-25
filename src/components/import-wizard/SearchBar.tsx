import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  matchCount?: number;
  className?: string;
}

export function SearchBar({ value, onChange, matchCount, className }: SearchBarProps) {
  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search in data..."
          className="pl-9 pr-8 h-9"
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => onChange('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {value && matchCount !== undefined && (
        <Badge variant="secondary" className="shrink-0">
          {matchCount} {matchCount === 1 ? 'match' : 'matches'}
        </Badge>
      )}
    </div>
  );
}
