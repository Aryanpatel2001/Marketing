'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  PenLine,
  Phone,
  Plus,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { SenderIdSelector } from '@/components/campaigns/sms/sender-id-selector';
import { SmsCostEstimator } from '@/components/campaigns/sms/sms-cost-estimator';
import { SmsMessageEditor } from '@/components/campaigns/sms/sms-message-editor';
import {
  CampaignType,
  CreateCampaignData,
  EmailContent,
  SmsContent,
  campaignsApi,
} from '@/lib/api/campaigns';
import { contactsApi } from '@/lib/api/contacts';
import { Template, templatesApi } from '@/lib/api/templates';

// Step configuration
const steps = [
  { id: 1, name: 'Channel', icon: Mail, description: 'Select campaign type' },
  { id: 2, name: 'Content', icon: FileText, description: 'Create your message' },
  { id: 3, name: 'Audience', icon: Users, description: 'Choose recipients' },
  { id: 4, name: 'Schedule', icon: Calendar, description: 'Set delivery time' },
  { id: 5, name: 'Review', icon: Check, description: 'Confirm and send' },
];

// Channel options
const channelOptions: Array<{
  type: CampaignType;
  name: string;
  description: string;
  icon: typeof Mail;
  color: string;
}> = [
  {
    type: 'email',
    name: 'Email Campaign',
    description: 'Send rich HTML emails with images and links',
    icon: Mail,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  {
    type: 'sms',
    name: 'SMS Campaign',
    description: 'Send short text messages to mobile phones',
    icon: Phone,
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  {
    type: 'whatsapp',
    name: 'WhatsApp Campaign',
    description: 'Send messages via WhatsApp Business',
    icon: MessageSquare,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
];

// Wizard state type
interface WizardState {
  // Step 1: Channel
  type: CampaignType;
  name: string;
  description: string;
  // Step 2: Content
  useTemplate: boolean;
  templateId: string | null;
  emailContent: EmailContent;
  smsContent: SmsContent;
  // Step 3: Audience
  audienceType: 'all' | 'list';
  contactListIds: string[];
  // Step 4: Schedule
  sendImmediately: boolean;
  scheduledAt: string;
  timezone: string;
}

const initialState: WizardState = {
  type: 'email',
  name: '',
  description: '',
  useTemplate: false,
  templateId: null,
  emailContent: {
    subject: '',
    previewText: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    htmlContent: '',
  },
  smsContent: {
    message: '',
    senderId: '',
  },
  audienceType: 'all',
  contactListIds: [],
  sendImmediately: true,
  scheduledAt: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export default function NewCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [state, setState] = useState<WizardState>(initialState);

  // Fetch templates filtered by campaign type (email, sms, whatsapp)
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', { type: state.type, limit: 50 }],
    queryFn: () => templatesApi.getTemplates({ type: state.type, limit: 50 }),
    enabled: currentStep === 2 || currentStep === 1, // Prefetch for step 2
  });

  // Fetch contact lists
  const { data: listsData } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: () => contactsApi.getLists(),
  });

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignData) => campaignsApi.createCampaign(data),
    onSuccess: (campaign) => {
      toast.success('Campaign created successfully!');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      router.push(`/campaigns/${campaign.id}`);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create campaign');
    },
  });

  const templates = templatesData?.data || [];
  const contactLists = listsData || [];

  // Update state helper
  const updateState = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Handle campaign type change - clear template selection
  const handleTypeChange = (newType: CampaignType) => {
    updateState({
      type: newType,
      templateId: null,
      useTemplate: false,
      // Reset content for new type
      emailContent: initialState.emailContent,
      smsContent: initialState.smsContent,
    });
  };

  // Navigation
  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return state.type && state.name.trim().length > 0;
      case 2:
        if (state.type === 'email') {
          return (
            state.emailContent.subject.trim().length > 0 &&
            state.emailContent.fromName.trim().length > 0 &&
            state.emailContent.fromEmail.trim().length > 0
          );
        }
        if (state.type === 'sms') {
          return state.smsContent.message.trim().length > 0;
        }
        return true;
      case 3:
        return state.audienceType === 'all' || state.contactListIds.length > 0;
      case 4:
        return state.sendImmediately || state.scheduledAt.length > 0;
      default:
        return true;
    }
  };

  const goNext = () => {
    if (currentStep < 5 && canGoNext()) {
      setCurrentStep((s) => s + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: Template) => {
    updateState({
      useTemplate: true,
      templateId: template.id,
    });

    if (state.type === 'email') {
      updateState({
        emailContent: {
          ...state.emailContent,
          subject: template.subject || '',
          htmlContent: template.content || '',
        },
      });
    } else if (state.type === 'sms') {
      updateState({
        smsContent: {
          ...state.smsContent,
          message: template.content || '',
        },
      });
    }
  };

  // Handle form submission
  const handleSubmit = () => {
    const campaignData: CreateCampaignData = {
      name: state.name,
      description: state.description || undefined,
      type: state.type,
      templateId: state.templateId || undefined,
      audienceType: state.audienceType,
      contactListIds: state.audienceType === 'list' ? state.contactListIds : undefined,
      sendImmediately: state.sendImmediately,
      scheduledAt: !state.sendImmediately ? state.scheduledAt : undefined,
      timezone: state.timezone,
    };

    // Add content based on type
    if (state.type === 'email') {
      campaignData.content = state.emailContent;
    } else if (state.type === 'sms') {
      campaignData.content = state.smsContent;
    }

    createMutation.mutate(campaignData);
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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="bg-background border-b">
        <div className="flex h-16 items-center gap-4 px-6">
          <Button variant="ghost" size="icon" onClick={() => router.push('/campaigns')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Create Campaign</h1>
            <p className="text-muted-foreground text-sm">
              Step {currentStep} of {steps.length}: {steps[currentStep - 1].description}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-muted/30 border-b px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2',
                  currentStep >= step.id ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium',
                    currentStep > step.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : currentStep === step.id
                        ? 'border-primary text-primary'
                        : 'border-muted-foreground/30'
                  )}
                >
                  {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                </div>
                <span className="hidden text-sm font-medium sm:inline">{step.name}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-4 h-0.5 w-12 sm:w-24',
                    currentStep > step.id ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {/* Step 1: Channel Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Choose Campaign Type</h2>
                <p className="text-muted-foreground mt-1">
                  Select the channel you want to use for this campaign
                </p>
              </div>

              <RadioGroup
                value={state.type}
                onValueChange={(value) => handleTypeChange(value as CampaignType)}
                className="grid gap-4 md:grid-cols-3"
              >
                {channelOptions.map((channel) => (
                  <Label
                    key={channel.type}
                    htmlFor={channel.type}
                    className={cn(
                      'cursor-pointer rounded-lg border-2 p-4 transition-colors',
                      state.type === channel.type
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/50'
                    )}
                  >
                    <RadioGroupItem value={channel.type} id={channel.type} className="sr-only" />
                    <div className={cn('mb-3 inline-flex rounded-lg p-2', channel.color)}>
                      <channel.icon className="h-5 w-5" />
                    </div>
                    <div className="font-medium">{channel.name}</div>
                    <p className="text-muted-foreground mt-1 text-sm">{channel.description}</p>
                  </Label>
                ))}
              </RadioGroup>

              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., January Newsletter"
                    value={state.name}
                    onChange={(e) => updateState({ name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this campaign..."
                    value={state.description}
                    onChange={(e) => updateState({ description: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Content */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Create Your Message</h2>
                <p className="text-muted-foreground mt-1">
                  Start from a template or create content from scratch
                </p>
              </div>

              {/* Content Source Selection */}
              <RadioGroup
                value={state.useTemplate ? 'template' : 'scratch'}
                onValueChange={(value) => {
                  if (value === 'scratch') {
                    updateState({ useTemplate: false, templateId: null });
                  } else {
                    updateState({ useTemplate: true });
                  }
                }}
                className="grid gap-4 md:grid-cols-2"
              >
                <Label
                  htmlFor="use-template"
                  className={cn(
                    'cursor-pointer rounded-lg border-2 p-4 transition-colors',
                    state.useTemplate
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <RadioGroupItem value="template" id="use-template" className="sr-only" />
                  <div className="mb-2 inline-flex rounded-lg bg-purple-100 p-2 text-purple-700">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="font-medium">Use Existing Template</div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Start with a pre-designed template and customize it
                  </p>
                </Label>

                <Label
                  htmlFor="from-scratch"
                  className={cn(
                    'cursor-pointer rounded-lg border-2 p-4 transition-colors',
                    !state.useTemplate
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <RadioGroupItem value="scratch" id="from-scratch" className="sr-only" />
                  <div className="mb-2 inline-flex rounded-lg bg-blue-100 p-2 text-blue-700">
                    <PenLine className="h-5 w-5" />
                  </div>
                  <div className="font-medium">Create from Scratch</div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Write your own content without a template
                  </p>
                </Label>
              </RadioGroup>

              {/* Template Selection */}
              {state.useTemplate && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Select a Template</Label>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {templates.length} {state.type} template{templates.length !== 1 ? 's' : ''}{' '}
                        available
                      </p>
                    </div>
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <a
                        href={`/templates/new?type=${state.type}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Create New {state.type.charAt(0).toUpperCase() + state.type.slice(1)}{' '}
                        Template
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  </div>

                  {templatesLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[1, 2, 3, 4].map((i) => (
                        <Card key={i} className="p-4">
                          <div className="space-y-2">
                            <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
                            <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : templates.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templates.map((template) => (
                        <Card
                          key={template.id}
                          className={cn(
                            'cursor-pointer transition-all',
                            state.templateId === template.id
                              ? 'border-primary ring-primary/20 ring-2'
                              : 'hover:border-muted-foreground/50 hover:shadow-sm'
                          )}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <CardHeader className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <CardTitle className="truncate text-sm">{template.name}</CardTitle>
                                {template.subject && (
                                  <CardDescription className="mt-1 truncate text-xs">
                                    {template.subject}
                                  </CardDescription>
                                )}
                              </div>
                              {state.templateId === template.id && (
                                <div className="bg-primary ml-2 rounded-full p-1">
                                  <Check className="text-primary-foreground h-3 w-3" />
                                </div>
                              )}
                            </div>
                            {template.thumbnailUrl && (
                              <div className="bg-muted mt-3 aspect-video overflow-hidden rounded">
                                <img
                                  src={
                                    template.thumbnailUrl.startsWith('http')
                                      ? template.thumbnailUrl
                                      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${template.thumbnailUrl}`
                                  }
                                  alt={template.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-8">
                        <FileText className="text-muted-foreground mb-3 h-10 w-10" />
                        <h3 className="font-medium">No templates available</h3>
                        <p className="text-muted-foreground mt-1 text-center text-sm">
                          Create a template first or switch to "Create from Scratch"
                        </p>
                        <Button variant="outline" className="mt-4" asChild>
                          <a href="/templates/new" target="_blank" rel="noopener noreferrer">
                            <Plus className="mr-2 h-4 w-4" />
                            Create Template
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {state.templateId && (
                    <p className="text-muted-foreground text-sm">
                      You can customize the template content below
                    </p>
                  )}
                </div>
              )}

              {/* Email Content */}
              {state.type === 'email' && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fromName">From Name *</Label>
                      <Input
                        id="fromName"
                        placeholder="Your Company"
                        value={state.emailContent.fromName}
                        onChange={(e) =>
                          updateState({
                            emailContent: { ...state.emailContent, fromName: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fromEmail">From Email *</Label>
                      <Input
                        id="fromEmail"
                        type="email"
                        placeholder="hello@company.com"
                        value={state.emailContent.fromEmail}
                        onChange={(e) =>
                          updateState({
                            emailContent: { ...state.emailContent, fromEmail: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line *</Label>
                    <Input
                      id="subject"
                      placeholder="Enter email subject..."
                      value={state.emailContent.subject}
                      onChange={(e) =>
                        updateState({
                          emailContent: { ...state.emailContent, subject: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="previewText">Preview Text (Optional)</Label>
                    <Input
                      id="previewText"
                      placeholder="Text shown in inbox preview..."
                      value={state.emailContent.previewText}
                      onChange={(e) =>
                        updateState({
                          emailContent: { ...state.emailContent, previewText: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="htmlContent">Email Content *</Label>
                    <Textarea
                      id="htmlContent"
                      placeholder="Enter your email content (HTML supported)..."
                      value={state.emailContent.htmlContent}
                      onChange={(e) =>
                        updateState({
                          emailContent: { ...state.emailContent, htmlContent: e.target.value },
                        })
                      }
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-muted-foreground text-xs">
                      Use variables like {'{{first_name}}'}, {'{{company}}'} for personalization
                    </p>
                  </div>
                </div>
              )}

              {/* SMS Content */}
              {state.type === 'sms' && (
                <div className="space-y-6">
                  <SenderIdSelector
                    value={state.smsContent.senderId || ''}
                    onChange={(value) =>
                      updateState({
                        smsContent: { ...state.smsContent, senderId: value },
                      })
                    }
                  />

                  <SmsMessageEditor
                    value={state.smsContent.message}
                    onChange={(value) =>
                      updateState({
                        smsContent: { ...state.smsContent, message: value },
                      })
                    }
                  />

                  {state.smsContent.message && (
                    <SmsCostEstimator
                      message={state.smsContent.message}
                      recipientCount={
                        state.audienceType === 'all' ? 1000 : state.contactListIds.length
                      }
                    />
                  )}
                </div>
              )}

              {/* WhatsApp - Placeholder */}
              {state.type === 'whatsapp' && (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <MessageSquare className="text-muted-foreground mb-4 h-12 w-12" />
                    <h3 className="font-medium">WhatsApp Templates</h3>
                    <p className="text-muted-foreground mt-1 text-center text-sm">
                      WhatsApp campaigns require pre-approved templates.
                      <br />
                      This feature will be available in the next update.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Audience */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Select Your Audience</h2>
                <p className="text-muted-foreground mt-1">Choose who will receive this campaign</p>
              </div>

              <RadioGroup
                value={state.audienceType}
                onValueChange={(value) => updateState({ audienceType: value as 'all' | 'list' })}
                className="space-y-3"
              >
                <Label
                  htmlFor="all"
                  className={cn(
                    'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                    state.audienceType === 'all'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <RadioGroupItem value="all" id="all" className="mt-1" />
                  <div className="flex-1">
                    <div className="font-medium">All Contacts</div>
                    <p className="text-muted-foreground text-sm">
                      Send to all contacts with a valid{' '}
                      {state.type === 'email' ? 'email' : 'phone number'}
                    </p>
                  </div>
                </Label>

                <Label
                  htmlFor="list"
                  className={cn(
                    'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                    state.audienceType === 'list'
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

              {/* List Selection */}
              {state.audienceType === 'list' && (
                <div className="space-y-3 pl-8">
                  <div className="flex items-center justify-between">
                    <Label>Select Lists</Label>
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <a href="/contacts/lists/new" target="_blank" rel="noopener noreferrer">
                        <Plus className="mr-1 h-3 w-3" />
                        Create New List
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                  {contactLists.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-6">
                        <Users className="text-muted-foreground mb-2 h-8 w-8" />
                        <p className="text-muted-foreground text-center text-sm">
                          No contact lists available yet.
                        </p>
                        <Button variant="outline" size="sm" className="mt-3" asChild>
                          <a href="/contacts/lists/new" target="_blank" rel="noopener noreferrer">
                            <Plus className="mr-2 h-4 w-4" />
                            Create Your First List
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {contactLists.map((list) => (
                        <Label
                          key={list.id}
                          className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                        >
                          <Checkbox
                            checked={state.contactListIds.includes(list.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                updateState({
                                  contactListIds: [...state.contactListIds, list.id],
                                });
                              } else {
                                updateState({
                                  contactListIds: state.contactListIds.filter(
                                    (id) => id !== list.id
                                  ),
                                });
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
            </div>
          )}

          {/* Step 4: Schedule */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Schedule Delivery</h2>
                <p className="text-muted-foreground mt-1">Choose when to send your campaign</p>
              </div>

              <RadioGroup
                value={state.sendImmediately ? 'now' : 'later'}
                onValueChange={(value) => updateState({ sendImmediately: value === 'now' })}
                className="space-y-3"
              >
                <Label
                  htmlFor="now"
                  className={cn(
                    'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                    state.sendImmediately
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
                      Campaign will start sending as soon as you confirm
                    </p>
                  </div>
                </Label>

                <Label
                  htmlFor="later"
                  className={cn(
                    'flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4',
                    !state.sendImmediately
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

              {/* Schedule Date/Time */}
              {!state.sendImmediately && (
                <div className="space-y-4 pl-8">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="scheduledAt">Date & Time *</Label>
                      <Input
                        id="scheduledAt"
                        type="datetime-local"
                        value={state.scheduledAt}
                        onChange={(e) => updateState({ scheduledAt: e.target.value })}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select
                        value={state.timezone}
                        onValueChange={(value) => updateState({ timezone: value })}
                      >
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
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Review Your Campaign</h2>
                <p className="text-muted-foreground mt-1">Double-check everything before sending</p>
              </div>

              <div className="space-y-4">
                {/* Campaign Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Campaign Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{state.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span className="font-medium capitalize">{state.type}</span>
                    </div>
                    {state.description && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Description</span>
                        <span className="text-right">{state.description}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Content Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Content</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {state.type === 'email' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subject</span>
                          <span className="font-medium">{state.emailContent.subject}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">From</span>
                          <span>
                            {state.emailContent.fromName} &lt;{state.emailContent.fromEmail}&gt;
                          </span>
                        </div>
                      </>
                    )}
                    {state.type === 'sms' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Message Length</span>
                          <span>
                            {getSmsSegments(state.smsContent.message).chars} characters (
                            {getSmsSegments(state.smsContent.message).segments} segment)
                          </span>
                        </div>
                        {state.smsContent.senderId && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sender ID</span>
                            <span>{state.smsContent.senderId}</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Audience */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Audience</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recipients</span>
                      <span className="font-medium">
                        {state.audienceType === 'all'
                          ? 'All contacts'
                          : `${state.contactListIds.length} list(s) selected`}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Schedule */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Delivery</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">When</span>
                      <span className="font-medium">
                        {state.sendImmediately
                          ? 'Send immediately'
                          : new Date(state.scheduledAt).toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-background border-t">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Button variant="outline" onClick={goBack} disabled={currentStep === 1}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/campaigns')}>
              Cancel
            </Button>
            {currentStep < 5 ? (
              <Button onClick={goNext} disabled={!canGoNext()}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>Creating...</>
                ) : state.sendImmediately ? (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Create & Send
                  </>
                ) : (
                  <>
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule Campaign
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
