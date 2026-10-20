import { useDates } from './useDates';
export function DateValue({ value }: { value: string | null | undefined }) {
  const { date } = useDates();
  return <time dateTime={value ?? undefined}>{date(value)}</time>;
}
export function TimeValue({ value }: { value: string | null | undefined }) {
  const { time } = useDates();
  return <time dateTime={value ?? undefined}>{time(value)}</time>;
}
export function PeriodValue({
  value,
  range,
}: {
  value: string;
  range?: { from: string; to: string };
}) {
  const { period } = useDates();
  return <>{period(value, range)}</>;
}
