'use client';

import { AlertCircle, ArrowLeft, CheckCircle2, Globe, Plus, Shield } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useComplianceStatus,
  useEUCountryRules,
  useRegisteredSenderIds,
  useRegisterEUSenderId,
} from '@/lib/hooks/use-sms-compliance';
import type { RegisterEUSenderIdDto, EUCountryRules } from '@/lib/api/sms-compliance';

const COUNTRY_FLAGS: Record<string, string> = {
  GB: '🇬🇧',
  FR: '🇫🇷',
  DE: '🇩🇪',
  ES: '🇪🇸',
  IT: '🇮🇹',
  NL: '🇳🇱',
  BE: '🇧🇪',
  AT: '🇦🇹',
  CH: '🇨🇭',
  SE: '🇸🇪',
  NO: '🇳🇴',
  DK: '🇩🇰',
  FI: '🇫🇮',
  IE: '🇮🇪',
  PL: '🇵🇱',
  PT: '🇵🇹',
};

interface RegisterSenderIdFormData {
  country: string;
  senderId: string;
  registrationId?: string;
}

function RegisterSenderIdDialog({
  open,
  onOpenChange,
  countries,
  registeredCountries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countries: EUCountryRules[];
  registeredCountries: string[];
}) {
  const registerMutation = useRegisterEUSenderId();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterSenderIdFormData>();

  const selectedCountry = watch('country');
  const selectedRules = countries.find((c) => c.countryCode === selectedCountry);

  const onSubmit = (data: RegisterSenderIdFormData) => {
    registerMutation.mutate(data as RegisterEUSenderIdDto, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    });
  };

  const availableCountries = countries.filter((c) => !registeredCountries.includes(c.countryCode));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register Sender ID</DialogTitle>
          <DialogDescription>Register a sender ID for an EU country</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="country">Country *</Label>
            <Select onValueChange={(value) => setValue('country', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent>
                {availableCountries.map((country) => (
                  <SelectItem key={country.countryCode} value={country.countryCode}>
                    <span className="flex items-center gap-2">
                      <span>{COUNTRY_FLAGS[country.countryCode] || '🌍'}</span>
                      <span>{country.countryName}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.country && <p className="text-destructive text-sm">{errors.country.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="senderId">Sender ID *</Label>
              {selectedRules && (
                <span className="text-muted-foreground text-xs">
                  Max {selectedRules.maxSenderIdLength} characters
                </span>
              )}
            </div>
            <Input
              id="senderId"
              placeholder="MYCOMPANY"
              maxLength={selectedRules?.maxSenderIdLength || 11}
              {...register('senderId', {
                required: 'Sender ID is required',
                pattern: {
                  value: /^[A-Za-z][A-Za-z0-9]*$/,
                  message: 'Must start with a letter and contain only alphanumeric characters',
                },
              })}
            />
            {errors.senderId && (
              <p className="text-destructive text-sm">{errors.senderId.message}</p>
            )}
            <p className="text-muted-foreground text-xs">Start with a letter, alphanumeric only</p>
          </div>

          {selectedRules?.senderIdRegistrationRequired && (
            <div className="space-y-2">
              <Label htmlFor="registrationId">Registration ID</Label>
              <Input
                id="registrationId"
                placeholder="Optional registration ID"
                {...register('registrationId')}
              />
              <p className="text-muted-foreground text-xs">
                {selectedRules.countryName} requires sender ID pre-registration
              </p>
            </div>
          )}

          {selectedRules?.specialRestrictions && selectedRules.specialRestrictions.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Country Restrictions</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  {selectedRules.specialRestrictions.map((restriction, i) => (
                    <li key={i}>{restriction}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Registering...' : 'Register'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CountryRulesCard({ rules }: { rules: EUCountryRules }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{COUNTRY_FLAGS[rules.countryCode] || '🌍'}</span>
          <div>
            <h4 className="font-medium">{rules.countryName}</h4>
            <p className="text-muted-foreground text-sm">Code: {rules.countryCode}</p>
          </div>
        </div>
        {rules.senderIdRegistrationRequired ? (
          <Badge variant="secondary">Registration Required</Badge>
        ) : (
          <Badge variant="outline">No Registration</Badge>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Max Sender ID Length</span>
          <span>{rules.maxSenderIdLength} characters</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Requires Opt-out</span>
          <span>{rules.requiresOptOutMention ? 'Yes' : 'No'}</span>
        </div>
        {rules.optOutText && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opt-out Text</span>
            <span className="text-right">{rules.optOutText}</span>
          </div>
        )}
      </div>

      {rules.specialRestrictions && rules.specialRestrictions.length > 0 && (
        <div className="bg-muted/50 mt-3 rounded-md p-2">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Special Restrictions:</p>
          <ul className="space-y-1 text-xs">
            {rules.specialRestrictions.map((restriction, i) => (
              <li key={i} className="flex items-start gap-1">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-yellow-500" />
                <span>{restriction}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function EUCompliancePage() {
  const { data: complianceStatus, isLoading: isLoadingStatus } = useComplianceStatus();
  const { data: countryRules, isLoading: isLoadingRules } = useEUCountryRules();
  const { data: registeredIds, isLoading: isLoadingIds } = useRegisteredSenderIds();

  const [showRegisterDialog, setShowRegisterDialog] = useState(false);

  const isLoading = isLoadingStatus || isLoadingRules || isLoadingIds;
  const registeredCountries = Object.keys(registeredIds || {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="EU GDPR Compliance"
        description="Manage sender ID registrations and GDPR requirements for European countries"
      >
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/settings/sms/compliance">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button onClick={() => setShowRegisterDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Register Sender ID
          </Button>
        </div>
      </PageHeader>

      {/* Status Card */}
      {isLoadingStatus ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : complianceStatus ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="text-primary h-5 w-5" />
                <CardTitle>EU Compliance Status</CardTitle>
              </div>
              {complianceStatus.eu.isCompliant ? (
                <Badge className="bg-green-500">Compliant</Badge>
              ) : (
                <Badge variant="secondary">Setup Required</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{complianceStatus.eu.details}</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">{registeredCountries.length} countries registered</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Registered Sender IDs */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Sender IDs</CardTitle>
          <CardDescription>Your sender IDs registered for each EU country</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingIds ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !registeredIds || Object.keys(registeredIds).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Globe className="text-muted-foreground mb-4 h-12 w-12" />
              <h3 className="text-lg font-medium">No sender IDs registered</h3>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Register sender IDs for EU countries to send SMS with your brand name.
              </p>
              <Button className="mt-4" onClick={() => setShowRegisterDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Register Sender ID
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Sender ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(registeredIds).map(([country, senderId]) => {
                    const rules = countryRules?.find((r) => r.countryCode === country);
                    return (
                      <TableRow key={country}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{COUNTRY_FLAGS[country] || '🌍'}</span>
                            <span>{rules?.countryName || country}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="bg-muted rounded px-2 py-1 text-sm">{senderId}</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-500">Active</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Country Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Country-Specific Rules</CardTitle>
          <CardDescription>SMS requirements and restrictions for each EU country</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRules ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : countryRules && countryRules.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {countryRules.map((rules) => (
                <CountryRulesCard key={rules.countryCode} rules={rules} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">No country rules available</p>
          )}
        </CardContent>
      </Card>

      {/* GDPR Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GDPR Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              The General Data Protection Regulation (GDPR) requires explicit consent for marketing
              communications to EU residents.
            </p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Include opt-out instructions in all messages</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Track consent for all recipients</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Provide data access and deletion options</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sender ID Guidelines</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Shield className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>Maximum 11 alphanumeric characters</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>Must start with a letter</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>No special characters allowed</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                <span>Some countries (UK, France) require pre-registration</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Register Dialog */}
      {countryRules && (
        <RegisterSenderIdDialog
          open={showRegisterDialog}
          onOpenChange={setShowRegisterDialog}
          countries={countryRules}
          registeredCountries={registeredCountries}
        />
      )}
    </div>
  );
}
