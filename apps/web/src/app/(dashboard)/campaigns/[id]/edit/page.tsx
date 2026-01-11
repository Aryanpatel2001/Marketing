'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Clock, Loader2, Mail, MessageSquare, Phone, Save, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import {
  CampaignType,
  UpdateCampaignData,
  EmailContent,
  SmsContent,
  campaignsApi,
} from '@/lib/api/campaigns';
import { contactsApi } from '@/lib/api/contacts';

// Channel configuration
const channelConfig: Record<CampaignType, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'bg-blue-100 text-blue-700', label: 'Email' },
  sms: { icon: Phone, color: 'bg-green-100 text-green-700', label: 'SMS' },
  whatsapp: { icon: MessageSquare, color: 'bg-emerald-100 text-emerald-700', label: 'WhatsApp' },
};

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const campaignId = params.id as string;

  // State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emailContent, setEmailContent] = useState<EmailContent>({
    subject: '',
    previewText: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    htmlContent: '',
  });
  const [smsContent, setSmsContent] = useState<SmsContent>({
    message: '',
    senderId: '',
  });
  const [audienceType, setAudienceType] = useState<'all' | 'list'>('all');
  const [contactListIds, setContactListIds] = useState<string[]>([]);
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState('UTC');

  // Fetch campaign
  const {
    data: campaign,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.getCampaign(campaignId),
    enabled: !!campaignId,
  });

  // Fetch contact lists
  const { data: listsData } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: () => contactsApi.getLists(),
  });

  const contactLists = listsData || [];

  // Populate form when campaign loads
  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description || '');
      setAudienceType(campaign.audienceType as 'all' | 'list');
      setContactListIds(campaign.contactListIds || []);
      setSendImmediately(campaign.sendImmediately);
      setScheduledAt(campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : '');
      setTimezone(campaign.timezone || 'UTC');

      if (campaign.type === 'email' && campaign.content && 'subject' in campaign.content) {
        setEmailContent(campaign.content as EmailContent);
      } else if (campaign.type === 'sms' && campaign.content && 'message' in campaign.content) {
        setSmsContent(campaign.content as SmsContent);
      }
    }
  }, [campaign]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateCampaignData) => campaignsApi.updateCampaign(campaignId, data),
    onSuccess: () => {
      toast.success('Campaign updated successfully');
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      router.push(`/campaigns/${campaignId}`);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update campaign');
    },
  });

  // Handle save
  const handleSave = () => {
    const updateData: UpdateCampaignData = {
      name,
      description: description || undefined,
      audienceType,
      contactListIds: audienceType === 'list' ? contactListIds : undefined,
      sendImmediately,
      scheduledAt: !sendImmediately && scheduledAt ? scheduledAt : undefined,
      timezone,
    };

    if (campaign?.type === 'email') {
      updateData.content = emailContent;
    } else if (campaign?.type === 'sms') {
      updateData.content = smsContent;
    }

    updateMutation.mutate(updateData);
  };

  // Validation
  const isValid = () => {
    if (!name.trim()) return false;
    if (campaign?.type === 'email') {
      if (
        !emailContent.subject.trim() ||
        !emailContent.fromName.trim() ||
        !emailContent.fromEmail.trim()
      ) {
        return false;
      }
    }
    if (campaign?.type === 'sms') {
      if (!smsContent.message.trim()) return false;
    }
    if (audienceType === 'list' && contactListIds.length === 0) return false;
    if (!sendImmediately && !scheduledAt) return false;
    return true;
  };

  // Calculate SMS segments
  const getSmsSegments = (message: string) => {
    const length = message.length;
    if (length === 0) return { chars: 0, segments: 0, hasUnicode: false };
    // eslint-disable-next-line no-control-regex
    const hasUnicode = /[^\u0000-\u007F]/.test(message);
    const segmentSize = hasUnicode ? 70 : 160;
    const segments = Math.ceil(length / segmentSize);
    return { chars: length, segments, hasUnicode };
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <h2 className="text-lg font-semibold">Campaign not found</h2>
        <p className="text-muted-foreground mb-4">
          The campaign you're trying to edit doesn't exist.
        </p>
        <Button onClick={() => router.push('/campaigns')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    );
  }

  // Can't edit non-draft campaigns
  if (campaign.status !== 'draft') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <h2 className="text-lg font-semibold">Cannot Edit Campaign</h2>
        <p className="text-muted-foreground mb-4">
          Only draft campaigns can be edited. This campaign is "{campaign.status}".
        </p>
        <Button onClick={() => router.push(`/campaigns/${campaignId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          View Campaign
        </Button>
      </div>
    );
  }

  const TypeIcon = channelConfig[campaign.type].icon;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="bg-background border-b">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/campaigns/${campaignId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Edit Campaign</h1>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <TypeIcon className="h-4 w-4" />
                <span className="capitalize">{campaign.type}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}`)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid() || updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Tabs defaultValue="details" className="space-y-6">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="audience">Audience</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Campaign Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., January Newsletter"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of this campaign..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {campaign.type === 'email' ? 'Email Content' : 'SMS Content'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaign.type === 'email' && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="fromName">From Name *</Label>
                          <Input
                            id="fromName"
                            placeholder="Your Company"
                            value={emailContent.fromName}
                            onChange={(e) =>
                              setEmailContent({ ...emailContent, fromName: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fromEmail">From Email *</Label>
                          <Input
                            id="fromEmail"
                            type="email"
                            placeholder="hello@company.com"
                            value={emailContent.fromEmail}
                            onChange={(e) =>
                              setEmailContent({ ...emailContent, fromEmail: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="replyTo">Reply-To Email (Optional)</Label>
                        <Input
                          id="replyTo"
                          type="email"
                          placeholder="reply@company.com"
                          value={emailContent.replyTo || ''}
                          onChange={(e) =>
                            setEmailContent({ ...emailContent, replyTo: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subject">Subject Line *</Label>
                        <Input
                          id="subject"
                          placeholder="Enter email subject..."
                          value={emailContent.subject}
                          onChange={(e) =>
                            setEmailContent({ ...emailContent, subject: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="previewText">Preview Text (Optional)</Label>
                        <Input
                          id="previewText"
                          placeholder="Text shown in inbox preview..."
                          value={emailContent.previewText || ''}
                          onChange={(e) =>
                            setEmailContent({ ...emailContent, previewText: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="htmlContent">Email Content *</Label>
                        <Textarea
                          id="htmlContent"
                          placeholder="Enter your email content (HTML supported)..."
                          value={emailContent.htmlContent}
                          onChange={(e) =>
                            setEmailContent({ ...emailContent, htmlContent: e.target.value })
                          }
                          rows={12}
                          className="font-mono text-sm"
                        />
                        <p className="text-muted-foreground text-xs">
                          Use variables like {'{{first_name}}'}, {'{{company}}'} for personalization
                        </p>
                      </div>
                    </>
                  )}

                  {campaign.type === 'sms' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="senderId">Sender ID (Optional)</Label>
                        <Input
                          id="senderId"
                          placeholder="COMPANY"
                          maxLength={11}
                          value={smsContent.senderId || ''}
                          onChange={(e) =>
                            setSmsContent({ ...smsContent, senderId: e.target.value })
                          }
                        />
                        <p className="text-muted-foreground text-xs">
                          Maximum 11 characters, alphanumeric only
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="message">Message *</Label>
                        <Textarea
                          id="message"
                          placeholder="Enter your SMS message..."
                          value={smsContent.message}
                          onChange={(e) =>
                            setSmsContent({ ...smsContent, message: e.target.value })
                          }
                          rows={6}
                        />
                        <div className="flex items-center justify-between text-xs">
                          <p className="text-muted-foreground">
                            Use variables like {'{{first_name}}'} for personalization
                          </p>
                          <p className="text-muted-foreground">
                            {getSmsSegments(smsContent.message).chars} characters ·{' '}
                            {getSmsSegments(smsContent.message).segments} segment(s)
                            {getSmsSegments(smsContent.message).hasUnicode && ' · Unicode'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audience Tab */}
            <TabsContent value="audience" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Select Audience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={audienceType}
                    onValueChange={(value) => setAudienceType(value as 'all' | 'list')}
                    className="space-y-3"
                  >
                    <Label
                      htmlFor="all"
                      className={cn(
                        'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                        audienceType === 'all'
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/50'
                      )}
                    >
                      <RadioGroupItem value="all" id="all" className="mt-1" />
                      <div className="flex-1">
                        <div className="font-medium">All Contacts</div>
                        <p className="text-muted-foreground text-sm">
                          Send to all contacts with a valid{' '}
                          {campaign.type === 'email' ? 'email' : 'phone number'}
                        </p>
                      </div>
                    </Label>
                    <Label
                      htmlFor="list"
                      className={cn(
                        'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                        audienceType === 'list'
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/50'
                      )}
                    >
                      <RadioGroupItem value="list" id="list" className="mt-1" />
                      <div className="flex-1">
                        <div className="font-medium">Specific Lists</div>
                        <p className="text-muted-foreground text-sm">
                          Send to contacts in selected lists
                        </p>
                      </div>
                    </Label>
                  </RadioGroup>

                  {audienceType === 'list' && (
                    <div className="space-y-3 pt-4">
                      <Label>Select Lists</Label>
                      {contactLists.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No contact lists available.</p>
                      ) : (
                        <div className="space-y-2">
                          {contactLists.map((list) => (
                            <Label
                              key={list.id}
                              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                            >
                              <Checkbox
                                checked={contactListIds.includes(list.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setContactListIds([...contactListIds, list.id]);
                                  } else {
                                    setContactListIds(
                                      contactListIds.filter((id) => id !== list.id)
                                    );
                                  }
                                }}
                              />
                              <div className="flex-1">
                                <div className="font-medium">{list.name}</div>
                                <p className="text-muted-foreground text-xs">
                                  {list.contactCount?.toLocaleString() || 0} contacts
                                </p>
                              </div>
                            </Label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Schedule Delivery</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={sendImmediately ? 'now' : 'later'}
                    onValueChange={(value) => setSendImmediately(value === 'now')}
                    className="space-y-3"
                  >
                    <Label
                      htmlFor="now"
                      className={cn(
                        'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                        sendImmediately
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/50'
                      )}
                    >
                      <RadioGroupItem value="now" id="now" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          <span className="font-medium">Send Immediately</span>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Campaign will start sending when you click "Send Now"
                        </p>
                      </div>
                    </Label>
                    <Label
                      htmlFor="later"
                      className={cn(
                        'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                        !sendImmediately
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/50'
                      )}
                    >
                      <RadioGroupItem value="later" id="later" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">Schedule for Later</span>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Set a specific date and time for delivery
                        </p>
                      </div>
                    </Label>
                  </RadioGroup>

                  {!sendImmediately && (
                    <div className="space-y-4 pt-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="scheduledAt">Date & Time *</Label>
                          <Input
                            id="scheduledAt"
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="timezone">Timezone</Label>
                          <Select value={timezone} onValueChange={setTimezone}>
                            <SelectTrigger id="timezone">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UTC">UTC</SelectItem>
                              <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                              <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                              <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                              <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                              <SelectItem value="Europe/London">London (GMT)</SelectItem>
                              <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                              <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                              <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
