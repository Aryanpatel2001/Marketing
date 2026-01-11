'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  Eye,
  FileText,
  Folder,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDialog } from '@/components/common/confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import {
  Template,
  templatesApi,
  TemplatesQuery,
  TemplateStatus,
  TemplateType,
} from '@/lib/api/templates';

// Type icons and colors
const typeConfig: Record<TemplateType, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'bg-blue-100 text-blue-700', label: 'Email' },
  sms: { icon: Phone, color: 'bg-green-100 text-green-700', label: 'SMS' },
  whatsapp: { icon: MessageSquare, color: 'bg-emerald-100 text-emerald-700', label: 'WhatsApp' },
};

// Status badges
const statusConfig: Record<TemplateStatus, { color: string; label: string }> = {
  draft: { color: 'bg-gray-100 text-gray-700', label: 'Draft' },
  active: { color: 'bg-green-100 text-green-700', label: 'Active' },
  archived: { color: 'bg-amber-100 text-amber-700', label: 'Archived' },
};

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<TemplateType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<TemplateStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  // Build query
  const query: TemplatesQuery = useMemo(
    () => ({
      page: currentPage,
      limit: 12,
      search: searchQuery || undefined,
      type: selectedType !== 'all' ? selectedType : undefined,
      categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    }),
    [currentPage, searchQuery, selectedType, selectedCategory, selectedStatus]
  );

  // Fetch templates
  const {
    data: templatesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['templates', query],
    queryFn: () => templatesApi.getTemplates(query),
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['template-categories'],
    queryFn: () => templatesApi.getCategories(),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['template-stats'],
    queryFn: () => templatesApi.getStats(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.deleteTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-stats'] });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete template');
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => templatesApi.duplicateTemplate(id),
    onSuccess: (newTemplate) => {
      toast.success('Template duplicated successfully');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      router.push(`/templates/${newTemplate.id}`);
    },
    onError: () => {
      toast.error('Failed to duplicate template');
    },
  });

  const templates = templatesData?.data || [];
  const meta = templatesData?.meta;

  const handleDelete = (template: Template) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      deleteMutation.mutate(templateToDelete.id);
    }
  };

  const handleDuplicate = (template: Template) => {
    duplicateMutation.mutate(template.id);
  };

  // Stats cards
  const statCards = [
    { label: 'Total', value: stats?.total || 0, icon: FileText, color: 'text-gray-600' },
    { label: 'Email', value: stats?.byType?.email || 0, icon: Mail, color: 'text-blue-600' },
    { label: 'SMS', value: stats?.byType?.sms || 0, icon: Phone, color: 'text-green-600' },
    {
      label: 'WhatsApp',
      value: stats?.byType?.whatsapp || 0,
      icon: MessageSquare,
      color: 'text-emerald-600',
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground">
            Create and manage email, SMS, and WhatsApp templates
          </p>
        </div>
        <Button onClick={() => router.push('/templates/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <stat.icon className={cn('h-4 w-4', stat.color)} />
              <span className="text-muted-foreground text-sm">{stat.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={selectedType}
          onValueChange={(value) => {
            setSelectedType(value as TemplateType | 'all');
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedCategory}
          onValueChange={(value) => {
            setSelectedCategory(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
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

        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value as TemplateStatus | 'all');
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 rounded-md border">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Templates Grid/List */}
      {isLoading ? (
        <div
          className={cn(
            'grid gap-4',
            viewMode === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'
          )}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-destructive">Failed to load templates</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['templates'] })}
          >
            Try Again
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-muted/20 flex flex-col items-center justify-center rounded-lg border py-12">
          <FileText className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="text-lg font-medium">No templates yet</h3>
          <p className="text-muted-foreground mb-4">Create your first template to get started</p>
          <Button onClick={() => router.push('/templates/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            viewMode === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'
          )}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              viewMode={viewMode}
              onEdit={() => router.push(`/templates/${template.id}`)}
              onDuplicate={() => handleDuplicate(template)}
              onDelete={() => handleDelete(template)}
              isDeleting={deleteMutation.isPending && templateToDelete?.id === template.id}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Showing {(meta.page - 1) * meta.limit + 1} to{' '}
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} templates
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={!meta.hasPrevPage}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-muted-foreground px-2 text-sm">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!meta.hasNextPage}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Template"
        description={`Are you sure you want to delete "${templateToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// SMS Preview Component - Shows message in a phone bubble style
function SmsPreview({ content }: { content: string | null }) {
  const displayContent = content || 'No message content';
  const truncated =
    displayContent.length > 80 ? displayContent.substring(0, 80) + '...' : displayContent;

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-gray-100 to-gray-50">
      {/* Phone status bar */}
      <div className=" flex items-center justify-between text-[10px] text-gray-500">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <div className="h-2 w-4 rounded-sm border border-gray-400">
            <div className="h-full w-3/4 rounded-sm bg-gray-400" />
          </div>
        </div>
      </div>

      {/* Message header */}
      <div className="mb-2 text-center">
        <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-gray-300">
          <Phone className="h-4 w-4 text-gray-600" />
        </div>
        <p className="mt-1 text-[10px] text-gray-500">Business SMS</p>
      </div>

      {/* Message bubble */}
      <div className="flex flex-1 items-start justify-start">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-gray-200 px-3 py-2 shadow-sm">
          <p className="break-words text-[11px] leading-relaxed text-gray-800">{truncated}</p>
        </div>
      </div>

      {/* Input bar */}
      <div className="mt-2 flex items-center gap-2">
        <div className="h-6 flex-1 rounded-full border border-gray-200 bg-white" />
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// WhatsApp Preview Component - Shows message in WhatsApp style
function WhatsAppPreview({ content }: { content: string | null }) {
  let displayContent = 'No message content';

  if (content) {
    try {
      const parsed = JSON.parse(content);
      displayContent = parsed.body || content;
    } catch {
      displayContent = content;
    }
  }

  const truncated =
    displayContent.length > 80 ? displayContent.substring(0, 80) + '...' : displayContent;

  return (
    <div
      className="flex h-full w-full flex-col bg-[#e5ddd5] p-3"
      style={{
        backgroundImage:
          'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//HLfwYiAOOoQvoqBAB+vgnxXtsSeQAAAABJRU5ErkJggg==")',
        backgroundRepeat: 'repeat',
      }}
    >
      {/* WhatsApp header */}
      <div className="-mx-3 -mt-3 mb-2 flex items-center gap-2 rounded-t bg-[#075e54] px-3 py-2">
        <div className="h-6 w-6 rounded-full bg-gray-300" />
        <span className="text-xs font-medium text-white">Business</span>
      </div>

      {/* Message bubble */}
      <div className="flex flex-1 items-start">
        <div className="max-w-[90%] rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
          <p className="break-words text-[11px] leading-relaxed text-gray-800">{truncated}</p>
          <div className="mt-1 flex items-center justify-end gap-1">
            <span className="text-[9px] text-gray-500">9:41 AM</span>
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="mt-2 flex items-center gap-2 rounded-full bg-white px-3 py-1">
        <div className="flex-1 text-[10px] text-gray-400">Type a message</div>
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#075e54]">
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Template Card Component
interface TemplateCardProps {
  template: Template;
  viewMode: 'grid' | 'list';
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function TemplateCard({
  template,
  viewMode,
  onEdit,
  onDuplicate,
  onDelete,
  isDeleting,
}: TemplateCardProps) {
  const TypeIcon = typeConfig[template.type].icon;
  const typeStyle = typeConfig[template.type];
  const statusStyle = statusConfig[template.status];

  if (viewMode === 'list') {
    return (
      <div className="bg-card flex items-center gap-4 rounded-lg border p-4 transition-shadow hover:shadow-md">
        <div
          className={cn('flex h-10 w-10 items-center justify-center rounded-lg', typeStyle.color)}
        >
          <TypeIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{template.name}</h3>
            <Badge variant="outline" className={cn('text-xs', statusStyle.color)}>
              {statusStyle.label}
            </Badge>
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {template.subject || 'No subject'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {template.category && (
            <Badge variant="outline" className="text-xs">
              <Folder className="mr-1 h-3 w-3" />
              {template.category.name}
            </Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {new Date(template.updatedAt).toLocaleDateString()}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card group overflow-hidden rounded-lg border transition-shadow hover:shadow-md">
      {/* Preview area */}
      <div className="bg-muted relative flex h-32 items-center justify-center overflow-hidden">
        {template.type === 'email' && template.thumbnailUrl ? (
          <img
            src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${template.thumbnailUrl}`}
            alt={template.name}
            className="h-full w-full object-cover"
          />
        ) : template.type === 'email' ? (
          <TypeIcon className="text-muted-foreground/50 h-12 w-12" />
        ) : template.type === 'sms' ? (
          <SmsPreview content={template.content} />
        ) : template.type === 'whatsapp' ? (
          <WhatsAppPreview content={template.content} />
        ) : (
          <TypeIcon className="text-muted-foreground/50 h-12 w-12" />
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Eye className="mr-1 h-4 w-4" />
            View
          </Button>
        </div>
        {/* Type badge */}
        <div
          className={cn(
            'absolute left-2 top-2 rounded px-2 py-1 text-xs font-medium',
            typeStyle.color
          )}
        >
          {typeStyle.label}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{template.name}</h3>
            <p className="text-muted-foreground truncate text-sm">
              {template.subject || 'No subject'}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Meta */}
        <div className="mt-3 flex items-center justify-between">
          <Badge variant="outline" className={cn('text-xs', statusStyle.color)}>
            {statusStyle.label}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {new Date(template.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Variables */}
        {template.variables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {template.variables.slice(0, 3).map((variable) => (
              <Badge key={variable} variant="secondary" className="text-xs">
                {`{{${variable}}}`}
              </Badge>
            ))}
            {template.variables.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{template.variables.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
