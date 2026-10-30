import { Select } from "@/components/ui/Select";
import {
  PERFORMANCE_SCOPES,
  type PerformanceScope,
} from "@/lib/api/performance";

export function PerformanceScopeSelect({
  value,
  onChange,
}: {
  value: PerformanceScope;
  onChange: (scope: PerformanceScope) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-text2">
      범위
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value as PerformanceScope)}
        className="min-w-[120px]"
      >
        {Object.entries(PERFORMANCE_SCOPES).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
    </label>
  );
}
