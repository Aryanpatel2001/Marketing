'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { contactsApi, CreateContactListData, ListType } from '@/lib/api/contacts';

// Predefined colors for lists
const listColors = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#6b7280', label: 'Gray' },
];

export default function NewListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<CreateContactListData>({
    name: '',
    description: '',
    type: 'static',
    color: '#3b82f6',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateContactListData) => contactsApi.createList(data),
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      toast.success('List created successfully');
      router.push(`/contacts/lists/${list.id}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create list');
    },
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'List name is required';
    } else if (formData.name.length > 255) {
      newErrors.name = 'List name must be less than 255 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/contacts/lists')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New List</h1>
          <p className="text-muted-foreground">
            Organize your contacts into a new list for targeted campaigns
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>List Details</CardTitle>
            <CardDescription>Give your list a name and description</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                List Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Newsletter Subscribers, VIP Customers"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-destructive text-sm">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe what this list is for..."
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* List Type */}
        <Card>
          <CardHeader>
            <CardTitle>List Type</CardTitle>
            <CardDescription>Choose how contacts are added to this list</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as ListType })}
              className="grid gap-4 md:grid-cols-2"
            >
              <label
                htmlFor="static"
                className={cn(
                  'flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors',
                  formData.type === 'static' && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem value="static" id="static" className="mt-1" />
                <div>
                  <p className="font-medium">Static List</p>
                  <p className="text-muted-foreground text-sm">
                    Manually add or remove contacts. Best for fixed groups like VIP customers or
                    event attendees.
                  </p>
                </div>
              </label>
              <label
                htmlFor="dynamic"
                className={cn(
                  'flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors',
                  formData.type === 'dynamic' && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem value="dynamic" id="dynamic" className="mt-1" />
                <div>
                  <p className="font-medium">Dynamic List</p>
                  <p className="text-muted-foreground text-sm">
                    Automatically include contacts based on filters. Best for segments like "Active
                    subscribers".
                  </p>
                </div>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Color */}
        <Card>
          <CardHeader>
            <CardTitle>List Color</CardTitle>
            <CardDescription>Choose a color to help identify this list</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {listColors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={cn(
                    'relative h-10 w-10 rounded-full transition-transform hover:scale-110',
                    formData.color === color.value && 'ring-2 ring-current ring-offset-2'
                  )}
                  style={{ backgroundColor: color.value, color: color.value }}
                  title={color.label}
                >
                  {formData.color === color.value && (
                    <Check className="absolute inset-0 m-auto h-5 w-5 text-white" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button type="button" variant="outline" onClick={() => router.push('/contacts/lists')}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create List
          </Button>
        </div>
      </form>
    </div>
  );
}
