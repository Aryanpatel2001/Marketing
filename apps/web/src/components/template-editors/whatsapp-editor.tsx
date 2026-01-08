'use client';

import { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Smile,
  Image,
  Video,
  FileText,
  Check,
  CheckCheck,
  ChevronsUpDown,
  Languages,
} from 'lucide-react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { DeviceFrameset } from 'react-device-frameset';
import 'react-device-frameset/styles/marvel-devices.min.css';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export type WhatsAppTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface WhatsAppButton {
  type: 'url' | 'phone' | 'quick_reply';
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface WhatsAppTemplate {
  category?: WhatsAppTemplateCategory;
  language?: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    content: string;
  };
  body: string;
  footer?: string;
  buttons?: WhatsAppButton[];
}

interface WhatsAppEditorProps {
  value: WhatsAppTemplate;
  onChange: (value: WhatsAppTemplate) => void;
  disabled?: boolean;
}

// Template categories per WhatsApp Business API
const templateCategories: {
  value: WhatsAppTemplateCategory;
  label: string;
  description: string;
}[] = [
  { value: 'MARKETING', label: 'Marketing', description: 'Promotions, offers, and updates' },
  { value: 'UTILITY', label: 'Utility', description: 'Order updates, confirmations, alerts' },
  { value: 'AUTHENTICATION', label: 'Authentication', description: 'OTP and verification codes' },
];

// Languages supported by WhatsApp Business API (comprehensive list)
const supportedLanguages = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh_CN', name: 'Chinese (Simplified)' },
  { code: 'zh_HK', name: 'Chinese (Hong Kong)' },
  { code: 'zh_TW', name: 'Chinese (Traditional)' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'en_GB', name: 'English (UK)' },
  { code: 'en_US', name: 'English (US)' },
  { code: 'et', name: 'Estonian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'ka', name: 'Georgian' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ha', name: 'Hausa' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'rw_RW', name: 'Kinyarwanda' },
  { code: 'ko', name: 'Korean' },
  { code: 'ky_KG', name: 'Kyrgyz' },
  { code: 'lo', name: 'Lao' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'es_AR', name: 'Spanish (Argentina)' },
  { code: 'es_ES', name: 'Spanish (Spain)' },
  { code: 'es_MX', name: 'Spanish (Mexico)' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zu', name: 'Zulu' },
];

// Available variables
const variables = [
  { name: 'First Name', value: '{{1}}', description: 'first_name' },
  { name: 'Last Name', value: '{{2}}', description: 'last_name' },
  { name: 'Company', value: '{{3}}', description: 'company' },
];

const MAX_BUTTONS = 3;
const MAX_BODY_LENGTH = 1024;
const MAX_FOOTER_LENGTH = 60;
const MAX_BUTTON_TEXT_LENGTH = 20;

export function WhatsAppEditor({ value, onChange, disabled }: WhatsAppEditorProps) {
  const [showHeader, setShowHeader] = useState(!!value.header);
  const [showFooter, setShowFooter] = useState(!!value.footer);
  const [showButtons, setShowButtons] = useState(!!value.buttons?.length);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const updateCategory = (category: WhatsAppTemplateCategory) => {
    onChange({ ...value, category });
  };

  const updateLanguage = (language: string) => {
    onChange({ ...value, language });
    setLanguageOpen(false);
  };

  const updateBody = (body: string) => {
    onChange({ ...value, body });
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const textarea = bodyTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = value.body.substring(0, start) + emoji + value.body.substring(end);
      updateBody(newBody);
      // Reset cursor position after emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      updateBody(value.body + emoji);
    }
    setEmojiOpen(false);
  };

  const updateHeader = (header: WhatsAppTemplate['header']) => {
    onChange({ ...value, header });
  };

  const updateFooter = (footer: string) => {
    onChange({ ...value, footer: footer || undefined });
  };

  const addButton = () => {
    const buttons = value.buttons || [];
    if (buttons.length >= MAX_BUTTONS) return;
    onChange({
      ...value,
      buttons: [...buttons, { type: 'quick_reply', text: '' }],
    });
  };

  const updateButton = (index: number, button: WhatsAppButton) => {
    const buttons = [...(value.buttons || [])];
    buttons[index] = button;
    onChange({ ...value, buttons });
  };

  const removeButton = (index: number) => {
    const buttons = [...(value.buttons || [])];
    buttons.splice(index, 1);
    onChange({ ...value, buttons: buttons.length ? buttons : undefined });
  };

  const insertVariable = (variable: string) => {
    updateBody(value.body + variable);
  };

  return (
    <div className="space-y-6">
      {/* Template Settings */}
      <div className="bg-muted/30 grid grid-cols-2 gap-4 rounded-lg border p-4">
        {/* Category Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Template Category *</Label>
          <Select
            value={value.category || ''}
            onValueChange={(val) => updateCategory(val as WhatsAppTemplateCategory)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {templateCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <div className="flex flex-col">
                    <span>{cat.label}</span>
                    <span className="text-muted-foreground text-xs">{cat.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Required by WhatsApp for template approval
          </p>
        </div>

        {/* Language Selection - Searchable Combobox */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Language *</Label>
          <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={languageOpen}
                className="w-full justify-between"
                disabled={disabled}
              >
                <span className="flex items-center gap-2">
                  <Languages className="text-muted-foreground h-4 w-4" />
                  {value.language
                    ? supportedLanguages.find((lang) => lang.code === value.language)?.name
                    : 'Select language...'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Search language..." />
                <CommandList>
                  <CommandEmpty>No language found.</CommandEmpty>
                  <CommandGroup>
                    {supportedLanguages.map((lang) => (
                      <CommandItem
                        key={lang.code}
                        value={lang.name}
                        onSelect={() => updateLanguage(lang.code)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value.language === lang.code ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {lang.name}
                        <span className="text-muted-foreground ml-auto text-xs">{lang.code}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-muted-foreground text-xs">Primary language for your template</p>
        </div>
      </div>

      {/* Variable buttons */}
      <div className="flex flex-wrap items-center gap-2">
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
            <Badge variant="secondary" className="ml-2 text-xs">
              {v.value}
            </Badge>
          </Button>
        ))}

        {/* Emoji Picker - using emoji-picker-react */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="ml-auto"
            >
              <Smile className="mr-2 h-4 w-4" />
              Emoji
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto border-0 p-0" align="end">
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              theme={Theme.LIGHT}
              searchPlaceHolder="Search emoji..."
              width={350}
              height={400}
              previewConfig={{ showPreview: false }}
              skinTonesDisabled
              lazyLoadEmojis
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Preview */}
      <div className="flex gap-6">
        {/* Editor */}
        <div className="flex-1 space-y-4">
          {/* Header toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Header (optional)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowHeader(!showHeader);
                if (showHeader) updateHeader(undefined);
              }}
              disabled={disabled}
            >
              {showHeader ? 'Remove' : 'Add Header'}
            </Button>
          </div>

          {showHeader && (
            <div className="space-y-3 border-l-2 pl-4">
              <div className="flex items-center gap-2">
                <Select
                  value={value.header?.type || 'text'}
                  onValueChange={(type) =>
                    updateHeader({ type: type as any, content: value.header?.content || '' })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">
                      <span className="flex items-center gap-2">
                        <span className="text-lg">Aa</span> Text
                      </span>
                    </SelectItem>
                    <SelectItem value="image">
                      <span className="flex items-center gap-2">
                        <Image className="h-4 w-4" /> Image
                      </span>
                    </SelectItem>
                    <SelectItem value="video">
                      <span className="flex items-center gap-2">
                        <Video className="h-4 w-4" /> Video
                      </span>
                    </SelectItem>
                    <SelectItem value="document">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Document
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {value.header?.type && value.header.type !== 'text' && (
                  <Badge variant="outline" className="text-xs">
                    {value.header.type === 'image' && 'JPG, PNG (max 5MB)'}
                    {value.header.type === 'video' && 'MP4 (max 16MB)'}
                    {value.header.type === 'document' && 'PDF (max 100MB)'}
                  </Badge>
                )}
              </div>
              <Input
                value={value.header?.content || ''}
                onChange={(e) =>
                  updateHeader({ type: value.header?.type || 'text', content: e.target.value })
                }
                placeholder={
                  value.header?.type === 'text'
                    ? 'Header text (max 60 chars)...'
                    : 'Enter media URL...'
                }
                disabled={disabled}
              />
              {/* Media preview */}
              {value.header?.type === 'image' && value.header.content && (
                <div className="bg-muted relative h-32 w-48 overflow-hidden rounded-lg border">
                  <img
                    src={value.header.content}
                    alt="Header preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="bg-muted/50 absolute inset-0 flex items-center justify-center">
                    <Image className="text-muted-foreground h-8 w-8" />
                  </div>
                </div>
              )}
              {value.header?.type === 'video' && value.header.content && (
                <div className="bg-muted relative flex h-32 w-48 items-center justify-center overflow-hidden rounded-lg border">
                  <Video className="text-muted-foreground h-8 w-8" />
                  <span className="text-muted-foreground absolute bottom-2 left-2 max-w-[160px] truncate text-xs">
                    {value.header.content.split('/').pop()}
                  </span>
                </div>
              )}
              {value.header?.type === 'document' && value.header.content && (
                <div className="bg-muted flex w-48 items-center gap-2 rounded-lg border p-2">
                  <FileText className="h-6 w-6 text-red-500" />
                  <span className="text-muted-foreground truncate text-xs">
                    {value.header.content.split('/').pop() || 'Document'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Body *</Label>
              <span
                className={cn(
                  'text-xs',
                  value.body.length > MAX_BODY_LENGTH ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {value.body.length}/{MAX_BODY_LENGTH}
              </span>
            </div>
            <Textarea
              ref={bodyTextareaRef}
              value={value.body}
              onChange={(e) => updateBody(e.target.value)}
              placeholder="Enter your message body..."
              rows={6}
              disabled={disabled}
              className="font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Use *bold*, _italic_, ~strikethrough~, and ```code``` for formatting
            </p>
          </div>

          {/* Footer toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Footer (optional)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowFooter(!showFooter);
                if (showFooter) updateFooter('');
              }}
              disabled={disabled}
            >
              {showFooter ? 'Remove' : 'Add Footer'}
            </Button>
          </div>

          {showFooter && (
            <div className="space-y-2 border-l-2 pl-4">
              <Input
                value={value.footer || ''}
                onChange={(e) => updateFooter(e.target.value)}
                placeholder="Footer text (e.g., Reply STOP to unsubscribe)"
                maxLength={MAX_FOOTER_LENGTH}
                disabled={disabled}
              />
              <span className="text-muted-foreground text-xs">
                {(value.footer || '').length}/{MAX_FOOTER_LENGTH}
              </span>
            </div>
          )}

          {/* Buttons toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Buttons (optional)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowButtons(!showButtons);
                if (showButtons) onChange({ ...value, buttons: undefined });
              }}
              disabled={disabled}
            >
              {showButtons ? 'Remove' : 'Add Buttons'}
            </Button>
          </div>

          {showButtons && (
            <div className="space-y-3 border-l-2 pl-4">
              {(value.buttons || []).map((button, index) => (
                <div
                  key={index}
                  className="bg-muted/20 flex items-start gap-2 rounded-lg border p-3"
                >
                  <GripVertical className="text-muted-foreground mt-2 h-4 w-4" />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Select
                        value={button.type}
                        onValueChange={(type) =>
                          updateButton(index, { ...button, type: type as any })
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quick_reply">Quick Reply</SelectItem>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={button.text}
                        onChange={(e) => updateButton(index, { ...button, text: e.target.value })}
                        placeholder="Button text"
                        maxLength={MAX_BUTTON_TEXT_LENGTH}
                        disabled={disabled}
                        className="flex-1"
                      />
                    </div>
                    {button.type === 'url' && (
                      <Input
                        value={button.url || ''}
                        onChange={(e) => updateButton(index, { ...button, url: e.target.value })}
                        placeholder="https://example.com"
                        disabled={disabled}
                      />
                    )}
                    {button.type === 'phone' && (
                      <Input
                        value={button.phoneNumber || ''}
                        onChange={(e) =>
                          updateButton(index, { ...button, phoneNumber: e.target.value })
                        }
                        placeholder="+1234567890"
                        disabled={disabled}
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeButton(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="text-destructive h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(value.buttons || []).length < MAX_BUTTONS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addButton}
                  disabled={disabled}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Button
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Preview - Phone Mockup using react-device-frameset */}
        <div className="w-96 flex-shrink-0">
          <div className="sticky top-4">
            <Label className="mb-3 block text-base font-medium">Preview</Label>

            {/* Device Frame - iPhone X */}
            <div className="-mr-32 origin-top-left scale-[0.65]">
              <DeviceFrameset device="iPhone X" color="black">
                <div className="flex h-full flex-col bg-white">
                  {/* WhatsApp Header */}
                  <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 pt-12">
                    <svg
                      className="h-5 w-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300">
                      <span className="text-sm font-medium text-gray-600">B</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Business Name</p>
                      <p className="text-xs text-green-200">online</p>
                    </div>
                    <svg
                      className="h-5 w-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                    <svg
                      className="h-5 w-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                      />
                    </svg>
                  </div>

                  {/* Chat area */}
                  <div
                    className="flex-1 overflow-auto p-3"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4d4d4' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                      backgroundColor: '#ece5dd',
                    }}
                  >
                    {/* Message bubble */}
                    <div className="max-w-[85%] overflow-hidden rounded-lg bg-white shadow-sm">
                      {/* Header preview */}
                      {value.header && (
                        <div className={cn(value.header.type !== 'text' && 'bg-gray-100')}>
                          {value.header.type === 'text' ? (
                            <div className="px-3 pt-2">
                              <p className="text-sm font-semibold">
                                {value.header.content || 'Header text'}
                              </p>
                            </div>
                          ) : value.header.type === 'image' ? (
                            <div className="flex h-40 items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                              {value.header.content ? (
                                <img
                                  src={value.header.content}
                                  alt="Header"
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Image className="h-12 w-12 text-gray-400" />
                              )}
                            </div>
                          ) : value.header.type === 'video' ? (
                            <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/30">
                                <div className="ml-1 h-0 w-0 border-y-[12px] border-l-[20px] border-y-transparent border-l-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 bg-gray-50 p-4">
                              <FileText className="h-10 w-10 text-red-500" />
                              <div>
                                <p className="text-sm font-medium">Document</p>
                                <p className="text-xs text-gray-500">PDF</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Body preview */}
                      <div className="px-3 py-2">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                          {value.body || 'Message body will appear here...'}
                        </p>
                      </div>

                      {/* Footer preview */}
                      {value.footer && (
                        <div className="px-3 pb-1">
                          <p className="text-xs text-gray-500">{value.footer}</p>
                        </div>
                      )}

                      {/* Timestamp and read receipt */}
                      <div className="flex items-center justify-end gap-1 px-3 pb-2">
                        <span className="text-[11px] text-gray-500">
                          {new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <CheckCheck className="h-4 w-4 text-blue-500" />
                      </div>

                      {/* Buttons preview */}
                      {value.buttons && value.buttons.length > 0 && (
                        <div className="border-t border-gray-100">
                          {value.buttons.map((button, index) => (
                            <button
                              key={index}
                              className="w-full border-b border-gray-100 py-3 text-center text-sm font-medium text-[#00a884] transition-colors last:border-b-0 hover:bg-gray-50"
                            >
                              {button.text || `Button ${index + 1}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Input bar */}
                  <div className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2">
                    <div className="flex flex-1 items-center rounded-full bg-white px-4 py-2.5">
                      <Smile className="mr-3 h-6 w-6 text-gray-500" />
                      <span className="text-sm text-gray-400">Type a message</span>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884]">
                      <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </DeviceFrameset>
            </div>

            {/* Template info badges */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {value.category && (
                <Badge variant="outline" className="text-xs">
                  {templateCategories.find((c) => c.value === value.category)?.label ||
                    value.category}
                </Badge>
              )}
              {value.language && (
                <Badge variant="outline" className="text-xs">
                  {supportedLanguages.find((l) => l.code === value.language)?.name ||
                    value.language}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WhatsAppEditor;
