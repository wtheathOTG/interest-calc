"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ContributionRange = {
  id: string;
  fromAge: number;
  toAge: number;
  yearlyAmount: number;
};

type ProjectedBucket = {
  grossValue: number;
  taxableOnWithdrawal: number;
  taxFreeOnWithdrawal: number;
  investedValue: number;
};

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
  annualContributionOverride?: (age: number) => number;
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
  toAge
});

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
      return total + (Number.isFinite(range.yearlyAmount) ? range.yearlyAmount : 0);
    }

    return total;
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
  annualContributionOverride
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
    const annualContribution =
      age < safeRetirementAge
        ? annualContributionOverride
          ? annualContributionOverride(age)
          : activeYearlyAmount(ranges, age)
        : 0;
    const annualExpense = age >= safeRetirementAge ? clampNumber(yearlyRetirementExpense) : 0;
    const monthlyInvestment = Math.max(Number.isFinite(annualContribution) ? annualContribution : 0, 0) / 12;
    const monthlyContribution =
      ((Number.isFinite(annualContribution) ? annualContribution : 0) -
        (Number.isFinite(annualExpense) ? annualExpense : 0)) /
      12;

    investedValue += monthlyInvestment;
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

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
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
      <span>{formatCurrency(invested)} invested</span>
      <span className="mx-1 text-border">|</span>
      <span className={made >= 0 ? "text-primary" : "text-destructive"}>{formatCurrency(made)} made</span>
    </p>
  );
}

function NumberField({
  label,
  value,
  onChange,
  note,
  disabled = false,
  suffix,
  min = 0,
  max,
  reserveNoteSpace = true,
  compact = false,
  noWrapLabel = false
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  note?: string;
  disabled?: boolean;
  suffix?: string;
  min?: number;
  max?: number;
  reserveNoteSpace?: boolean;
  compact?: boolean;
  noWrapLabel?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Label className="grid min-w-0 content-start gap-1 text-sm font-medium text-foreground">
      <span className="flex min-h-5 items-start justify-between gap-2 leading-5">
        <span className={`min-w-0 ${noWrapLabel ? "whitespace-nowrap" : "break-words"}`}>{label}</span>
        {suffix ? <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span> : null}
      </span>
      <Input
        className={`w-full min-w-0 rounded-md border-input bg-card text-foreground shadow-sm focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground ${
          compact ? "h-9" : "h-10"
        }`}
        type="number"
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
  onChange
}: {
  title: string;
  note: string;
  ranges: ContributionRange[];
  disabled?: boolean;
  currentAge: number;
  endAge: number;
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

          return (
            <Card
              className={`grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] ${
                invalid ? "border-red-300" : ""
              } ${disabled ? "opacity-60" : ""}`}
              key={range.id}
            >
              <NumberField
                label="Yearly amount"
                value={range.yearlyAmount}
                disabled={disabled}
                reserveNoteSpace={false}
                min={Number.NEGATIVE_INFINITY}
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

function Section({
  title,
  subtitle,
  bucket,
  children
}: {
  title: string;
  subtitle: string;
  bucket: ProjectedBucket;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 md:p-5">
      <CardHeader className="mb-5 grid items-start gap-3 p-0 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <CardTitle className="text-xl font-bold text-foreground">{title}</CardTitle>
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
  const [isDarkMode, setIsDarkMode] = useState(false);
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

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = savedTheme ? savedTheme === "dark" : prefersDark;

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
        annualContributionOverride: (age) =>
          resolve401kEmployeeContributions({
            age,
            traditionalRanges: traditional401kRanges,
            rothRanges: roth401kRanges,
            traditionalMax: traditional401kMax,
            rothMax: roth401kMax
          }).traditional + activeYearlyAmount(employerContributionRanges, age)
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
        annualContributionOverride: (age) =>
          resolve401kEmployeeContributions({
            age,
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
        annualContributionOverride: rothIraMax ? annualRothIraLimit : undefined
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
        annualContributionOverride: hsaMax ? (age) => annualHsaLimit(age, hsaCoverage) : undefined
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
    const afterTax =
      finalProjection.total.taxFreeOnWithdrawal +
      finalProjection.total.taxableOnWithdrawal * (1 - withdrawalTaxRate / 100);
    const inflationYears = Math.max(0, endAge - currentAge);
    const inflationDiscountFactor = Math.pow(1 + clampNumber(inflationRate) / 100, inflationYears);

    return {
      ...finalProjection,
      afterTax,
      inflationDiscountFactor,
      fourPercentAtRetirement: retirementProjection.total.grossValue * 0.04,
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
    employerContributionRanges,
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
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-6">
        <header className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Savings calculator</p>
              <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">
                Project taxable, retirement, and HSA balances.
              </h1>
            </div>
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
          <Card className="grid items-start gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
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
              note="Income and max contributions stop at this age."
              noWrapLabel
              compact
            />
            <NumberField label="End age" value={endAge} onChange={setEndAge} noWrapLabel compact />
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
              note="Used to show final value in today's dollars."
              noWrapLabel
              compact
            />
          </Card>
        </header>

        <Section
          title="Brokerage"
          subtitle="Post-tax contributions with taxable growth at withdrawal."
          bucket={projection.brokerage}
        >
          <div className="grid items-start gap-3 md:grid-cols-3">
            <NumberField label="Start age" value={brokerageStartAge} onChange={setBrokerageStartAge} />
            <NumberField
              label="Starting value"
              value={brokerageStartingValue}
              onChange={setBrokerageStartingValue}
              note="Already post-tax; estimated withdrawal tax applies only to growth."
            />
            <NumberField
              label="Annual return"
              value={brokerageReturn}
              suffix="%"
              onChange={setBrokerageReturn}
            />
          </div>
          <RangeEditor
            title="Yearly additional investments"
            note="Already post-tax contribution. New ranges default to stop at retirement age."
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

        <Section
          title="401k"
          subtitle="Traditional and Roth employee deferrals share one legal max. Employer cash contributions go into the pre-tax bucket."
          bucket={projection.k401}
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
              note="Roth/post-tax; tax-free on qualified withdrawal."
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
                Pre-tax {formatCurrency(projection.traditional401k.grossValue)} / Roth{" "}
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
            title="Traditional 401k employee contributions"
            note="Pre-tax; taxed on withdrawal. New ranges default to stop at retirement age."
            ranges={traditional401kRanges}
            disabled={traditional401kMax}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setTraditional401kRanges}
          />
          <RangeEditor
            title="Roth 401k employee contributions"
            note="Roth/post-tax contribution; tax-free on qualified withdrawal. New ranges default to stop at retirement age."
            ranges={roth401kRanges}
            disabled={roth401kMax}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setRoth401kRanges}
          />
          <RangeEditor
            title="Employer pre-tax cash contributions"
            note="Employer pre-tax contribution; taxed on withdrawal. New ranges default to stop at retirement age."
            ranges={employerContributionRanges}
            currentAge={currentAge}
            endAge={retirementAge}
            onChange={setEmployerContributionRanges}
          />
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
            <NumberField
              label="Pre-tax 401k retirement yearly expense"
              value={preTax401kRetirementExpense}
              onChange={setPreTax401kRetirementExpense}
              note="Withdraws from the combined traditional and employer pre-tax bucket from retirement age through end age."
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

        <Section
          title="Roth IRA"
          subtitle="Post-tax IRA contributions with tax-free qualified withdrawals."
          bucket={projection.rothIra}
        >
          <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4">
            <NumberField label="Start age" value={rothIraStartAge} onChange={setRothIraStartAge} />
            <NumberField
              label="Starting value"
              value={rothIraStartingValue}
              onChange={setRothIraStartingValue}
              note="Roth/post-tax; tax-free on qualified withdrawal."
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
            note="Roth/post-tax contribution; tax-free on qualified withdrawal. New ranges default to stop at retirement age."
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

        <Section
          title="HSA"
          subtitle="Assumes qualified medical withdrawals, so projected HSA value is tax-free."
          bucket={projection.hsa}
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
            note="HSA contributions are assumed tax-free when used for qualified medical expenses. New ranges default to stop at retirement age."
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
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projected total</p>
          <Card className="mt-2 grid items-start gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.75fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gross final value</p>
              <InflationAdjustedAmount
                value={projection.total.grossValue}
                adjustedValue={projection.total.grossValue / projection.inflationDiscountFactor}
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
                value={projection.afterTax}
                adjustedValue={projection.afterTax / projection.inflationDiscountFactor}
                className="text-xl font-bold text-primary"
              />
              <p className="mt-1 text-xs leading-4 text-muted-foreground">
                {percentFormatter.format(withdrawalTaxRate)}% on taxable balances.
              </p>
            </div>
          </Card>

          <Card className="mt-3 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              4% at retirement age
            </p>
            <InflationAdjustedAmount
              value={projection.fourPercentAtRetirement}
              adjustedValue={projection.fourPercentAtRetirement / projection.inflationDiscountFactor}
              className="text-xl font-bold text-gold"
              suffix="/ year"
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Based on the projected gross balance at age {retirementAge}.
            </p>
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
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Sum of all yearly retirement expense inputs.
              </p>
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
            {[
              ["Taxable on withdrawal", projection.total.taxableOnWithdrawal],
              ["Tax-free on withdrawal", projection.total.taxFreeOnWithdrawal]
            ].map(([label, value]) => (
              <div className="flex items-center justify-between gap-3 border-b border-border pb-2" key={label}>
                <span className="text-muted-foreground">{label}</span>
                <InflationAdjustedAmount
                  value={value as number}
                  adjustedValue={(value as number) / projection.inflationDiscountFactor}
                  className="text-right font-bold text-foreground"
                />
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </main>
  );
}
