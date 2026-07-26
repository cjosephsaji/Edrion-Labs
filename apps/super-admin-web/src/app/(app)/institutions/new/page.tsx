'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import {
  AdministrativeDivisionSelect,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CountrySelect,
  Input,
  InternationalPhoneInput,
  Label,
  FieldError,
  TimezoneSelect,
  Select,
  subdivisionLabel,
} from '@edrion/ui';
import { createInstitutionSchema, type CreateInstitutionInput } from '@edrion/schemas';
import { InstitutionType, Currency } from '@edrion/shared-types';
import { ApiClientError, useCreateInstitution } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

export default function NewInstitutionPage() {
  const router = useRouter();
  const create = useCreateInstitution();

  const {
    register,
    handleSubmit,
    setError,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreateInstitutionInput>({
    resolver: zodResolver(createInstitutionSchema),
    defaultValues: { timezone: 'UTC', currency: Currency.USD, type: InstitutionType.School },
  });

  const country = watch('country');

  function onSubmit(values: CreateInstitutionInput) {
    create.mutate(values as unknown as Record<string, unknown>, {
      onSuccess: (inst) => router.push(`/institutions/${inst.id}`),
      onError: (e) => {
        if (e instanceof ApiClientError && e.details) {
          for (const [path, msgs] of Object.entries(e.details)) {
            setError(path as keyof CreateInstitutionInput, { message: msgs[0] });
          }
        }
      },
    });
  }

  return (
    <>
      <Topbar title="New institution" actions={<span />} />
      <div className="page-enter mx-auto max-w-2xl space-y-5 p-6">
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <Link href="/institutions" className="hover:text-text-primary">
            Institutions
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">New</span>
        </nav>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Institution details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name" error={errors.legalName?.message}>
                <Input {...register('legalName')} placeholder="Riverside Public School Trust" />
              </Field>
              <Field label="Display name" error={errors.displayName?.message}>
                <Input {...register('displayName')} placeholder="Riverside Public School" />
              </Field>
              <Field label="Type" error={errors.type?.message}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="capitalize"
                      options={Object.values(InstitutionType).map((t) => ({
                        value: t,
                        label: t.replace(/_/g, ' '),
                      }))}
                    />
                  )}
                />
              </Field>
              <Field label="Country" error={errors.country?.message}>
                <Controller
                  control={control}
                  name="country"
                  render={({ field }) => (
                    <CountrySelect
                      value={field.value}
                      invalid={!!errors.country}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
              <Field label={subdivisionLabel(country)} error={errors.region?.message}>
                <Controller
                  control={control}
                  name="region"
                  render={({ field }) => (
                    <AdministrativeDivisionSelect
                      countryCode={country}
                      value={field.value}
                      invalid={!!errors.region}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
              <Field label="Time zone" error={errors.timezone?.message}>
                <Controller
                  control={control}
                  name="timezone"
                  render={({ field }) => (
                    <TimezoneSelect
                      countryCode={country}
                      value={field.value}
                      invalid={!!errors.timezone}
                      suggestDetected
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
              <Field label="Currency" error={errors.currency?.message}>
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      options={Object.values(Currency).map((c) => ({ value: c, label: c }))}
                    />
                  )}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Primary contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={errors.primaryContact?.name?.message}>
                <Input {...register('primaryContact.name')} placeholder="Priya Menon" />
              </Field>
              <Field label="Email" error={errors.primaryContact?.email?.message}>
                <Input {...register('primaryContact.email')} type="email" placeholder="admin@school.edu" />
              </Field>
              <Field label="Phone" error={errors.primaryContact?.phone?.message}>
                <Controller
                  control={control}
                  name="primaryContact.phone"
                  render={({ field }) => (
                    <InternationalPhoneInput
                      value={field.value}
                      defaultCountry={country}
                      invalid={!!errors.primaryContact?.phone}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
            </CardContent>
          </Card>

          {create.isError && !errors.legalName && (
            <FieldError>
              {create.error instanceof ApiClientError
                ? create.error.message
                : 'Could not create institution.'}
            </FieldError>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push('/institutions')}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!isDirty}>
              Create institution
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}
