'use client';

import { useState, useEffect, useCallback } from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SmsEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// SMS character limits
const GSM_SINGLE_LIMIT = 160;
const GSM_MULTI_LIMIT = 153; // Each segment in multi-part SMS
const UNICODE_SINGLE_LIMIT = 70;
const UNICODE_MULTI_LIMIT = 67;

// GSM 7-bit character set (basic)
const GSM_CHARS =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€';

// Available variables
const variables = [
  { name: 'First Name', value: '{{first_name}}' },
  { name: 'Last Name', value: '{{last_name}}' },
  { name: 'Phone', value: '{{phone}}' },
  { name: 'Company', value: '{{company}}' },
];

function isGsmChar(char: string): boolean {
  return GSM_CHARS.includes(char) || GSM_EXTENDED.includes(char);
}

function isGsmMessage(text: string): boolean {
  return text.split('').every(isGsmChar);
}

function countGsmChars(text: string): number {
  let count = 0;
  for (const char of text) {
    if (GSM_EXTENDED.includes(char)) {
      count += 2; // Extended chars count as 2
    } else {
      count += 1;
    }
  }
  return count;
}

function calculateSegments(text: string): {
  segments: number;
  charsPerSegment: number;
  totalChars: number;
  isGsm: boolean;
} {
  if (!text) {
    return { segments: 0, charsPerSegment: GSM_SINGLE_LIMIT, totalChars: 0, isGsm: true };
  }

  const isGsm = isGsmMessage(text);
  const totalChars = isGsm ? countGsmChars(text) : text.length;

  const singleLimit = isGsm ? GSM_SINGLE_LIMIT : UNICODE_SINGLE_LIMIT;
  const multiLimit = isGsm ? GSM_MULTI_LIMIT : UNICODE_MULTI_LIMIT;

  if (totalChars <= singleLimit) {
    return { segments: 1, charsPerSegment: singleLimit, totalChars, isGsm };
  }

  const segments = Math.ceil(totalChars / multiLimit);
  return { segments, charsPerSegment: multiLimit, totalChars, isGsm };
}

export function SmsEditor({ value, onChange, placeholder, disabled }: SmsEditorProps) {
  const [stats, setStats] = useState(() => calculateSegments(value));

  useEffect(() => {
    setStats(calculateSegments(value));
  }, [value]);

  const insertVariable = useCallback(
    (variable: string) => {
      onChange(value + variable);
    },
    [value, onChange]
  );

  const remainingChars =
    stats.segments === 1
      ? stats.charsPerSegment - stats.totalChars
      : stats.segments * stats.charsPerSegment - stats.totalChars;

  return (
    <div className="space-y-3">
      {/* Variable buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-muted-foreground mr-2 text-sm">Insert variable:</span>
        {variables.map((v) => (
          <Button
            key={v.value}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => insertVariable(v.value)}
            disabled={disabled}
          >
            {v.name}
          </Button>
        ))}
      </div>

      {/* Textarea */}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Enter your SMS message...'}
        disabled={disabled}
        rows={6}
        className="font-mono text-sm"
      />

      {/* Stats bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Characters:</span>
            <Badge variant={remainingChars < 20 ? 'destructive' : 'secondary'}>
              {stats.totalChars}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Segments:</span>
            <Badge variant={stats.segments > 1 ? 'outline' : 'secondary'}>
              {stats.segments || 1}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Encoding:</span>
            <Badge variant="outline">{stats.isGsm ? 'GSM-7' : 'Unicode'}</Badge>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Info className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2 text-sm">
              <p className="font-medium">SMS Character Limits</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-1">
                <li>GSM-7: 160 chars (single), 153/segment (multi)</li>
                <li>Unicode: 70 chars (single), 67/segment (multi)</li>
                <li>Special chars like emojis use Unicode</li>
                <li>Each segment is billed separately</li>
              </ul>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Warnings */}
      {!stats.isGsm && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Unicode detected</p>
            <p className="text-amber-700">
              Your message contains special characters. This reduces the character limit per
              segment.
            </p>
          </div>
        </div>
      )}

      {stats.segments > 3 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Long message</p>
            <p className="text-amber-700">
              This message will be sent as {stats.segments} segments. Consider shortening it to
              reduce costs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmsEditor;
