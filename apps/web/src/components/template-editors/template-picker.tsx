'use client';

import { useState } from 'react';
import { Check, FileText, Mail, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { emailTemplatePresets, EmailTemplatePreset } from './email-templates';

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: EmailTemplatePreset) => void;
}

const categoryColors: Record<string, string> = {
  blank: 'bg-gray-100 text-gray-600',
  welcome: 'bg-blue-100 text-blue-600',
  newsletter: 'bg-purple-100 text-purple-600',
  promotional: 'bg-orange-100 text-orange-600',
  transactional: 'bg-green-100 text-green-600',
};

export function TemplatePicker({ open, onOpenChange, onSelect }: TemplatePickerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplatePreset | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = ['all', 'blank', 'welcome', 'newsletter', 'promotional', 'transactional'];

  const filteredTemplates =
    selectedCategory && selectedCategory !== 'all'
      ? emailTemplatePresets.filter((t) => t.category === selectedCategory)
      : emailTemplatePresets;

  const handleSelect = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate);
      onOpenChange(false);
      setSelectedTemplate(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
          <DialogDescription>
            Select a pre-built template to get started, or start from scratch with a blank template.
          </DialogDescription>
        </DialogHeader>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2 py-2">
          {categories.map((category) => (
            <Button
              key={category}
              variant={
                selectedCategory === category || (!selectedCategory && category === 'all')
                  ? 'default'
                  : 'outline'
              }
              size="sm"
              onClick={() => setSelectedCategory(category === 'all' ? null : category)}
              className="capitalize"
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={cn(
                  'group relative cursor-pointer overflow-hidden rounded-lg border transition-all hover:shadow-md',
                  selectedTemplate?.id === template.id
                    ? 'ring-primary border-primary ring-2'
                    : 'hover:border-gray-300'
                )}
              >
                {/* Template Preview */}
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                  {/* Preview illustration based on category */}
                  <TemplatePreviewIllustration category={template.category} />

                  {/* Selected checkmark */}
                  {selectedTemplate?.id === template.id && (
                    <div className="bg-primary absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full">
                      <Check className="text-primary-foreground h-4 w-4" />
                    </div>
                  )}
                </div>

                {/* Template Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-medium">{template.name}</h3>
                    <Badge
                      variant="secondary"
                      className={cn('shrink-0 text-xs', categoryColors[template.category])}
                    >
                      {template.category}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    {template.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!selectedTemplate}>
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple preview illustrations for each category
function TemplatePreviewIllustration({ category }: { category: string }) {
  const baseClasses = 'absolute inset-0 flex items-center justify-center';

  switch (category) {
    case 'blank':
      return (
        <div className={baseClasses}>
          <div className="flex h-3/4 w-3/4 items-center justify-center rounded border-2 border-dashed border-gray-300">
            <FileText className="h-8 w-8 text-gray-300" />
          </div>
        </div>
      );

    case 'welcome':
      return (
        <div className={cn(baseClasses, 'flex-col gap-2 p-4')}>
          <div className="h-12 w-12 rounded-full bg-blue-200" />
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-1/2 rounded bg-gray-200" />
          <div className="mt-2 w-full space-y-1">
            <div className="h-2 w-full rounded bg-gray-200" />
            <div className="h-2 w-4/5 rounded bg-gray-200" />
            <div className="h-2 w-3/5 rounded bg-gray-200" />
          </div>
          <div className="mt-2 h-6 w-20 rounded bg-blue-400" />
        </div>
      );

    case 'newsletter':
      return (
        <div className={cn(baseClasses, 'flex-col gap-1 p-3')}>
          <div className="h-12 w-full rounded bg-purple-200" />
          <div className="mt-1 flex w-full gap-2">
            <div className="flex-1 space-y-1">
              <div className="h-8 rounded bg-gray-200" />
              <div className="h-2 w-3/4 rounded bg-gray-200" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-8 rounded bg-gray-200" />
              <div className="h-2 w-3/4 rounded bg-gray-200" />
            </div>
          </div>
          <div className="flex w-full gap-2">
            <div className="flex-1 space-y-1">
              <div className="h-8 rounded bg-gray-200" />
              <div className="h-2 w-3/4 rounded bg-gray-200" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-8 rounded bg-gray-200" />
              <div className="h-2 w-3/4 rounded bg-gray-200" />
            </div>
          </div>
        </div>
      );

    case 'promotional':
      return (
        <div className={cn(baseClasses, 'flex-col gap-2 p-3')}>
          <div className="flex h-16 w-full items-center justify-center rounded bg-gradient-to-r from-orange-300 to-red-300">
            <span className="text-lg font-bold text-white">50% OFF</span>
          </div>
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-1/2 rounded bg-gray-200" />
          <div className="mt-1 flex gap-2">
            <div className="h-16 w-16 rounded bg-gray-200" />
            <div className="h-16 w-16 rounded bg-gray-200" />
            <div className="h-16 w-16 rounded bg-gray-200" />
          </div>
          <div className="mt-1 h-8 w-24 rounded bg-orange-400" />
        </div>
      );

    case 'transactional':
      return (
        <div className={cn(baseClasses, 'flex-col gap-2 p-4')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200">
            <ShoppingCart className="h-5 w-5 text-green-600" />
          </div>
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div className="mt-1 w-full space-y-1 rounded border border-gray-200 p-2">
            <div className="flex justify-between">
              <div className="h-2 w-20 rounded bg-gray-200" />
              <div className="h-2 w-10 rounded bg-gray-200" />
            </div>
            <div className="flex justify-between">
              <div className="h-2 w-16 rounded bg-gray-200" />
              <div className="h-2 w-8 rounded bg-gray-200" />
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1">
              <div className="h-2 w-12 rounded bg-gray-300" />
              <div className="h-2 w-12 rounded bg-gray-300" />
            </div>
          </div>
          <div className="mt-1 h-6 w-20 rounded bg-green-400" />
        </div>
      );

    default:
      return (
        <div className={baseClasses}>
          <Mail className="h-12 w-12 text-gray-300" />
        </div>
      );
  }
}
