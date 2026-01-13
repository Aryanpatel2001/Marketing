'use client';

import { AlertCircle, Loader2, Phone } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  useAddExistingNumber,
  usePlanLimits,
  useSetupTrialNumber,
} from '@/lib/hooks/use-sms-senders';

interface AddExistingNumberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormData {
  phoneNumber: string;
  friendlyName: string;
}

export function AddExistingNumberModal({ open, onOpenChange }: AddExistingNumberModalProps) {
  const [_useAutoSetup, setUseAutoSetup] = useState(false);

  const { data: planLimits } = usePlanLimits();
  const addExistingMutation = useAddExistingNumber();
  const setupTrialMutation = useSetupTrialNumber();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      phoneNumber: '',
      friendlyName: '',
    },
  });

  const canAddNumber = planLimits?.canPurchaseDedicated;

  const handleAddNumber = async (data: FormData) => {
    await addExistingMutation.mutateAsync({
      phoneNumber: data.phoneNumber,
      friendlyName: data.friendlyName || undefined,
    });

    reset();
    onOpenChange(false);
  };

  const handleAutoSetup = async () => {
    await setupTrialMutation.mutateAsync();
    reset();
    onOpenChange(false);
  };

  const handleClose = () => {
    reset();
    setUseAutoSetup(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Existing Number</DialogTitle>
          <DialogDescription>
            Add your Twilio trial number or an existing phone number to use for SMS campaigns.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Trial Account?</AlertTitle>
          <AlertDescription className="text-sm">
            If you&apos;re using a Twilio trial account, you can add your trial number here.
            Remember that trial accounts can only send SMS to verified phone numbers.
          </AlertDescription>
        </Alert>

        {!canAddNumber && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              You have reached the maximum number of dedicated numbers for your plan. Upgrade your
              plan to add more numbers.
            </p>
          </div>
        )}

        {/* Auto Setup Option */}
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium">Auto Setup from Environment</p>
              <p className="text-muted-foreground text-sm">
                Use the TWILIO_PHONE_NUMBER configured in your server
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoSetup}
              disabled={!canAddNumber || setupTrialMutation.isPending}
            >
              {setupTrialMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Setup'
              )}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">Or enter manually</span>
            </div>
          </div>
        </div>

        {/* Manual Entry Form */}
        <form onSubmit={handleSubmit(handleAddNumber)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <div className="relative">
              <Phone className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                id="phoneNumber"
                placeholder="+1234567890"
                className="pl-10"
                {...register('phoneNumber', {
                  required: 'Phone number is required',
                  pattern: {
                    value: /^\+[1-9]\d{1,14}$/,
                    message: 'Enter a valid E.164 format (e.g., +1234567890)',
                  },
                })}
              />
            </div>
            {errors.phoneNumber && (
              <p className="text-destructive text-sm">{errors.phoneNumber.message}</p>
            )}
            <p className="text-muted-foreground text-xs">
              Enter your phone number in E.164 format (e.g., +1234567890)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="friendlyName">Friendly Name (optional)</Label>
            <Input id="friendlyName" placeholder="My Trial Number" {...register('friendlyName')} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canAddNumber || addExistingMutation.isPending}>
              {addExistingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Number
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
