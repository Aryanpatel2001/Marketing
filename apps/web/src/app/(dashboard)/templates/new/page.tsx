'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, MessageSquare, Loader2, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { templatesApi, TemplateType } from '@/lib/api/templates';
import { TemplatePicker, EmailTemplatePreset } from '@/components/template-editors';

const templateTypes = [
  {
    type: 'email' as TemplateType,
    icon: Mail,
    title: 'Email Template',
    description: 'Create rich HTML emails with drag-and-drop editor',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    selectedColor: 'ring-2 ring-blue-500 border-blue-500',
  },
  {
    type: 'sms' as TemplateType,
    icon: Phone,
    title: 'SMS Template',
    description: 'Short text messages with character tracking',
    color: 'bg-green-100 text-green-700 border-green-200',
    selectedColor: 'ring-2 ring-green-500 border-green-500',
  },
  {
    type: 'whatsapp' as TemplateType,
    icon: MessageSquare,
    title: 'WhatsApp Template',
    description: 'Rich messages with buttons and media',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    selectedColor: 'ring-2 ring-emerald-500 border-emerald-500',
  },
];

export default function NewTemplatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedType, setSelectedType] = useState<TemplateType | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('none');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<EmailTemplatePreset | null>(null);

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['template-categories'],
    queryFn: () => templatesApi.getCategories(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      type: TemplateType;
      categoryId?: string;
      designJson?: Record<string, unknown>;
    }) => templatesApi.createTemplate(data),
    onSuccess: (template) => {
      toast.success('Template created successfully');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      router.push(`/templates/${template.id}`);
    },
    onError: () => {
      toast.error('Failed to create template');
    },
  });

  const handleSelectPreset = (preset: EmailTemplatePreset) => {
    setSelectedPreset(preset);
    // Optionally use the preset name if no name is set
    if (!name.trim()) {
      setName(preset.name);
    }
  };

  const handleCreate = () => {
    if (!selectedType || !name.trim()) {
      toast.error('Please select a type and enter a name');
      return;
    }

    const createData = {
      name: name.trim(),
      type: selectedType,
      categoryId: categoryId && categoryId !== 'none' ? categoryId : undefined,
      // Pass the preset design if one is selected (for email templates)
      designJson: selectedType === 'email' && selectedPreset ? selectedPreset.design : undefined,
    };

    console.log('[NewTemplate] Creating template with data:', {
      name: createData.name,
      type: createData.type,
      hasDesignJson: !!createData.designJson,
      designJsonKeys: createData.designJson ? Object.keys(createData.designJson) : [],
      selectedPresetId: selectedPreset?.id,
    });

    createMutation.mutate(createData);
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Template</h1>
          <p className="text-muted-foreground">Choose a template type and give it a name</p>
        </div>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* Step 1: Select Type */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">1. Select Template Type</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {templateTypes.map((template) => (
              <Card
                key={template.type}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  selectedType === template.type && template.selectedColor
                )}
                onClick={() => setSelectedType(template.type)}
              >
                <CardHeader className="pb-3">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-lg',
                      template.color
                    )}
                  >
                    <template.icon className="h-6 w-6" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">{template.title}</CardTitle>
                  <CardDescription className="mt-1">{template.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Step 2: Choose Starting Template (Email only) */}
        {selectedType === 'email' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
            <h2 className="text-lg font-semibold">2. Choose a Starting Template</h2>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setShowTemplatePicker(true)}
                className="gap-2"
              >
                <LayoutTemplate className="h-4 w-4" />
                Browse Templates
              </Button>
              {selectedPreset ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {selectedPreset.category}
                  </Badge>
                  <span className="text-sm font-medium">{selectedPreset.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPreset(null)}
                    className="text-muted-foreground h-auto p-1"
                  >
                    &times;
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">
                  No template selected (starts blank)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Template Details (Step 2 for non-email) */}
        {selectedType && (
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
            <h2 className="text-lg font-semibold">
              {selectedType === 'email' ? '3' : '2'}. Template Details
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Welcome Email, Order Confirmation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category (optional)</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 pt-4">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedType || !name.trim() || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create & Edit Template
          </Button>
        </div>
      </div>

      {/* Template Picker Dialog */}
      <TemplatePicker
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        onSelect={handleSelectPreset}
      />
    </div>
  );
}
