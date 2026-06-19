"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RangeCadence = "yearly" | "monthly";

type ContributionRange = {
  id: string;
  fromAge: number;
  toAge: number;
  yearlyAmount: number;
  cadence: RangeCadence;
};

type EmployerMatchRange = {
  id: string;
  fromAge: number;
  toAge: number;
  income: number;
  matchPercent: number;
  cadence: RangeCadence;
};

type DebtPaymentRange = {
  id: string;
  fromAge: number;
  toAge: number;
  hasToAge: boolean;
  amount: number;
  cadence: RangeCadence;
};

type ProjectedBucket = {
  grossValue: number;
  taxableOnWithdrawal: number;
  taxFreeOnWithdrawal: number;
  investedValue: number;
};

type Debt = {
  id: string;
  value: number;
  interest: number;
  paymentRanges: DebtPaymentRange[];
};

type VisibleCardId = "brokerage" | "k401" | "rothIra" | "hsa" | "debt";

type ProjectionInputs = {
  currentAge: number;
  retirementAge: number;
  endAge: number;
  startAge: number;
  startingValue: number;
  annualReturn: number;
  ranges: ContributionRange[];
  yearlyRetirementExpense: number;
  taxTreatment: "brokerage" | "taxable" | "taxFree";
  contributionOverride?: (age: number, month: number) => number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

const DEFAULT_RANGE = (amount = 0, fromAge = 30, toAge = 65): ContributionRange => ({
  id: crypto.randomUUID(),
  yearlyAmount: amount,
  fromAge,
  toAge,
  cadence: "yearly"
});

const DEFAULT_EMPLOYER_MATCH_RANGE = (fromAge = 30, toAge = 65): EmployerMatchRange => ({
  id: crypto.randomUUID(),
  fromAge,
  toAge,
  income: 0,
  matchPercent: 0,
  cadence: "yearly"
});

const DEFAULT_DEBT_PAYMENT_RANGE = (fromAge = 30): DebtPaymentRange => ({
  id: crypto.randomUUID(),
  fromAge,
  toAge: fromAge + 1,
  hasToAge: false,
  amount: 0,
  cadence: "yearly"
});

const DEFAULT_DEBT = (): Debt => ({
  id: crypto.randomUUID(),
  value: 0,
  interest: 0,
  paymentRanges: []
});

const VISIBLE_CARD_OPTIONS = [
  { value: "brokerage", label: "Brokerage" },
  { value: "k401", label: "401k" },
  { value: "rothIra", label: "Roth IRA" },
  { value: "hsa", label: "HSA" },
  { value: "debt", label: "Debt" }
] satisfies Array<{ value: VisibleCardId; label: string }>;

function clampNumber(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function activeYearlyAmount(ranges: ContributionRange[], age: number) {
  return ranges.reduce((total, range) => {
    if (range.toAge <= range.fromAge) {
      return total;
    }

    if (age >= range.fromAge && age < range.toAge) {
      const amount = Number.isFinite(range.yearlyAmount) ? range.yearlyAmount : 0;
      return total + (range.cadence === "monthly" ? amount * 12 : amount);
    }

    return total;
  }, 0);
}

function activeRangePayment(ranges: ContributionRange[], age: number, month: number) {
  return ranges.reduce((total, range) => {
    if (range.toAge <= range.fromAge || age < range.fromAge || age >= range.toAge) {
      return total;
    }

    const amount = Number.isFinite(range.yearlyAmount) ? range.yearlyAmount : 0;
    return total + (range.cadence === "monthly" ? amount : month % 12 === 0 ? amount : 0);
  }, 0);
}

function activeDebtPayment(ranges: DebtPaymentRange[], age: number, month: number) {
  return ranges.reduce((total, range) => {
    const hasToAge = range.hasToAge === true;

    if (age < range.fromAge || (hasToAge && (range.toAge <= range.fromAge || age >= range.toAge))) {
      return total;
    }

    const amount = Number.isFinite(range.amount) ? range.amount : 0;
    return total + (range.cadence === "monthly" ? amount : month % 12 === 0 ? amount : 0);
  }, 0);
}

function activeEmployerMatchPayment(ranges: EmployerMatchRange[], age: number, month: number) {
  return ranges.reduce((total, range) => {
    if (range.toAge <= range.fromAge || age < range.fromAge || age >= range.toAge) {
      return total;
    }

    const annualMatch = clampNumber(range.income) * (clampNumber(range.matchPercent, 0, 100) / 100);
    return total + (range.cadence === "monthly" ? annualMatch / 12 : month % 12 === 0 ? annualMatch : 0);
  }, 0);
}

function annual401kEmployeeLimit(age: number) {
  const baseLimit = 24500;

  if (age >= 60 && age <= 63) {
    return baseLimit + 11250;
  }

  if (age >= 50) {
    return baseLimit + 8000;
  }

  return baseLimit;
}

function annualRothIraLimit(age: number) {
  return age >= 50 ? 8600 : 7500;
}

function annualHsaLimit(age: number, coverage: "self" | "family") {
  const baseLimit = coverage === "family" ? 8750 : 4400;
  return age >= 55 ? baseLimit + 1000 : baseLimit;
}

function resolve401kEmployeeContributions({
  age,
  traditionalRanges,
  rothRanges,
  traditionalMax,
  rothMax
}: {
  age: number;
  traditionalRanges: ContributionRange[];
  rothRanges: ContributionRange[];
  traditionalMax: boolean;
  rothMax: boolean;
}) {
  const limit = annual401kEmployeeLimit(age);
  const intendedTraditional = activeYearlyAmount(traditionalRanges, age);
  const intendedRoth = activeYearlyAmount(rothRanges, age);

  if (traditionalMax && rothMax) {
    return {
      traditional: limit / 2,
      roth: limit / 2,
      wasCapped: false
    };
  }

  if (traditionalMax) {
    const roth = Math.min(intendedRoth, limit);
    return {
      traditional: Math.max(limit - roth, 0),
      roth,
      wasCapped: intendedRoth > limit
    };
  }

  if (rothMax) {
    const traditional = Math.min(intendedTraditional, limit);
    return {
      traditional,
      roth: Math.max(limit - traditional, 0),
      wasCapped: intendedTraditional > limit
    };
  }

  const traditional = Math.min(intendedTraditional, limit);
  const roth = Math.min(intendedRoth, Math.max(limit - traditional, 0));

  return {
    traditional,
    roth,
    wasCapped: intendedTraditional + intendedRoth > limit
  };
}

function resolve401kEmployeePayment({
  age,
  month,
  traditionalRanges,
  rothRanges,
  traditionalMax,
  rothMax
}: {
  age: number;
  month: number;
  traditionalRanges: ContributionRange[];
  rothRanges: ContributionRange[];
  traditionalMax: boolean;
  rothMax: boolean;
}) {
  const annualContributions = resolve401kEmployeeContributions({
    age,
    traditionalRanges,
    rothRanges,
    traditionalMax,
    rothMax
  });

  if (traditionalMax || rothMax) {
    return {
      traditional: month % 12 === 0 ? annualContributions.traditional : 0,
      roth: month % 12 === 0 ? annualContributions.roth : 0
    };
  }

  const intendedTraditional = activeYearlyAmount(traditionalRanges, age);
  const intendedRoth = activeYearlyAmount(rothRanges, age);
  const traditionalScale = intendedTraditional > 0 ? annualContributions.traditional / intendedTraditional : 0;
  const rothScale = intendedRoth > 0 ? annualContributions.roth / intendedRoth : 0;

  return {
    traditional: activeRangePayment(traditionalRanges, age, month) * traditionalScale,
    roth: activeRangePayment(rothRanges, age, month) * rothScale
  };
}

function projectAccount({
  currentAge,
  retirementAge,
  endAge,
  startAge,
  startingValue,
  annualReturn,
  ranges,
  yearlyRetirementExpense,
  taxTreatment,
  contributionOverride
}: ProjectionInputs): ProjectedBucket {
  const safeCurrentAge = clampNumber(currentAge);
  const safeRetirementAge = clampNumber(retirementAge);
  const safeEndAge = clampNumber(endAge);
  const safeStartAge = clampNumber(startAge);
  const projectionStartAge = Math.max(safeCurrentAge, safeStartAge);
  const monthlyRate = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
  const months = Math.max(0, Math.round((safeEndAge - projectionStartAge) * 12));
  let grossValue = safeEndAge <= safeStartAge ? clampNumber(startingValue) : clampNumber(startingValue);
  let basis = taxTreatment === "brokerage" ? grossValue : 0;
  let investedValue = clampNumber(startingValue);

  for (let month = 0; month < months; month += 1) {
    const age = Math.floor(projectionStartAge + month / 12);
    const contribution =
      age < safeRetirementAge
        ? contributionOverride
          ? contributionOverride(age, month)
          : activeRangePayment(ranges, age, month)
        : 0;
    const annualExpense = age >= safeRetirementAge ? clampNumber(yearlyRetirementExpense) : 0;
    const investment = Math.max(Number.isFinite(contribution) ? contribution : 0, 0);
    const monthlyContribution =
      (Number.isFinite(contribution) ? contribution : 0) -
      (Number.isFinite(annualExpense) ? annualExpense : 0) / 12;

    investedValue += investment;
    grossValue += monthlyContribution;

    if (taxTreatment === "brokerage") {
      basis = clampNumber(basis + monthlyContribution, 0, Math.max(grossValue, 0));
    }

    if (grossValue <= 0) {
      grossValue = 0;
      basis = 0;
      continue;
    }

    grossValue *= 1 + monthlyRate;
    grossValue = Math.max(grossValue, 0);

    if (taxTreatment === "brokerage") {
      basis = Math.min(basis, grossValue);
    }
  }

  if (taxTreatment === "taxable") {
    return {
      grossValue,
      taxableOnWithdrawal: grossValue,
      taxFreeOnWithdrawal: 0,
      investedValue
    };
  }

  if (taxTreatment === "taxFree") {
    return {
      grossValue,
      taxableOnWithdrawal: 0,
      taxFreeOnWithdrawal: grossValue,
      investedValue
    };
  }

  const taxableGrowth = Math.max(grossValue - basis, 0);

  return {
    grossValue,
    taxableOnWithdrawal: taxableGrowth,
    taxFreeOnWithdrawal: grossValue - taxableGrowth,
    investedValue
  };
}

function combineBuckets(buckets: ProjectedBucket[]): ProjectedBucket {
  return buckets.reduce(
    (total, bucket) => ({
      grossValue: total.grossValue + bucket.grossValue,
      taxableOnWithdrawal: total.taxableOnWithdrawal + bucket.taxableOnWithdrawal,
      taxFreeOnWithdrawal: total.taxFreeOnWithdrawal + bucket.taxFreeOnWithdrawal,
      investedValue: total.investedValue + bucket.investedValue
    }),
    { grossValue: 0, taxableOnWithdrawal: 0, taxFreeOnWithdrawal: 0, investedValue: 0 }
  );
}

function projectSingleDebt({
  debt,
  currentAge,
  endAge
}: {
  debt: Debt;
  currentAge: number;
  endAge: number;
}) {
  const safeCurrentAge = clampNumber(currentAge);
  const months = Math.max(0, Math.round((clampNumber(endAge) - safeCurrentAge) * 12));
  const monthlyRate = Math.pow(1 + clampNumber(debt.interest) / 100, 1 / 12) - 1;
  let balance = clampNumber(debt.value);
  let paymentsMade = 0;
  let payoffMonth: number | null = balance <= 0 ? 0 : null;

  for (let month = 0; month < months; month += 1) {
    const age = Math.floor(safeCurrentAge + month / 12);
    const payment = clampNumber(activeDebtPayment(debt.paymentRanges ?? [], age, month));
    const appliedPayment = Math.min(payment, balance);

    paymentsMade += appliedPayment;
    balance = Math.max(balance - appliedPayment, 0);

    if (balance <= 0) {
      payoffMonth = month;
      break;
    }

    balance *= 1 + monthlyRate;
  }

  return {
    balance,
    paymentsMade,
    payoffMonth
  };
}

function projectDebt({
  debts,
  currentAge,
  endAge
}: {
  debts: Debt[];
  currentAge: number;
  endAge: number;
}) {
  return debts.reduce(
    (total, debt) => {
      const debtProjection = projectSingleDebt({ debt, currentAge, endAge });

      return {
        balance: total.balance + debtProjection.balance,
        paymentsMade: total.paymentsMade + debtProjection.paymentsMade
      };
    },
    { balance: 0, paymentsMade: 0 }
  );
}

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
}

function formatPayoffTime(payoffMonth: number | null) {
  if (payoffMonth === null) {
    return "Not paid off";
  }

  if (payoffMonth === 0) {
    return "Immediate";
  }

  const years = Math.floor(payoffMonth / 12);
  const months = payoffMonth % 12;

  if (years === 0) {
    return `${months} mo`;
  }

  if (months === 0) {
    return `${years} yr`;
  }

  return `${years} yr ${months} mo`;
}

function InvestedMadeReadout({
  invested,
  made,
  align = "left"
}: {
  invested: number;
  made: number;
  align?: "left" | "right";
}) {
  return (
    <p className={`text-xs leading-4 text-muted-foreground ${align === "right" ? "text-right" : ""}`}>
      <span className="whitespace-nowrap">{formatCurrency(invested)} invested</span>
      <span className="mx-1 text-border">|</span>
      <span className={`whitespace-nowrap ${made >= 0 ? "text-primary" : "text-destructive"}`}>
        {formatCurrency(made)} made
      </span>
    </p>
  );
}

function NumberField({
  label,
  value,
  displayValue,
  onChange,
  note,
  disabled = false,
  suffix,
  min = 0,
  max,
  reserveNoteSpace = true,
  compact = false,
  noWrapLabel = false,
  labelAccessory
}: {
  label: string;
  value: number;
  displayValue?: string;
  onChange: (value: number) => void;
  note?: string;
  disabled?: boolean;
  suffix?: string;
  min?: number;
  max?: number;
  reserveNoteSpace?: boolean;
  compact?: boolean;
  noWrapLabel?: boolean;
  labelAccessory?: React.ReactNode;
}) {
  const inputValue = displayValue ?? String(value);
  const [draft, setDraft] = useState(inputValue);

  useEffect(() => {
    setDraft(inputValue);
  }, [inputValue]);

  return (
    <Label className="grid min-w-0 content-start gap-1 text-sm font-medium text-foreground">
      <span className="flex min-h-5 items-start justify-between gap-2 leading-5">
        <span
          className={`flex min-w-0 items-center gap-2 ${
            noWrapLabel ? "whitespace-nowrap" : "break-words"
          }`}
        >
          {labelAccessory}
          <span>{label}</span>
        </span>
        {suffix ? <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span> : null}
      </span>
      <Input
        className={`w-full min-w-0 rounded-md border-input bg-card text-foreground shadow-sm focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground ${
          compact ? "h-9" : "h-10"
        }`}
        type={displayValue !== undefined ? "text" : "number"}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);

          if (nextDraft === "") {
            return;
          }

          const nextValue = Number(nextDraft);

          if (Number.isFinite(nextValue)) {
            onChange(clampNumber(nextValue, min, max));
          }
        }}
        onBlur={() => {
          if (draft === "") {
            setDraft(String(value));
          }
        }}
      />
      {note || reserveNoteSpace ? (
        <span
          className={`min-h-8 text-xs font-normal leading-4 text-muted-foreground ${
            note ? "" : "invisible"
          }`}
        >
          {note || "No note"}
        </span>
      ) : null}
    </Label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  note
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  note?: string;
}) {
  return (
    <Label className="flex h-full min-h-[5.75rem] min-w-0 items-start gap-3 rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm">
      <Checkbox
        className="mt-1"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span className="grid min-w-0 gap-1">
        <span className="break-words leading-5">{label}</span>
        {note ? <span className="text-xs font-normal leading-4 text-muted-foreground">{note}</span> : null}
      </span>
    </Label>
  );
}

function RangeEditor({
  title,
  note,
  ranges,
  disabled = false,
  currentAge,
  endAge,
  amountLabel = "Amount",
  amountMin = Number.NEGATIVE_INFINITY,
  onChange
}: {
  title: string;
  note: string;
  ranges: ContributionRange[];
  disabled?: boolean;
  currentAge: number;
  endAge: number;
  amountLabel?: string;
  amountMin?: number;
  onChange: (ranges: ContributionRange[]) => void;
}) {
  const updateRange = (id: string, patch: Partial<ContributionRange>) => {
    onChange(ranges.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{note}</p>
        </div>
        <Button
          className="h-9"
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => onChange([...ranges, DEFAULT_RANGE(0, currentAge, endAge)])}
        >
          Add range
        </Button>
      </div>

      <div className="grid gap-2">
        {ranges.map((range) => {
          const invalid = range.toAge <= range.fromAge;
          const cadence = range.cadence ?? "yearly";
          return (
            <Card
              className={`grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] ${
                invalid ? "border-red-300" : ""
              } ${disabled ? "opacity-60" : ""}`}
              key={range.id}
            >
              <div className="lg:col-span-4">
                <ButtonGroup className={disabled ? "pointer-events-none opacity-60" : ""}>
                  {(["yearly", "monthly"] satisfies RangeCadence[]).map((option) => (
                    <Button
                      className={`h-7 text-xs ${
                        cadence === option ? "bg-secondary text-secondary-foreground hover:bg-secondary" : ""
                      }`}
                      key={option}
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => updateRange(range.id, { cadence: option })}
                    >
                      {option === "yearly" ? "Yearly" : "Monthly"}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
              <NumberField
                label={amountLabel}
                value={range.yearlyAmount}
                disabled={disabled}
                reserveNoteSpace={false}
                min={amountMin}
                onChange={(value) => updateRange(range.id, { yearlyAmount: value })}
              />
              <NumberField
                label="From age"
                value={range.fromAge}
                disabled={disabled}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { fromAge: value })}
              />
              <NumberField
                label="To age"
                value={range.toAge}
                disabled={disabled}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { toAge: value })}
              />
              <div className="flex items-end lg:pt-6">
                <Button
                  className="h-10 w-full"
                  variant="outline"
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(ranges.filter((item) => item.id !== range.id))}
                >
                  Remove
                </Button>
              </div>
              {invalid ? (
                <p className="text-xs font-medium text-destructive lg:col-span-4">
                  This range is ignored because the ending age must be greater than the starting age.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EmployerMatchEditor({
  ranges,
  currentAge,
  endAge,
  onChange
}: {
  ranges: EmployerMatchRange[];
  currentAge: number;
  endAge: number;
  onChange: (ranges: EmployerMatchRange[]) => void;
}) {
  const updateRange = (id: string, patch: Partial<EmployerMatchRange>) => {
    onChange(ranges.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Employer match</h4>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Ranges calculate employer Traditional 401k contributions from income and match percentage.
          </p>
        </div>
        <Button
          className="h-9"
          type="button"
          variant="secondary"
          onClick={() => onChange([...ranges, DEFAULT_EMPLOYER_MATCH_RANGE(currentAge, endAge)])}
        >
          Add match
        </Button>
      </div>

      <div className="grid gap-2">
        {ranges.map((range) => {
          const invalid = range.toAge <= range.fromAge;
          const cadence = range.cadence ?? "yearly";

          return (
            <Card
              className={`grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] ${
                invalid ? "border-red-300" : ""
              }`}
              key={range.id}
            >
              <div className="xl:col-span-5">
                <ButtonGroup>
                  {(["yearly", "monthly"] satisfies RangeCadence[]).map((option) => (
                    <Button
                      className={`h-7 px-2 text-xs ${
                        cadence === option ? "bg-secondary text-secondary-foreground hover:bg-secondary" : ""
                      }`}
                      key={option}
                      type="button"
                      variant="outline"
                      onClick={() => updateRange(range.id, { cadence: option })}
                    >
                      {option === "yearly" ? "Yearly" : "Monthly"}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
              <NumberField
                label="Income"
                value={range.income}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { income: value })}
              />
              <NumberField
                label="Match"
                value={range.matchPercent}
                suffix="%"
                min={0}
                max={100}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { matchPercent: clampNumber(value, 0, 100) })}
              />
              <NumberField
                label="From age"
                value={range.fromAge}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { fromAge: value })}
              />
              <NumberField
                label="To age"
                value={range.toAge}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { toAge: value })}
              />
              <div className="flex items-end xl:pt-6">
                <Button
                  className="h-10 w-full"
                  variant="outline"
                  type="button"
                  onClick={() => onChange(ranges.filter((item) => item.id !== range.id))}
                >
                  Remove
                </Button>
              </div>
              {invalid ? (
                <p className="text-xs font-medium text-destructive xl:col-span-5">
                  This range is ignored because the ending age must be greater than the starting age.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DebtPaymentEditor({
  ranges,
  currentAge,
  onChange
}: {
  ranges: DebtPaymentRange[];
  currentAge: number;
  onChange: (ranges: DebtPaymentRange[]) => void;
}) {
  const updateRange = (id: string, patch: Partial<DebtPaymentRange>) => {
    onChange(ranges.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Debt payments</h4>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Payments within time frame or until paid off.
          </p>
        </div>
        <Button
          className="h-9"
          type="button"
          variant="secondary"
          onClick={() => onChange([...ranges, DEFAULT_DEBT_PAYMENT_RANGE(currentAge)])}
        >
          Add payment
        </Button>
      </div>

      <div className="grid gap-2">
        {ranges.map((range) => {
          const cadence = range.cadence ?? "yearly";
          const hasToAge = range.hasToAge === true;
          const invalid = hasToAge && range.toAge <= range.fromAge;

          return (
            <Card
              className={`grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] ${
                invalid ? "border-red-300" : ""
              }`}
              key={range.id}
            >
              <div className="lg:col-span-4">
                <ButtonGroup>
                  {(["yearly", "monthly"] satisfies RangeCadence[]).map((option) => (
                    <Button
                      className={`h-7 text-xs ${
                        cadence === option ? "bg-secondary text-secondary-foreground hover:bg-secondary" : ""
                      }`}
                      key={option}
                      type="button"
                      variant="outline"
                      onClick={() => updateRange(range.id, { cadence: option })}
                    >
                      {option === "yearly" ? "Yearly" : "Monthly"}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
              <NumberField
                label="Amount"
                value={range.amount}
                min={0}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { amount: value })}
              />
              <NumberField
                label="From age"
                value={range.fromAge}
                reserveNoteSpace={false}
                onChange={(value) => updateRange(range.id, { fromAge: value })}
              />
              <NumberField
                label="To age"
                value={range.toAge}
                displayValue={!hasToAge ? "Until paid" : undefined}
                disabled={!hasToAge}
                reserveNoteSpace={false}
                labelAccessory={
                  <Checkbox
                    checked={hasToAge}
                    onCheckedChange={(checked) =>
                      updateRange(range.id, {
                        hasToAge: checked === true,
                        toAge: range.toAge > range.fromAge ? range.toAge : range.fromAge + 1
                      })
                    }
                  />
                }
                onChange={(value) => updateRange(range.id, { toAge: value })}
              />
              <div className="flex items-end lg:pt-6">
                <Button
                  className="h-10 w-full"
                  variant="outline"
                  type="button"
                  onClick={() => onChange(ranges.filter((item) => item.id !== range.id))}
                >
                  Remove
                </Button>
              </div>
              {invalid ? (
                <p className="text-xs font-medium text-destructive lg:col-span-4">
                  This payment is ignored because the ending age must be greater than the starting age.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DebtEditor({
  debts,
  currentAge,
  endAge,
  selectedCard,
  onSelectedCardChange,
  onChange
}: {
  debts: Debt[];
  currentAge: number;
  endAge: number;
  selectedCard: VisibleCardId;
  onSelectedCardChange: (card: VisibleCardId) => void;
  onChange: (debts: Debt[]) => void;
}) {
  const updateDebt = (id: string, patch: Partial<Debt>) => {
    onChange(debts.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt)));
  };

  return (
    <Card className="min-w-0 p-4 md:p-5">
      <CardHeader className="mb-5 grid items-start gap-3 p-0 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <CardTitle className="text-xl font-bold text-foreground">
            <VisibleCardSelect value={selectedCard} onChange={onSelectedCardChange} />
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Track debts with compounding interest; enter 0 for interest if there is no interest.
          </CardDescription>
        </div>
        <Button
          className="h-9 justify-self-start sm:justify-self-end"
          type="button"
          onClick={() => onChange([...debts, DEFAULT_DEBT()])}
        >
          Add debt
        </Button>
      </CardHeader>

      <CardContent className="grid gap-3 p-0">
        {debts.length === 0 ? (
          <Card className="p-3 text-sm text-muted-foreground">No debts added.</Card>
        ) : null}

        {debts.map((debt) => {
          const debtProjection = projectSingleDebt({ debt, currentAge, endAge });

          return (
            <Card className="grid gap-4 p-3" key={debt.id}>
              <Card className="grid gap-3 p-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projected debt</p>
                  <p
                    className={`text-lg font-bold ${
                      debtProjection.balance > 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {formatCurrency(debtProjection.balance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments made</p>
                  <p
                    className={`text-lg font-bold ${
                      debtProjection.paymentsMade > 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {formatCurrency(debtProjection.paymentsMade)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time to pay off</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatPayoffTime(debtProjection.payoffMonth)}
                  </p>
                </div>
              </Card>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
                <NumberField
                  label="Value"
                  value={debt.value}
                  reserveNoteSpace={false}
                  onChange={(value) => updateDebt(debt.id, { value })}
                />
                <NumberField
                  label="Interest"
                  value={debt.interest}
                  suffix="%"
                  min={0}
                  max={100}
                  reserveNoteSpace={false}
                  onChange={(value) => updateDebt(debt.id, { interest: clampNumber(value, 0, 100) })}
                />
                <div className="flex items-end md:pt-6">
                  <Button
                    className="h-10 w-full"
                    variant="outline"
                    type="button"
                    onClick={() => onChange(debts.filter((item) => item.id !== debt.id))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <DebtPaymentEditor
                ranges={debt.paymentRanges ?? []}
                currentAge={currentAge}
                onChange={(paymentRanges) => updateDebt(debt.id, { paymentRanges })}
              />
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

function VisibleCardSelect({
  value,
  onChange
}: {
  value: VisibleCardId;
  onChange: (card: VisibleCardId) => void;
}) {
  const selectedLabel = VISIBLE_CARD_OPTIONS.find((option) => option.value === value)?.label ?? "Brokerage";

  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as VisibleCardId)}>
      <SelectTrigger
        asChild
        aria-label="Visible card"
      >
        <Button
          className="visible-card-select-trigger h-auto min-w-0 justify-start gap-1 px-2 py-1 text-xl font-bold -ml-2"
          type="button"
          variant="ghost"
        >
          <span>{selectedLabel}</span>
          <ChevronDown className="shrink-0" />
        </Button>
      </SelectTrigger>
      <SelectContent>
        {VISIBLE_CARD_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Section({
  subtitle,
  bucket,
  selectedCard,
  onSelectedCardChange,
  children
}: {
  subtitle: string;
  bucket: ProjectedBucket;
  selectedCard: VisibleCardId;
  onSelectedCardChange: (card: VisibleCardId) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 p-4 md:p-5">
      <CardHeader className="mb-5 grid items-start gap-3 p-0 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <CardTitle className="text-xl font-bold text-foreground">
            <VisibleCardSelect value={selectedCard} onChange={onSelectedCardChange} />
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </CardDescription>
        </div>
        <Card className="justify-self-end px-4 py-3 text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projected</div>
          <div className="whitespace-nowrap text-xl font-bold text-primary">
            {formatCurrency(bucket.grossValue)}
          </div>
          <InvestedMadeReadout
            invested={bucket.investedValue}
            made={bucket.grossValue - bucket.investedValue}
            align="right"
          />
        </Card>
      </CardHeader>
      <CardContent className="grid gap-5 p-0">{children}</CardContent>
    </Card>
  );
}

function FourPercentReadout({ value }: { value: number }) {
  return (
    <Card className="grid min-h-[5.75rem] content-start gap-1 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4% at retirement</p>
      <p className="whitespace-nowrap text-xl font-bold text-gold">
        {formatCurrency(value)}
        <span className="text-sm font-semibold text-muted-foreground"> / year</span>
      </p>
      <p className="min-h-8 text-xs leading-4 text-muted-foreground">Based on this account at retirement age.</p>
    </Card>
  );
}

function InflationAdjustedAmount({
  value,
  adjustedValue,
  className = "text-xl font-bold text-foreground",
  suffix,
  adjustedSuffix = suffix
}: {
  value: number;
  adjustedValue: number;
  className?: string;
  suffix?: string;
  adjustedSuffix?: string;
}) {
  return (
    <div>
      <p className={className}>
        {formatCurrency(value)}
        {suffix ? <span className="text-sm font-semibold text-muted-foreground"> {suffix}</span> : null}
      </p>
      <p className="text-xs font-semibold leading-4 text-muted-foreground">
        {formatCurrency(adjustedValue)}
        {adjustedSuffix ? ` ${adjustedSuffix}` : ""} today
      </p>
    </div>
  );
}

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentAge, setCurrentAge] = useState(20);
  const [retirementAge, setRetirementAge] = useState(45);
  const [endAge, setEndAge] = useState(65);
  const [withdrawalTaxRate, setWithdrawalTaxRate] = useState(15);
  const [inflationRate, setInflationRate] = useState(3);

  const [brokerageStartAge, setBrokerageStartAge] = useState(20);
  const [brokerageStartingValue, setBrokerageStartingValue] = useState(0);
  const [brokerageReturn, setBrokerageReturn] = useState(8);
  const [brokerageRanges, setBrokerageRanges] = useState<ContributionRange[]>([]);
  const [brokerageRetirementExpense, setBrokerageRetirementExpense] = useState(0);

  const [k401StartAge, setK401StartAge] = useState(20);
  const [traditional401kStartingValue, setTraditional401kStartingValue] = useState(0);
  const [roth401kStartingValue, setRoth401kStartingValue] = useState(0);
  const [k401Return, setK401Return] = useState(8);
  const [traditional401kRanges, setTraditional401kRanges] = useState<ContributionRange[]>([]);
  const [roth401kRanges, setRoth401kRanges] = useState<ContributionRange[]>([]);
  const [employerContributionRanges, setEmployerContributionRanges] = useState<ContributionRange[]>([]);
  const [employerMatchRanges, setEmployerMatchRanges] = useState<EmployerMatchRange[]>([]);
  const [preTax401kRetirementExpense, setPreTax401kRetirementExpense] = useState(0);
  const [roth401kRetirementExpense, setRoth401kRetirementExpense] = useState(0);
  const [traditional401kMax, setTraditional401kMax] = useState(false);
  const [roth401kMax, setRoth401kMax] = useState(false);

  const [rothIraStartAge, setRothIraStartAge] = useState(20);
  const [rothIraStartingValue, setRothIraStartingValue] = useState(0);
  const [rothIraReturn, setRothIraReturn] = useState(8);
  const [rothIraMax, setRothIraMax] = useState(false);
  const [rothIraRanges, setRothIraRanges] = useState<ContributionRange[]>([]);
  const [rothIraRetirementExpense, setRothIraRetirementExpense] = useState(0);

  const [hsaStartAge, setHsaStartAge] = useState(20);
  const [hsaStartingValue, setHsaStartingValue] = useState(0);
  const [hsaReturn, setHsaReturn] = useState(8);
  const [hsaCoverage, setHsaCoverage] = useState<"self" | "family">("self");
  const [hsaMax, setHsaMax] = useState(false);
  const [hsaRanges, setHsaRanges] = useState<ContributionRange[]>([]);
  const [hsaRetirementExpense, setHsaRetirementExpense] = useState(0);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [visibleCard, setVisibleCard] = useState<VisibleCardId>("brokerage");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    const shouldUseDark = savedTheme ? savedTheme === "dark" : true;

    setIsDarkMode(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const handleDarkModeToggle = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    document.documentElement.classList.toggle("dark", nextMode);
    window.localStorage.setItem("theme", nextMode ? "dark" : "light");
  };

  const handleCurrentAgeChange = (nextAge: number) => {
    const previousAge = currentAge;
    setCurrentAge(nextAge);

    if (brokerageStartAge === previousAge) {
      setBrokerageStartAge(nextAge);
    }

    if (k401StartAge === previousAge) {
      setK401StartAge(nextAge);
    }

    if (rothIraStartAge === previousAge) {
      setRothIraStartAge(nextAge);
    }

    if (hsaStartAge === previousAge) {
      setHsaStartAge(nextAge);
    }
  };

  const projection = useMemo(() => {
    const buildProjection = (targetEndAge: number) => {
      const brokerage = projectAccount({
        currentAge,
        retirementAge,
        endAge: targetEndAge,
        startAge: brokerageStartAge,
        startingValue: brokerageStartingValue,
        annualReturn: brokerageReturn,
        ranges: brokerageRanges,
        yearlyRetirementExpense: brokerageRetirementExpense,
        taxTreatment: "brokerage"
      });

      const traditional401k = projectAccount({
        currentAge,
        retirementAge,
        endAge: targetEndAge,
        startAge: k401StartAge,
        startingValue: traditional401kStartingValue,
        annualReturn: k401Return,
        ranges: traditional401kRanges,
        yearlyRetirementExpense: preTax401kRetirementExpense,
        taxTreatment: "taxable",
        contributionOverride: (age, month) =>
          resolve401kEmployeePayment({
            age,
            month,
            traditionalRanges: traditional401kRanges,
            rothRanges: roth401kRanges,
            traditionalMax: traditional401kMax,
            rothMax: roth401kMax
          }).traditional +
          activeRangePayment(employerContributionRanges, age, month) +
          activeEmployerMatchPayment(employerMatchRanges, age, month)
      });

      const roth401k = projectAccount({
        currentAge,
        retirementAge,
        endAge: targetEndAge,
        startAge: k401StartAge,
        startingValue: roth401kStartingValue,
        annualReturn: k401Return,
        ranges: roth401kRanges,
        yearlyRetirementExpense: roth401kRetirementExpense,
        taxTreatment: "taxFree",
        contributionOverride: (age, month) =>
          resolve401kEmployeePayment({
            age,
            month,
            traditionalRanges: traditional401kRanges,
            rothRanges: roth401kRanges,
            traditionalMax: traditional401kMax,
            rothMax: roth401kMax
          }).roth
      });

      const rothIra = projectAccount({
        currentAge,
        retirementAge,
        endAge: targetEndAge,
        startAge: rothIraStartAge,
        startingValue: rothIraStartingValue,
        annualReturn: rothIraReturn,
        ranges: rothIraRanges,
        yearlyRetirementExpense: rothIraRetirementExpense,
        taxTreatment: "taxFree",
        contributionOverride: rothIraMax ? (age, month) => (month % 12 === 0 ? annualRothIraLimit(age) : 0) : undefined
      });

      const hsa = projectAccount({
        currentAge,
        retirementAge,
        endAge: targetEndAge,
        startAge: hsaStartAge,
        startingValue: hsaStartingValue,
        annualReturn: hsaReturn,
        ranges: hsaRanges,
        yearlyRetirementExpense: hsaRetirementExpense,
        taxTreatment: "taxFree",
        contributionOverride: hsaMax
          ? (age, month) => (month % 12 === 0 ? annualHsaLimit(age, hsaCoverage) : 0)
          : undefined
      });

      const k401 = combineBuckets([traditional401k, roth401k]);
      const total = combineBuckets([brokerage, k401, rothIra, hsa]);

      return {
        brokerage,
        traditional401k,
        roth401k,
        k401,
        rothIra,
        hsa,
        total
      };
    };

    const finalProjection = buildProjection(endAge);
    const retirementProjection = buildProjection(retirementAge);
    const projectedDebt = projectDebt({ debts, currentAge, endAge });
    const retirementDebt = projectDebt({ debts, currentAge, endAge: retirementAge });
    const afterTax =
      finalProjection.total.taxFreeOnWithdrawal +
      finalProjection.total.taxableOnWithdrawal * (1 - withdrawalTaxRate / 100);
    const inflationYears = Math.max(0, endAge - currentAge);
    const inflationDiscountFactor = Math.pow(1 + clampNumber(inflationRate) / 100, inflationYears);

    return {
      ...finalProjection,
      afterTax,
      grossAfterDebt: finalProjection.total.grossValue - projectedDebt.balance - projectedDebt.paymentsMade,
      afterTaxAfterDebt: afterTax - projectedDebt.balance - projectedDebt.paymentsMade,
      projectedDebt: projectedDebt.balance,
      debtPaymentsMade: projectedDebt.paymentsMade,
      inflationDiscountFactor,
      fourPercentAtRetirement:
        Math.max(retirementProjection.total.grossValue - retirementDebt.balance - retirementDebt.paymentsMade, 0) *
        0.04,
      retirementFourPercent: {
        brokerage: retirementProjection.brokerage.grossValue * 0.04,
        preTax401k: retirementProjection.traditional401k.grossValue * 0.04,
        roth401k: retirementProjection.roth401k.grossValue * 0.04,
        rothIra: retirementProjection.rothIra.grossValue * 0.04,
        hsa: retirementProjection.hsa.grossValue * 0.04
      },
      currentRetirementSpending:
        clampNumber(brokerageRetirementExpense) +
        clampNumber(preTax401kRetirementExpense) +
        clampNumber(roth401kRetirementExpense) +
        clampNumber(rothIraRetirementExpense) +
        clampNumber(hsaRetirementExpense)
    };
  }, [
    brokerageRanges,
    brokerageReturn,
    brokerageRetirementExpense,
    brokerageStartAge,
    brokerageStartingValue,
    currentAge,
    debts,
    employerContributionRanges,
    employerMatchRanges,
    endAge,
    hsaCoverage,
    hsaMax,
    hsaRanges,
    hsaRetirementExpense,
    hsaReturn,
    hsaStartAge,
    hsaStartingValue,
    inflationRate,
    k401Return,
    k401StartAge,
    preTax401kRetirementExpense,
    retirementAge,
    roth401kMax,
    roth401kRanges,
    roth401kRetirementExpense,
    roth401kStartingValue,
    rothIraMax,
    rothIraRanges,
    rothIraRetirementExpense,
    rothIraReturn,
    rothIraStartAge,
    rothIraStartingValue,
    traditional401kMax,
    traditional401kRanges,
    traditional401kStartingValue,
    withdrawalTaxRate
  ]);

  const current401kLimit = annual401kEmployeeLimit(currentAge);
  const currentRothIraLimit = annualRothIraLimit(currentAge);
  const currentHsaLimit = annualHsaLimit(currentAge, hsaCoverage);
  const current401kContributions = resolve401kEmployeeContributions({
    age: currentAge,
    traditionalRanges: traditional401kRanges,
    rothRanges: roth401kRanges,
    traditionalMax: traditional401kMax,
    rothMax: roth401kMax
  });

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-6">
        <header className="grid min-w-0 gap-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Savings Calculator</h1>
            <Button
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="mt-1 shrink-0"
              size="icon"
              type="button"
              variant="outline"
              onClick={handleDarkModeToggle}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
          <Card className="grid min-w-0 grid-cols-5 items-start gap-1.5 p-2">
            <NumberField
              label="Current age"
              value={currentAge}
              onChange={handleCurrentAgeChange}
              noWrapLabel
              compact
            />
            <NumberField
              label="Retirement age"
              value={retirementAge}
              onChange={setRetirementAge}
              note="Income ends at this age."
              noWrapLabel
              compact
            />
            <NumberField 
              label="End age" 
              value={endAge} 
              onChange={setEndAge} 
              note="Simulation ends at this age."
              noWrapLabel 
              compact 
            />
            <NumberField
              label="Tax rate"
              value={withdrawalTaxRate}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => setWithdrawalTaxRate(clampNumber(value, 0, 100))}
              note="Withdrawal tax."
              noWrapLabel
              compact
            />
            <NumberField
              label="Inflation"
              value={inflationRate}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => setInflationRate(clampNumber(value, 0, 100))}
              noWrapLabel
              compact
            />
          </Card>
        </header>

        {visibleCard === "brokerage" ? (
        <Section
          subtitle="Post-tax contributions with taxable growth at withdrawal."
          bucket={projection.brokerage}
          selectedCard={visibleCard}
          onSelectedCardChange={setVisibleCard}
        >
          <div className="grid items-start gap-3 md:grid-cols-3">
            <NumberField label="Start age" value={brokerageStartAge} onChange={setBrokerageStartAge} />
            <NumberField
              label="Starting value"
              value={brokerageStartingValue}
              onChange={setBrokerageStartingValue}
              note="Enter already post-tax value; estimated withdrawal tax applies only to growth."
            />
            <NumberField
              label="Annual return"
              value={brokerageReturn}
              suffix="%"
              onChange={setBrokerageReturn}
            />
          </div>
          <RangeEditor
            title="Additional investments"
            note="Enter already post-tax contribution."
            ranges={brokerageRanges}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setBrokerageRanges}
          />
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NumberField
              label="Retirement yearly expense"
              value={brokerageRetirementExpense}
              onChange={setBrokerageRetirementExpense}
              note="Withdraws from brokerage every year from retirement age through end age."
            />
            <FourPercentReadout value={projection.retirementFourPercent.brokerage} />
          </div>
        </Section>
        ) : null}

        {visibleCard === "k401" ? (
        <Section
          subtitle="Traditional and Roth 401k's share a max employee contribution. Employer contributions go into the Traditional 401k."
          bucket={projection.k401}
          selectedCard={visibleCard}
          onSelectedCardChange={setVisibleCard}
        >
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
            <NumberField label="Start age" value={k401StartAge} onChange={setK401StartAge} />
            <NumberField
              label="Traditional starting value"
              value={traditional401kStartingValue}
              onChange={setTraditional401kStartingValue}
              note="Pre-tax; taxed on withdrawal."
            />
            <NumberField
              label="Roth starting value"
              value={roth401kStartingValue}
              onChange={setRoth401kStartingValue}
              note="Post-tax; tax-free on qualified withdrawal."
            />
            <NumberField label="Annual return" value={k401Return} suffix="%" onChange={setK401Return} />
          </div>

          <Card className="grid items-start gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current employee limit
              </p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(current401kLimit)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Traditional now</p>
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(current401kContributions.traditional)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roth now</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(current401kContributions.roth)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projected split</p>
              <p className="text-sm font-semibold text-muted-foreground">
                Traditional {formatCurrency(projection.traditional401k.grossValue)} / Roth{" "}
                {formatCurrency(projection.roth401k.grossValue)}
              </p>
            </div>
            {current401kContributions.wasCapped ? (
              <p className="text-xs font-semibold text-gold md:col-span-4">
                Current-year employee contributions are capped to stay under the 2026 IRS 401k limit.
              </p>
            ) : null}
          </Card>

          <div className="grid items-stretch gap-3 md:grid-cols-2">
            <Toggle
              label="Max traditional 401k"
              checked={traditional401kMax}
              onChange={setTraditional401kMax}
              note="Disables traditional ranges and fills the remaining legal employee limit."
            />
            <Toggle
              label="Max Roth 401k"
              checked={roth401kMax}
              onChange={setRoth401kMax}
              note="Disables Roth ranges and fills the remaining legal employee limit."
            />
          </div>

          <RangeEditor
            title="Traditional 401k contributions"
            note="Pre-tax; taxed on withdrawal."
            ranges={traditional401kRanges}
            disabled={traditional401kMax}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setTraditional401kRanges}
          />
          <RangeEditor
            title="Roth 401k contributions"
            note="Post-tax contribution; tax-free on qualified withdrawal."
            ranges={roth401kRanges}
            disabled={roth401kMax}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setRoth401kRanges}
          />
          <RangeEditor
            title="Employer cash contributions"
            note="Employer Traditional 401k contribution; taxed on withdrawal."
            ranges={employerContributionRanges}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setEmployerContributionRanges}
          />
          <EmployerMatchEditor
            ranges={employerMatchRanges}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setEmployerMatchRanges}
          />
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
            <NumberField
              label="Pre-tax 401k retirement yearly expense"
              value={preTax401kRetirementExpense}
              onChange={setPreTax401kRetirementExpense}
              note="Withdraws from Traditional 401k every yearfrom retirement age through end age."
            />
            <FourPercentReadout value={projection.retirementFourPercent.preTax401k} />
            <NumberField
              label="Roth 401k retirement yearly expense"
              value={roth401kRetirementExpense}
              onChange={setRoth401kRetirementExpense}
              note="Withdraws from Roth 401k every year from retirement age through end age."
            />
            <FourPercentReadout value={projection.retirementFourPercent.roth401k} />
          </div>
        </Section>
        ) : null}

        {visibleCard === "rothIra" ? (
        <Section
          subtitle="Post-tax IRA contributions with tax-free qualified withdrawals."
          bucket={projection.rothIra}
          selectedCard={visibleCard}
          onSelectedCardChange={setVisibleCard}
        >
          <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4">
            <NumberField label="Start age" value={rothIraStartAge} onChange={setRothIraStartAge} />
            <NumberField
              label="Starting value"
              value={rothIraStartingValue}
              onChange={setRothIraStartingValue}
              note="Post-tax; tax-free on qualified withdrawal."
            />
            <NumberField
              label="Annual return"
              value={rothIraReturn}
              suffix="%"
              onChange={setRothIraReturn}
            />
            <Toggle
              label="Max Roth IRA"
              checked={rothIraMax}
              onChange={setRothIraMax}
              note={`Uses ${formatCurrency(currentRothIraLimit)} at your current age; ignores income phase-outs.`}
            />
          </div>
          <RangeEditor
            title="Roth IRA contributions"
            note="Post-tax contribution; tax-free on qualified withdrawal."
            ranges={rothIraRanges}
            disabled={rothIraMax}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setRothIraRanges}
          />
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NumberField
              label="Retirement yearly expense"
              value={rothIraRetirementExpense}
              onChange={setRothIraRetirementExpense}
              note="Withdraws from Roth IRA every year from retirement age through end age."
            />
            <FourPercentReadout value={projection.retirementFourPercent.rothIra} />
          </div>
        </Section>
        ) : null}

        {visibleCard === "hsa" ? (
        <Section
          subtitle="Assumes qualified medical withdrawals, so projected HSA value is tax-free."
          bucket={projection.hsa}
          selectedCard={visibleCard}
          onSelectedCardChange={setVisibleCard}
        >
          <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-5">
            <NumberField label="Start age" value={hsaStartAge} onChange={setHsaStartAge} />
            <NumberField
              label="Starting value"
              value={hsaStartingValue}
              onChange={setHsaStartingValue}
              note="Assumes qualified medical withdrawals; tax-free."
            />
            <NumberField label="Annual return" value={hsaReturn} suffix="%" onChange={setHsaReturn} />
            <Label className="grid min-w-0 content-start gap-1 text-sm font-medium text-foreground">
              <span className="flex min-h-5 items-start leading-5">Coverage</span>
              <Select
                value={hsaCoverage}
                onValueChange={(value) => setHsaCoverage(value as "self" | "family")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Coverage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self-only</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                </SelectContent>
              </Select>
              <span className="min-h-8 text-xs font-normal leading-4 text-muted-foreground">
                Current max: {formatCurrency(currentHsaLimit)}
              </span>
            </Label>
            <Toggle
              label="Max HSA"
              checked={hsaMax}
              onChange={setHsaMax}
              note="Disables HSA ranges and contributes the legal max after start age."
            />
          </div>
          <RangeEditor
            title="HSA contributions"
            note="HSA contributions are assumed tax-free when used for qualified medical expenses."
            ranges={hsaRanges}
            disabled={hsaMax}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setHsaRanges}
          />
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NumberField
              label="Retirement yearly expense"
              value={hsaRetirementExpense}
              onChange={setHsaRetirementExpense}
              note="Withdraws from HSA every year from retirement age through end age."
            />
            <FourPercentReadout value={projection.retirementFourPercent.hsa} />
          </div>
        </Section>
        ) : null}

        {visibleCard === "debt" ? (
        <DebtEditor
          debts={debts}
          currentAge={currentAge}
          endAge={endAge}
          selectedCard={visibleCard}
          onSelectedCardChange={setVisibleCard}
          onChange={setDebts}
        />
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projected total</p>
          <Card className="mt-2 grid items-start gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.75fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gross final value</p>
              <InflationAdjustedAmount
                value={projection.grossAfterDebt}
                adjustedValue={projection.grossAfterDebt / projection.inflationDiscountFactor}
                className="text-3xl font-bold text-foreground"
              />
              <InvestedMadeReadout
                invested={projection.total.investedValue}
                made={projection.total.grossValue - projection.total.investedValue}
              />
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">After tax</p>
              <InflationAdjustedAmount
                value={projection.afterTaxAfterDebt}
                adjustedValue={projection.afterTaxAfterDebt / projection.inflationDiscountFactor}
                className="text-xl font-bold text-primary"
              />
              <p className="mt-1 text-xs leading-4 text-muted-foreground">
                {percentFormatter.format(withdrawalTaxRate)}% on taxable balances.
              </p>
            </div>
          </Card>

          <Card className="mt-3 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              4% at retirement age ({retirementAge})
            </p>
            <InflationAdjustedAmount
              value={projection.fourPercentAtRetirement}
              adjustedValue={projection.fourPercentAtRetirement / projection.inflationDiscountFactor}
              className="text-xl font-bold text-gold"
              suffix="/ year"
            />
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current retirement spending
              </p>
              <InflationAdjustedAmount
                value={projection.currentRetirementSpending}
                adjustedValue={projection.currentRetirementSpending / projection.inflationDiscountFactor}
                className="text-xl font-bold text-destructive"
                suffix="/ year"
              />
            </div>
          </Card>

          <div className="mt-4 grid gap-2 text-sm">
            {(
              [
              ["Brokerage", projection.brokerage],
              ["401k", projection.k401],
              ["Roth IRA", projection.rothIra],
              ["HSA", projection.hsa]
              ] satisfies Array<[string, ProjectedBucket]>
            ).map(([label, bucket]) => (
              <div className="flex items-center justify-between gap-3 border-b border-border pb-2" key={label}>
                <span className="text-muted-foreground">{label}</span>
                <div className="grid justify-items-end">
                  <InflationAdjustedAmount
                    value={bucket.grossValue}
                    adjustedValue={bucket.grossValue / projection.inflationDiscountFactor}
                    className="text-right font-bold text-foreground"
                  />
                  <InvestedMadeReadout
                    invested={bucket.investedValue}
                    made={bucket.grossValue - bucket.investedValue}
                    align="right"
                  />
                </div>
              </div>
            ))}
            {(
              [
                ["Projected debt", projection.projectedDebt, projection.projectedDebt > 0 ? "text-destructive" : "text-foreground"],
                ["Debt payments made", projection.debtPaymentsMade, projection.debtPaymentsMade > 0 ? "text-destructive" : "text-foreground"],
                ["Taxable on withdrawal", projection.total.taxableOnWithdrawal, "text-foreground"],
                ["Tax-free on withdrawal", projection.total.taxFreeOnWithdrawal, "text-foreground"]
              ] satisfies Array<[string, number, string]>
            ).map(([label, value, valueClassName]) => (
              <div className="flex items-center justify-between gap-3 border-b border-border pb-2" key={label}>
                <span className="text-muted-foreground">{label}</span>
                <InflationAdjustedAmount
                  value={value}
                  adjustedValue={value / projection.inflationDiscountFactor}
                  className={`text-right font-bold ${valueClassName}`}
                />
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </main>
  );
}
