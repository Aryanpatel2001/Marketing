'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { usePlanLimits, useRegisterSenderId } from '@/lib/hooks/use-sms-senders';

interface RegisterSenderIdModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormData {
  senderId: string;
  friendlyName: string;
}

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
];

export function RegisterSenderIdModal({ open, onOpenChange }: RegisterSenderIdModalProps) {
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['US']);

  const { data: planLimits } = usePlanLimits();
  const registerMutation = useRegisterSenderId();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormData>({
    defaultValues: {
      senderId: '',
      friendlyName: '',
    },
  });

  const senderId = watch('senderId');

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const onSubmit = async (data: FormData) => {
    if (selectedCountries.length === 0) return;

    await registerMutation.mutateAsync({
      senderId: data.senderId.toUpperCase(),
      countries: selectedCountries,
      friendlyName: data.friendlyName || undefined,
    });

    // Reset and close
    reset();
    setSelectedCountries(['US']);
    onOpenChange(false);
  };

  const handleClose = () => {
    reset();
    setSelectedCountries(['US']);
    onOpenChange(false);
  };

  const canRegister = planLimits?.canRegisterSenderId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Sender ID</DialogTitle>
          <DialogDescription>
            Create an alphanumeric sender ID for better brand recognition. Sender IDs require admin
            approval before activation.
          </DialogDescription>
        </DialogHeader>

        {!canRegister && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Sender IDs are only available on Enterprise plans. Please upgrade your plan to use
              this feature.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Sender ID Input */}
          <div className="space-y-2">
            <Label htmlFor="senderId">Sender ID *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="senderId"
                placeholder="MYCOMPANY"
                maxLength={11}
                {...register('senderId', {
                  required: 'Sender ID is required',
                  minLength: {
                    value: 3,
                    message: 'Minimum 3 characters',
                  },
                  maxLength: {
                    value: 11,
                    message: 'Maximum 11 characters',
                  },
                  pattern: {
                    value: /^[a-zA-Z0-9]+$/,
                    message: 'Only alphanumeric characters allowed',
                  },
                })}
                className={`uppercase ${errors.senderId ? 'border-red-500' : ''}`}
                disabled={!canRegister}
              />
              {senderId && (
                <Badge variant="outline" className="shrink-0">
                  {senderId.length}/11
                </Badge>
              )}
            </div>
            {errors.senderId && <p className="text-sm text-red-500">{errors.senderId.message}</p>}
            <p className="text-muted-foreground text-xs">
              3-11 characters, alphanumeric only. This will appear as the sender on recipient
              devices.
            </p>
          </div>

          {/* Friendly Name */}
          <div className="space-y-2">
            <Label htmlFor="friendlyName">Friendly Name (optional)</Label>
            <Input
              id="friendlyName"
              placeholder="Main Brand Sender"
              {...register('friendlyName')}
              disabled={!canRegister}
            />
            <p className="text-muted-foreground text-xs">A descriptive name for your reference</p>
          </div>

          {/* Country Selection */}
          <div className="space-y-2">
            <Label>Target Countries *</Label>
            <p className="text-muted-foreground text-xs">
              Select the countries where you want to use this sender ID. Some countries have
              specific regulations.
            </p>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2">
                {COUNTRIES.map((country) => (
                  <label
                    key={country.code}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md p-2"
                  >
                    <Checkbox
                      checked={selectedCountries.includes(country.code)}
                      onCheckedChange={() => toggleCountry(country.code)}
                      disabled={!canRegister}
                    />
                    <span className="text-sm">{country.name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {country.code}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
            {selectedCountries.length === 0 && (
              <p className="text-sm text-red-500">Select at least one country</p>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-muted/50 rounded-lg border p-4">
            <h4 className="mb-2 font-medium">Important Information</h4>
            <ul className="text-muted-foreground space-y-1 text-sm">
              <li>• Sender IDs require admin approval (1-3 business days)</li>
              <li>• Some countries may require additional documentation</li>
              <li>• Recipients cannot reply to messages from Sender IDs</li>
              <li>• Not all carriers support alphanumeric sender IDs</li>
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !canRegister || selectedCountries.length === 0 || registerMutation.isPending
              }
            >
              {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for Approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
