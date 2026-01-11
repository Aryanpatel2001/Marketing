'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Loader2,
  Settings,
  Mail,
  Phone,
  MessageSquare,
  LayoutTemplate,
} from 'lucide-react';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { templatesApi, TemplateStatus, UpdateTemplateData } from '@/lib/api/templates';
import {
  EmailEditor,
  EmailEditorRef,
  SmsEditor,
  WhatsAppEditor,
  WhatsAppTemplate,
  TemplatePicker,
  EmailTemplatePreset,
} from '@/components/template-editors';

const statusOptions: { value: TemplateStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'archived', label: 'Archived', color: 'bg-amber-100 text-amber-700' },
];

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const templateId = params.id as string;

  // Editor refs
  const emailEditorRef = useRef<EmailEditorRef | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState<TemplateStatus>('draft');
  const [categoryId, setCategoryId] = useState<string>('none');
  const [smsContent, setSmsContent] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState<WhatsAppTemplate>({ body: '' });
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Fetch template
  const {
    data: template,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => templatesApi.getTemplate(templateId),
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['template-categories'],
    queryFn: () => templatesApi.getCategories(),
  });

  // Initialize form when template loads
  useEffect(() => {
    if (template) {
      console.log('[EditTemplate] Template loaded:', {
        id: template.id,
        name: template.name,
        type: template.type,
        hasDesignJson: !!template.designJson,
        designJsonKeys: template.designJson ? Object.keys(template.designJson) : [],
        designJsonPreview: template.designJson
          ? JSON.stringify(template.designJson).substring(0, 200)
          : null,
      });

      setName(template.name);
      setSubject(template.subject || '');
      setStatus(template.status);
      setCategoryId(template.categoryId || 'none');

      if (template.type === 'sms') {
        setSmsContent(template.content || '');
      } else if (template.type === 'whatsapp') {
        try {
          const parsed = template.content ? JSON.parse(template.content) : { body: '' };
          setWhatsappTemplate(parsed);
        } catch {
          setWhatsappTemplate({ body: template.content || '' });
        }
      }
    }
  }, [template]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: UpdateTemplateData) => {
      return templatesApi.updateTemplate(templateId, data);
    },
    onSuccess: () => {
      toast.success('Template saved successfully');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: () => {
      toast.error('Failed to save template');
    },
  });

  const handleSave = async () => {
    const updateData: UpdateTemplateData = {
      name,
      subject: subject || undefined,
      status,
      categoryId: categoryId && categoryId !== 'none' ? categoryId : undefined,
    };

    if (template?.type === 'email' && emailEditorRef.current) {
      try {
        // Export HTML and design
        const { html, design } = await emailEditorRef.current.exportHtml();
        updateData.content = html;
        updateData.designJson = design;

        // Export thumbnail image
        try {
          const { url: imageUrl } = await emailEditorRef.current.exportImage();
          if (imageUrl) {
            // Upload thumbnail to server
            await templatesApi.uploadThumbnail(templateId, imageUrl);
          }
        } catch (thumbErr) {
          // Thumbnail upload is non-critical, log but continue
          console.warn('[Save] Thumbnail export/upload failed:', thumbErr);
        }
      } catch (err) {
        toast.error('Failed to export email design');
        return;
      }
    } else if (template?.type === 'sms') {
      updateData.content = smsContent;
    } else if (template?.type === 'whatsapp') {
      updateData.content = JSON.stringify(whatsappTemplate);
    }

    updateMutation.mutate(updateData);
  };

  const markChanged = () => {
    if (!hasChanges) setHasChanges(true);
  };

  const handleSelectPreset = (preset: EmailTemplatePreset) => {
    if (emailEditorRef.current && isEditorReady) {
      emailEditorRef.current.loadDesign(preset.design);
      markChanged();
      toast.success(`Loaded "${preset.name}" template`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[600px] rounded-lg" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <p className="text-destructive mb-4">Failed to load template</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const TypeIcon =
    template.type === 'email' ? Mail : template.type === 'sms' ? Phone : MessageSquare;

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="bg-background sticky top-0 z-10 border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/templates')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  template.type === 'email' && 'bg-blue-100 text-blue-700',
                  template.type === 'sms' && 'bg-green-100 text-green-700',
                  template.type === 'whatsapp' && 'bg-emerald-100 text-emerald-700'
                )}
              >
                <TypeIcon className="h-5 w-5" />
              </div>
              <div>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markChanged();
                  }}
                  className="h-auto border-none p-0 text-lg font-semibold focus-visible:ring-0"
                  placeholder="Template name"
                />
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {template.type}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', statusOptions.find((s) => s.value === status)?.color)}
                  >
                    {status}
                  </Badge>
                  {hasChanges && (
                    <Badge variant="secondary" className="text-xs">
                      Unsaved changes
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Browse Templates Button (Email only) */}
            {template.type === 'email' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplatePicker(true)}
                disabled={!isEditorReady}
              >
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Templates
              </Button>
            )}

            {/* Settings Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Template Settings</SheetTitle>
                  <SheetDescription>Configure template metadata and status</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onValueChange={(value) => {
                        setStatus(value as TemplateStatus);
                        markChanged();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  option.color.replace('text-', 'bg-').split(' ')[0]
                                )}
                              />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={categoryId}
                      onValueChange={(value) => {
                        setCategoryId(value);
                        markChanged();
                      }}
                    >
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

                  {template.variables.length > 0 && (
                    <div className="space-y-2">
                      <Label>Variables Used</Label>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.map((variable) => (
                          <Badge key={variable} variant="secondary">
                            {`{{${variable}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-muted-foreground space-y-2 border-t pt-4 text-sm">
                    <p>Created: {new Date(template.createdAt).toLocaleString()}</p>
                    <p>Updated: {new Date(template.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </div>

        {/* Subject line for email */}
        {template.type === 'email' && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground whitespace-nowrap text-sm">Subject:</Label>
              <Input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  markChanged();
                }}
                placeholder="Enter email subject line..."
                className="flex-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-auto">
        {template.type === 'email' && (
          <EmailEditor
            initialDesign={template.designJson}
            editorRef={emailEditorRef}
            onReady={() => setIsEditorReady(true)}
            minHeight={window.innerHeight - 200}
          />
        )}

        {template.type === 'sms' && (
          <div className="max-w-3xl p-6">
            <SmsEditor
              value={smsContent}
              onChange={(value) => {
                setSmsContent(value);
                markChanged();
              }}
            />
          </div>
        )}

        {template.type === 'whatsapp' && (
          <div className="p-6">
            <WhatsAppEditor
              value={whatsappTemplate}
              onChange={(value) => {
                setWhatsappTemplate(value);
                markChanged();
              }}
            />
          </div>
        )}
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
