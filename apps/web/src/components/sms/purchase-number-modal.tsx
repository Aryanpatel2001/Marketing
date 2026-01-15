'use client';

import { Loader2, Phone, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AvailableNumber, SearchAvailableNumbersParams } from '@/lib/api/sms';
import { useAvailableNumbers, usePlanLimits, usePurchaseNumber } from '@/lib/hooks/use-sms-senders';

interface PurchaseNumberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchForm {
  country: string;
  type: 'local' | 'mobile' | 'toll_free';
  areaCode: string;
  contains: string;
}

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
];

const NUMBER_TYPES = [
  { value: 'local', label: 'Local Number', price: '$1/month' },
  { value: 'mobile', label: 'Mobile Number', price: '$1/month' },
  { value: 'toll_free', label: 'Toll-Free Number', price: '$2/month' },
] as const;

export function PurchaseNumberModal({ open, onOpenChange }: PurchaseNumberModalProps) {
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(null);
  const [friendlyName, setFriendlyName] = useState('');
  const [searchParams, setSearchParams] = useState<SearchAvailableNumbersParams | null>(null);

  const { data: _planLimits } = usePlanLimits();
  const purchaseMutation = usePurchaseNumber();

  const { register, handleSubmit, watch, setValue, reset } = useForm<SearchForm>({
    defaultValues: {
      country: 'US',
      type: 'local',
      areaCode: '',
      contains: '',
    },
  });

  const country = watch('country');
  const type = watch('type');

  const {
    data: availableNumbers,
    isLoading: isSearching,
    isFetched,
  } = useAvailableNumbers(searchParams!, !!searchParams);

  const canPurchase =
    type === 'toll_free' ? planLimits?.canPurchaseTollFree : planLimits?.canPurchaseDedicated;

  const handleSearch = (data: SearchForm) => {
    setSelectedNumber(null);
    setSearchParams({
      country: data.country,
      type: data.type,
      areaCode: data.areaCode || undefined,
      contains: data.contains || undefined,
      limit: 20,
    });
  };

  const handlePurchase = async () => {
    if (!selectedNumber) return;

    await purchaseMutation.mutateAsync({
      phoneNumber: selectedNumber.phoneNumber,
      friendlyName: friendlyName || undefined,
    });

    // Reset and close
    setSelectedNumber(null);
    setFriendlyName('');
    setSearchParams(null);
    reset();
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedNumber(null);
    setFriendlyName('');
    setSearchParams(null);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Purchase Phone Number</DialogTitle>
          <DialogDescription>
            Search for available phone numbers and purchase one for your SMS campaigns.
          </DialogDescription>
        </DialogHeader>

        {!canPurchase && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              You have reached the maximum number of{' '}
              {type === 'toll_free' ? 'toll-free' : 'dedicated'} numbers for your plan. Upgrade your
              plan to purchase more numbers.
            </p>
          </div>
        )}

        {/* Search Form */}
        <form onSubmit={handleSubmit(handleSearch)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select value={country} onValueChange={(value) => setValue('country', value)}>
                <SelectTrigger id="country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Number Type</Label>
              <Select value={type} onValueChange={(value: any) => setValue('type', value)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label} ({t.price})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="areaCode">Area Code (optional)</Label>
              <Input id="areaCode" placeholder="415" maxLength={3} {...register('areaCode')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contains">Contains (optional)</Label>
              <Input id="contains" placeholder="777" maxLength={7} {...register('contains')} />
            </div>
          </div>

          <Button type="submit" disabled={isSearching || !canPurchase} className="w-full">
            {isSearching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Search Available Numbers
          </Button>
        </form>

        {/* Results */}
        {isFetched && (
          <div className="space-y-2">
            <Label>Available Numbers</Label>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border">
              {availableNumbers && availableNumbers.length > 0 ? (
                <div className="divide-y">
                  {availableNumbers.map((number) => (
                    <button
                      key={number.phoneNumber}
                      type="button"
                      onClick={() => setSelectedNumber(number)}
                      className={`hover:bg-muted/50 flex w-full items-center justify-between p-3 text-left ${
                        selectedNumber?.phoneNumber === number.phoneNumber ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Phone className="text-muted-foreground h-4 w-4" />
                        <div>
                          <p className="font-mono font-medium">{number.phoneNumber}</p>
                          <p className="text-muted-foreground text-sm">
                            {number.region}, {number.country}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {number.capabilities.mms && (
                          <Badge variant="outline" className="text-xs">
                            MMS
                          </Badge>
                        )}
                        <span className="text-sm font-medium">${number.monthlyPrice}/mo</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    No numbers available. Try different search criteria.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected Number Details */}
        {selectedNumber && (
          <div className="bg-muted/50 space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Selected Number</p>
                <p className="font-mono text-lg font-medium">{selectedNumber.phoneNumber}</p>
              </div>
              <Badge variant="secondary">${selectedNumber.monthlyPrice}/month</Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="friendlyName">Friendly Name (optional)</Label>
              <Input
                id="friendlyName"
                placeholder="Marketing Main Line"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} disabled={!selectedNumber || purchaseMutation.isPending}>
            {purchaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Purchase Number
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
