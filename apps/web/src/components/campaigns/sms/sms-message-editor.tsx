'use client';

import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Smile, Variable } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useSmsSegments } from '@/lib/hooks/use-sms-segments';
import { cn } from '@/lib/utils';

interface SmsMessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const VARIABLES = [
  { label: 'First Name', value: '{{firstName}}' },
  { label: 'Last Name', value: '{{lastName}}' },
  { label: 'Email', value: '{{email}}' },
  { label: 'Phone', value: '{{phone}}' },
  { label: 'Company', value: '{{company}}' },
];

export function SmsMessageEditor({ value, onChange, className }: SmsMessageEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { segments, characters, encoding, remainingCharacters } = useSmsSegments({
    message: value,
  });

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onChange(value + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleVariableInsert = (variable: string) => {
    onChange(value + variable);
  };

  const isUnicode = encoding === 'UCS-2';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Message Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="sms-message">Message *</Label>
          <div className="flex gap-2">
            {/* Variable Inserter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" type="button">
                  <Variable className="mr-2 h-4 w-4" />
                  Insert Variable
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {VARIABLES.map((variable) => (
                  <DropdownMenuItem
                    key={variable.value}
                    onClick={() => handleVariableInsert(variable.value)}
                  >
                    {variable.label}
                    <span className="text-muted-foreground ml-2 text-xs">{variable.value}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Emoji Picker */}
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" type="button">
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="end">
                <EmojiPicker onEmojiClick={handleEmojiClick} width="100%" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Textarea
          id="sms-message"
          placeholder="Enter your SMS message..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="resize-none font-mono text-sm"
        />

        {/* Character Counter & Segment Info */}
        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            Use variables like <code className="bg-muted rounded px-1">{'{{firstName}}'}</code> for
            personalization
          </div>
          <div className="flex items-center gap-3">
            {isUnicode && (
              <span className="text-amber-600 dark:text-amber-500">⚠️ Unicode detected</span>
            )}
            <span className="text-muted-foreground">
              {characters} character{characters !== 1 ? 's' : ''}
            </span>
            <span className="font-medium">
              {segments} segment{segments !== 1 ? 's' : ''}
            </span>
            {segments > 0 && (
              <span className="text-muted-foreground">({remainingCharacters} remaining)</span>
            )}
          </div>
        </div>
      </div>

      {/* Message Preview */}
      <div className="space-y-2">
        <Label>Preview</Label>
        <div className="bg-muted/50 flex justify-center rounded-lg p-6">
          <div className="relative w-full max-w-sm">
            {/* Phone Frame */}
            <div className="bg-background overflow-hidden rounded-[2.5rem] border-8 border-gray-800 shadow-2xl dark:border-gray-700">
              {/* Phone Notch */}
              <div className="bg-background relative h-6">
                <div className="absolute left-1/2 top-0 h-5 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-800 dark:bg-gray-700" />
              </div>

              {/* Phone Screen */}
              <div className="h-[500px] bg-gradient-to-b from-blue-50 to-blue-100 p-4 dark:from-gray-900 dark:to-gray-800">
                {/* Status Bar */}
                <div className="mb-4 flex items-center justify-between text-xs">
                  <span className="font-medium">9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <div className="h-3 w-8 rounded bg-gray-400" />
                  </div>
                </div>

                {/* Message Header */}
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
                    S
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Your Company</div>
                    <div className="text-muted-foreground text-xs">SMS</div>
                  </div>
                </div>

                {/* Message Bubble */}
                {value ? (
                  <div className="inline-block max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2 shadow-sm dark:bg-gray-700">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900 dark:text-gray-100">
                      {value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                        // Replace variables with example values for preview
                        const examples: Record<string, string> = {
                          firstName: 'John',
                          lastName: 'Doe',
                          email: 'john@example.com',
                          phone: '+1234567890',
                          company: 'Acme Inc',
                        };
                        return examples[key] || `{{${key}}}`;
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center text-sm">
                    Your message preview will appear here
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
