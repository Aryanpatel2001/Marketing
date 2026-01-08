'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Mail, Phone, Building, MapPin, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/page-header';
import { ConfirmationDialog } from '@/components/common/confirmation-dialog';

import { contactsApi, UpdateContactData, ContactStatus } from '@/lib/api/contacts';

const contactSchema = z.object({
  email: z.string().email('Invalid email address').or(z.literal('')).optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  website: z.string().url('Invalid URL').or(z.literal('')).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const contactId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  // Fetch contact
  const {
    data: contact,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => contactsApi.getContact(contactId),
  });

  // Populate form when contact loads
  useEffect(() => {
    if (contact) {
      reset({
        email: contact.email || '',
        phone: contact.phone || '',
        whatsappNumber: contact.whatsappNumber || '',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        company: contact.company || '',
        jobTitle: contact.jobTitle || '',
        website: contact.website || '',
        city: contact.city || '',
        state: contact.state || '',
        country: contact.country || '',
        postalCode: contact.postalCode || '',
        tags: contact.tags?.join(', ') || '',
        notes: contact.notes || '',
        status: contact.status,
      });
    }
  }, [contact, reset]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateContactData) => contactsApi.updateContact(contactId, data),
    onSuccess: () => {
      toast.success('Contact updated successfully');
      queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-stats'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update contact');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => contactsApi.deleteContact(contactId),
    onSuccess: () => {
      toast.success('Contact deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-stats'] });
      router.push('/contacts');
    },
    onError: () => {
      toast.error('Failed to delete contact');
    },
  });

  const onSubmit = (data: ContactFormData) => {
    const updateData: UpdateContactData = {
      ...data,
      email: data.email || undefined,
      website: data.website || undefined,
      tags: data.tags
        ? data.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    };
    updateMutation.mutate(updateData);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: ContactStatus) => {
    const variants: Record<ContactStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      unsubscribed: 'secondary',
      bounced: 'destructive',
      complained: 'destructive',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6 md:col-span-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-lg">Contact not found</p>
        <Button onClick={() => router.push('/contacts')}>Back to Contacts</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/contacts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title={
              contact.firstName || contact.lastName
                ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                : contact.email || 'Contact Details'
            }
            description={contact.company || undefined}
          />
          {getStatusBadge(contact.status)}
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2">
          <Tabs defaultValue="details" className="space-y-6">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input id="firstName" {...register('firstName')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input id="lastName" {...register('lastName')} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input id="company" {...register('company')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">Job Title</Label>
                      <Input id="jobTitle" {...register('jobTitle')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={watch('status')}
                        onValueChange={(value) =>
                          setValue('status', value as ContactFormData['status'], {
                            shouldDirty: true,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                          <SelectItem value="bounced">Bounced</SelectItem>
                          <SelectItem value="complained">Complained</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        {...register('email')}
                        error={!!errors.email}
                      />
                      {errors.email && (
                        <p className="text-destructive text-sm">{errors.email.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" type="tel" {...register('phone')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsappNumber">WhatsApp</Label>
                      <Input id="whatsappNumber" type="tel" {...register('whatsappNumber')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        type="url"
                        {...register('website')}
                        error={!!errors.website}
                      />
                      {errors.website && (
                        <p className="text-destructive text-sm">{errors.website.message}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Location */}
                <Card>
                  <CardHeader>
                    <CardTitle>Location</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input id="city" {...register('city')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input id="state" {...register('state')} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input id="country" {...register('country')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="postalCode">Postal Code</Label>
                        <Input id="postalCode" {...register('postalCode')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tags & Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle>Tags & Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tags">Tags</Label>
                      <Input
                        id="tags"
                        placeholder="vip, newsletter, customer"
                        {...register('tags')}
                      />
                      <p className="text-muted-foreground text-sm">Separate tags with commas</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea id="notes" rows={4} {...register('notes')} />
                    </div>
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button type="submit" disabled={!isDirty || updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle>Email Activity</CardTitle>
                  <CardDescription>Email engagement history for this contact</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-muted rounded-lg p-4">
                        <div className="text-2xl font-bold">{contact.totalEmailsSent}</div>
                        <div className="text-muted-foreground text-sm">Emails Sent</div>
                      </div>
                      <div className="bg-muted rounded-lg p-4">
                        <div className="text-2xl font-bold">{contact.totalEmailsOpened}</div>
                        <div className="text-muted-foreground text-sm">Opened</div>
                      </div>
                      <div className="bg-muted rounded-lg p-4">
                        <div className="text-2xl font-bold">{contact.totalEmailsClicked}</div>
                        <div className="text-muted-foreground text-sm">Clicked</div>
                      </div>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      <p>Last email sent: {formatDate(contact.lastEmailSentAt)}</p>
                      <p>Last email opened: {formatDate(contact.lastEmailOpenedAt)}</p>
                      <p>Last email clicked: {formatDate(contact.lastEmailClickedAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <Mail className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">{contact.email}</span>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">{contact.phone}</span>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-3">
                  <Building className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">{contact.company}</span>
                </div>
              )}
              {(contact.city || contact.country) && (
                <div className="flex items-center gap-3">
                  <MapPin className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">
                    {[contact.city, contact.state, contact.country].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              {contact.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No tags</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="capitalize">{contact.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Engagement Score</span>
                <span>{contact.engagementScore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(contact.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Activity</span>
                <span>{formatDate(contact.lastActivityAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Contact"
        description="Are you sure you want to delete this contact? This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
