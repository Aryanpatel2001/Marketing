'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ChevronRight,
  ChevronLeft,
  Download,
  RefreshCw,
  Users,
  Mail,
  Phone,
  Sparkles,
  Zap,
  UserPlus,
  FileCheck,
  Settings,
  Eye,
  Rocket,
  PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  contactsApi,
  ImportProgressEvent,
  ImportUploadResponse,
  DuplicateHandling,
} from '@/lib/api/contacts';

// Contact field definitions for mapping
const CONTACT_FIELDS = [
  { key: 'email', label: 'Email Address', required: false },
  { key: 'phone', label: 'Phone Number', required: false },
  { key: 'whatsappNumber', label: 'WhatsApp Number', required: false },
  { key: 'firstName', label: 'First Name', required: false },
  { key: 'lastName', label: 'Last Name', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'jobTitle', label: 'Job Title', required: false },
  { key: 'website', label: 'Website', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'country', label: 'Country', required: false },
  { key: 'postalCode', label: 'Postal Code', required: false },
  { key: 'tags', label: 'Tags (comma-separated)', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const;

type ContactFieldKey = (typeof CONTACT_FIELDS)[number]['key'];

interface ParsedData {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

interface FieldMapping {
  [csvColumn: string]: ContactFieldKey | 'skip';
}

interface ImportOptions {
  duplicateHandling: DuplicateHandling;
  duplicateCheckField: 'email' | 'phone' | 'both';
  updateExistingTags: boolean;
  defaultStatus: 'active' | 'unsubscribed';
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Step = 'upload' | 'mapping' | 'options' | 'preview' | 'importing' | 'complete';

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'mapping', label: 'Map Fields', icon: FileCheck },
  { key: 'options', label: 'Options', icon: Settings },
  { key: 'preview', label: 'Preview', icon: Eye },
  { key: 'importing', label: 'Import', icon: Rocket },
  { key: 'complete', label: 'Done', icon: PartyPopper },
];

// Server-side import uses larger batches (500) for better performance

// Animated counter component
function AnimatedCounter({ value, duration = 1500 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(easeOutQuart * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{displayValue.toLocaleString()}</span>;
}

// Confetti component for celebration
function Confetti() {
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomX = Math.random() * 100;
        const randomDelay = Math.random() * 3;
        const randomDuration = 3 + Math.random() * 2;
        const randomSize = 8 + Math.random() * 8;

        return (
          <div
            key={i}
            className="animate-confetti absolute"
            style={{
              left: `${randomX}%`,
              top: '-20px',
              width: `${randomSize}px`,
              height: `${randomSize}px`,
              backgroundColor: randomColor,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              animationDelay: `${randomDelay}s`,
              animationDuration: `${randomDuration}s`,
            }}
          />
        );
      })}
    </div>
  );
}

// Floating particles for import animation
function ImportingAnimation({
  progress,
  current,
  total,
  message,
  currentBatch,
  totalBatches,
}: {
  progress: number;
  current: number;
  total: number;
  message?: string;
  currentBatch?: number;
  totalBatches?: number;
}) {
  const defaultMessages = [
    'Reading contact data...',
    'Validating email addresses...',
    'Checking for duplicates...',
    'Creating new contacts...',
    'Updating records...',
    'Syncing with database...',
    'Almost there...',
    'Finishing up...',
  ];

  const messageIndex = Math.min(Math.floor(progress / 15), defaultMessages.length - 1);
  const displayMessage = message || defaultMessages[messageIndex];

  return (
    <div className="relative flex flex-col items-center justify-center py-12">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-primary/5 h-64 w-64 animate-pulse rounded-full" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="bg-primary/10 h-48 w-48 animate-pulse rounded-full"
          style={{ animationDelay: '0.5s' }}
        />
      </div>

      {/* Orbiting icons */}
      <div className="relative h-40 w-40">
        {/* Center icon */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="from-primary to-primary/80 flex h-20 w-20 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl">
            <Users className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Orbiting elements */}
        <div className="animate-spin-slow absolute inset-0">
          <div className="absolute -top-3 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg">
            <Mail className="h-5 w-5 text-white" />
          </div>
        </div>
        <div className="animate-spin-slow absolute inset-0" style={{ animationDelay: '-2s' }}>
          <div className="absolute -bottom-3 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg">
            <Phone className="h-5 w-5 text-white" />
          </div>
        </div>
        <div className="animate-spin-slow absolute inset-0" style={{ animationDelay: '-4s' }}>
          <div className="absolute -right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 shadow-lg">
            <UserPlus className="h-5 w-5 text-white" />
          </div>
        </div>
        <div className="animate-spin-slow absolute inset-0" style={{ animationDelay: '-6s' }}>
          <div className="absolute -left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Flying particles */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="bg-primary/60 animate-float-particle absolute h-2 w-2 rounded-full"
            style={{
              left: `${50 + Math.cos((i * Math.PI * 2) / 12) * 60}%`,
              top: `${50 + Math.sin((i * Math.PI * 2) / 12) * 60}%`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>

      {/* Progress info */}
      <div className="z-10 mt-12 space-y-4 text-center">
        <div className="text-primary flex items-center justify-center gap-2">
          <Zap className="h-5 w-5 animate-pulse" />
          <span className="text-lg font-medium">{displayMessage}</span>
        </div>

        {currentBatch && totalBatches && totalBatches > 0 && (
          <p className="text-muted-foreground text-xs">
            Batch {currentBatch} of {totalBatches}
          </p>
        )}

        <div className="from-primary to-primary/60 bg-gradient-to-r bg-clip-text text-4xl font-bold text-transparent">
          {progress}%
        </div>

        <p className="text-muted-foreground">
          Processing {current.toLocaleString()} of {total.toLocaleString()} contacts
        </p>

        <div className="mx-auto w-80">
          <div className="bg-muted h-3 overflow-hidden rounded-full">
            <div
              className="from-primary via-primary/80 to-primary relative h-full overflow-hidden rounded-full bg-gradient-to-r transition-all duration-300"
              style={{ width: `${progress}%` }}
            >
              <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Success celebration component
function SuccessCelebration({ result }: { result: ImportResult }) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      {showConfetti && <Confetti />}

      {/* Success header with animation */}
      <div className="flex flex-col items-center justify-center space-y-6 py-8">
        <div className="relative">
          {/* Pulsing rings */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-32 animate-ping rounded-full border-4 border-emerald-500/20" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="h-28 w-28 animate-ping rounded-full border-4 border-emerald-500/30"
              style={{ animationDelay: '0.3s' }}
            />
          </div>

          {/* Main success icon */}
          <div className="animate-bounce-in relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-2xl">
            <CheckCircle2 className="h-12 w-12 text-white" />
          </div>
        </div>

        <div
          className="animate-fade-in-up space-y-2 text-center"
          style={{ animationDelay: '0.3s' }}
        >
          <h2 className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-3xl font-bold text-transparent">
            Import Successful!
          </h2>
          <p className="text-muted-foreground text-lg">
            Your contacts have been imported successfully
          </p>
        </div>
      </div>

      {/* Stats cards with staggered animation */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div
          className="animate-scale-in rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 p-6 text-center shadow-lg dark:border-slate-700 dark:from-slate-800 dark:to-slate-900"
          style={{ animationDelay: '0.4s' }}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-500/10">
            <Users className="h-6 w-6 text-slate-600 dark:text-slate-400" />
          </div>
          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
            <AnimatedCounter value={result.total} />
          </p>
          <p className="text-muted-foreground mt-1 text-sm">Total Processed</p>
        </div>

        <div
          className="animate-scale-in rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6 text-center shadow-lg dark:border-emerald-800 dark:from-emerald-900/30 dark:to-green-900/30"
          style={{ animationDelay: '0.5s' }}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <UserPlus className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            <AnimatedCounter value={result.created} />
          </p>
          <p className="text-muted-foreground mt-1 text-sm">Created</p>
        </div>

        <div
          className="animate-scale-in rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 p-6 text-center shadow-lg dark:border-blue-800 dark:from-blue-900/30 dark:to-sky-900/30"
          style={{ animationDelay: '0.6s' }}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
            <RefreshCw className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            <AnimatedCounter value={result.updated} />
          </p>
          <p className="text-muted-foreground mt-1 text-sm">Updated</p>
        </div>

        <div
          className="animate-scale-in rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-6 text-center shadow-lg dark:border-amber-800 dark:from-amber-900/30 dark:to-yellow-900/30"
          style={{ animationDelay: '0.7s' }}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <X className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
            <AnimatedCounter value={result.skipped} />
          </p>
          <p className="text-muted-foreground mt-1 text-sm">Skipped</p>
        </div>
      </div>
    </div>
  );
}

export default function ImportContactsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [completedSteps, setCompletedSteps] = useState<Step[]>([]);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [_isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Server upload state
  const [uploadedFile, setUploadedFile] = useState<ImportUploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Mapping state
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});

  // Options state
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    duplicateHandling: 'skip',
    duplicateCheckField: 'email',
    updateExistingTags: false,
    defaultStatus: 'active',
  });

  // Import progress state
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    message: 'Starting import...',
    currentBatch: 0,
    totalBatches: 0,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-detect column mappings based on header names
  const autoDetectMappings = useCallback((headers: string[]): FieldMapping => {
    const mapping: FieldMapping = {};
    const normalizedHeaders = headers.map((h) =>
      h
        .toLowerCase()
        .trim()
        .replace(/[_\s-]+/g, '')
    );

    headers.forEach((header, index) => {
      const normalized = normalizedHeaders[index];

      if (normalized.includes('email') || normalized === 'e-mail') {
        mapping[header] = 'email';
      } else if (
        normalized.includes('phone') ||
        normalized.includes('mobile') ||
        normalized.includes('tel') ||
        normalized === 'phonenumber'
      ) {
        mapping[header] = 'phone';
      } else if (normalized.includes('whatsapp') || normalized.includes('wa')) {
        mapping[header] = 'whatsappNumber';
      } else if (
        normalized === 'firstname' ||
        normalized === 'first' ||
        normalized === 'fname' ||
        normalized === 'givenname'
      ) {
        mapping[header] = 'firstName';
      } else if (
        normalized === 'lastname' ||
        normalized === 'last' ||
        normalized === 'lname' ||
        normalized === 'surname' ||
        normalized === 'familyname'
      ) {
        mapping[header] = 'lastName';
      } else if (
        normalized.includes('company') ||
        normalized.includes('organization') ||
        normalized.includes('org')
      ) {
        mapping[header] = 'company';
      } else if (
        normalized.includes('title') ||
        normalized.includes('jobtitle') ||
        normalized.includes('position') ||
        normalized.includes('role')
      ) {
        mapping[header] = 'jobTitle';
      } else if (
        normalized.includes('website') ||
        normalized.includes('url') ||
        normalized === 'web'
      ) {
        mapping[header] = 'website';
      } else if (normalized === 'city' || normalized === 'town') {
        mapping[header] = 'city';
      } else if (normalized === 'state' || normalized === 'province' || normalized === 'region') {
        mapping[header] = 'state';
      } else if (normalized === 'country' || normalized === 'nation') {
        mapping[header] = 'country';
      } else if (
        normalized.includes('postal') ||
        normalized.includes('zip') ||
        normalized.includes('postcode')
      ) {
        mapping[header] = 'postalCode';
      } else if (
        normalized.includes('tag') ||
        normalized.includes('label') ||
        normalized.includes('group')
      ) {
        mapping[header] = 'tags';
      } else if (
        normalized.includes('note') ||
        normalized.includes('comment') ||
        normalized.includes('description')
      ) {
        mapping[header] = 'notes';
      } else {
        mapping[header] = 'skip';
      }
    });

    return mapping;
  }, []);

  // Upload file to server and get preview
  const uploadToServer = useCallback(
    async (selectedFile: File) => {
      setIsUploading(true);
      try {
        const response = await contactsApi.uploadImportFile(selectedFile);
        setUploadedFile(response);
        // Auto-detect mappings from server-provided headers
        setFieldMapping(autoDetectMappings(response.headers));
        setParsedData({
          headers: response.headers,
          rows: response.previewData,
          totalRows: response.totalRows,
        });
        toast.success(`File uploaded: ${response.totalRows.toLocaleString()} contacts found`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to upload file');
        setParseError('Failed to upload file to server');
      } finally {
        setIsUploading(false);
      }
    },
    [autoDetectMappings]
  );

  // Parse CSV file (fallback for client-side preview)
  const _parseFile = useCallback(
    (selectedFile: File) => {
      setIsParsing(true);
      setParseError(null);

      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        preview: 1000,
        complete: (results) => {
          if (results.errors.length > 0) {
            setParseError(`Parse error: ${results.errors[0].message}`);
            setIsParsing(false);
            return;
          }

          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];

          if (headers.length === 0) {
            setParseError('No columns found in the file');
            setIsParsing(false);
            return;
          }

          if (rows.length === 0) {
            setParseError('No data rows found in the file');
            setIsParsing(false);
            return;
          }

          let totalRows = rows.length;

          if (selectedFile.size > 100000) {
            Papa.parse(selectedFile, {
              header: true,
              skipEmptyLines: true,
              step: () => {},
              complete: (countResults) => {
                totalRows = countResults.data.length;
                setParsedData({ headers, rows, totalRows });
                setFieldMapping(autoDetectMappings(headers));
                setIsParsing(false);
              },
              error: () => {
                setParsedData({ headers, rows, totalRows: rows.length });
                setFieldMapping(autoDetectMappings(headers));
                setIsParsing(false);
              },
            });
          } else {
            setParsedData({ headers, rows, totalRows: rows.length });
            setFieldMapping(autoDetectMappings(headers));
            setIsParsing(false);
          }
        },
        error: (error) => {
          setParseError(`Failed to parse file: ${error.message}`);
          setIsParsing(false);
        },
      });
    },
    [autoDetectMappings]
  );

  // Handle file selection - upload to server for processing
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      const isValidType =
        validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv');

      if (!isValidType) {
        toast.error('Please upload a CSV file');
        return;
      }

      if (selectedFile.size > 50 * 1024 * 1024) {
        toast.error('File size must be less than 50MB');
        return;
      }

      setFile(selectedFile);
      // Upload to server for server-side processing
      uploadToServer(selectedFile);
    },
    [uploadToServer]
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        const isValidType = droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv');
        if (!isValidType) {
          toast.error('Please upload a CSV file');
          return;
        }
        if (droppedFile.size > 50 * 1024 * 1024) {
          toast.error('File size must be less than 50MB');
          return;
        }
        setFile(droppedFile);
        uploadToServer(droppedFile);
      }
    },
    [uploadToServer]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Update field mapping
  const updateMapping = (csvColumn: string, field: ContactFieldKey | 'skip') => {
    setFieldMapping((prev) => ({ ...prev, [csvColumn]: field }));
  };

  // Check if at least one contact method is mapped
  const hasContactMethod = () => {
    const mappedFields = Object.values(fieldMapping);
    return (
      mappedFields.includes('email') ||
      mappedFields.includes('phone') ||
      mappedFields.includes('whatsappNumber')
    );
  };

  // Transform row data based on mapping
  const _transformRow = (row: Record<string, string>): Record<string, unknown> => {
    const transformed: Record<string, unknown> = {};

    Object.entries(fieldMapping).forEach(([csvColumn, field]) => {
      if (field !== 'skip' && row[csvColumn]) {
        const value = row[csvColumn].trim();
        if (value) {
          if (field === 'tags') {
            transformed[field] = value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
          } else {
            transformed[field] = value;
          }
        }
      }
    });

    transformed.status = importOptions.defaultStatus;
    return transformed;
  };

  // Start server-side import with SSE progress
  const startServerImport = async () => {
    if (!uploadedFile) {
      toast.error('No file uploaded');
      return;
    }

    try {
      // Start the import job
      const job = await contactsApi.startImportJob({
        fileId: uploadedFile.fileId,
        filePath: uploadedFile.filePath,
        fileSize: uploadedFile.fileSize,
        totalRows: uploadedFile.totalRows,
        fieldMapping,
        duplicateHandling: importOptions.duplicateHandling,
        duplicateCheckField: importOptions.duplicateCheckField,
      });

      setCurrentJobId(job.id);
      setImportProgress({
        current: 0,
        total: uploadedFile.totalRows,
        percentage: 0,
        message: 'Starting import...',
        currentBatch: 0,
        totalBatches: 0,
      });

      // Connect to SSE for real-time progress
      const _token = localStorage.getItem('accessToken');
      const eventSource = new EventSource(`${API_URL}/api/v1/contacts/import/progress/${job.id}`, {
        withCredentials: false,
      });
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data: ImportProgressEvent = JSON.parse(event.data);

          setImportProgress({
            current: data.processedRows,
            total: data.totalRows,
            percentage: data.progress,
            message: data.message,
            currentBatch: data.currentBatch,
            totalBatches: data.totalBatches,
          });

          // Handle completion
          if (data.status === 'completed' || data.status === 'failed') {
            eventSource.close();
            eventSourceRef.current = null;

            if (data.status === 'completed') {
              setImportResult({
                total: data.totalRows,
                created: data.createdCount,
                updated: data.updatedCount,
                skipped: data.skippedCount,
                errors: [], // Will fetch errors separately if needed
              });
              setCurrentStep('complete');
              setCompletedSteps((prev) => [...prev, 'importing']);
            } else {
              toast.error('Import failed');
            }
          }
        } catch {
          // Silently ignore parse errors for SSE events
        }
      };

      eventSource.onerror = async () => {
        eventSource.close();
        eventSourceRef.current = null;

        // Fallback: poll for final status
        try {
          const finalJob = await contactsApi.getImportJobStatus(job.id);
          if (finalJob.status === 'completed') {
            setImportResult({
              total: finalJob.totalRows,
              created: finalJob.createdCount,
              updated: finalJob.updatedCount,
              skipped: finalJob.skippedCount,
              errors: finalJob.errors || [],
            });
            setCurrentStep('complete');
            setCompletedSteps((prev) => [...prev, 'importing']);
          } else if (finalJob.status === 'failed') {
            toast.error(finalJob.errorMessage || 'Import failed');
          }
        } catch {
          toast.error('Lost connection to import progress');
        }
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start import');
    }
  };

  // Download error report
  const downloadErrorReport = async () => {
    if (!currentJobId) return;
    try {
      const blob = await contactsApi.downloadImportErrors(currentJobId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `import-errors-${currentJobId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download error report');
    }
  };

  const goNext = () => {
    const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
    if (stepIndex < STEPS.length - 1) {
      setCompletedSteps((prev) => [...prev, currentStep]);
      if (currentStep === 'preview') {
        setCurrentStep('importing');
        startServerImport();
      } else {
        setCurrentStep(STEPS[stepIndex + 1].key);
      }
    }
  };

  const goBack = () => {
    const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
    if (stepIndex > 0) {
      setCompletedSteps((prev) => prev.filter((s) => s !== STEPS[stepIndex - 1].key));
      setCurrentStep(STEPS[stepIndex - 1].key);
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsedData(null);
    setParseError(null);
    setFieldMapping({});
    setImportProgress({
      current: 0,
      total: 0,
      percentage: 0,
      message: '',
      currentBatch: 0,
      totalBatches: 0,
    });
    setImportResult(null);
    setUploadedFile(null);
    setCurrentJobId(null);
    setCurrentStep('upload');
    setCompletedSteps([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      ['Email', 'First Name', 'Last Name', 'Phone', 'Company', 'City', 'Country', 'Tags'],
      [
        'john@example.com',
        'John',
        'Doe',
        '+1234567890',
        'Acme Inc',
        'New York',
        'USA',
        'customer,vip',
      ],
      [
        'jane@example.com',
        'Jane',
        'Smith',
        '+0987654321',
        'Tech Corp',
        'San Francisco',
        'USA',
        'lead',
      ],
    ];

    const csvContent = sampleData.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contacts_sample.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'upload':
        return file && uploadedFile && parsedData && !parseError && !isUploading;
      case 'mapping':
        return hasContactMethod();
      case 'options':
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  // Render step indicator
  const renderStepIndicator = () => (
    <div className="mb-10 flex items-center justify-center">
      {STEPS.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = currentStep === step.key;
        const isCompleted = completedSteps.includes(step.key);

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'relative flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-all duration-300',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-primary/25 scale-110 shadow-lg'
                    : isCompleted
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-muted-foreground/20 text-muted-foreground bg-muted/30'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <StepIcon className="h-5 w-5" />
                )}
                {isActive && (
                  <div className="border-primary absolute inset-0 animate-ping rounded-2xl border-2 opacity-30" />
                )}
              </div>
              <span
                className={cn(
                  'mt-2 hidden text-xs font-medium sm:block',
                  isActive
                    ? 'text-primary'
                    : isCompleted
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-1 w-12 rounded-full transition-all duration-500 sm:w-20',
                  isCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // Render upload step
  const renderUploadStep = () => (
    <Card className="from-card to-card/50 border-0 bg-gradient-to-b shadow-xl">
      <CardHeader className="pb-2 text-center">
        <div className="from-primary to-primary/80 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
          <Upload className="h-8 w-8 text-white" />
        </div>
        <CardTitle className="text-2xl">Upload Your Contacts</CardTitle>
        <CardDescription className="text-base">
          Upload a CSV file containing your contacts. Maximum file size is 50MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <div
          className={cn(
            'group relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300',
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : file
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="border-primary/20 absolute inset-0 h-20 w-20 animate-ping rounded-full border-4" />
                <div className="from-primary to-primary/80 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              </div>
              <p className="text-muted-foreground font-medium">
                Uploading and analyzing your file...
              </p>
            </div>
          ) : file && uploadedFile ? (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-bounce-in flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg">
                <FileSpreadsheet className="h-10 w-10 text-white" />
              </div>
              <div>
                <p className="text-lg font-semibold">{file.name}</p>
                <p className="text-muted-foreground text-sm">
                  {(file.size / 1024).toFixed(1)} KB
                  {parsedData && ` • ${parsedData.totalRows.toLocaleString()} contacts found`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  resetImport();
                }}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Remove file
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="bg-muted/50 group-hover:bg-primary/10 flex h-20 w-20 items-center justify-center rounded-2xl transition-colors">
                <Upload className="text-muted-foreground group-hover:text-primary h-10 w-10 transition-colors" />
              </div>
              <div>
                <p className="text-lg font-semibold">Drop your CSV file here</p>
                <p className="text-muted-foreground text-sm">or click to browse your files</p>
              </div>
            </div>
          )}
        </div>

        {parseError && (
          <Alert variant="destructive" className="animate-shake">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        <div className="from-muted/50 to-muted/30 border-border/50 flex items-center justify-between rounded-xl border bg-gradient-to-r p-5">
          <div>
            <p className="font-semibold">Need a template?</p>
            <p className="text-muted-foreground text-sm">
              Download our sample CSV to see the expected format
            </p>
          </div>
          <Button variant="outline" onClick={downloadSampleCSV} className="shrink-0 gap-2">
            <Download className="h-4 w-4" />
            Download Sample
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Render mapping step
  const renderMappingStep = () => (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
            <FileCheck className="h-5 w-5 text-white" />
          </div>
          Map Your Columns
        </CardTitle>
        <CardDescription>
          Match your CSV columns to contact fields. We've auto-detected some mappings for you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!hasContactMethod() && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Contact method required</AlertTitle>
              <AlertDescription>
                Please map at least one contact method (Email, Phone, or WhatsApp).
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-1/3 font-semibold">CSV Column</TableHead>
                  <TableHead className="w-1/3 font-semibold">Sample Data</TableHead>
                  <TableHead className="w-1/3 font-semibold">Map To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData?.headers.map((header, i) => (
                  <TableRow
                    key={header}
                    className="animate-fade-in"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <TableCell className="font-medium">{header}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {parsedData.rows[0]?.[header] || '-'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={fieldMapping[header] || 'skip'}
                        onValueChange={(value) =>
                          updateMapping(header, value as ContactFieldKey | 'skip')
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">
                            <span className="text-muted-foreground">Skip this column</span>
                          </SelectItem>
                          {CONTACT_FIELDS.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Render options step
  const renderOptionsStep = () => (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600">
            <Settings className="h-5 w-5 text-white" />
          </div>
          Import Options
        </CardTitle>
        <CardDescription>
          Configure how duplicates and existing contacts should be handled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-4">
          <Label className="text-base font-semibold">Duplicate Handling</Label>
          <RadioGroup
            value={importOptions.duplicateHandling}
            onValueChange={(value) =>
              setImportOptions((prev) => ({
                ...prev,
                duplicateHandling: value as ImportOptions['duplicateHandling'],
              }))
            }
            className="space-y-3"
          >
            {[
              {
                value: 'skip',
                title: 'Skip duplicates',
                desc: 'Existing contacts will not be modified',
              },
              {
                value: 'update',
                title: 'Update existing',
                desc: 'Overwrite data for existing contacts',
              },
              {
                value: 'create_new',
                title: 'Create as new',
                desc: 'Import all contacts, even if duplicates exist',
              },
            ].map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center space-x-3 rounded-xl border p-4 transition-all',
                  importOptions.duplicateHandling === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value={option.value} id={option.value} />
                <div>
                  <span className="font-medium">{option.title}</span>
                  <p className="text-muted-foreground text-sm">{option.desc}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {importOptions.duplicateHandling !== 'create_new' && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">Check Duplicates By</Label>
            <Select
              value={importOptions.duplicateCheckField}
              onValueChange={(value) =>
                setImportOptions((prev) => ({
                  ...prev,
                  duplicateCheckField: value as ImportOptions['duplicateCheckField'],
                }))
              }
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email Address</SelectItem>
                <SelectItem value="phone">Phone Number</SelectItem>
                <SelectItem value="both">Email or Phone</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {importOptions.duplicateHandling === 'update' && (
          <div className="bg-muted/50 flex items-center space-x-3 rounded-xl p-4">
            <Checkbox
              id="updateTags"
              checked={importOptions.updateExistingTags}
              onCheckedChange={(checked) =>
                setImportOptions((prev) => ({
                  ...prev,
                  updateExistingTags: checked as boolean,
                }))
              }
            />
            <Label htmlFor="updateTags" className="cursor-pointer font-normal">
              Replace existing tags (instead of merging)
            </Label>
          </div>
        )}

        <div className="space-y-4">
          <Label className="text-base font-semibold">Default Status</Label>
          <Select
            value={importOptions.defaultStatus}
            onValueChange={(value) =>
              setImportOptions((prev) => ({
                ...prev,
                defaultStatus: value as ImportOptions['defaultStatus'],
              }))
            }
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm">
            All imported contacts will have this status
          </p>
        </div>
      </CardContent>
    </Card>
  );

  // Render preview step
  const renderPreviewStep = () => {
    const previewRows = parsedData?.rows.slice(0, 5) || [];
    const mappedFields = Object.entries(fieldMapping).filter(([, field]) => field !== 'skip');

    return (
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600">
              <Eye className="h-5 w-5 text-white" />
            </div>
            Preview Import
          </CardTitle>
          <CardDescription>
            Review the first 5 contacts before importing {parsedData?.totalRows.toLocaleString()}{' '}
            total contacts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Total Contacts', value: parsedData?.totalRows || 0, color: 'slate' },
              { label: 'Fields Mapped', value: mappedFields.length, color: 'blue' },
              {
                label: 'Duplicate Handling',
                value: importOptions.duplicateHandling.replace('_', ' '),
                color: 'violet',
              },
              { label: 'Default Status', value: importOptions.defaultStatus, color: 'emerald' },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="bg-muted/50 animate-fade-in rounded-xl p-4 text-center"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <p className="text-2xl font-bold capitalize">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </p>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">#</TableHead>
                  {mappedFields.map(([csvColumn, field]) => (
                    <TableHead key={csvColumn}>
                      {CONTACT_FIELDS.find((f) => f.key === field)?.label || field}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, index) => (
                  <TableRow
                    key={index}
                    className="animate-fade-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <TableCell className="text-muted-foreground font-medium">{index + 1}</TableCell>
                    {mappedFields.map(([csvColumn]) => (
                      <TableCell key={csvColumn} className="max-w-[200px] truncate">
                        {row[csvColumn] || '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {(parsedData?.totalRows || 0) > 5 && (
            <p className="text-muted-foreground text-center text-sm">
              Showing 5 of {parsedData?.totalRows.toLocaleString()} contacts
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  // Render importing step
  const renderImportingStep = () => (
    <Card className="overflow-hidden border-0 shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Importing Your Contacts</CardTitle>
        <CardDescription className="text-base">
          Server-side processing for maximum performance. Please wait...
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportingAnimation
          progress={importProgress.percentage}
          current={importProgress.current}
          total={importProgress.total}
          message={importProgress.message}
          currentBatch={importProgress.currentBatch}
          totalBatches={importProgress.totalBatches}
        />
      </CardContent>
    </Card>
  );

  // Render complete step
  const renderCompleteStep = () => (
    <Card className="overflow-hidden border-0 shadow-xl">
      <CardContent className="pt-8">
        {importResult && <SuccessCelebration result={importResult} />}

        {(importResult?.errors && importResult.errors.length > 0) ||
        (importResult && importResult.skipped > 0) ? (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Some contacts were skipped or had errors</AlertTitle>
            <AlertDescription>
              <p className="mb-3">
                {importResult.errors.length > 0
                  ? `${importResult.errors.length} contacts had errors.`
                  : `${importResult.skipped} contacts were skipped.`}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mb-3 max-h-32 list-inside list-disc overflow-auto text-sm">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li>... and {importResult.errors.length - 5} more errors</li>
                  )}
                </ul>
              )}
              {currentJobId && (
                <Button variant="outline" size="sm" onClick={downloadErrorReport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Error Report
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div
          className="animate-fade-in mt-8 flex justify-center gap-4"
          style={{ animationDelay: '0.8s' }}
        >
          <Button variant="outline" onClick={resetImport} size="lg" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Import More
          </Button>
          <Button onClick={() => router.push('/contacts')} size="lg" className="gap-2 shadow-lg">
            <Users className="h-4 w-4" />
            View Contacts
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return renderUploadStep();
      case 'mapping':
        return renderMappingStep();
      case 'options':
        return renderOptionsStep();
      case 'preview':
        return renderPreviewStep();
      case 'importing':
        return renderImportingStep();
      case 'complete':
        return renderCompleteStep();
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Import Contacts</h1>
          <p className="text-muted-foreground">Import contacts from a CSV file</p>
        </div>
      </div>

      {renderStepIndicator()}
      {renderStepContent()}

      {/* Navigation buttons */}
      {currentStep !== 'importing' && currentStep !== 'complete' && (
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={currentStep === 'upload' ? () => router.back() : goBack}
            size="lg"
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {currentStep === 'upload' ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={goNext} disabled={!canProceed()} size="lg" className="gap-2 shadow-lg">
            {currentStep === 'preview' ? (
              <>
                <Rocket className="h-4 w-4" />
                Start Import
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
